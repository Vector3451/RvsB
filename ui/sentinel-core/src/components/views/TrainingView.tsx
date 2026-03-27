import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Target, Brain, RefreshCcw, Play, Square, Gauge, Activity, TrendingUp, History, User } from 'lucide-react';
import { GlassCard, Button, Badge } from '../ui/CyberComponents';
import { useRvsbApi } from '../../lib/useRvsbApi';

export const TrainingView = () => {
  const { state, startTraining, stopTraining, setGlobalModel } = useRvsbApi();
  const [episodes, setEpisodes] = useState(10);
  const [role, setRole] = useState<'red' | 'blue'>('red');
  const feedEndRef = useRef<HTMLDivElement>(null);

  const isTraining = state.training.isTraining;

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.training.episodes]);

  const handleStart = () => {
    startTraining(role, episodes, state.globalModel, role === 'red' ? state.redGuidance : state.blueGuidance);
  };

  return (
    <div className="flex-1 p-8 grid grid-cols-12 gap-8 max-h-screen overflow-y-auto no-scrollbar bg-background/20">
      {/* Header */}
      <div className="col-span-12 flex items-end justify-between border-b border-primary/10 pb-6 mb-2">
        <div>
          <Badge className="mb-2">Reinforcement Learning Engine</Badge>
          <h1 className="font-headline text-4xl font-black italic tracking-tight text-on-surface uppercase">Agent Training Grounds</h1>
        </div>
        {isTraining && (
          <div className="flex items-center gap-4 bg-primary/10 px-4 py-2 rounded-lg border border-primary/30 animate-pulse">
            <Activity size={16} className="text-primary" />
            <span className="text-[10px] font-black text-primary uppercase tracking-widest">PPO Training in Progress</span>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
        <GlassCard className="p-8 space-y-8">
          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant flex items-center gap-2">
                <User size={12} /> Training Target
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setRole('red')}
                  disabled={isTraining}
                  className={`flex-1 py-3 rounded-lg border transition-all uppercase text-[10px] font-black ${role === 'red' ? 'bg-secondary/20 border-secondary text-secondary shadow-[0_0_15px_rgba(255,82,95,0.2)]' : 'border-outline-variant/20 text-on-surface/40 hover:bg-surface-container-high'}`}
                >
                  Red Team
                </button>
                <button
                  onClick={() => setRole('blue')}
                  disabled={isTraining}
                  className={`flex-1 py-3 rounded-lg border transition-all uppercase text-[10px] font-black ${role === 'blue' ? 'bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(0,218,243,0.2)]' : 'border-outline-variant/20 text-on-surface/40 hover:bg-surface-container-high'}`}
                >
                  Blue Team
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant flex items-center gap-2">
                <RefreshCcw size={12} /> Episode Count
              </label>
              <input
                type="range" min="1" max="50" step="1"
                value={episodes} onChange={(e) => setEpisodes(parseInt(e.target.value))}
                disabled={isTraining}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] font-bold text-primary italic">
                <span>1 EP</span>
                <span className="text-lg">{episodes} EPISODES</span>
                <span>50 EP</span>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant flex items-center gap-2">
                <Brain size={12} /> Inference Model
              </label>
              <select
                value={state.globalModel} onChange={(e) => setGlobalModel(e.target.value)}
                disabled={isTraining}
                className="w-full bg-surface-container-high border border-outline-variant/20 p-3 rounded-lg text-xs font-mono uppercase text-on-surface focus:outline-none focus:border-primary/50"
              >
                {state.availableModels.length > 0 ? (
                  state.availableModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))
                ) : (
                  <option value="none">Loading Models...</option>
                )}
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
            <div className="text-2xl font-black font-headline italic">{state.training.currentEpisode}</div>
            <div className="text-[8px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Episode Index</div>
          </GlassCard>
          <GlassCard className="p-4 flex flex-col items-center justify-center text-center space-y-2">
            <TrendingUp size={20} className="text-secondary opacity-50" />
            <div className="text-2xl font-black font-headline italic">{state.training.avgReward.toFixed(1)}</div>
            <div className="text-[8px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Avg Reward</div>
          </GlassCard>
        </div>
      </div>

      {/* Results Feed */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
        <GlassCard className="flex-1 flex flex-col overflow-hidden min-h-[600px]">
          <div className="p-6 border-b border-primary/10 flex justify-between items-center bg-surface-container-low/20">
            <h3 className="text-sm font-black text-on-surface uppercase tracking-[0.25em] font-headline flex items-center gap-3">
              <History size={16} className="text-primary" /> Training Timeline
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-8 font-mono text-xs custom-scrollbar space-y-4">
            {state.training.episodes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-30 text-center space-y-4">
                <RefreshCcw size={48} className={isTraining ? 'animate-spin' : ''} />
                <div className="uppercase font-black tracking-[0.3em] italic">Waiting for telemetry packets...</div>
              </div>
            ) : (
              <AnimatePresence>
                {state.training.episodes.map((ep, idx) => (
                  <motion.div
                    key={ep.episode}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-4 bg-surface-container-low/40 border border-outline-variant/10 rounded-xl hover:border-primary/30 transition-all group"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-4">
                        <Badge className="bg-primary/20 text-primary">EPISODE #{ep.episode}</Badge>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                          Steps: {ep.steps} // Time: {new Date().toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase py-1 px-2 bg-secondary/20 text-secondary rounded">Reward: {ep.avg_reward.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-[10px] border-t border-white/5 pt-4">
                      <div>
                        <div className="text-on-surface-variant uppercase font-black mb-1">Agent Strategy</div>
                        <div className="italic text-on-surface/70 leading-relaxed overflow-hidden text-ellipsis line-clamp-3">
                          {ep.strategy || 'Executing baseline adversarial logic with PPO optimization.'}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between"><span>Exploration</span><span className="font-bold text-primary">{(ep.exploration_rate * 100).toFixed(1)}%</span></div>
                        <div className="flex justify-between"><span>Tactical Failures</span><span className="font-bold text-secondary">{ep.mistakes}</span></div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            <div ref={feedEndRef} />
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
