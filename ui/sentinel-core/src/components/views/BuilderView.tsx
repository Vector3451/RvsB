import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Server, Database, Shield, Router, Globe, Radio, Save, RefreshCw,
  Network, Trash2, Link2, X, Settings, Cpu, Lock, Unlock, Bug, Info
} from 'lucide-react';
import { Button } from '../ui/CyberComponents';
import { useRvsbApi, NetworkNode, TemplateConfig } from '../../lib/useRvsbApi';

// ---------------------------------------------------------------------------
// Node type catalogue
// ---------------------------------------------------------------------------
const NODE_TYPES = [
  {
    category: 'Core Network', items: [
      { id: 'router', label: 'Core Router', icon: Router, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40' },
      { id: 'firewall', label: 'Firewall', icon: Shield, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/40' },
      { id: 'switch', label: 'L3 Switch', icon: Network, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40' },
    ]
  },
  {
    category: 'Servers', items: [
      { id: 'http', label: 'Web Server', icon: Globe, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40' },
      { id: 'ftp', label: 'FTP Server', icon: Server, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40' },
      { id: 'smb', label: 'SMB Share', icon: Database, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40' },
      { id: 'rdp', label: 'RDP Host', icon: Cpu, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40' },
      { id: 'sql', label: 'SQL Database', icon: Database, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40' },
      { id: 'dns', label: 'DNS Server', icon: Globe, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40' },
    ]
  },
  {
    category: 'Custom', items: [
      { id: 'api', label: 'Payment API', icon: Network, color: 'text-secondary', bg: 'bg-secondary/10', border: 'border-secondary/40' },
      { id: 'crm', label: 'Internal CRM', icon: Database, color: 'text-secondary', bg: 'bg-secondary/10', border: 'border-secondary/40' },
      { id: 'iot', label: 'IoT Controller', icon: Radio, color: 'text-secondary', bg: 'bg-secondary/10', border: 'border-secondary/40' },
      { id: 'ssh', label: 'SSH Gateway', icon: Lock, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/40' },
    ]
  },
];

const ALL_ITEMS = NODE_TYPES.flatMap(g => g.items);

const getNodeDef = (id: string) => ALL_ITEMS.find(n => n.id === id.split('-')[0]) || ALL_ITEMS[0];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CanvasNode {
  uid: string;
  typeId: string;
  label: string;
  x: number;
  y: number;
  // Metadata
  ip: string;
  os: 'Linux' | 'Windows' | 'Unknown';
  ports: string;
  vulns: string[];
  accessLevel: 'exploitable' | 'patched' | 'honeypot';
  securityScore: number;
  firewallRules: string;
}

interface CanvasLink {
  from: string;
  to: string;
}

const VULN_OPTIONS = ['SQLi', 'XSS', 'Unpatched SSH', 'RDP Brute-Force', 'CVE-2024-1234', 'Default Credentials', 'Log4Shell'];

const NODE_DEFAULTS: Record<string, Partial<CanvasNode>> = {
  router: { os: 'Unknown', ports: '179, 520', vulns: [], securityScore: 70, firewallRules: 'ALLOW BGP FROM INTERNAL\nDENY ALL FROM 0.0.0.0/0' },
  firewall: { os: 'Unknown', ports: '443, 22', vulns: [], securityScore: 85, firewallRules: 'DENY ALL INBOUND\nALLOW 443 FROM TRUSTED' },
  switch: { os: 'Unknown', ports: '161, 23', vulns: ['Default Credentials'], securityScore: 55, firewallRules: '' },
  http: { os: 'Linux', ports: '80, 443', vulns: ['SQLi', 'XSS'], securityScore: 35, firewallRules: 'ALLOW 80, 443 FROM 0.0.0.0/0' },
  ftp: { os: 'Linux', ports: '21, 20', vulns: ['Default Credentials'], securityScore: 25, firewallRules: 'ALLOW 21 FROM INTERNAL' },
  smb: { os: 'Windows', ports: '445, 139', vulns: ['RDP Brute-Force', 'CVE-2024-1234'], securityScore: 20, firewallRules: 'DENY 445 FROM EXTERNAL' },
  rdp: { os: 'Windows', ports: '3389', vulns: ['RDP Brute-Force'], securityScore: 30, firewallRules: 'ALLOW 3389 FROM VPN_ONLY' },
  sql: { os: 'Linux', ports: '3306, 5432', vulns: ['SQLi', 'Default Credentials'], securityScore: 40, firewallRules: 'DENY 3306 FROM EXTERNAL\nALLOW FROM APP_SUBNET' },
  dns: { os: 'Linux', ports: '53', vulns: [], securityScore: 60, firewallRules: 'ALLOW 53 UDP FROM INTERNAL' },
  api: { os: 'Linux', ports: '8443, 8080', vulns: ['XSS', 'SQLi'], securityScore: 45, firewallRules: 'ALLOW 8443 FROM GATEWAY' },
  crm: { os: 'Windows', ports: '80, 1433', vulns: ['SQLi', 'Default Credentials'], securityScore: 30, firewallRules: 'ALLOW 80 FROM OFFICE_NET' },
  iot: { os: 'Unknown', ports: '1883, 8883', vulns: ['Default Credentials', 'Log4Shell'], securityScore: 15, firewallRules: '' },
  ssh: { os: 'Linux', ports: '22', vulns: ['Unpatched SSH'], securityScore: 50, firewallRules: 'ALLOW 22 FROM BASTION_IP' },
};

const defaultNode = (typeId: string, x: number, y: number): CanvasNode => {
  const defaults = NODE_DEFAULTS[typeId] || {};
  return {
    uid: `${typeId}-${Date.now()}`,
    typeId,
    label: getNodeDef(typeId)?.label || typeId.toUpperCase(),
    x,
    y,
    ip: `10.0.${Math.floor(Math.random() * 3)}.${Math.floor(Math.random() * 254) + 1}`,
    os: defaults.os ?? 'Linux',
    ports: defaults.ports ?? '22',
    vulns: defaults.vulns ?? [],
    accessLevel: 'exploitable',
    securityScore: defaults.securityScore ?? 50,
    firewallRules: defaults.firewallRules ?? '',
  };
};

// ---------------------------------------------------------------------------
// BuilderView component
// ---------------------------------------------------------------------------
export const BuilderView = () => {
  const { state, setActiveTemplate } = useRvsbApi();
  const canvasRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [links, setLinks] = useState<CanvasLink[]>([]);
  const [selected, setSelected] = useState<CanvasNode | null>(null);
  const [dragging, setDragging] = useState<{ uid: string; ox: number; oy: number } | null>(null);
  const [linking, setLinking] = useState<string | null>(null); // uid of source node
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/templates/list')
      .then(r => r.json())
      .then(setTemplates)
      .catch(console.error);
  }, []);

  // ── Canvas drag ──────────────────────────────────────────────────────────
  const onNodeMouseDown = (e: React.MouseEvent, uid: string) => {
    if (linking) return; // ignore drag when linking
    e.stopPropagation();
    const node = nodes.find(n => n.uid === uid)!;
    setDragging({ uid, ox: e.clientX - node.x, oy: e.clientY - node.y });
    setSelected(node);
  };

  const onCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    setNodes(prev => prev.map(n =>
      n.uid === dragging.uid ? { ...n, x: e.clientX - dragging.ox, y: e.clientY - dragging.oy } : n
    ));
  }, [dragging]);

  const onCanvasMouseUp = () => setDragging(null);

  // ── Drop from sidebar ────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, typeId: string) => {
    e.dataTransfer.setData('typeId', typeId);
  };

  const onCanvasDrop = (e: React.DragEvent) => {
    const typeId = e.dataTransfer.getData('typeId');
    if (!typeId) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left - 32;
    const y = e.clientY - rect.top - 32;
    const node = defaultNode(typeId, x, y);
    setNodes(prev => [...prev, node]);
    setSelected(node);
  };

  // ── Link mode ────────────────────────────────────────────────────────────
  const onNodeLinkClick = (e: React.MouseEvent, uid: string) => {
    e.stopPropagation();
    if (!linking) {
      setLinking(uid);
    } else if (linking !== uid) {
      if (!links.some(l => (l.from === linking && l.to === uid) || (l.from === uid && l.to === linking))) {
        setLinks(prev => [...prev, { from: linking, to: uid }]);
      }
      setLinking(null);
    } else {
      setLinking(null);
    }
  };

  // ── Commit topology ──────────────────────────────────────────────────────
  const handleCommit = async () => {
    setIsSaving(true);
    setSaveStatus('ENCRYPTING…');
    const services: Record<string, any> = {};
    const exploitable: string[] = [];
    nodes.forEach(n => {
      const base = n.typeId;
      services[base] = {
        ip: n.ip,
        os: n.os,
        ports: n.ports.split(',').map(p => p.trim()),
        vulns: n.vulns,
        accessLevel: n.accessLevel,
        securityScore: n.securityScore,
        firewallRules: n.firewallRules,
        label: n.label,
      };
      if (n.accessLevel === 'exploitable') exploitable.push(base);
    });
    const config: TemplateConfig = {
      name: `Topology_${Date.now()}`,
      services,
      exploitable,
      connections: links,
    };
    try {
      await fetch('/api/templates/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: config.name, config }),
      });
      const latest = await fetch('/api/templates/list').then(r => r.json());
      setTemplates(latest);
      setSaveStatus('SYNCED ✓');
    } catch {
      setSaveStatus('SYNC FAILED');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  // ── Update a selected node field ─────────────────────────────────────────
  const updateNode = (field: keyof CanvasNode, value: any) => {
    if (!selected) return;
    const updated = { ...selected, [field]: value };
    setSelected(updated);
    setNodes(prev => prev.map(n => n.uid === updated.uid ? updated : n));
  };

  const deleteNode = () => {
    if (!selected) return;
    setNodes(prev => prev.filter(n => n.uid !== selected.uid));
    setLinks(prev => prev.filter(l => l.from !== selected.uid && l.to !== selected.uid));
    setSelected(null);
  };

  return (
    <div className="flex-1 flex overflow-hidden h-full">

      {/* ── Left Sidebar: Arsenal ─────────────────────────────────────────── */}
      <aside className="w-64 bg-surface-container-low/60 border-r border-outline-variant/10 flex flex-col z-20 flex-shrink-0">
        <div className="p-4 border-b border-outline-variant/10">
          <h2 className="font-headline font-black text-sm uppercase tracking-[0.2em] text-primary hud-glow">Node Arsenal</h2>
          <p className="text-[10px] text-on-surface/40 mt-0.5">Drag onto canvas to deploy</p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
          {NODE_TYPES.map(group => (
            <div key={group.category}>
              <div className="text-[9px] font-black uppercase tracking-[0.25em] text-on-surface/40 px-1 mb-2 flex items-center gap-2">
                <span className="w-1 h-1 bg-primary rounded-full inline-block" />
                {group.category}
              </div>
              <div className="space-y-1">
                {group.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={e => onDragStart(e, item.id)}
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-outline-variant/10 bg-surface-container/40 hover:border-primary/50 hover:bg-primary/5 cursor-grab active:cursor-grabbing transition-all group"
                    >
                      <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${item.bg} border ${item.border} flex-shrink-0`}>
                        <Icon size={16} className={item.color} />
                      </div>
                      <div>
                        <div className="text-[11px] font-bold text-on-surface group-hover:text-primary transition-colors">{item.label}</div>
                        <div className="text-[9px] text-on-surface/30 font-mono">{item.id.toUpperCase()}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-outline-variant/10 space-y-2">
          {linking && (
            <div className="py-2 px-3 bg-secondary/20 border border-secondary/40 rounded-lg text-[10px] text-secondary font-bold flex items-center gap-2">
              <Link2 size={12} />
              Click another node to link
            </div>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setNodes([]);
                setLinks([]);
                setSelected(null);
                setLinking(null);
              }}
              disabled={nodes.length === 0}
              className="px-3 py-3 !bg-secondary/10 hover:!bg-secondary/20 !border-secondary/30 !text-secondary flex-shrink-0"
              title="Clear Canvas"
            >
              <Trash2 size={14} />
            </Button>
            <Button onClick={handleCommit} disabled={isSaving || nodes.length === 0} className="flex-1 py-3 text-xs">
              {isSaving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
              {saveStatus || 'Save Topology'}
            </Button>
          </div>
        </div>
      </aside>

      {/* ── Main Canvas ───────────────────────────────────────────────────── */}
      <div
        ref={canvasRef}
        className="flex-1 relative bg-[#07090c] overflow-hidden"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(0,218,243,0.04) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
        onMouseMove={onCanvasMouseMove}
        onMouseUp={onCanvasMouseUp}
        onDrop={onCanvasDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => { setSelected(null); if (linking) setLinking(null); }}
      >
        {/* SVG connection lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {links.map((link, i) => {
            const from = nodes.find(n => n.uid === link.from);
            const to = nodes.find(n => n.uid === link.to);
            if (!from || !to) return null;
            return (
              <line
                key={i}
                x1={from.x + 32} y1={from.y + 32}
                x2={to.x + 32} y2={to.y + 32}
                stroke="rgba(0,218,243,0.3)"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map(node => {
          const def = getNodeDef(node.typeId);
          const Icon = def.icon;
          const isSelected = selected?.uid === node.uid;
          const isLinker = linking === node.uid;

          return (
            <div
              key={node.uid}
              style={{ left: node.x, top: node.y, position: 'absolute' }}
              onMouseDown={e => onNodeMouseDown(e, node.uid)}
              onClick={e => { e.stopPropagation(); setSelected(node); }}
              className="group select-none"
            >
              <div className={`relative w-16 h-16 flex flex-col items-center justify-center rounded-xl border-2 backdrop-blur-md cursor-move transition-all
                ${isSelected ? 'border-secondary shadow-[0_0_30px_rgba(255,82,95,0.5)] scale-110' :
                  isLinker ? 'border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.5)]' :
                    `${def.border} shadow-[0_0_15px_rgba(0,218,243,0.1)] hover:scale-105`}
                ${def.bg}`}
              >
                <Icon size={20} className={isSelected ? 'text-secondary' : def.color} />
                <div className={`absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] font-bold uppercase tracking-widest ${isSelected ? 'text-secondary' : 'text-on-surface/60'}`}>
                  {node.label}
                </div>
                {/* Link button */}
                <button
                  title="Draw connection"
                  onClick={e => onNodeLinkClick(e, node.uid)}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-surface-container-high border border-primary/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
                >
                  <Link2 size={10} className="text-primary" />
                </button>
                {/* Access level indicator */}
                <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border border-surface-container-low ${node.accessLevel === 'exploitable' ? 'bg-secondary' :
                  node.accessLevel === 'honeypot' ? 'bg-yellow-400' : 'bg-green-400'
                  }`} />
              </div>
            </div>
          );
        })}

        {/* Empty state hint */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center opacity-20 space-y-3">
              <Network size={64} className="mx-auto text-primary" />
              <div className="font-headline font-black text-xl uppercase tracking-[0.3em] text-on-surface">Drag nodes to build your network</div>
              <div className="text-xs text-on-surface/60">Connect them with the Link button, then configure each node's metadata</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Right Panel: Templates & Node Config ─────────────────────────── */}
      <aside className="w-72 bg-surface-container-low/60 border-l border-outline-variant/10 flex flex-col z-20 flex-shrink-0">

        {/* Saved Templates */}
        <div className="p-4 border-b border-outline-variant/10">
          <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-secondary mb-3 flex items-center gap-2">
            <span className="w-1 h-1 bg-secondary rounded-full inline-block" />
            Saved Topologies
          </h3>
          <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
            {templates.length === 0 && <div className="text-[10px] text-on-surface/30 italic">No topologies saved yet</div>}
            {templates.map(t => (
              <div
                key={t.name}
                className={`p-2.5 border rounded-lg text-[10px] font-mono transition-all flex items-center justify-between group
                  ${state.activeTemplate?.name === t.config?.name
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-outline-variant/10 text-on-surface/50 hover:border-primary/40 hover:bg-primary/5 hover:text-on-surface'
                  }`}
              >
                <span className="truncate font-bold cursor-pointer flex-1" onClick={() => setActiveTemplate(t.config)}>{t.name}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    title="Delete Topology"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (confirm(`Delete topology '${t.name}'?`)) {
                        await fetch('/api/templates/delete', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name: t.name })
                        });
                        const latest = await fetch('/api/templates/list').then(r => r.json());
                        setTemplates(latest);
                        if (state.activeTemplate?.name === t.name) setActiveTemplate(null);
                      }
                    }}
                    className="p-1 hover:bg-secondary/20 hover:text-secondary rounded text-on-surface/30 transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                  {state.activeTemplate?.name === t.config?.name
                    ? <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-black cursor-pointer" onClick={() => setActiveTemplate(t.config)}>ACTIVE</span>
                    : <span className="text-[8px] border border-outline-variant/20 group-hover:border-primary/40 text-on-surface/30 group-hover:text-primary/60 px-1.5 py-0.5 rounded transition-all cursor-pointer" onClick={() => setActiveTemplate(t.config)}>USE</span>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Node Config Panel */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key={selected.uid}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 space-y-4"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.25em] text-primary/60 mb-1 flex items-center gap-2">
                      <Settings size={10} /> Node Configuration
                    </div>
                    <h3 className="font-headline font-black text-lg text-primary tracking-tighter uppercase">{selected.typeId.toUpperCase()}</h3>
                  </div>
                  <button onClick={deleteNode} className="p-1.5 hover:bg-secondary/20 rounded-lg text-secondary/50 hover:text-secondary transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Label */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-on-surface/50">Display Label</label>
                  <input
                    className="w-full bg-surface-container p-2.5 rounded-lg border border-outline-variant/10 text-xs font-mono text-on-surface focus:outline-none focus:border-primary/50"
                    value={selected.label}
                    onChange={e => updateNode('label', e.target.value)}
                  />
                </div>

                {/* IP */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-on-surface/50">IP Address</label>
                  <input
                    className="w-full bg-surface-container p-2.5 rounded-lg border border-outline-variant/10 text-xs font-mono text-on-surface focus:outline-none focus:border-primary/50"
                    value={selected.ip}
                    onChange={e => updateNode('ip', e.target.value)}
                    placeholder="10.0.1.10"
                  />
                </div>

                {/* OS + Ports */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-on-surface/50">OS</label>
                    <select
                      className="w-full bg-surface-container p-2.5 rounded-lg border border-outline-variant/10 text-xs font-mono text-on-surface focus:outline-none"
                      value={selected.os}
                      onChange={e => updateNode('os', e.target.value)}
                    >
                      <option>Linux</option>
                      <option>Windows</option>
                      <option>Unknown</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-on-surface/50">Ports</label>
                    <input
                      className="w-full bg-surface-container p-2.5 rounded-lg border border-outline-variant/10 text-xs font-mono text-on-surface focus:outline-none"
                      value={selected.ports}
                      onChange={e => updateNode('ports', e.target.value)}
                      placeholder="22, 80"
                    />
                  </div>
                </div>

                {/* Access Level */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-on-surface/50">Access Level</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['exploitable', 'patched', 'honeypot'] as const).map(level => (
                      <button
                        key={level}
                        onClick={() => updateNode('accessLevel', level)}
                        className={`py-2 rounded-lg border text-[9px] font-black uppercase transition-all ${selected.accessLevel === level
                          ? level === 'exploitable' ? 'bg-secondary/20 border-secondary text-secondary'
                            : level === 'patched' ? 'bg-green-500/20 border-green-500 text-green-400'
                              : 'bg-yellow-400/20 border-yellow-400 text-yellow-300'
                          : 'border-outline-variant/10 text-on-surface/30 hover:bg-surface-container-high'
                          }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Security Score */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-on-surface/50 flex justify-between">
                    Security Score <span className={`font-black text-xs ${selected.securityScore < 40 ? 'text-secondary' : selected.securityScore < 70 ? 'text-yellow-400' : 'text-green-400'}`}>{selected.securityScore}/100</span>
                  </label>
                  <input type="range" min="0" max="100"
                    value={selected.securityScore}
                    onChange={e => updateNode('securityScore', parseInt(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>

                {/* Vulnerabilities */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-on-surface/50 flex items-center gap-1">
                    <Bug size={10} /> Known Vulnerabilities
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {VULN_OPTIONS.map(v => (
                      <button
                        key={v}
                        onClick={() => {
                          const current = selected.vulns.includes(v)
                            ? selected.vulns.filter(x => x !== v)
                            : [...selected.vulns, v];
                          updateNode('vulns', current);
                        }}
                        className={`px-2 py-1 rounded text-[9px] font-bold transition-all border ${selected.vulns.includes(v)
                          ? 'bg-secondary/20 border-secondary text-secondary'
                          : 'border-outline-variant/10 text-on-surface/40 hover:border-outline-variant/40'
                          }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Firewall Rules */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-on-surface/50">Firewall Rules</label>
                  <textarea
                    className="w-full bg-surface-container p-2.5 rounded-lg border border-outline-variant/10 text-[10px] font-mono text-on-surface focus:outline-none focus:border-primary/50 h-16 resize-none"
                    placeholder={"DENY 22 FROM 0.0.0.0/0\nALLOW 80 FROM INTERNAL"}
                    value={selected.firewallRules}
                    onChange={e => updateNode('firewallRules', e.target.value)}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-6 flex flex-col items-center justify-center h-48 text-center opacity-30"
              >
                <Info size={32} className="mb-3 text-primary" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Select a node to configure</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>
    </div>
  );
};
