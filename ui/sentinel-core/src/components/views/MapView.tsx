import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Network, Database, AlertTriangle, Server, Shield, Globe, Swords, Target as TargetIcon, Play, Square } from 'lucide-react';
import { GlassCard, Badge } from '../ui/CyberComponents';
import { useRvsbApi, NetworkNode } from '../../lib/useRvsbApi';

const getIconForNode = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes('db') || l.includes('sql') || l.includes('smb')) return Database;
  if (l.includes('web') || l.includes('http')) return Globe;
  if (l.includes('fw') || l.includes('firewall')) return Shield;
  return Server;
};

export const MapView = () => {
  const { state, startMatch, stopMatch } = useRvsbApi();
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);

  const nodes = state.network?.nodes || [];
  const radius = 35;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#080c10]">
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none"></div>
      <div className="absolute inset-0 scanline opacity-20 pointer-events-none"></div>

      {/* Arena Title */}
      <div className="absolute top-24 left-12 z-0">
        <div className="flex items-center gap-4 opacity-10">
          <Swords size={48} className="text-on-surface" />
          <div>
            <h2 className="font-headline font-black text-5xl text-on-surface tracking-tighter uppercase italic">Test</h2>
            <h3 className="font-headline font-black text-5xl text-on-surface tracking-tighter -mt-2 uppercase italic">Arena</h3>
          </div>
        </div>
      </div>

      {/* Agent Status Indicators */}
      <div className="absolute top-24 right-12 z-40 space-y-4">
        <div className="flex items-center gap-4 justify-end">
          <div className="text-right">
            <div className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Red Aggressor</div>
            <div className="text-sm font-headline font-bold text-on-surface/60 italic">{state.availableModels?.find(m => m.id === state.globalModel)?.name || 'Dolphin Llama 3'}</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center shadow-[0_0_20px_rgba(255,82,95,0.3)]">
            <TargetIcon size={20} className="text-secondary" />
          </div>
        </div>
        <div className="flex items-center gap-4 justify-end">
          <div className="text-right">
            <div className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Blue Sentinel</div>
            <div className="text-sm font-headline font-bold text-on-surface/60 italic">{state.availableModels?.find(m => m.id === state.globalModel)?.name || 'Dolphin Llama 3'}</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shadow-[0_0_20px_rgba(0,218,243,0.3)]">
            <Shield size={20} className="text-primary" />
          </div>
        </div>
      </div>

      {nodes.map((node) => {
        const Icon = getIconForNode(node.label);
        const rad = (node.angle - 90) * (Math.PI / 180);
        const x = 50 + radius * Math.cos(rad);
        const y = 50 + radius * Math.sin(rad);

        const isAttacked = state.network?.attacker_at === node.id;
        const isPatched = node.status === 'patched';
        const isHidden = node.status === 'hidden';

        if (isHidden) return null;

        let borderColor = 'border-primary/40';
        let bgColor = 'bg-primary/10';
        let glow = 'shadow-[0_0_20px_rgba(0,218,243,0.15)]';
        let iconColor = 'text-primary';

        if (isAttacked) {
          borderColor = 'border-secondary-container/80';
          bgColor = 'bg-secondary-container/20';
          glow = 'shadow-[0_0_30px_rgba(255,82,95,0.4)]';
          iconColor = 'text-secondary';
        } else if (isPatched) {
          borderColor = 'border-green-500/50';
          bgColor = 'bg-green-500/10';
          glow = 'shadow-[0_0_20px_rgba(34,197,94,0.2)]';
          iconColor = 'text-green-500';
        }

        return (
          <motion.div
            key={node.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1, left: `${x}%`, top: `${y}%` }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-10`}
            onClick={() => setSelectedNode(node)}
          >
            <div className={`relative w-16 h-16 flex items-center justify-center ${bgColor} border ${borderColor} rounded-lg backdrop-blur-sm group-hover:scale-110 transition-all ${glow}`}>
              {isAttacked && <div className="absolute -inset-2 border border-secondary/50 rounded-lg animate-ping opacity-50"></div>}
              <Icon className={iconColor} size={24} />
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-surface-container-high px-3 py-1.5 rounded text-[10px] uppercase font-black tracking-widest border border-primary/20 text-on-surface z-50 shadow-2xl">
                {node.label}
              </div>
            </div>

            <svg className="absolute w-[200vw] h-[200vh] -left-[100vw] -top-[100vh] pointer-events-none -z-10" style={{ pointerEvents: 'none' }}>
              <line
                x1={`${x}%`} y1={`${y}%`}
                x2="50%" y2="50%"
                stroke={isAttacked ? "rgba(255, 82, 95, 0.4)" : "rgba(0, 218, 243, 0.2)"}
                strokeWidth={isAttacked ? "2" : "1"}
                strokeDasharray={isPatched ? "none" : "4 4"}
              />
            </svg>
          </motion.div>
        );
      })}

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer" onClick={() => setSelectedNode({ id: 'core', label: 'CORE ROUTER', angle: 0, status: 'open' })}>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className={`w-20 h-20 flex items-center justify-center rounded-xl shadow-[0_0_40px_rgba(0,218,243,0.4)] relative z-30 ${state.network?.foothold ? 'bg-secondary text-on-secondary shadow-[0_0_50px_rgba(255,82,95,0.6)]' : 'bg-primary text-on-primary font-black italic'}`}
        >
          {state.network?.foothold ? <AlertTriangle size={32} /> : <Network size={32} />}
        </motion.div>
      </div>

      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute right-0 top-0 bottom-0 w-96 bg-surface-container-low/95 backdrop-blur-3xl border-l border-primary/20 shadow-2xl z-50 p-8 flex flex-col"
          >
            <div className="flex justify-between items-start mb-10">
              <div>
                <Badge className="mb-2">Node_Analysis_Unit</Badge>
                <h3 className="font-headline font-black text-3xl text-primary tracking-tighter uppercase italic">{selectedNode.label}</h3>
              </div>
              <button onClick={() => setSelectedNode(null)} className="p-2 hover:bg-white/5 rounded-full transition-colors text-on-surface/30 hover:text-primary">✕</button>
            </div>

            <div className="space-y-8 flex-1 overflow-y-auto custom-scrollbar pr-2">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/40">Status Vector</label>
                <div className="bg-surface-container p-4 rounded-xl border border-outline-variant/10 text-xs font-mono font-bold text-on-surface">
                  {selectedNode.status.toUpperCase()}
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-primary/40">Vulnerability Assessment</label>
                <div className="bg-surface-container p-5 rounded-xl border border-outline-variant/10 space-y-4">
                  <div className="flex justify-between items-center"><span className="text-[10px] uppercase font-bold text-on-surface/60">Exploit Risk</span><span className="text-secondary font-black text-sm italic">CRITICAL</span></div>
                  <div className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden"><div className="h-full bg-secondary w-[94%] shadow-[0_0_10px_rgba(255,82,95,0.5)]"></div></div>
                </div>
              </div>
            </div>
            <div className="pt-8 border-t border-primary/10 space-y-3">
              <button className="w-full py-4 bg-primary text-on-primary font-black text-[10px] uppercase tracking-[0.2em] rounded-xl hover:opacity-90 transition-all shadow-xl">
                Load Payload
              </button>
              <button className="w-full py-4 bg-surface-container-high text-on-surface/40 border border-outline-variant/10 font-black text-[10px] uppercase tracking-[0.2em] rounded-xl hover:border-secondary hover:text-secondary transition-all">
                Isolate Segment
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-12 right-12 w-96 space-y-4 pointer-events-none z-40">
        <GlassCard className="p-6 relative overflow-hidden backdrop-blur-3xl bg-surface-container-low/60">
          <div className="absolute top-0 right-0 p-2 opacity-5"><Swords size={96} /></div>
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-headline font-black text-xs uppercase tracking-[0.3em] italic text-primary">{state.isRunning ? 'COMBAT ENGAGED' : 'ARENA READY'}</h4>
            <span className="text-on-surface font-headline font-black text-2xl italic">{state.network?.step || 0}<span className="text-on-surface/20">/</span>40</span>
          </div>
          <div className="relative h-2 bg-surface-container-highest rounded-full overflow-hidden">
            <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-primary-container transition-all duration-300 shadow-[0_0_15px_rgba(0,218,243,0.5)]" style={{ width: `${((state.network?.step || 0) / 40) * 100}%` }}></div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-container-low/60 backdrop-blur-3xl p-6 rounded-2xl border border-primary/20 shadow-2xl">
            <div className="text-3xl font-headline font-black text-on-surface italic">{nodes.filter(n => n.status === 'patched').length}<span className="text-primary/20 mx-1">/</span>{nodes.length || 5}</div>
            <div className="text-[9px] text-primary mt-2 uppercase font-black tracking-widest">Patched Units</div>
          </div>
          <div className="bg-surface-container-low/60 backdrop-blur-3xl p-6 rounded-2xl border border-secondary/20 shadow-2xl">
            <div className="text-3xl font-headline font-black text-secondary italic">{state.network?.alerts || 0}</div>
            <div className="text-[9px] text-secondary mt-2 uppercase font-black tracking-widest">Active Alerts</div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-12 left-12 z-40">
        {!state.isRunning ? (
          <button
            onClick={() => startMatch(40)}
            className="flex items-center gap-4 px-10 py-5 bg-gradient-to-br from-primary to-primary-container text-on-primary font-black text-xs tracking-[0.4em] uppercase rounded-2xl shadow-[0_10px_40px_rgba(0,218,243,0.4)] hover:scale-105 active:scale-95 transition-all cursor-pointer italic"
          >
            <Play size={18} fill="currentColor" /> Deploy Agents
          </button>
        ) : (
          <button
            onClick={() => stopMatch()}
            className="flex items-center gap-4 px-10 py-5 bg-gradient-to-br from-secondary to-secondary-container text-on-secondary font-black text-xs tracking-[0.4em] uppercase rounded-2xl shadow-[0_10px_40px_rgba(255,82,95,0.4)] hover:scale-105 active:scale-95 transition-all cursor-pointer italic"
          >
            <Square size={18} fill="currentColor" /> Abort Session
          </button>
        )}
      </div>
    </div>
  );
};
