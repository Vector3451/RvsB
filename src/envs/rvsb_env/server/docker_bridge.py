import subprocess
import logging

logger = logging.getLogger(__name__)

class DockerBridge:
    """
    Manages communication with Kali (Red) and Target (Blue) containers.
    """
    
    RED_CONTAINER = "june-kali-daemon"
    BLUE_CONTAINER = "rvsb-target"

    @classmethod
    def exec_command(cls, container_name: str, command: str):
        """
        Executes a command inside the specified container and returns (stdout, stderr, exit_code).
        """
        full_command = ["docker", "exec", container_name, "bash", "-c", command]
        try:
            logger.info(f"Docker Exec [{container_name}]: {command}")
            process = subprocess.Popen(
                full_command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            stdout, stderr = process.communicate(timeout=30)
            return stdout, stderr, process.returncode
        except subprocess.TimeoutExpired:
            process.kill()
            return "", "Command timed out after 30 seconds", 124
        except Exception as e:
            logger.error(f"Docker Bridge Error: {str(e)}")
            return "", str(e), 1

    @classmethod
    def is_running(cls, container_name: str) -> bool:
        try:
            res = subprocess.run(
                ["docker", "inspect", "-f", "{{.State.Running}}", container_name],
                capture_output=True,
                text=True
            )
            return res.stdout.strip() == "true"
        except:
            return False

# Initialize containers if not running
def ensure_containers():
    if not DockerBridge.is_running(DockerBridge.RED_CONTAINER):
        logger.warning(f"Starting {DockerBridge.RED_CONTAINER}...")
        subprocess.run(["docker", "start", DockerBridge.RED_CONTAINER])
    
    if not DockerBridge.is_running(DockerBridge.BLUE_CONTAINER):
        logger.warning(f"Target container {DockerBridge.BLUE_CONTAINER} not found/running. Attempting to run rvsb-challenge...")
        # Check if it exists but is stopped
        res = subprocess.run(["docker", "ps", "-a", "--filter", f"name={DockerBridge.BLUE_CONTAINER}", "--format", "{{.Names}}"], capture_output=True, text=True)
        if DockerBridge.BLUE_CONTAINER in res.stdout:
            subprocess.run(["docker", "start", DockerBridge.BLUE_CONTAINER])
        else:
            subprocess.run(["docker", "run", "-d", "--name", DockerBridge.BLUE_CONTAINER, "rvsb-challenge:latest"])
