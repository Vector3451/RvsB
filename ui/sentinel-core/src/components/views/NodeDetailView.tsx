import React from 'react';
import { ShieldAlert, ShieldCheck, Share2, History, BarChart3, Target } from 'lucide-react';
import { GlassCard, Badge } from '../ui/CyberComponents';
import { cn } from '@/src/lib/utils';
import { useRvsbApi } from '../../lib/useRvsbApi';

export const NodeDetailView = () => {
  const { state } = useRvsbApi();

  const activeNode = state.network?.nodes[0] || { id: 'LOCAL', label: 'SYSTEM_IDLE', status: 'hidden' };
  const step = state.network?.step || 0;
  const isRunning = state.isRunning;

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-background/30 px-6 py-10 lg:p-12">
      <div className="max-w-[1600px] mx-auto space-y-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-primary/10 pb-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Badge>{isRunning ? 'LIVE_ENGAGEMENT' : 'BASELINE_MONITOR'}</Badge>
              {isRunning && <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(0,218,243,0.8)]"></span>}
            </div>
            <h1 className="text-4xl md:text-5xl font-headline font-black tracking-tight text-on-surface uppercase italic">
              Dashboard: <span className="text-primary">{activeNode.label}</span>
            </h1>
            <p className="font-label text-sm text-on-surface-variant max-w-xl">
              Central command interface for RvsB Autonomous Security agents. Monitoring real-time reasoning and tactical drift.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-[10px] font-black tracking-[0.3em] text-primary uppercase opacity-60">Global Progress</div>
            <div className="flex items-center gap-4 bg-surface-container-high px-6 py-3 rounded-xl border border-primary/20 shadow-xl">
              <div className="text-2xl font-black font-headline italic tracking-tighter text-on-surface">{step}<span className="text-on-surface-variant/30 px-2">/</span>40</div>
              <div className="w-32 h-2 bg-background rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-primary/50 to-primary transition-all duration-500" style={{ width: `${(step / 40) * 100}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Arena / Duel Status */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <Target size={18} className="text-primary" />
            <h2 className="text-sm font-black text-on-surface uppercase tracking-[0.25em] font-headline">Agent Engagement Arena</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <GlassCard className="p-8 relative overflow-hidden group" glow>
              <div className="absolute top-0 left-0 w-2 h-full bg-secondary"></div>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-headline font-black text-2xl text-secondary tracking-tighter uppercase italic">Red_Aggressor</h3>
                  <p className="text-[10px] text-secondary/60 uppercase font-bold tracking-widest">Offensive LLM // Reasoning Layer</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-on-surface italic">{Math.round((state.stats?.red_scores?.precision_exploit || 0) * 100)}%</div>
                  <div className="text-[9px] uppercase font-bold text-secondary/40">Infiltration Score</div>
                </div>
              </div>
              <div className="p-4 bg-secondary/5 border border-secondary/20 rounded-lg italic text-xs text-secondary/80 leading-relaxed h-20 overflow-hidden">
                {state.redGuidance ? `"${state.redGuidance}"` : "Executing standard adversarial policy. No manual directive loaded."}
              </div>
            </GlassCard>

            <GlassCard className="p-8 relative overflow-hidden group" glow>
              <div className="absolute top-0 right-0 w-2 h-full bg-primary"></div>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="font-headline font-black text-2xl text-primary tracking-tighter uppercase italic">Blue_Sentinel</h3>
                  <p className="text-[10px] text-primary/60 uppercase font-bold tracking-widest">Defensive LLM // reasoning Layer</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black text-on-surface italic">{Math.round((state.stats?.blue_scores?.precision_exploit || 0) * 100)}%</div>
                  <div className="text-[9px] uppercase font-bold text-primary/40">Security Integrity</div>
                </div>
              </div>
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg italic text-xs text-primary/80 leading-relaxed h-20 overflow-hidden">
                {state.blueGuidance ? `"${state.blueGuidance}"` : "Executing hardened defensive doctrine. Multi-vector analysis active."}
              </div>
            </GlassCard>
          </div>
        </section>

        {/* Global Topology Overview & Metrics */}
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-4 space-y-8">
            <GlassCard className="p-6">
              <div className="flex justify-between items-start mb-6">
                <h3 className="font-headline font-bold text-xs tracking-[0.2em] text-on-surface-variant uppercase">Network_Alerts</h3>
                <span className={cn("text-secondary font-headline text-lg font-black uppercase", state.network?.alerts === 0 && "text-primary")}>
                  {state.network?.alerts || 0} SEVERE
                </span>
              </div>
              <div className="relative flex justify-center py-4">
                <div className="w-48 h-48 rounded-full border-[10px] border-surface-container-high relative flex items-center justify-center">
                  <div className={cn("absolute inset-0 border-[10px] border-t-transparent border-l-transparent -rotate-45 rounded-full", state.network?.foothold ? "border-secondary" : "border-primary")}></div>
                  <div className="text-center z-10">
                    <span className="text-5xl font-headline font-black text-on-surface">{state.network?.nodes?.length || 0}</span>
                    <span className="text-on-surface-variant text-[10px] block font-label opacity-60 uppercase font-black">Active_Nodes</span>
                  </div>
                </div>
              </div>
            </GlassCard>

            <GlassCard className="p-6">
              <h3 className="font-headline font-bold text-xs tracking-[0.2em] text-on-surface-variant mb-6 flex items-center gap-2 uppercase">
                <Share2 size={14} /> Critical_Node_State
              </h3>
              <div className="space-y-4">
                {(state.network?.nodes || []).slice(0, 3).map((node, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                    <div className="flex items-center gap-4">
                      <div className={cn("w-2 h-2 rounded-full", node.status === 'patched' ? "bg-primary" : "bg-secondary animate-pulse")}></div>
                      <div>
                        <div className="text-[0.7rem] font-black uppercase tracking-wider">{node.label}</div>
                        <div className="text-[0.6rem] text-on-surface-variant font-mono">STATUS: {node.status.toUpperCase()}</div>
                      </div>
                    </div>
                    {node.status === 'patched' ? <ShieldCheck size={16} className="text-primary" /> : <ShieldAlert size={16} className="text-secondary" />}
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          <div className="col-span-12 lg:col-span-8">
            <GlassCard className="flex flex-col h-full min-h-[500px]">
              <div className="p-6 border-b border-primary/10 flex justify-between items-center">
                <h3 className="font-headline font-bold text-xs tracking-[0.2em] text-on-surface-variant flex items-center gap-2 uppercase italic">
                  <BarChart3 size={14} className="text-primary" /> Multi-Agent_Duel_Feed
                </h3>
                <div className="flex gap-4 text-[9px] font-black tracking-widest text-on-surface-variant uppercase">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-primary rounded-full"></span> BLUE</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-secondary rounded-full"></span> RED</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-8 font-mono text-[11px] leading-relaxed custom-scrollbar bg-surface-container-low/20">
                {state.logs.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-on-surface/20 uppercase font-black tracking-[0.5em] italic">Awaiting AI Combat Phase...</div>
                ) : (
                  state.logs.map((log) => (
                    <div key={log.id} className="mb-6 group">
                      <div className="flex items-center gap-3 mb-2 opacity-40 group-hover:opacity-100 transition-opacity">
                        <span className="text-[9px]">{log.timestamp}</span>
                        <span className={cn("px-2 py-0.5 rounded text-[8px] font-black", log.role === 'RED' ? "bg-secondary/20 text-secondary" : "bg-primary/20 text-primary")}>
                          {log.role || 'CORE'}
                        </span>
                      </div>
                      <div className={cn("pl-4 border-l border-white/5", log.role === 'RED' ? "text-secondary/90" : "text-primary/90")}>
                        {log.content}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
};
