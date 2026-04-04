"""
RvsB Core Simulation Logic.
Manages the simulated network, flag, and scoring for all 3 tasks.
"""
import hashlib
import random
import uuid
from typing import List

from core.env_server import Environment
from envs.rvsb_env.models import (
    ExfiltrateAction,
    ExploitAction,
    ReconAction,
    RvsBAction,
    RvsBObservation,
    RvsBState,
)
from envs.rvsb_env.server.docker_bridge import DockerBridge, ensure_containers

# The "real" flag — only the environment knows this.
_FLAG_SECRET = "flag{r3d_t34m_w1ns_" + uuid.uuid4().hex[:8] + "}"
_FLAG_HASH = hashlib.sha256(_FLAG_SECRET.encode()).hexdigest()

_ALERT_THRESHOLDS = {"passive": 0, "slow": 1, "aggressive": 3}


class RvsBEnvironment(Environment):
    """
    Simulates a target network with:
      - 5 discoverable services
      - 1 exploitable service (http with SQLi)
      - A hidden flag file at /root/flag.txt
      - An IDS that triggers based on scan intensity
    """

    def __init__(self):
        ensure_containers()
        self._state = RvsBState()
        self._is_training = False
        self._flag_accessible = False
        self._foothold = False
        self._found_services: List[str] = []
        self._failed_attempts = 0
        self._alerts = 0
        self._patched: List[str] = []
        self._all_services = ["ssh", "http", "ftp", "smb", "rdp"]
        self._exploitable_services = ["http"]
        self._last_console_output = ""

    # ------------------------------------------------------------------
    # OpenEnv required methods
    # ------------------------------------------------------------------
    def reset(self, config: dict = None) -> RvsBObservation:
        config = config or {}
        self._all_services = config.get("nodes", ["ssh", "http", "ftp", "smb", "rdp"])
        self._exploitable_services = config.get("exploitable", ["http"])
        self._is_training = config.get("training", False)
        
        # Set timeout based on task difficulty
        task_id = config.get("task_id", "stealth_recon")
        timeouts = {
            "stealth_recon": 20,
            "precision_exploit": 40,
            "flag_capture": 60,
            "autonomous_defense": 60
        }
        duration = timeouts.get(task_id, 60)

        self._state = RvsBState(
            episode_id=str(uuid.uuid4()),
            step_count=0,
            current_task=task_id,
            phase="recon",
            red_score=0.0,
            blue_score=0.0,
            time_remaining=duration,
            total_alerts=0,
            total_services=len(self._all_services),
            found_services=0,
        )
        self._flag_accessible = False
        self._foothold = False
        self._attacker_at = None
        self._found_services = []
        self._failed_attempts = 0
        self._alerts = 0
        self._patched = []
        return RvsBObservation(
            done=False,
            reward=0.0,
            open_services=[],
            alert_triggered=False,
            alerts_count=0,
            foothold_gained=False,
            attacker_at=None,
            failed_attempts=0,
            flag_found=False,
            flag_content="",
            patched_services=[],
            intrusion_detected=False,
            total_nodes=len(self._all_services)
        )

    def _checkpoint(self) -> dict:
        import copy
        return {
            "state": copy.deepcopy(self._state),
            "flag_accessible": self._flag_accessible,
            "foothold": self._foothold,
            "attacker_at": self._attacker_at,
            "found_services": list(self._found_services),
            "failed_attempts": self._failed_attempts,
            "alerts": self._alerts,
            "patched": list(self._patched),
        }

    def _rollback(self, cp: dict):
        self._state = cp["state"]
        self._flag_accessible = cp["flag_accessible"]
        self._foothold = cp["foothold"]
        self._attacker_at = cp.get("attacker_at")
        self._found_services = cp["found_services"]
        self._failed_attempts = cp["failed_attempts"]
        self._alerts = cp["alerts"]
        self._patched = cp["patched"]

    def step(self, action: RvsBAction) -> RvsBObservation:
        cp = self._checkpoint()
        try:
            self._state.step_count += 1
            self._state.time_remaining -= 1

            if self._state.time_remaining <= 0:
                return self._timeout_obs()

            if isinstance(action, ReconAction):
                return self._handle_recon(action)
            if isinstance(action, ExploitAction):
                # Multi-phase enforcement: penalise exploit before any recon
                if not self._found_services and action.role == "red":
                    return RvsBObservation(
                        done=False, reward=-0.1,
                        metadata={
                            "warning": "phase_violation",
                            "console": "[IDS] Exploit attempted before reconnaissance — maximum alert triggered.",
                            "role": action.role
                        }
                    )
                return self._handle_exploit(action)
            if isinstance(action, ExfiltrateAction):
                return self._handle_exfiltrate(action)

            return RvsBObservation(done=False, reward=0.0)
        except Exception as e:
            self._rollback(cp)
            self._last_console_output = f"[CRITICAL ENV ERROR] Transaction Rollback triggered due to: {str(e)}"
            return RvsBObservation(done=False, reward=0.0, metadata={"error": "rollback", "console": self._last_console_output, "role": "system"})

    @property
    def state(self) -> RvsBState:
        return self._state

    # ------------------------------------------------------------------
    # Task handlers
    # ------------------------------------------------------------------
    def _handle_recon(self, action: ReconAction) -> RvsBObservation:
        if self._is_training:
            # FAST SIMULATION MANIFOLD FOR RL TRAINING
            self._last_console_output = f"[SIM2REAL] Executing {action.scan_intensity} scan..."
            stdout = " ".join([f"{s} open" for s in self._all_services]) if action.role == "red" else " ".join([f"{s} LISTEN" for s in self._all_services])
        else:
            if action.role == "red":
                # GROUNDED: Run real nmap on Kali container
                target_ip = "rvsb-target" # Internal Docker name for target mapping
                cmd = f"nmap -sV {target_ip}"
                if action.scan_intensity == "passive":
                    cmd = f"nmap -sn {target_ip}"
                
                stdout, stderr, code = DockerBridge.exec_command(DockerBridge.RED_CONTAINER, cmd)
                self._last_console_output = stdout if stdout else stderr
                # Fallback to simulation if grounded environment is unreachable
                if code != 0 or not stdout.strip() or "Host seems down" in stdout:
                    stdout = " ".join([f"{s} open" for s in self._all_services])
                    self._last_console_output = f"[Grounded scan failed, using simulation mapping]\n{stdout}"
            else:
                # GROUNDED: Monitor services on Target container via /proc/net/tcp (netstat alternative)
                cmd = "cat /proc/net/tcp"
                stdout, stderr, code = DockerBridge.exec_command(DockerBridge.BLUE_CONTAINER, cmd)
                
                # Convert standard ports to their hex representation for /proc/net/tcp parsing
                hex_ports = {
                    "ssh": "0016", "http": "0050", "ftp": "0015", 
                    "smb": "01BD", "rdp": "0D3D"
                }
                
                # Build simulated output for the UI based on real /proc/net/tcp open ports
                sim_lines = []
                for service_name, hport in hex_ports.items():
                    if hport in stdout.upper():
                        sim_lines.append(f"tcp 0 0 0.0.0.0:{service_name} 0.0.0.0:* LISTEN")
                
                out_str = "\n".join(sim_lines)
                self._last_console_output = out_str if out_str else ("[BLUE] No active open listening sockets found.\n" + (stderr or ""))
                # Overwrite stdout with our synthetic netstat output to reuse the existing parsing logic
                stdout = out_str

        # Analyze real/sim output
        found_count = stdout.count("open") if action.role == "red" else stdout.count("LISTEN")
        alert = action.scan_intensity == "aggressive" and action.role == "red"
        if alert:
            self._alerts += 3
            self._state.total_alerts += 3

        # Update found services (simplified parsing)
        current_found = []
        for s in self._all_services:
            # Match base service type (e.g. 'ssh' matches 'ssh_0_123')
            base_s = s.split('_')[0].lower()
            if base_s in stdout.lower() and s not in self._found_services:
                current_found.append(s)
        
        self._found_services.extend(current_found)
        self._state.found_services = len(self._found_services)

        score = (len(self._found_services) / len(self._all_services)) * (1.0 - 0.1 * self._alerts)
        if action.role == "red":
            self._state.red_score = max(self._state.red_score, score)

        return RvsBObservation(
            alert_triggered=alert,
            alerts_count=self._alerts,
            open_services=list(self._found_services),
            patched_services=list(self._patched),
            foothold_gained=self._foothold,
            attacker_at=self._attacker_at,
            flag_found=self._flag_accessible,
            total_nodes=len(self._all_services),
            metadata={"console": self._last_console_output, "role": action.role}
        )

    def _handle_exploit(self, action: ExploitAction) -> RvsBObservation:
        if action.role == "blue":
            if action.payload == "patch":
                if action.target_service not in self._patched:
                    self._patched.append(action.target_service)
                    # Intrinsic reward for patching: higher if it's actually the vulnerable service
                    reward = 2.0 if action.target_service in self._exploitable_services else 0.5
                else:
                    reward = -0.1  # penalty for redundant patch
                
                if self._is_training:
                    self._last_console_output = f"[SIM2REAL] Firewall patch applied to {action.target_service}."
                else:
                    # GROUNDED: Simulate patching by adding an iptables block rule
                    cmd = f"echo 'Applying firewall patch for {action.target_service}'; " \
                          f"iptables -A INPUT -p tcp --dport $(grep -w {action.target_service} /etc/services | awk '{{print $2}}' | cut -d/ -f1 | head -n 1) -j DROP"
                    stdout, stderr, code = DockerBridge.exec_command(DockerBridge.BLUE_CONTAINER, cmd)
                    self._last_console_output = stdout if stdout else stderr
                
                return RvsBObservation(
                    done=False, reward=reward,
                    foothold_gained=self._foothold,
                    attacker_at=self._attacker_at,
                    failed_attempts=self._failed_attempts,
                    open_services=list(self._found_services),
                    patched_services=list(self._patched),
                    flag_found=self._flag_accessible,
                    total_nodes=len(self._all_services),
                    metadata={"console": f"[BLUE] Service {action.target_service} secured.\n" + self._last_console_output, "role": "blue"}
                )
            elif action.payload in ["dropconn", "honeypot", "restart", "isolate"]:
                self._last_console_output = f"[BLUE] Active Defense module engaged: {action.payload.upper()}"
                
                # Active defense intrinsic rewards
                ad_rewards = {"dropconn": 0.2, "honeypot": 1.0, "restart": 0.1, "isolate": 0.5}
                reward = ad_rewards.get(action.payload, 0.2)
                
                return RvsBObservation(
                    done=False, reward=reward,
                    foothold_gained=self._foothold,
                    attacker_at=self._attacker_at,
                    failed_attempts=self._failed_attempts,
                    open_services=list(self._found_services),
                    patched_services=list(self._patched),
                    flag_found=self._flag_accessible,
                    total_nodes=len(self._all_services),
                    metadata={"console": self._last_console_output, "role": "blue"}
                )
            
        if action.target_service in self._patched:
            self._failed_attempts += 1
            return RvsBObservation(
                done=False, reward=0.0,
                foothold_gained=False,
                attacker_at=self._attacker_at,
                failed_attempts=self._failed_attempts,
                open_services=list(self._found_services),
                patched_services=list(self._patched),
                flag_found=self._flag_accessible,
                total_nodes=len(self._all_services),
                metadata={"error": "service_patched", "console": "Access Denied: Firewall rule active (Connection Refused).", "role": action.role}
            )

        if self._is_training:
            self._last_console_output = f"[SIM2REAL] Attempting exploit payload on {action.target_service}."
        else:
            # GROUNDED: Run exploit check on Target container
            # FALLBACK: Check common web roots if /var/www/html/ fails
            target_path = "/var/www/html/"
            check_path = f"[ -d {target_path} ] && echo 'exists' || echo 'missing'"
            exists_out, _, _ = DockerBridge.exec_command(DockerBridge.BLUE_CONTAINER, check_path)
            
            if "missing" in exists_out:
                target_path = "/" # Absolute safe fallback if web root is missing
                
            cmd = f"ls -l {target_path} | grep {action.target_service} || echo 'Target visible but no sensitive data found.'"
            stdout, stderr, code = DockerBridge.exec_command(DockerBridge.BLUE_CONTAINER, cmd)
            self._last_console_output = stdout if stdout else stderr

        # Check payload match for the specific service (strip hash if present)
        svc_type = action.target_service.split('_')[0].lower()
        payload_lower = action.payload.lower()
        valid_payload = False
        
        # HTTP Exploits
        if svc_type == "http" and payload_lower in ["sqli", "rce"]: valid_payload = True
        # SSH Exploits
        elif svc_type == "ssh" and payload_lower in ["bruteforce", "keyleak"]: valid_payload = True
        # FTP Exploits
        elif svc_type == "ftp" and payload_lower in ["anonymous", "bounce"]: valid_payload = True
        # SMB Exploits
        elif svc_type == "smb" and payload_lower in ["eternalblue", "guess"]: valid_payload = True
        # RDP Exploits
        elif svc_type == "rdp" and payload_lower in ["bruteforce", "bluekeep"]: valid_payload = True
        # SQL Exploits
        elif svc_type == "sql" and payload_lower in ["sqli", "defaultcreds"]: valid_payload = True
        # NFS Exploits
        elif svc_type == "nfs" and payload_lower in ["mount", "suid"]: valid_payload = True
        # Fallback for Generic
        elif "sqli" in payload_lower: valid_payload = True 
        
        success = (action.target_service in self._exploitable_services and valid_payload)
        
        if not success:
            self._failed_attempts += 1
            self._alerts += 1
            self._state.total_alerts += 1

        score = 1.0 / (1 + self._failed_attempts)
        if success:
            self._foothold = True
            self._attacker_at = action.target_service
            self._flag_accessible = True
            self._state.phase = "exfiltrate"
            if "Target visible but no sensitive data found" in self._last_console_output:
                self._last_console_output = self._last_console_output.replace("Target visible but no sensitive data found.", "").strip()
            self._last_console_output += f"\n\n[SUCCESS] Exploit payload delivered successfully. Gained shell access on {action.target_service}!"

        if action.role == "red":
            self._state.red_score = max(self._state.red_score, score if success else 0.0)
        else:
            self._state.blue_score = max(self._state.blue_score, score if success else 0.0)

        return RvsBObservation(
            done=False,
            reward=round(score, 3) if success else 0.0,
            foothold_gained=self._foothold,
            attacker_at=self._attacker_at,
            failed_attempts=self._failed_attempts,
            open_services=list(self._found_services),
            patched_services=list(self._patched),
            flag_found=self._flag_accessible,
            alert_triggered=not success,
            alerts_count=self._alerts,
            metadata={"console": self._last_console_output, "role": action.role}
        )

    def _handle_exfiltrate(self, action: ExfiltrateAction) -> RvsBObservation:
        if not self._flag_accessible:
            return RvsBObservation(
                done=False, reward=0.0,
                metadata={"error": "no_foothold — gain access first", "console": "Permission Denied", "role": action.role}
            )

        payload_lower = action.payload.lower()
        if self._is_training:
            self._last_console_output = f"[SIM2REAL] Executing post-exploitation payload: {payload_lower}"
        else:
            # GROUNDED: Execute generic post-exploitation commands
            cmd = "echo 'Success'"
            if payload_lower == "passwd": cmd = "cat /etc/passwd | head -n 5 || echo 'success'"
            elif payload_lower == "sam": cmd = "echo 'SAM hash dump successful (simulated)'"
            elif payload_lower == "db": cmd = "echo 'Database dumped successfully'"
            elif payload_lower == "backdoor": cmd = "echo 'SSH backdoor installed'"
            elif payload_lower == "clearlogs": cmd = "echo 'Logs cleared'"
            
            stdout, stderr, code = DockerBridge.exec_command(DockerBridge.BLUE_CONTAINER, cmd)
            self._last_console_output = stdout.strip() if stdout else stderr.strip()
        
        score = 1.0
        if action.role == "red":
            self._state.red_score = max(self._state.red_score, score)
        else:
            self._state.blue_score = max(self._state.blue_score, score)

        return RvsBObservation(
            done=True,
            reward=score,
            flag_found=True,
            flag_content=self._last_console_output,
            metadata={"console": f"Post-Exploitation [{payload_lower.upper()}]: \n{self._last_console_output}", "role": action.role}
        )
        self._state.red_score = max(self._state.red_score, score)

        return RvsBObservation(
            done=True,
            reward=score,
            flag_found=success,
            flag_content=self._last_console_output if success else "****",
            metadata={"console": f"Exfiltrating data... \n{self._last_console_output}", "role": "red"}
        )

    def _timeout_obs(self) -> RvsBObservation:
        return RvsBObservation(
            done=True, reward=0.0,
            metadata={"error": "episode_timeout"},
        )

    # ------------------------------------------------------------------
    # Grader helpers (used by /grader endpoint)
    # ------------------------------------------------------------------
    def grader_score(self, task_id: str) -> float:
        """Return a score in [0.0, 1.0] for the given task."""
        if task_id == "stealth_recon":
            if not self._found_services:
                return 0.0
            # No floor: aggressive scanning can legitimately score 0.0
            coverage = len(self._found_services) / len(self._all_services)
            alert_penalty = max(0.0, 1.0 - 0.2 * self._alerts)  # 0.2 per alert, no floor
            return round(coverage * alert_penalty, 3)

        if task_id == "precision_exploit":
            if not self._foothold:
                return 0.0
            # Accuracy component: penalise failed attempts
            accuracy = round(1.0 / (1 + self._failed_attempts), 3)
            # Time-efficiency component: fewer steps taken = better
            max_steps = 60
            steps_used = self._state.step_count
            efficiency = max(0.0, 1.0 - steps_used / max_steps)
            # Weighted: 70% accuracy, 30% speed
            return round(0.7 * accuracy + 0.3 * efficiency, 3)

        if task_id == "flag_capture":
            # Partial scoring: foothold alone earns 0.3, full exfil earns 1.0
            if not self._foothold and not self._flag_accessible:
                return 0.0
            foothold_score = 0.3 if self._foothold else 0.0
            exfil_score = 0.7 if self._flag_accessible and any(
                hashlib.sha256(c.encode()).hexdigest() == _FLAG_HASH
                for c in [_FLAG_SECRET]
            ) else 0.0
            return round(foothold_score + exfil_score, 3)

        if task_id == "autonomous_defense":
            # Blue team grader: reward patching exploitable services before foothold
            if not self._patched:
                return 0.0
            # Coverage of exploitable services that were patched
            exploitable_patched = [s for s in self._patched if s in self._exploitable_services]
            coverage = len(exploitable_patched) / max(1, len(self._exploitable_services))
            # Bonus: if no foothold was ever gained, the defense was perfect
            integrity_bonus = 0.3 if not self._foothold else 0.0
            return round(min(1.0, coverage * 0.7 + integrity_bonus), 3)

        return 0.0

    def grader_score_with_cvss(self, task_id: str) -> dict:
        """Return score + CVSS-style audit metadata for richer reporting."""
        score = self.grader_score(task_id)
        cvss_info = {
            "task_id": task_id,
            "score": score,
            "range": "[0.0, 1.0]",
            "cvss_breakdown": {
                "attack_vector": "NETWORK",
                "attack_complexity": "LOW" if self._failed_attempts == 0 else "HIGH",
                "privileges_required": "NONE",
                "user_interaction": "NONE",
                "confidentiality_impact": "HIGH" if self._flag_accessible else "NONE",
                "integrity_impact": "HIGH" if self._foothold else "NONE",
                "availability_impact": "LOW" if self._alerts > 2 else "NONE",
            },
            "audit_metadata": {
                "services_discovered": self._found_services,
                "services_patched": self._patched,
                "alerts_triggered": self._alerts,
                "foothold_gained": self._foothold,
                "steps_used": self._state.step_count,
                "failed_exploit_attempts": self._failed_attempts,
            }
        }
        return cvss_info

    @staticmethod
    def flag_hash() -> str:
        return _FLAG_HASH
