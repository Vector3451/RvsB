import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Target, Brain, RefreshCcw, Play, Square, Gauge, Activity,
  TrendingUp, History, User, Clock, AlertOctagon, Compass,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { GlassCard, Button, Badge } from '../ui/CyberComponents';
import { useRvsbApi } from '../../lib/useRvsbApi';

// ── Helpers ────────────────────────────────────────────────────────────────

function formatEta(ms: number): string {
  if (ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

// ── Component ──────────────────────────────────────────────────────────────

import { NodeMap } from '../ui/NodeMap';

export const TrainingView = () => {
  const { state, startTraining, stopTraining, setGlobalModel } = useRvsbApi();
  const [episodes, setEpisodes] = useState(10);
  const [role, setRole] = useState<'red' | 'blue'>('red');
  const [now, setNow] = useState(Date.now());
  const [expandedEp, setExpandedEp] = useState<number | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const training = state.training;
  const isTraining = training.isTraining;

  // Tick every second to update ETA
  useEffect(() => {
    if (!isTraining) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isTraining]);

  // Auto-scroll feed disabled as per user request to prevent page-level jumpiness
  /*
  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [training.episodes]);
  */

  // ── ETA calculation ────────────────────────────────────────────────────
  let etaMs = 0;
  let progressPct = 0;
  if (training.trainStartTime && training.currentEpisode > 0) {
    const elapsed = now - training.trainStartTime;
    const msPerEp = elapsed / training.currentEpisode;
    const remaining = training.totalEpisodes - training.currentEpisode;
    etaMs = remaining * msPerEp;
    progressPct = (training.currentEpisode / training.totalEpisodes) * 100;
  }

  const handleStart = () => {
    startTraining(
      role,
      episodes,
      state.globalModel,
      role === 'red' ? state.redGuidance : state.blueGuidance
    );
  };

  return (
    <div className="flex-1 p-8 grid grid-cols-12 gap-8 max-h-screen overflow-y-auto custom-scrollbar bg-background/20">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="col-span-12 flex items-end justify-between border-b border-primary/10 pb-6 mb-2">
        <div>
          <Badge className="mb-2">Reinforcement Learning Engine</Badge>
          <h1 className="font-headline text-4xl font-black italic tracking-tight text-on-surface uppercase">Agent Training Grounds</h1>
        </div>
        {isTraining && (
          <div className={`flex items-center gap-4 px-4 py-2 rounded-lg border animate-pulse ${training.role === 'red' ? 'bg-secondary/10 border-secondary/30' : 'bg-primary/10 border-primary/30'}`}>
            <Activity size={16} className={training.role === 'red' ? 'text-secondary' : 'text-primary'} />
            <span className={`text-[10px] font-black uppercase tracking-widest ${training.role === 'red' ? 'text-secondary' : 'text-primary'}`}>
              PPO Training [{training.role?.toUpperCase()}] — Episode {training.currentEpisode}/{training.totalEpisodes}
            </span>
          </div>
        )}
      </div>


      {/* ── Control Panel ──────────────────────────────────────────────── */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
        <GlassCard className="p-8 space-y-8">
          <div className="space-y-6">

            {/* Role selector */}
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant flex items-center gap-2">
                <User size={12} /> Training Target
              </label>
              <div className="flex gap-2">
                {(['red', 'blue'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    disabled={isTraining}
                    className={`flex-1 py-3 rounded-lg border transition-all uppercase text-[10px] font-black
                      ${role === r
                        ? r === 'red' ? 'bg-secondary/20 border-secondary text-secondary shadow-[0_0_15px_rgba(255,82,95,0.2)]'
                          : 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(0,218,243,0.2)]'
                        : 'border-outline-variant/20 text-on-surface/40 hover:bg-surface-container-high'}`}
                  >
                    {r === 'red' ? 'Adversary' : 'Defender'}
                  </button>
                ))}
              </div>
            </div>

            {/* Episode count */}
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant flex items-center gap-2">
                <RefreshCcw size={12} /> Episode Count
              </label>
              <input type="range" min="1" max="50" step="1"
                value={episodes} onChange={e => setEpisodes(+e.target.value)}
                disabled={isTraining} className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] font-bold text-primary italic">
                <span>1 EP</span>
                <span className="text-lg">{episodes} EPISODES</span>
                <span>50 EP</span>
              </div>
            </div>

            {/* Model selector */}
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant flex items-center gap-2">
                <Brain size={12} /> Inference Model
              </label>
              <select
                value={state.globalModel} onChange={e => setGlobalModel(e.target.value)}
                disabled={isTraining}
                className="w-full bg-surface-container-high border border-outline-variant/20 p-3 rounded-lg text-xs font-mono uppercase text-on-surface focus:outline-none focus:border-primary/50"
              >
                {state.availableModels.length > 0
                  ? state.availableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)
                  : <option value="none">Loading Models...</option>}
              </select>
            </div>
          </div>

          <div className="pt-6 border-t border-outline-variant/10">
            {isTraining ? (
              <Button variant="outline" className="w-full py-4 border-secondary text-secondary hover:bg-secondary/10" onClick={stopTraining}>
                <Square size={16} fill="currentColor" /> TERMINATE TRAINING
              </Button>
            ) : (
              <Button className="w-full py-4 shadow-[0_0_30px_rgba(0,218,243,0.3)]" onClick={handleStart}>
                <Play size={16} fill="currentColor" /> INITIATE PPO BATCH
              </Button>
            )}
          </div>
        </GlassCard>

        {/* Live Gauges */}
        <div className="grid grid-cols-2 gap-4">
          <GlassCard className="p-4 flex flex-col items-center justify-center text-center space-y-2">
            <Gauge size={20} className="text-primary opacity-50" />
            <div className="text-2xl font-black font-headline italic">{training.currentEpisode}</div>
            <div className="text-[8px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Episode Index</div>
          </GlassCard>
          <GlassCard className="p-4 flex flex-col items-center justify-center text-center space-y-2">
            <TrendingUp size={20} className="text-secondary opacity-50" />
            <div className="text-2xl font-black font-headline italic">{training.avgReward.toFixed(2)}</div>
            <div className="text-[8px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Avg Reward</div>
          </GlassCard>
        </div>

        {/* ETA Card — only visible while training */}
        {isTraining && training.totalEpisodes > 0 && (
          <GlassCard className="p-5 space-y-3">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
              <div className="flex items-center gap-2 text-primary">
                <Clock size={12} /> ETA
              </div>
              <span className="text-primary text-sm font-headline italic">{formatEta(etaMs)}</span>
            </div>
            <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-primary-container shadow-[0_0_15px_rgba(0,218,243,0.5)]"
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.6 }}
              />
            </div>
            <div className="flex justify-between text-[9px] font-mono text-on-surface/40">
              <span>{training.currentEpisode} done</span>
              <span>{training.totalEpisodes - training.currentEpisode} remaining</span>
            </div>
          </GlassCard>
        )}
      </div>

      {/* ── Results Feed ─────────────────────────────────────────────────── */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
        <GlassCard className="flex-1 flex flex-col overflow-hidden min-h-[600px]">
          <div className="p-6 border-b border-primary/10 flex justify-between items-center bg-surface-container-low/20">
            <h3 className="text-sm font-black text-on-surface uppercase tracking-[0.25em] font-headline flex items-center gap-3">
              <History size={16} className={training.role === 'red' ? 'text-secondary' : 'text-primary'} />
              Training Log {training.role && `— ${training.role === 'red' ? 'ADVERSARY' : 'DEFENDER'} ROLE`}
            </h3>
            {isTraining && (
              <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 font-mono text-xs custom-scrollbar space-y-3">
            {training.episodes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-30 text-center space-y-4 py-16">
                <RefreshCcw size={48} className={isTraining ? 'animate-spin text-primary' : ''} />
                <div className="uppercase font-black tracking-[0.3em] italic">
                  {isTraining ? 'Awaiting first episode telemetry...' : 'No training sessions yet'}
                </div>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {training.episodes.map((ep) => {
                  const isExpanded = expandedEp === ep.episode;
                  const explorationPct = (ep.exploration_rate * 100).toFixed(1);
                  const isSuccess = ep.avg_reward > 0.3;

                  const teamColor = training.role === 'red' ? 'secondary' : 'primary';

                  return (
                    <motion.div
                      key={ep.episode}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`border rounded-xl overflow-hidden transition-all ${training.role === 'red' ? 'border-secondary/30' : 'border-primary/30'}`}
                    >
                      {/* Episode header */}
                      <button
                        className="w-full p-4 bg-surface-container-low/40 flex items-center justify-between hover:bg-surface-container-high/30 transition-all text-left"
                        onClick={() => setExpandedEp(isExpanded ? null : ep.episode)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${isSuccess ? (training.role === 'red' ? 'bg-secondary' : 'bg-primary') : 'bg-on-surface/20'} shadow-[0_0_6px_rgba(var(--color-primary),0.8)]`} />
                          <Badge className={training.role === 'red' ? 'bg-secondary/20 text-secondary' : 'bg-primary/20 text-primary'}>
                            EP #{String(ep.episode).padStart(3, '0')}
                          </Badge>
                          <span className="text-on-surface/40 text-[10px]">Steps: {ep.steps}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`text-sm font-headline font-black italic ${training.role === 'red' ? 'text-secondary' : 'text-primary'}`}>
                            {ep.avg_reward >= 0 ? '+' : ''}{ep.avg_reward.toFixed(3)}
                          </span>
                          {isExpanded ? <ChevronUp size={14} className="text-on-surface/40" /> : <ChevronDown size={14} className="text-on-surface/40" />}
                        </div>
                      </button>

                      {/* Expanded details */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="p-5 bg-surface-container/20 space-y-4 border-t border-outline-variant/10">

                              {/* Metrics row */}
                              <div className="grid grid-cols-3 gap-3">
                                <div className="bg-surface-container-low/40 p-3 rounded-lg text-center border border-outline-variant/10">
                                  <div className="flex items-center justify-center gap-1 mb-1 text-primary">
                                    <Compass size={10} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Exploration</span>
                                  </div>
                                  <div className="text-lg font-headline font-black italic text-primary">{explorationPct}%</div>
                                  <div className="h-1 bg-surface-container-highest rounded-full mt-2 overflow-hidden">
                                    <div className="h-full bg-primary" style={{ width: `${explorationPct}%` }} />
                                  </div>
                                </div>
                                <div className="bg-surface-container-low/40 p-3 rounded-lg text-center border border-outline-variant/10">
                                  <div className="flex items-center justify-center gap-1 mb-1 text-secondary">
                                    <AlertOctagon size={10} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Failures</span>
                                  </div>
                                  <div className="text-lg font-headline font-black italic text-secondary">{ep.mistakes}</div>
                                </div>
                                <div className="bg-surface-container-low/40 p-3 rounded-lg text-center border border-outline-variant/10">
                                  <div className="flex items-center justify-center gap-1 mb-1 text-on-surface/40">
                                    <TrendingUp size={10} />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Score</span>
                                  </div>
                                  <div className="text-lg font-headline font-black italic text-on-surface">
                                    {ep.scores ? Object.values(ep.scores as Record<string, number>).map(v => (v * 100).toFixed(0)).join(' / ') : '—'}
                                  </div>
                                </div>
                              </div>

                              {/* Strategy debrief */}
                              {ep.strategy && (
                                <div className="space-y-1">
                                  <div className="text-[9px] font-black uppercase tracking-widest text-on-surface/40">Strategy Debrief</div>
                                  <div className="italic text-on-surface/70 leading-relaxed text-[10px] bg-surface-container-low/40 p-3 rounded-lg border border-outline-variant/10">
                                    {ep.strategy}
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
            <div ref={feedEndRef} />
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
