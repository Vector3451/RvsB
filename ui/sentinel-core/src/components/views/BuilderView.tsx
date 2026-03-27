import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Server, Database, Shield, Share2, Router, ZoomIn, ZoomOut, Undo, Redo, Focus, Eye, Zap, Save, RefreshCw, Network, AlertTriangle, Globe, Radio } from 'lucide-react';
import { GlassCard, Button } from '../ui/CyberComponents';
import { useRvsbApi, NetworkNode } from '../../lib/useRvsbApi';

interface Template {
  name: string;
  config: {
    name: string;
    services: Record<string, any>;
    exploitable: string[];
  };
}

const AVAILABLE_SERVICES = [
  { id: 'ssh', label: 'SSH Gateway', icon: Shield, type: 'core' },
  { id: 'http', label: 'Web Server', icon: Globe, type: 'core' },
  { id: 'ftp', label: 'File Transfer', icon: Server, type: 'core' },
  { id: 'smb', label: 'SMB Share', icon: Database, type: 'core' },
  { id: 'rdp', label: 'Remote Desktop', icon: Server, type: 'core' },
  { id: 'sql', label: 'Database', icon: Database, type: 'core' },
  { id: 'api', label: 'Payment API', icon: Network, type: 'custom' },
  { id: 'crm', label: 'Internal CRM', icon: Database, type: 'custom' },
  { id: 'iot', label: 'IoT Controller', icon: Radio, type: 'custom' },
];

export const BuilderView = () => {
  const { state, setActiveTemplate } = useRvsbApi();
  const [nodes, setNodes] = useState<NetworkNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    // Initial fetch of templates
    fetch('/api/templates/list')
      .then(r => r.json())
      .then(data => setTemplates(data))
      .catch(e => console.error("Failed to load templates", e));
  }, []);

  const handleSyncLiveMap = () => {
    if (state.network?.nodes) {
      setNodes(state.network.nodes.map(n => ({ ...n })));
    }
  };

  const handleAddService = (svc: typeof AVAILABLE_SERVICES[0]) => {
    const angle = nodes.length * (360 / (nodes.length + 1 || 1));
    const newNode: NetworkNode = {
      id: `${svc.id}-${Date.now()}`,
      label: svc.label,
      angle: angle,
      status: 'open',
    };

    // Recalculate angles to distribute evenly
    const newNodes = [...nodes, newNode].map((n, i, arr) => ({
      ...n,
      angle: i * (360 / arr.length)
    }));

    setNodes(newNodes);
  };

  const handleCommitArchitecture = async () => {
    setIsSaving(true);
    setSaveStatus("ENCRYPTING PAYLOAD...");

    // Convert canvas nodes to backend config format
    const serviceDict: Record<string, any> = {};
    const exploitable: string[] = [];

    nodes.forEach(n => {
      const baseName = n.id.split('-')[0];
      serviceDict[baseName] = { active: true, ports: [80] }; // Mocking basic port
      if (n.status === 'open') exploitable.push(baseName);
    });

    const payload = {
      name: `Custom_Topology_${Date.now()}`,
      config: {
        name: `Custom_Topology_${Date.now()}`,
        services: serviceDict,
        exploitable: exploitable
      }
    };

    try {
      await fetch('/api/templates/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setSaveStatus("SYNCED (200 OK)");

      // Refresh list
      const latest = await fetch('/api/templates/list').then(r => r.json());
      setTemplates(latest);
    } catch (e) {
      setSaveStatus("ERR: SYNC_FAILED");
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar: Service Picker */}
      <aside className="w-80 glass-panel border-r border-outline-variant/10 flex flex-col z-20">
        <div className="p-6 border-b border-outline-variant/10">
          <h2 className="font-headline font-black text-xl tracking-tighter mb-1 hud-glow text-primary uppercase">Service Arsenal</h2>
          <p className="text-[0.65rem] text-on-surface-variant font-headline font-bold uppercase tracking-[0.2em] opacity-60">Deploy logic units to canvas</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar">
          <section>
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
                <h3 className="text-[10px] font-black text-primary uppercase tracking-[0.25em] font-headline">Service Arsenal</h3>
              </div>
              <button
                onClick={handleSyncLiveMap}
                disabled={!state.network?.nodes}
                className="text-[9px] font-bold text-primary/60 hover:text-primary transition-colors flex items-center gap-1 uppercase tracking-widest"
              >
                <RefreshCw size={10} className={state.isRunning ? 'animate-spin' : ''} /> Sync Live
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              {AVAILABLE_SERVICES.map(svc => (
                <div key={svc.id} onClick={() => handleAddService(svc)} className="group relative p-4 bg-surface-container-low/40 border border-outline-variant/10 rounded-xl hover:border-primary/40 hover:bg-primary/5 cursor-pointer transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <svc.icon className="text-primary group-hover:scale-110 transition-transform" size={20} />
                      </div>
                      <div>
                        <div className="text-[0.75rem] font-black font-headline uppercase tracking-wider text-on-surface">{svc.label}</div>
                        <div className="text-[0.6rem] text-on-surface-variant/60 font-medium leading-tight mt-0.5">Click to deploy instance</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {templates.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4 px-2">
                <span className="w-1.5 h-1.5 bg-secondary rounded-full"></span>
                <h3 className="text-[10px] font-black text-secondary uppercase tracking-[0.25em] font-headline">Saved Templates</h3>
              </div>
              <div className="space-y-2">
                {templates.map(t => (
                  <div
                    key={t.name}
                    onClick={() => {
                      setActiveTemplate(t.config);
                      if (t.config.services) {
                        const newNodes = Object.entries(t.config.services).map(([svcId, conf], i, arr) => ({
                          id: `${svcId}-${i}`,
                          label: svcId.toUpperCase(),
                          angle: i * (360 / arr.length),
                          status: t.config.exploitable?.includes(svcId) ? 'open' as const : 'patched' as const
                        }));
                        setNodes(newNodes);
                      }
                    }}
                    className={`p-3 border rounded-lg text-xs font-mono transition-all cursor-pointer flex justify-between items-center group ${state.activeTemplate?.name === t.config.name ? 'bg-primary/20 border-primary shadow-[0_0_15px_rgba(0,218,243,0.2)] text-primary' : 'bg-surface-container-low/40 border-outline-variant/10 text-on-surface/80 hover:border-primary/50 hover:bg-surface-container-high'}`}
                  >
                    <span className="flex-1 font-bold group-hover:text-primary transition-colors">{t.name}</span>
                    {state.activeTemplate?.name === t.config.name ? (
                      <div className="text-[9px] bg-primary text-on-primary px-2 py-0.5 rounded font-black tracking-widest">ACTIVE</div>
                    ) : (
                      <div className="text-[9px] border border-outline-variant/20 group-hover:border-primary/50 text-on-surface/40 group-hover:text-primary/70 px-2 py-0.5 rounded font-black tracking-widest transition-colors">ACTIVATE</div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="p-6 bg-[#0a0f13] border-t border-outline-variant/10">
          <Button
            onClick={handleCommitArchitecture}
            disabled={isSaving || nodes.length === 0}
            className="w-full py-3.5 uppercase text-xs tracking-[0.2em]"
          >
            {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} {saveStatus || "COMMIT ARCHITECTURE"}
          </Button>
        </div>
      </aside>

      {/* Canvas */}
      <div className="flex-1 relative bg-[#0a0f13] grid-bg overflow-hidden">
        {/* Canvas Content */}
        <div className="absolute inset-0 scanline opacity-10 pointer-events-none"></div>

        {nodes.map((node) => {
          // Circular layout calculation (visual only, logic handles config)
          const radius = 35;
          const rad = (node.angle - 90) * (Math.PI / 180);
          const x = 50 + radius * Math.cos(rad);
          const y = 50 + radius * Math.sin(rad);

          const Icon = AVAILABLE_SERVICES.find(s => s.id === node.id.split('-')[0])?.icon || Server;

          return (
            <motion.div
              key={node.id}
              initial={{ scale: 0 }}
              animate={{ scale: 1, left: `${x}%`, top: `${y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-10"
              onClick={() => setSelectedNode(node)}
            >
              <div className={`relative w-16 h-16 flex items-center justify-center bg-primary/10 border ${selectedNode?.id === node.id ? 'border-secondary shadow-[0_0_30px_rgba(255,82,95,0.4)]' : 'border-primary/40 shadow-[0_0_20px_rgba(0,218,243,0.15)]'} rounded-lg backdrop-blur-sm group-hover:scale-110 transition-all`}>
                <Icon className={selectedNode?.id === node.id ? 'text-secondary' : 'text-primary'} size={24} />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-surface-container-high px-2 py-1 rounded text-[10px] uppercase font-bold text-on-surface tracking-widest border border-primary/20">
                  {node.label}
                </div>
              </div>
              {/* Connection line to center */}
              <svg className="absolute w-[200vw] h-[200vh] -left-[100vw] -top-[100vh] pointer-events-none -z-10" style={{ pointerEvents: 'none' }}>
                <line
                  x1={`${x}%`} y1={`${y}%`}
                  x2="50%" y2="50%"
                  stroke="rgba(0, 218, 243, 0.2)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              </svg>
            </motion.div>
          )
        })}

        {/* Central Router (Builder anchor) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <div className="w-20 h-20 flex items-center justify-center bg-[#141a1f] border-2 border-primary text-primary rounded-xl shadow-[0_0_40px_rgba(0,218,243,0.4)] relative">
            <Router size={32} />
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-widest uppercase bg-surface-container-highest px-3 py-1 rounded border border-primary/20">
              CORE ROUTER
            </div>
          </div>
        </div>

        {/* Selected Node Drawer/Config Panel */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute right-0 top-0 bottom-0 w-80 bg-surface-container-low/95 backdrop-blur-3xl border-l border-primary/20 shadow-2xl z-50 p-6 flex flex-col"
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="font-headline font-black text-xl text-primary tracking-tighter uppercase">Node Config</h3>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-[0.2em] font-label mt-1">{selectedNode.id}</p>
                </div>
                <button onClick={() => setSelectedNode(null)} className="text-on-surface/50 hover:text-primary">✕</button>
              </div>

              <div className="space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Access Level</label>
                  <select
                    className="w-full bg-surface-container p-3 rounded-lg border border-outline-variant/10 text-xs font-mono text-on-surface focus:outline-none focus:border-primary/50"
                    value={selectedNode.status}
                    onChange={(e) => {
                      const v = e.target.value as any;
                      setNodes(nodes.map(n => n.id === selectedNode.id ? { ...n, status: v } : n));
                      setSelectedNode({ ...selectedNode, status: v });
                    }}
                  >
                    <option value="open">EXPLOITABLE (Open)</option>
                    <option value="patched">SECURED (Patched)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Simulated Ports</label>
                  <div className="bg-surface-container p-3 rounded-lg border border-outline-variant/10 flex gap-2">
                    <span className="px-2 py-1 bg-primary/20 text-primary text-[10px] font-bold rounded">22</span>
                    <span className="px-2 py-1 bg-primary/20 text-primary text-[10px] font-bold rounded">80</span>
                    <span className="px-2 py-1 bg-surface-container-highest text-on-surface/50 text-[10px] border border-dashed border-on-surface/20 rounded">+ Add</span>
                  </div>
                </div>

                <div className="pt-4 mt-6 border-t border-outline-variant/10">
                  <button
                    onClick={() => {
                      setNodes(nodes.filter(n => n.id !== selectedNode.id));
                      setSelectedNode(null);
                    }}
                    className="w-full py-2 bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/30 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors"
                  >
                    Remove Node
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
