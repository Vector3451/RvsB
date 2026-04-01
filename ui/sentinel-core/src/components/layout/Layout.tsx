import React, { useState } from 'react';
import { LayoutDashboard, Map as MapIcon, Box, Terminal, Settings, HelpCircle, LogOut, Search, Radio, Wifi, Target, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useRvsbApi } from '../../lib/useRvsbApi';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar = ({ activeTab, setActiveTab }: SidebarProps) => {
  const { state } = useRvsbApi();
  const [hovered, setHovered] = useState(false);

  const navItems = [
    { id: 'map', label: 'Simulation', icon: MapIcon },
    { id: 'builder', label: 'Builder', icon: Box },
    { id: 'training', label: 'Training', icon: Target },
  ];

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "fixed left-0 top-0 h-full z-[100] flex flex-col bg-background/90 border-r border-primary/20 shadow-[20px_0_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl pt-20 transition-all duration-300 ease-in-out",
        hovered ? "w-64" : "w-16"
      )}
    >
      {/* Branding */}
      <div className={cn("px-4 mb-8 overflow-hidden whitespace-nowrap transition-all duration-300", !hovered && "opacity-0")}>
        <h2 className="text-xl font-bold tracking-tighter text-primary italic font-headline">SENTINEL</h2>
        <p className="font-headline tracking-wider uppercase text-[0.6875rem] text-on-surface/40">CORE AUDIT PLATFORM</p>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            title={!hovered ? item.label : undefined}
            className={cn(
              "w-full flex items-center h-12 px-4 font-headline tracking-wider uppercase text-[0.6875rem] transition-all duration-200",
              activeTab === item.id
                ? "bg-primary/10 text-primary border-r-2 border-primary"
                : "text-on-surface/40 hover:bg-surface-container-high hover:text-primary",
              hovered ? "gap-4 justify-start" : "justify-center"
            )}
          >
            <item.icon size={18} className="flex-shrink-0" />
            <span className={cn(
              "transition-all duration-200 overflow-hidden",
              hovered ? "opacity-100 max-w-[120px]" : "opacity-0 max-w-0"
            )}>
              {item.label}
            </span>
          </button>
        ))}
      </nav>

      {/* Global Training Monitor */}
      {state.training.isTraining && (
        <div className={cn(
          "mx-3 mb-6 p-3 rounded-xl border animate-pulse transition-all",
          state.training.role === 'red'
            ? "bg-secondary/10 border-secondary/20 shadow-[0_0_20px_rgba(255,82,95,0.1)]"
            : "bg-primary/10 border-primary/20 shadow-[0_0_20px_rgba(0,218,243,0.1)]",
        )}>
          {hovered ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={cn("text-[8px] font-black uppercase tracking-widest", state.training.role === 'red' ? "text-secondary" : "text-primary")}>
                  {state.training.role === 'red' ? 'Adversary' : 'Defender'} Training
                </span>
                <Radio size={10} className={state.training.role === 'red' ? "text-secondary" : "text-primary"} />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-on-surface/40">EPISODE</span>
                <span className="font-bold">{state.training.currentEpisode}/{state.training.totalEpisodes}</span>
              </div>
              <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
                <div
                  className={cn("h-full transition-all duration-500", state.training.role === 'red' ? "bg-secondary" : "bg-primary")}
                  style={{ width: `${(state.training.currentEpisode / state.training.totalEpisodes) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <div className={cn("w-2 h-2 rounded-full", state.training.role === 'red' ? "bg-secondary shadow-[0_0_8px_rgba(255,82,95,0.8)]" : "bg-primary shadow-[0_0_8px_rgba(0,218,243,0.8)]")} />
            </div>
          )}
        </div>
      )}
    </aside>
  );
};

export const TopBar = () => {
  const { state, setGlobalModel } = useRvsbApi();

  return (
    <header className="fixed top-0 right-0 left-0 z-[110] flex items-center justify-between px-6 bg-background/80 backdrop-blur-xl h-14 border-b border-primary/10">
      {/* Left: Logo */}
      <div className="flex items-center gap-3 ml-16">
        <span className="font-headline font-black italic tracking-tighter text-xl">
          <span className="text-secondary">Sentinel</span>
          <span className="text-on-surface/30 mx-1">·</span>
          <span className="text-primary">Core</span>
        </span>
        <span className="px-2 py-0.5 bg-primary/10 border border-primary/20 rounded text-[8px] font-black uppercase tracking-widest text-primary">
          AUDIT PLATFORM
        </span>
      </div>

      {/* Right: Model selector */}
      <div className="flex items-center gap-4">
        {/* Status indicator */}
        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-on-surface/30">
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            state.isRunning ? "bg-primary animate-pulse shadow-[0_0_8px_rgba(0,218,243,0.8)]" : "bg-on-surface/20"
          )} />
          {state.isRunning ? <span className="text-primary">Live</span> : "Standby"}
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-outline-variant/20" />

        {/* Model selector — polished pill */}
        <div className="flex items-center gap-2 group">
          <span className="text-[9px] font-black uppercase tracking-widest text-on-surface/30">Engine</span>
          <div className="relative">
            <select
              value={state.globalModel}
              onChange={(e) => setGlobalModel(e.target.value)}
              className="appearance-none bg-surface-container-high border border-primary/30 shadow-[0_0_15px_rgba(0,218,243,0.1)] text-[10px] font-mono font-bold uppercase text-primary pl-3 pr-7 py-1.5 rounded-lg focus:outline-none focus:border-primary/60 cursor-pointer hover:border-primary/50 transition-all"
            >
              {state.availableModels.length > 0 ? (
                state.availableModels.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))
              ) : (
                <option value="none">RL Only</option>
              )}
            </select>
            {/* Custom dropdown arrow */}
            <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
              <svg className="w-3 h-3 text-primary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};


