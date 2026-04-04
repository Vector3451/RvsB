import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Network, Database, AlertTriangle, Server, Shield, Globe,
  Swords, Target as TargetIcon, Play, Square, ChevronUp, ChevronDown,
  FileText, Lock, Terminal as TerminalIcon, Dices, Download, Crosshair, Zap
} from 'lucide-react';
import { GlassCard, Badge } from '../ui/CyberComponents';
import { cn } from '@/src/lib/utils';
import { useRvsbApi, NetworkNode } from '../../lib/useRvsbApi';
import { ReportView } from './ReportView';

import { NodeMap } from '../ui/NodeMap';

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
  <div className={`flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-xl border ${color === 'red' ? 'border-secondary/20' : 'border-primary/20'}`}>
    <div className="flex flex-col">
      <div className={`text-[7px] font-black uppercase tracking-widest ${color === 'red' ? 'text-secondary' : 'text-primary'} opacity-60 leading-none mb-0.5`}>{label}</div>
      <div className="text-sm font-black text-on-surface leading-none tracking-tighter">{count}</div>
    </div>
    <div className="flex flex-col gap-0.5">
      <button onClick={onInc} className="p-0.5 hover:bg-white/10 rounded-sm transition-colors text-on-surface/40 hover:text-primary"><ChevronUp size={12} /></button>
      <button onClick={onDec} className="p-0.5 hover:bg-white/10 rounded-sm transition-colors text-on-surface/40 hover:text-secondary"><ChevronDown size={12} /></button>
    </div>
  </div>
);

// ── Live Action Feed ────────────────────────────────────────────────────



// ── Main MapView ─────────────────────────────────────────────────────────

export const MapView = () => {
  const { state, startMatch, stopMatch, setRedAgents, setBlueAgents, setRedModel, setBlueModel, randomizeMap, setActiveTemplate } = useRvsbApi();
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [nodeCount, setNodeCount] = useState(5);
  const [showImport, setShowImport] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [attackType, setAttackType] = useState<'stealth' | 'aggressive' | 'full_chain'>('stealth');

  const attackModes = [
    { id: 'stealth', label: 'Stealth', icon: Crosshair, hint: 'Passive recon, zero alerts', steps: 20, task: 'stealth_recon' },
    { id: 'aggressive', label: 'Aggressive', icon: Zap, hint: 'High-impact exploit, max damage', steps: 40, task: 'precision_exploit' },
    { id: 'full_chain', label: 'Full Chain', icon: Swords, hint: 'Recon → Exploit → Exfiltrate', steps: 60, task: 'flag_capture' },
  ] as const;


  // Memoize risk score to avoid CPU spiking during high-speed RL render playback
  const selectedNodeRiskScore = useMemo(() => {
    if (!selectedNode || selectedNode.status === 'patched') return 0;
    return 15 + (Math.abs(selectedNode.id.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)) % 80);
  }, [selectedNode?.id, selectedNode?.status]);

  useEffect(() => {
    fetch('/api/templates/list')
      .then(r => r.json())
      .then(setTemplates)
      .catch(console.error);
  }, []);

  const nodes = state.network?.nodes || [];
  const radius = 35;

  const lastLogWithConsole = [...state.logs].reverse().find(l => l.metadata?.console);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#080c10]">
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
      <div className="absolute inset-0 scanline opacity-20 pointer-events-none" />

      {/* Arena title watermark */}
      <div className="absolute top-24 left-80 z-0 pointer-events-none">
        <div className="flex items-center gap-4 opacity-5">
          <Swords size={48} className="text-on-surface" />
          <div>
            <h2 className="font-headline font-black text-5xl text-on-surface tracking-tighter uppercase italic">Simulation</h2>
            <h3 className="font-headline font-black text-5xl text-on-surface tracking-tighter -mt-2 uppercase italic">Arena</h3>
          </div>
        </div>
      </div>


      {/* ── Network Canvas ──────────────────────────────────────────────── */}

      <div className="absolute inset-0 z-10 p-24">
        <NodeMap
          nodes={nodes}
          attackerAt={state.network?.attacker_at}
          foothold={state.network?.foothold}
          onNodeClick={setSelectedNode}
        />
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
                  <div
                    className={`h-full transition-all duration-1000 ${selectedNode.status === 'patched' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-secondary shadow-[0_0_10px_rgba(255,82,95,0.5)]'}`}
                    style={{ width: `${selectedNodeRiskScore}%` }}
                  />
                </div>
                <div className="text-[9px] text-secondary/60 font-mono">
                  {selectedNode.status === 'patched' ? '0% — SECURED' :
                    (() => {
                      const score = selectedNodeRiskScore;
                      if (score > 80) return `${score}% — CRITICAL`;
                      if (score > 50) return `${score}% — HIGH`;
                      return `${score}% — MEDIUM`;
                    })()
                  }
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Unified Command Center Dock ────────────────────────────────────── */}
      <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-40 w-fit max-w-[95vw]">
        <div className="bg-[#0b0f14]/90 backdrop-blur-3xl border border-white/10 rounded-2xl p-1.5 flex items-center gap-4 shadow-[0_25px_80px_rgba(0,0,0,0.9)]">

          {/* Setup Group */}
          <div className="flex items-center gap-3 pl-2 pr-4 border-r border-white/5">
            <button onClick={() => setShowImport(true)}
              className="p-2.5 text-on-surface/40 hover:text-primary hover:bg-white/5 rounded-xl transition-all" title="Import Template">
              <Download size={18} />
            </button>
            <div className="flex items-center gap-4 px-4 py-2.5 bg-white/5 rounded-xl border border-white/5">
              <span className="text-primary font-black text-[9px] uppercase tracking-widest min-w-[42px] italic">{nodeCount} Nodes</span>
              <input type="range" min="3" max="50" value={nodeCount} onChange={(e) => setNodeCount(Number(e.target.value))} className="w-20 accent-primary scale-90" />
              <button onClick={() => randomizeMap(nodeCount)} className="p-1 text-primary/60 hover:text-primary transition-all">
                <Dices size={18} />
              </button>
            </div>
          </div>

          {/* Team Group */}
          <div className="flex items-center gap-2 px-2 border-r border-white/5">
            {/* Red Agent */}
            <div className="flex flex-col gap-1">
              <AgentCounter label="RED ADVERSARY" color="red" count={state.redAgents}
                onInc={() => setRedAgents(state.redAgents + 1)} onDec={() => setRedAgents(Math.max(1, state.redAgents - 1))} />
              <select
                value={state.redModel}
                onChange={e => setRedModel(e.target.value)}
                className="w-full bg-black/60 border border-secondary/20 text-secondary font-mono text-[8px] px-1.5 py-0.5 rounded-md focus:outline-none focus:border-secondary/60 tracking-wide"
              >
                {(state.availableModels.length > 0 ? state.availableModels : [{ id: state.redModel, name: state.redModel }]).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            {/* Blue Agent */}
            <div className="flex flex-col gap-1">
              <AgentCounter label="BLUE DEFENDER" color="blue" count={state.blueAgents}
                onInc={() => setBlueAgents(state.blueAgents + 1)} onDec={() => setBlueAgents(Math.max(0, state.blueAgents - 1))} />
              <select
                value={state.blueModel}
                onChange={e => setBlueModel(e.target.value)}
                className="w-full bg-black/60 border border-primary/20 text-primary font-mono text-[8px] px-1.5 py-0.5 rounded-md focus:outline-none focus:border-primary/60 tracking-wide"
              >
                {(state.availableModels.length > 0 ? state.availableModels : [{ id: state.blueModel, name: state.blueModel }]).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Red Team Sandbox */}
          <div className="flex items-center gap-2 px-2 border-r border-white/5">
            {/* Attack Mode Selector */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[7px] font-black uppercase tracking-widest text-secondary/60">Attack Mode</span>
              <div className="flex gap-1 p-0.5 rounded-lg bg-black/40 border border-white/5">
                {attackModes.map(m => {
                  const Icon = m.icon;
                  const active = attackType === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setAttackType(m.id)}
                      title={m.hint}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 text-[8px] font-black uppercase tracking-widest rounded-md transition-all',
                        active
                          ? 'bg-secondary text-surface-container-lowest shadow-[0_0_12px_rgba(255,82,95,0.4)]'
                          : 'text-on-surface/30 hover:text-secondary hover:bg-white/5'
                      )}
                    >
                      <Icon size={10} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Execution & Status Group */}
          <div className="flex items-center gap-4 pr-1">
            {!state.isRunning ? (
              <button onClick={() => {
                const mode = attackModes.find(m => m.id === attackType);
                startMatch(mode?.steps || 40, mode?.task || 'stealth_recon');
              }}
                className="flex items-center gap-4 pl-8 pr-10 py-4 bg-gradient-to-br from-primary to-primary-container text-on-primary font-black text-[11px] tracking-[0.4em] uppercase rounded-xl shadow-[0_10px_30px_rgba(0,218,243,0.2)] hover:scale-[1.02] active:scale-95 transition-all cursor-pointer italic whitespace-nowrap">
                <Play size={16} fill="currentColor" /> Launch Simulation
              </button>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 px-5 py-2 bg-white/5 border border-white/10 rounded-xl">
                  <div className="flex flex-col items-end">
                    <span className="text-[7px] text-on-surface/40 uppercase font-black tracking-widest leading-none mb-1">Audit Step</span>
                    <span className="text-sm font-mono text-primary font-black leading-none">{state.network?.step || 0}<span className="opacity-20 mx-0.5">/</span>40</span>
                  </div>
                  <div className="flex gap-2 border-l border-white/10 pl-3">
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-black text-secondary">{state.network?.alerts || 0}</span>
                      <AlertTriangle size={10} className="text-secondary/60" />
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-black text-green-400">{nodes.filter(n => n.status === 'patched').length}</span>
                      <Shield size={10} className="text-green-400/60" />
                    </div>
                  </div>
                </div>
                <button onClick={() => stopMatch()}
                  className="flex items-center gap-3 px-6 py-4 bg-secondary/10 border border-secondary/30 text-secondary font-black text-[10px] tracking-[0.2em] uppercase rounded-xl hover:bg-secondary/20 transition-all cursor-pointer italic">
                  <Square size={14} fill="currentColor" /> Abort
                </button>
              </div>
            )}
          </div>
        </div>
        {state.stats && (
          <button onClick={() => setShowReport(true)}
            className="absolute -top-12 left-1/2 -translate-x-1/2 w-fit flex items-center justify-center gap-3 px-8 py-2.5 bg-primary text-on-primary font-black text-[10px] tracking-[0.4em] uppercase rounded-full shadow-[0_0_30px_rgba(0,218,243,0.4)] hover:scale-105 transition-all animate-pulse pointer-events-auto">
            <FileText size={14} /> Final Report Ready
          </button>
        )}
      </div>

      {/* ── Terminal Gutter — fixed bottom drawer ────────────────────────── */}
      <div className={`fixed bottom-0 right-0 left-16 z-50 transition-all duration-500 ease-in-out ${showTerminal ? 'h-72' : 'h-10'}`}>
        {/* Header bar — always visible */}
        <div
          onClick={() => setShowTerminal(!showTerminal)}
          className="flex items-center justify-between px-6 h-10 bg-background/95 backdrop-blur-xl border-t border-primary/15 cursor-pointer hover:bg-surface-container-low/80 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className={`w-1.5 h-1.5 rounded-full ${state.isRunning ? 'bg-primary animate-pulse shadow-[0_0_8px_rgba(0,218,243,0.8)]' : 'bg-on-surface/20'}`} />
            <TerminalIcon size={12} className="text-primary/60" />
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-on-surface/40 group-hover:text-primary/60 transition-colors">
              Simulation Console
            </span>
            {(state.redLogs.length > 0 || state.blueLogs.length > 0) && (
              <span className="px-1.5 py-0.5 bg-primary/15 text-primary text-[8px] font-black rounded tracking-widest">
                {state.redLogs.length + state.blueLogs.length} events
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[8px] font-mono text-on-surface/20 uppercase tracking-widest">ADV_CONSOLE · DEF_CONSOLE</span>
            <ChevronDown size={12} className={`text-primary/40 transition-transform duration-300 ${showTerminal ? '' : 'rotate-180'}`} />
          </div>
        </div>

        {/* Terminal content */}
        {showTerminal && (
          <div className="h-[calc(100%-2.5rem)] p-3 bg-background/98 backdrop-blur-3xl border-t border-primary/5">
            <div className="h-full flex flex-col bg-black/70 rounded-xl border border-primary/20 overflow-hidden">
              <div className="bg-primary/5 px-4 py-2 border-b border-primary/15 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                  <span className="text-[8px] font-black uppercase tracking-[0.3em] text-primary/70">Unified Simulation Console</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] leading-relaxed custom-scrollbar space-y-3">
                {state.logs.length > 0 ? (
                  state.logs.map((log) => {
                    const isRed = log.content?.includes('[RED]');
                    const colorScore = isRed ? "text-secondary" : "text-primary";
                    return (
                      <div key={log.id} className="animate-in fade-in slide-in-from-bottom-2">
                        <div className={`font-bold ${colorScore}`}>
                          {log.content?.split('  |  ')[0]}
                        </div>
                        <div className={`text-on-surface/60 pl-6 border-l ml-1 mt-1 py-0.5 whitespace-pre-wrap ${isRed ? 'border-secondary/20' : 'border-primary/20'}`}>
                          &gt; {log.metadata?.console || 'Action executed.'}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="h-full flex items-center justify-center text-primary/20 italic text-[9px] uppercase tracking-widest">No events yet</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Report Modal ─────────────────────────────────────────────────── */}
      {showReport && state.stats && (
        <ReportView stats={state.stats} steps={state.network?.step || 0} alerts={state.network?.alerts || 0} onClose={() => setShowReport(false)} />
      )}

      {/* ── Import Modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showImport && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-8">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface-container border border-primary/20 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-surface-container-low">
                <div>
                  <h3 className="text-xl font-headline font-black text-on-surface uppercase italic tracking-widest">Deploy Builder Template</h3>
                  <p className="text-xs text-on-surface/50 mt-1 uppercase tracking-widest">Load saved network topologies into the arena</p>
                </div>
                <button onClick={() => setShowImport(false)} className="p-2 hover:bg-white/5 rounded-full text-on-surface/40 hover:text-on-surface">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {templates.length === 0 ? (
                  <div className="text-center py-12 text-on-surface/30 italic uppercase tracking-widest">No templates found. Save one in the Builder.</div>
                ) : (
                  templates.map(t => {
                    const totalServices = Object.keys(t.services || {}).length;
                    const exploitableServices = t.exploitable?.length || 0;
                    const rating = Math.round(((totalServices - exploitableServices) / Math.max(1, totalServices)) * 100);

                    return (
                      <div key={t.name} className="flex items-center justify-between p-4 bg-surface-container-highest border border-white/5 rounded-xl hover:border-primary/30 transition-colors group">
                        <div>
                          <div className="text-lg font-headline font-black text-primary uppercase tracking-widest italic">{t.name}</div>
                          <div className="text-xs text-on-surface/50 font-mono mt-1">
                            {totalServices} Nodes • {exploitableServices} Exploitable • Rating: <span className={rating > 70 ? 'text-green-400' : rating > 40 ? 'text-yellow-400' : 'text-secondary'}>{rating}/100</span>
                          </div>
                        </div>
                        <button onClick={() => { setActiveTemplate(t); setShowImport(false); }}
                          className="px-6 py-2 bg-primary/10 text-primary font-black text-[10px] uppercase tracking-widest rounded-lg border border-primary/30 opacity-0 group-hover:opacity-100 transition-all hover:bg-primary/20">
                          Deploy
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
