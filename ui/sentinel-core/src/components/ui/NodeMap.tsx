import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import {
    Network, Database, AlertTriangle, Server, Shield, Globe, Lock
} from 'lucide-react';
import { NetworkNode } from '../../lib/useRvsbApi';

interface NodeMapProps {
    nodes: NetworkNode[];
    attackerAt?: string | null;
    foothold?: boolean;
    radius?: number;
    onNodeClick?: (node: NetworkNode) => void;
}

const getIconForNode = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes('db') || l.includes('sql') || l.includes('smb')) return Database;
    if (l.includes('web') || l.includes('http')) return Globe;
    if (l.includes('fw') || l.includes('firewall')) return Shield;
    if (l.includes('lock') || l.includes('ssh')) return Lock;
    return Server;
};

export const NodeMap: React.FC<NodeMapProps> = ({
    nodes,
    attackerAt,
    foothold,
    radius = 35,
    onNodeClick
}) => {
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);
    const [isDragging, setIsDragging] = useState(false);
    const lastMouse = useRef({ x: 0, y: 0 });

    const startDrag = (e: React.MouseEvent) => {
        // Only drag on left click and ignore clicks on actual node elements
        if (e.button !== 0) return;
        setIsDragging(true);
        lastMouse.current = { x: e.clientX, y: e.clientY };
    };

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const dx = e.clientX - lastMouse.current.x;
            const dy = e.clientY - lastMouse.current.y;
            setPan(p => ({ x: p.x + dx, y: p.y + dy }));
            lastMouse.current = { x: e.clientX, y: e.clientY };
        };
        const onMouseUp = () => setIsDragging(false);

        if (isDragging) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDragging]);

    const handleWheel = (e: React.WheelEvent) => {
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setScale(s => Math.min(Math.max(0.5, s + delta), 2.5));
    };

    return (
        <div
            className={`relative w-full h-full overflow-hidden outline-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            onMouseDown={startDrag}
            onWheel={handleWheel}
        >
            <div
                className="absolute inset-0 origin-center w-full h-full pointer-events-none"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
            >
                <div className="absolute inset-0 pointer-events-auto">
                    {/* Network Connections Layer */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                        {nodes.map(node => {
                            if (node.status === 'hidden') return null;
                            const rad = (node.angle - 90) * (Math.PI / 180);
                            const x = 50 + radius * Math.cos(rad);
                            const y = 50 + radius * Math.sin(rad);
                            const isAttacked = attackerAt === node.id;
                            const isPatched = node.status === 'patched';
                            const isDiscovered = node.discovered !== false;

                            return (
                                <line key={`line-${node.id}`}
                                    x1={`${x}%`} y1={`${y}%`} x2="50%" y2="50%"
                                    stroke={!isDiscovered ? "rgba(255,255,255,0.05)" : isAttacked ? "rgba(255, 82, 95, 0.4)" : isPatched ? "rgba(34,197,94,0.3)" : "rgba(0, 218, 243, 0.2)"}
                                    strokeWidth={isAttacked ? "2" : "1"}
                                    strokeDasharray={isPatched ? "none" : !isDiscovered ? "2 6" : "4 4"}
                                />
                            );
                        })}
                    </svg>

                    {nodes.map((node) => {
                        const isDiscovered = node.discovered !== false;
                        const displayLabel = isDiscovered ? node.label : 'UNKNOWN';
                        const Icon = isDiscovered ? getIconForNode(displayLabel) : Network;

                        const rad = (node.angle - 90) * (Math.PI / 180);
                        const x = 50 + radius * Math.cos(rad);
                        const y = 50 + radius * Math.sin(rad);
                        const isAttacked = attackerAt === node.id;
                        const isPatched = node.status === 'patched';
                        if (node.status === 'hidden') return null;

                        let borderColor = 'border-primary/40', bgColor = 'bg-primary/10', glow = 'shadow-[0_0_20px_rgba(0,218,243,0.15)]', iconColor = 'text-primary';

                        if (!isDiscovered) {
                            borderColor = 'border-on-surface/10'; bgColor = 'bg-surface-container-highest/20'; glow = ''; iconColor = 'text-on-surface/20';
                        } else if (isAttacked) {
                            borderColor = 'border-secondary/80'; bgColor = 'bg-secondary/20'; glow = 'shadow-[0_0_30px_rgba(255,82,95,0.4)]'; iconColor = 'text-secondary';
                        } else if (isPatched) {
                            borderColor = 'border-green-500/50'; bgColor = 'bg-green-500/10'; glow = 'shadow-[0_0_20px_rgba(34,197,94,0.2)]'; iconColor = 'text-green-500';
                        }

                        return (
                            <motion.div key={node.id} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1, left: `${x}%`, top: `${y}%` }}
                                className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-10"
                                onClick={() => onNodeClick?.(node)}
                            >
                                <div className={`relative w-16 h-16 flex items-center justify-center ${bgColor} border ${borderColor} rounded-lg backdrop-blur-sm group-hover:scale-110 transition-all ${glow}`}>
                                    {isAttacked && <div className="absolute -inset-2 border border-secondary/50 rounded-lg animate-ping opacity-50" />}
                                    <Icon className={iconColor} size={24} />
                                    <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#080c10] ${isAttacked ? 'bg-secondary animate-pulse' : isPatched ? 'bg-green-400' : 'bg-yellow-400'}`} />
                                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-surface-container-high px-3 py-1.5 rounded text-[10px] uppercase font-black tracking-widest border border-primary/20 text-on-surface z-50 shadow-2xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                                        {displayLabel}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}

                    {/* Core Router */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer"
                        onClick={() => onNodeClick?.({ id: 'core', label: 'CORE ROUTER', angle: 0, status: 'open' })}>
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className={`w-20 h-20 flex items-center justify-center rounded-xl shadow-[0_0_40px_rgba(0,218,243,0.4)] relative z-30 ${foothold ? 'bg-secondary text-on-secondary shadow-[0_0_50px_rgba(255,82,95,0.6)]' : 'bg-primary text-on-primary'}`}>
                            {foothold ? <AlertTriangle size={32} /> : <Network size={32} />}
                        </motion.div>
                    </div>
                </div>
            </div>
        </div>
    );
};
