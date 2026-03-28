import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Network, Database, AlertTriangle, Server, Shield, Globe,
  Swords, Target as TargetIcon, Play, Square, ChevronUp, ChevronDown,
  FileText, Activity, Lock
} from 'lucide-react';
import { GlassCard, Badge } from '../ui/CyberComponents';
import { useRvsbApi, NetworkNode } from '../../lib/useRvsbApi';
import { ReportView } from './ReportView';

// ── Node icon helper ──────────────────────────────────────────────────────

const getIconForNode = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes('db') || l.includes('sql') || l.includes('smb')) return Database;
  if (l.includes('web') || l.includes('http')) return Globe;
  if (l.includes('fw') || l.includes('firewall')) return Shield;
  if (l.includes('lock') || l.includes('ssh')) return Lock;
  return Server;
};

// ── Agent counter widget ─────────────────────────────────────────────────

const AgentCounter = ({
  label, color, count, onInc, onDec
}: { label: string; color: 'red' | 'blue'; count: number; onInc: () => void; onDec: () => void }) => (
  <div className={`flex flex-col items-center gap-1.5 bg-surface-container-low/60 px-4 py-3 rounded-xl border ${color === 'red' ? 'border-secondary/30' : 'border-primary/30'}`}>
    <div className={`text-[9px] font-black uppercase tracking-[0.2em] ${color === 'red' ? 'text-secondary' : 'text-primary'}`}>{label}</div>
    <div className="flex items-center gap-2">
      <button onClick={onDec} className="w-6 h-6 rounded-lg bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-all">
        <ChevronDown size={14} className="text-on-surface/60" />
      </button>
      <span className={`text-2xl font-headline font-black italic min-w-[24px] text-center ${color === 'red' ? 'text-secondary' : 'text-primary'}`}>{count}</span>
      <button onClick={onInc} className="w-6 h-6 rounded-lg bg-surface-container-high flex items-center justify-center hover:bg-surface-container-highest transition-all">
        <ChevronUp size={14} className="text-on-surface/60" />
      </button>
    </div>
    <div className="flex gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`w-2 h-2 rounded-full ${color === 'red' ? 'bg-secondary' : 'bg-primary'}`} />
      ))}
    </div>
  </div>
);

// ── Live Action Feed ────────────────────────────────────────────────────

const LiveActionFeed = ({ logs }: { logs: any[] }) => {
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="absolute left-4 top-24 bottom-4 w-96 z-40 flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1 mb-1">
        <Activity size={12} className="text-primary" />
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-primary">Live Combat Feed</span>
        {logs.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />}
      </div>
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1"
      >
        <AnimatePresence initial={false}>
          {logs.slice(-40).map(log => {
            const isRed = log.role === 'RED' || log.content?.includes('[RED]');
            const isBlue = log.role === 'BLUE' || log.content?.includes('[BLUE]');
            const isSystem = log.type === 'system';

            // Parse content lines for nicer display
            const lines = (log.content || '').split('\n');
            const actionLine = lines[0] || '';
            const rewardLine = lines[1] || '';
            const reasoning = lines[2] || '';

            return (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`p-2.5 rounded-lg border text-[10px] font-mono backdrop-blur-md
                  ${isRed ? 'bg-secondary/10 border-secondary/30' :
                    isBlue ? 'bg-primary/10 border-primary/30' :
                      'bg-surface-container/60 border-outline-variant/10'}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className={`flex items-center gap-1.5 font-black text-[9px] uppercase tracking-widest
                    ${isRed ? 'text-secondary' : isBlue ? 'text-primary' : 'text-on-surface/40'}`}>
                    {isRed && <TargetIcon size={9} />}
                    {isBlue && <Shield size={9} />}
                    {isRed ? 'Red Attack' : isBlue ? 'Blue Defense' : 'System'}
                  </div>
                  <span className="text-on-surface/30 text-[8px] flex-shrink-0">{log.timestamp}</span>
                </div>
                {/* Action */}
                {actionLine && (
                  <div className={`font-bold break-words whitespace-pre-wrap ${isRed ? 'text-secondary/80' : isBlue ? 'text-primary/80' : 'text-on-surface/60'}`}>
                    {actionLine.replace(/^\>[^\]]*\]\s*/, '').replace(/^>\[.*?\]\s*/, '')}
                  </div>
                )}
                {/* Reward */}
                {rewardLine && rewardLine.includes('Reward') && (
                  <div className="text-on-surface/40 text-[9px] mt-0.5 break-words whitespace-pre-wrap">{rewardLine.replace('>', '').trim()}</div>
                )}
                {/* Reasoning */}
                {reasoning && reasoning.includes('Reasoning') && (
                  <div className="text-on-surface/30 text-[9px] mt-0.5 italic break-words whitespace-pre-wrap line-clamp-4">
                    {reasoning.replace('> Reasoning:', '').trim()}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {logs.length === 0 && (
          <div className="text-[9px] text-on-surface/20 italic text-center py-4">
            Awaiting agent deployment...
          </div>
        )}
      </div>
    </div>
  );
};

// ── Main MapView ─────────────────────────────────────────────────────────

export const MapView = () => {
  const { state, startMatch, stopMatch, setRedAgents, setBlueAgents } = useRvsbApi();
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [showReport, setShowReport] = useState(false);

  const nodes = state.network?.nodes || [];
  const radius = 35;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#080c10]">
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
      <div className="absolute inset-0 scanline opacity-20 pointer-events-none" />

      {/* Arena title watermark */}
      <div className="absolute top-24 left-80 z-0 pointer-events-none">
        <div className="flex items-center gap-4 opacity-5">
          <Swords size={48} className="text-on-surface" />
          <div>
            <h2 className="font-headline font-black text-5xl text-on-surface tracking-tighter uppercase italic">Test</h2>
            <h3 className="font-headline font-black text-5xl text-on-surface tracking-tighter -mt-2 uppercase italic">Arena</h3>
          </div>
        </div>
      </div>

      {/* ── Live Action Feed (Left) ──────────────────────────────────────── */}
      <LiveActionFeed logs={state.logs} />

      {/* ── Agent Status Indicators (Top Right) ─────────────────────────── */}
      <div className="absolute top-24 right-12 z-40 space-y-4">
        <div className="flex items-center gap-4 justify-end">
          <div className="text-right">
            <div className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Red Aggressor{state.redAgents > 1 ? ` ×${state.redAgents}` : ''}</div>
            <div className="text-sm font-headline font-bold text-on-surface/60 italic">
              {state.availableModels?.find(m => m.id === state.globalModel)?.name || 'Dolphin Llama 3'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center shadow-[0_0_20px_rgba(255,82,95,0.3)]">
            <TargetIcon size={20} className="text-secondary" />
          </div>
        </div>
        <div className="flex items-center gap-4 justify-end">
          <div className="text-right">
            <div className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Blue Sentinel{state.blueAgents > 1 ? ` ×${state.blueAgents}` : ''}</div>
            <div className="text-sm font-headline font-bold text-on-surface/60 italic">
              {state.availableModels?.find(m => m.id === state.globalModel)?.name || 'Dolphin Llama 3'}
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shadow-[0_0_20px_rgba(0,218,243,0.3)]">
            <Shield size={20} className="text-primary" />
          </div>
        </div>
      </div>

      {/* ── Network Nodes ───────────────────────────────────────────────── */}
      {nodes.map((node) => {
        const Icon = getIconForNode(node.label);
        const rad = (node.angle - 90) * (Math.PI / 180);
        const x = 50 + radius * Math.cos(rad);
        const y = 50 + radius * Math.sin(rad);
        const isAttacked = state.network?.attacker_at === node.id;
        const isPatched = node.status === 'patched';
        if (node.status === 'hidden') return null;

        let borderColor = 'border-primary/40', bgColor = 'bg-primary/10', glow = 'shadow-[0_0_20px_rgba(0,218,243,0.15)]', iconColor = 'text-primary';
        if (isAttacked) { borderColor = 'border-secondary/80'; bgColor = 'bg-secondary/20'; glow = 'shadow-[0_0_30px_rgba(255,82,95,0.4)]'; iconColor = 'text-secondary'; }
        else if (isPatched) { borderColor = 'border-green-500/50'; bgColor = 'bg-green-500/10'; glow = 'shadow-[0_0_20px_rgba(34,197,94,0.2)]'; iconColor = 'text-green-500'; }

        return (
          <motion.div key={node.id} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1, left: `${x}%`, top: `${y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-10"
            onClick={() => setSelectedNode(node)}
          >
            <div className={`relative w-16 h-16 flex items-center justify-center ${bgColor} border ${borderColor} rounded-lg backdrop-blur-sm group-hover:scale-110 transition-all ${glow}`}>
              {isAttacked && <div className="absolute -inset-2 border border-secondary/50 rounded-lg animate-ping opacity-50" />}
              <Icon className={iconColor} size={24} />
              {/* Status badge */}
              <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#080c10] ${isAttacked ? 'bg-secondary animate-pulse' : isPatched ? 'bg-green-400' : 'bg-yellow-400'}`} />
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-surface-container-high px-3 py-1.5 rounded text-[10px] uppercase font-black tracking-widest border border-primary/20 text-on-surface z-50 shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                {node.label}
                {isAttacked && <span className="ml-2 text-secondary animate-pulse">⚡ UNDER ATTACK</span>}
                {isPatched && <span className="ml-2 text-green-400">✓ SECURED</span>}
              </div>
            </div>
            <svg className="absolute w-[200vw] h-[200vh] -left-[100vw] -top-[100vh] pointer-events-none -z-10" style={{ pointerEvents: 'none' }}>
              <line x1={`${x}%`} y1={`${y}%`} x2="50%" y2="50%"
                stroke={isAttacked ? "rgba(255, 82, 95, 0.4)" : isPatched ? "rgba(34,197,94,0.3)" : "rgba(0, 218, 243, 0.2)"}
                strokeWidth={isAttacked ? "2" : "1"} strokeDasharray={isPatched ? "none" : "4 4"} />
            </svg>
          </motion.div>
        );
      })}

      {/* ── Core Router ─────────────────────────────────────────────────── */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer"
        onClick={() => setSelectedNode({ id: 'core', label: 'CORE ROUTER', angle: 0, status: 'open' })}>
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
          className={`w-20 h-20 flex items-center justify-center rounded-xl shadow-[0_0_40px_rgba(0,218,243,0.4)] relative z-30 ${state.network?.foothold ? 'bg-secondary text-on-secondary shadow-[0_0_50px_rgba(255,82,95,0.6)]' : 'bg-primary text-on-primary'}`}>
          {state.network?.foothold ? <AlertTriangle size={32} /> : <Network size={32} />}
        </motion.div>
      </div>

      {/* ── Node Detail Panel (right slide-in) ──────────────────────────── */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
            className="absolute right-0 top-0 bottom-0 w-80 bg-surface-container-low/95 backdrop-blur-3xl border-l border-primary/20 shadow-2xl z-50 p-8 flex flex-col">
            <div className="flex justify-between items-start mb-8">
              <div>
                <Badge className="mb-2">Node_Analysis</Badge>
                <h3 className="font-headline font-black text-2xl text-primary tracking-tighter uppercase italic">{selectedNode.label}</h3>
              </div>
              <button onClick={() => setSelectedNode(null)} className="p-2 hover:bg-white/5 rounded-full text-on-surface/30 hover:text-primary">✕</button>
            </div>
            <div className="space-y-6 flex-1 overflow-y-auto custom-scrollbar pr-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-container p-3 rounded-lg border border-outline-variant/10">
                  <div className="text-[9px] font-black uppercase tracking-widest text-on-surface/40 mb-1">Status</div>
                  <div className={`text-xs font-bold font-mono ${selectedNode.status === 'patched' ? 'text-green-400' : 'text-secondary'}`}>
                    {selectedNode.status.toUpperCase()}
                  </div>
                </div>
                <div className="bg-surface-container p-3 rounded-lg border border-outline-variant/10">
                  <div className="text-[9px] font-black uppercase tracking-widest text-on-surface/40 mb-1">Risk</div>
                  <div className={`text-xs font-bold ${state.network?.attacker_at === selectedNode.id ? 'text-secondary animate-pulse' : 'text-on-surface/60'}`}>
                    {state.network?.attacker_at === selectedNode.id ? '⚡ ACTIVE TARGET' : 'Passive'}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[9px] font-black uppercase tracking-widest text-on-surface/40">Exploit Exposure</div>
                <div className="h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                  <div className="h-full bg-secondary shadow-[0_0_10px_rgba(255,82,95,0.5)]" style={{ width: '94%' }} />
                </div>
                <div className="text-[9px] text-secondary/60 font-mono">94% — CRITICAL</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom Right: Progress & Controls ──────────────────────────── */}
      <div className="absolute bottom-12 right-12 w-80 space-y-4 pointer-events-none z-40">
        {state.stats && (
          <button onClick={() => setShowReport(true)}
            className="pointer-events-auto w-full flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/40 text-primary font-black text-xs tracking-[0.3em] uppercase rounded-xl hover:bg-primary/20 transition-all animate-pulse">
            <FileText size={14} /> View Match Report
          </button>
        )}
        <GlassCard className="p-5 relative overflow-hidden backdrop-blur-3xl bg-surface-container-low/60">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-headline font-black text-xs uppercase tracking-[0.3em] italic text-primary">{state.isRunning ? 'COMBAT ENGAGED' : 'ARENA READY'}</h4>
            <span className="text-on-surface font-headline font-black text-2xl italic">{state.network?.step || 0}<span className="text-on-surface/20">/</span>40</span>
          </div>
          <div className="relative h-2 bg-surface-container-highest rounded-full overflow-hidden">
            <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-primary-container transition-all duration-300 shadow-[0_0_15px_rgba(0,218,243,0.5)]"
              style={{ width: `${((state.network?.step || 0) / 40) * 100}%` }} />
          </div>
        </GlassCard>
        <div className="grid grid-cols-2 gap-4 pointer-events-auto">
          <div className="bg-surface-container-low/60 backdrop-blur-3xl p-4 rounded-2xl border border-primary/20 shadow-2xl">
            <div className="text-3xl font-headline font-black text-on-surface italic">
              {nodes.filter(n => n.status === 'patched').length}<span className="text-primary/20 mx-1">/</span>{nodes.length || 5}
            </div>
            <div className="text-[9px] text-primary mt-1 uppercase font-black tracking-widest">Patched</div>
          </div>
          <div className="bg-surface-container-low/60 backdrop-blur-3xl p-4 rounded-2xl border border-secondary/20 shadow-2xl">
            <div className="text-3xl font-headline font-black text-secondary italic">{state.network?.alerts || 0}</div>
            <div className="text-[9px] text-secondary mt-1 uppercase font-black tracking-widest">Alerts</div>
          </div>
        </div>
      </div>

      {/* ── Bottom Left: Deploy Controls ─────────────────────────────────── */}
      <div className="absolute bottom-12 left-80 z-40 space-y-4">
        {!state.isRunning && (
          <div className="flex gap-3">
            <AgentCounter label="Red Agents" color="red" count={state.redAgents}
              onInc={() => setRedAgents(state.redAgents + 1)} onDec={() => setRedAgents(state.redAgents - 1)} />
            <AgentCounter label="Blue Agents" color="blue" count={state.blueAgents}
              onInc={() => setBlueAgents(state.blueAgents + 1)} onDec={() => setBlueAgents(state.blueAgents - 1)} />
          </div>
        )}
        {!state.isRunning ? (
          <button onClick={() => startMatch(40)}
            className="flex items-center gap-4 px-10 py-5 bg-gradient-to-br from-primary to-primary-container text-on-primary font-black text-xs tracking-[0.4em] uppercase rounded-2xl shadow-[0_10px_40px_rgba(0,218,243,0.4)] hover:scale-105 active:scale-95 transition-all cursor-pointer italic">
            <Play size={18} fill="currentColor" /> Deploy Agents
          </button>
        ) : (
          <button onClick={() => stopMatch()}
            className="flex items-center gap-4 px-10 py-5 bg-gradient-to-br from-secondary to-secondary-container text-on-secondary font-black text-xs tracking-[0.4em] uppercase rounded-2xl shadow-[0_10px_40px_rgba(255,82,95,0.4)] hover:scale-105 active:scale-95 transition-all cursor-pointer italic">
            <Square size={18} fill="currentColor" /> Abort Session
          </button>
        )}
      </div>

      {/* ── Report Modal ─────────────────────────────────────────────────── */}
      {showReport && state.stats && (
        <ReportView stats={state.stats} steps={state.network?.step || 0} alerts={state.network?.alerts || 0} onClose={() => setShowReport(false)} />
      )}
    </div>
  );
};
