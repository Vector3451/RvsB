import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Target, Activity, TrendingUp, Clock, AlertTriangle, CheckCircle, Award, BarChart2 } from 'lucide-react';
import { Badge, GlassCard } from '../ui/CyberComponents';

interface Props {
    stats: {
        red_scores: Record<string, number>;
        blue_scores: Record<string, number>;
        red_stats?: any;
        blue_stats?: any;
        timeline: string[];
        report_path?: string;
    } | null;
    steps: number;
    alerts: number;
    onClose: () => void;
}

const ScoreBar = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="space-y-1">
        <div className="flex justify-between text-[10px] font-bold font-headline uppercase tracking-widest">
            <span className="text-on-surface/60">{label}</span>
            <span className={color}>{(value * 100).toFixed(1)}%</span>
        </div>
        <div className="h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${value * 100}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                className={`h-full rounded-full ${color === 'text-secondary' ? 'bg-secondary shadow-[0_0_8px_rgba(255,82,95,0.6)]' : 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]'}`}
            />
        </div>
    </div>
);

export const ReportView = ({ stats, steps, alerts, onClose }: Props) => {
    if (!stats) return null;

    const redAvg = Object.values(stats.red_scores).reduce((a, b) => a + b, 0) / Math.max(Object.values(stats.red_scores).length, 1);
    const blueAvg = Object.values(stats.blue_scores).reduce((a, b) => a + b, 0) / Math.max(Object.values(stats.blue_scores).length, 1);
    const redWon = redAvg > blueAvg;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-background/80 backdrop-blur-xl z-[100] flex items-center justify-center p-6"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 40 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                    className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar bg-[#0b0f14] border border-primary/20 rounded-2xl shadow-[0_0_80px_rgba(0,218,243,0.15)] p-8"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Close */}
                    <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full text-on-surface/30 hover:text-primary transition-all">
                        <X size={20} />
                    </button>

                    {/* Header */}
                    <div className="mb-8 text-center space-y-2">
                        <Badge>Post-Match Analysis Report</Badge>
                        <h2 className="font-headline font-black text-5xl uppercase tracking-tighter mt-3">
                            {redWon
                                ? <><span className="text-secondary">Red</span> <span className="text-on-surface">Team Wins</span></>
                                : <><span className="text-primary">Blue</span> <span className="text-on-surface">Team Wins</span></>
                            }
                        </h2>
                        <p className="text-on-surface/40 text-sm font-mono uppercase tracking-widest">Simulation Complete</p>
                    </div>

                    {/* Stat cards */}
                    <div className="grid grid-cols-3 gap-4 mb-8">
                        {[
                            { icon: Clock, label: 'Total Steps', value: steps, color: 'text-primary' },
                            { icon: AlertTriangle, label: 'Alerts Triggered', value: alerts, color: 'text-secondary' },
                            { icon: Activity, label: 'Log Events', value: stats.timeline.length, color: 'text-primary' },
                        ].map(card => (
                            <GlassCard key={card.label} className="p-5 flex flex-col items-center text-center space-y-2">
                                <card.icon size={20} className={`${card.color} opacity-60`} />
                                <div className={`text-3xl font-headline font-black italic ${card.color}`}>{card.value}</div>
                                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface-variant">{card.label}</div>
                            </GlassCard>
                        ))}
                    </div>

                    {/* Score Breakdown */}
                    <div className="grid grid-cols-2 gap-6 mb-8">
                        <GlassCard className="p-6 space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-secondary flex items-center gap-2">
                                <Target size={12} /> Red Team Scores
                            </h3>
                            {Object.entries(stats.red_scores).map(([task, score]) => (
                                <ScoreBar key={task} label={task.replace(/_/g, ' ')} value={score} color="text-secondary" />
                            ))}
                            <div className="pt-3 border-t border-outline-variant/10 flex justify-between text-xs font-black font-headline">
                                <span className="text-on-surface/50 uppercase tracking-widest">Average</span>
                                <span className="text-secondary text-lg">{(redAvg * 100).toFixed(1)}%</span>
                            </div>
                        </GlassCard>

                        <GlassCard className="p-6 space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-primary flex items-center gap-2">
                                <Shield size={12} /> Blue Team Scores
                            </h3>
                            {Object.entries(stats.blue_scores).map(([task, score]) => (
                                <ScoreBar key={task} label={task.replace(/_/g, ' ')} value={score} color="text-green-400" />
                            ))}
                            <div className="pt-3 border-t border-outline-variant/10 flex justify-between text-xs font-black font-headline">
                                <span className="text-on-surface/50 uppercase tracking-widest">Average</span>
                                <span className="text-green-400 text-lg">{(blueAvg * 100).toFixed(1)}%</span>
                            </div>
                        </GlassCard>
                    </div>

                    {/* Attack Timeline */}
                    <GlassCard className="p-6">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-primary flex items-center gap-2 mb-4">
                            <BarChart2 size={12} /> Attack TimelineLog
                        </h3>
                        <div className="font-mono text-[10px] space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                            {stats.timeline.slice(0, 60).map((entry, i) => {
                                const isRed = entry.includes('[RED]');
                                const isBlue = entry.includes('[BLUE]');
                                return (
                                    <div key={i} className={`flex gap-2 ${isRed ? 'text-secondary/80' : isBlue ? 'text-primary/80' : 'text-on-surface/40'}`}>
                                        <span className="opacity-40 flex-shrink-0">{String(i + 1).padStart(3, '0')}</span>
                                        <span>{entry}</span>
                                    </div>
                                );
                            })}
                            {stats.timeline.length > 60 && (
                                <div className="text-on-surface/30 italic pt-1">...and {stats.timeline.length - 60} more events</div>
                            )}
                        </div>
                    </GlassCard>

                    {/* Winner banner */}
                    <div className={`mt-6 p-4 rounded-xl flex items-center gap-4 ${redWon ? 'bg-secondary/10 border border-secondary/30' : 'bg-primary/10 border border-primary/30'}`}>
                        <Award size={28} className={redWon ? 'text-secondary' : 'text-primary'} />
                        <div>
                            <div className={`font-headline font-black text-lg uppercase tracking-tight ${redWon ? 'text-secondary' : 'text-primary'}`}>
                                {redWon ? 'Red Team Achieved Mission Objective' : 'Blue Team Defended Successfully'}
                            </div>
                            <div className="text-[10px] text-on-surface/50 font-mono uppercase tracking-widest mt-0.5">
                                {redWon ? `Compromised network in ${steps} steps with ${alerts} alerts generated` : `Maintained network integrity over ${steps} engagement steps`}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
