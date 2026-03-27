import React from 'react';
import { LayoutDashboard, Map as MapIcon, Box, Terminal, Settings, HelpCircle, LogOut, Search, Radio, Wifi, Target } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useRvsbApi } from '../../lib/useRvsbApi';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar = ({ activeTab, setActiveTab }: SidebarProps) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'map', label: 'Test', icon: MapIcon },
    { id: 'builder', label: 'Builder', icon: Box },
    { id: 'training', label: 'Training', icon: Target },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full z-40 flex flex-col bg-background w-20 md:w-64 border-r border-primary/15 shadow-[20px_0_40px_rgba(0,218,243,0.05)] pt-20">
      <div className="px-6 mb-8">
        <h2 className="text-xl font-bold tracking-tighter text-primary italic font-headline">OBSIDIAN</h2>
        <p className="font-headline tracking-wider uppercase text-[0.6875rem] text-on-surface/40">SENTINEL-01</p>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-4 py-4 px-6 font-headline tracking-wider uppercase text-[0.6875rem] transition-all duration-300",
              activeTab === item.id
                ? "bg-primary/10 text-primary border-r-2 border-primary"
                : "text-on-surface/50 hover:bg-surface-container-high hover:text-primary"
            )}
          >
            <item.icon size={20} />
            <span className="hidden md:block">{item.label}</span>
          </button>
        ))}
      </nav>

    </aside>
  );
};

export const TopBar = () => {
  const { state, setGlobalModel } = useRvsbApi();

  return (
    <header className="fixed top-0 right-0 left-0 z-50 flex items-center justify-between px-8 bg-background/80 backdrop-blur-xl h-16 border-b border-primary/10">
      <div className="flex items-center gap-6">
        <span className="font-headline font-black italic tracking-tighter text-2xl">
          <span className="text-secondary">R</span>
          <span className="text-on-surface">vs</span>
          <span className="text-primary">B</span>
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3 bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant/20">
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface/50">Core Engine:</span>
          <select
            value={state.globalModel}
            onChange={(e) => setGlobalModel(e.target.value)}
            className="bg-transparent border-none text-xs font-mono font-bold uppercase text-on-surface focus:outline-none cursor-pointer"
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
    </header>
  );
};
