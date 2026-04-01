import { useState, useEffect } from 'react';

// Types
export interface NetworkNode {
    id: string;
    label: string;
    angle: number;
    status: 'open' | 'patched' | 'hidden';
    discovered?: boolean;
}

export interface NetworkState {
    step: number;
    nodes: NetworkNode[];
    alerts: number;
    foothold: boolean;
    flag_captured: boolean;
    attacker_at: string | null;
}

export interface MatchStats {
    red_scores: Record<string, number>;
    blue_scores: Record<string, number>;
    timeline: string[];
}

export interface FeedItem {
    id: string;
    timestamp: string;
    type: 'system' | 'directive' | 'ai' | 'train';
    content: string;
    role?: string;
    data?: any;
    metadata?: any;
}

export interface TrainingState {
    isTraining: boolean;
    role: 'red' | 'blue' | null;
    currentEpisode: number;
    totalEpisodes: number;
    avgReward: number;
    episodes: any[];
    trainStartTime: number | null;
}

export interface ModelResponse {
    id: string;
    name: string;
    source: string;
}

export interface TemplateConfig {
    name: string;
    services: Record<string, any>;
    exploitable: string[];
    connections?: { from: string; to: string }[];
}

export interface ApiState {
    isRunning: boolean;
    network: NetworkState | null;
    logs: FeedItem[];
    stats: MatchStats | null;
    redGuidance: string;
    blueGuidance: string;
    training: TrainingState;
    globalModel: string;
    availableModels: ModelResponse[];
    activeTemplate: TemplateConfig | null;
    redAgents: number;
    blueAgents: number;
    redLogs: FeedItem[];
    blueLogs: FeedItem[];
}

class ApiStore {
    state: ApiState = {
        isRunning: false,
        network: null,
        logs: [{ id: 'init', timestamp: new Date().toLocaleTimeString(), type: 'system', content: 'SYSTEM ONLINE. Awaiting engagement...' }],
        stats: null,
        redGuidance: '',
        blueGuidance: '',
        globalModel: 'dolphin-llama3:latest',
        availableModels: [],
        activeTemplate: null,
        redAgents: 1,
        blueAgents: 1,
        redLogs: [],
        blueLogs: [],
        training: {
            isTraining: false,
            role: null,
            currentEpisode: 0,
            totalEpisodes: 0,
            avgReward: 0,
            episodes: [],
            trainStartTime: null,
        }
    };
    listeners: Set<() => void> = new Set();
    baseUrl = '';
    eventSource: EventSource | null = null;
    trainSource: EventSource | null = null;

    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    notify() {
        this.listeners.forEach((l) => l());
    }

    setState(partial: Partial<ApiState>) {
        this.state = { ...this.state, ...partial };
        this.notify();
    }

    setTrainingState(partial: Partial<TrainingState>) {
        this.state.training = { ...this.state.training, ...partial };
        this.notify();
    }

    async fetchModels() {
        try {
            const res = await fetch(`${this.baseUrl}/api/models`);
            const data = await res.json();
            if (data && data.models) {
                this.setState({ availableModels: data.models });
                if (data.models.length > 0 && this.state.globalModel === 'dolphin-llama3:latest' && !data.models.find((m: any) => m.id === 'dolphin-llama3:latest')) {
                    this.setState({ globalModel: data.models[0].id });
                }
            }
        } catch (e) {
            console.error("Failed to fetch models", e);
        }
    }

    connectMatchStream() {
        if (this.eventSource) this.eventSource.close();
        this.eventSource = new EventSource(`${this.baseUrl}/api/match/stream`);
        this.setState({ isRunning: true });

        this.eventSource.onmessage = (e) => {
            const payload = JSON.parse(e.data);
            if (payload.type === 'network_state') {
                this.setState({ network: payload.data });
            } else if (payload.type === 'red_action' || payload.type === 'blue_action') {
                const actingRole = payload.type === 'red_action' ? 'RED' : 'BLUE';
                const newLog: FeedItem = {
                    id: Date.now().toString() + Math.random(),
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    type: 'ai',
                    content: `>[${actingRole}] ${payload.data.action}\n> Reward: ${payload.data.reward}\n> Reasoning: ${payload.data.reasoning || '(Standard Policy)'}`,
                    metadata: payload.data.metadata
                };

                const role = payload.data.metadata?.role?.toLowerCase();
                const partial: any = { logs: [...this.state.logs, newLog].slice(-100) };

                if (role === 'red') {
                    partial.redLogs = [...(this.state.redLogs || []), newLog].slice(-50);
                } else if (role === 'blue') {
                    partial.blueLogs = [...(this.state.blueLogs || []), newLog].slice(-50);
                }

                this.setState(partial);
            } else if (payload.type === 'match_end') {
                this.setState({ isRunning: false, stats: payload.data });
                this.eventSource?.close();
            }
        };
    }

    connectTrainingStream() {
        if (this.trainSource) this.trainSource.close();
        this.trainSource = new EventSource(`${this.baseUrl}/api/train/stream`);
        this.setTrainingState({ isTraining: true });

        this.trainSource.onmessage = (e) => {
            const payload = JSON.parse(e.data);
            if (payload.type === 'train_start') {
                this.setTrainingState({
                    role: payload.data.role,
                    totalEpisodes: payload.data.episodes,
                    episodes: [],
                    currentEpisode: 0,
                    trainStartTime: Date.now(),
                });
            } else if (payload.type === 'episode_done') {
                this.setTrainingState({
                    currentEpisode: payload.data.episode,
                    avgReward: payload.data.avg_reward,
                    episodes: [payload.data, ...this.state.training.episodes].slice(0, 50)
                });
            } else if (payload.type === 'network_state') {
                this.setState({ network: payload.data });
            } else if (payload.type === 'train_end') {
                this.setTrainingState({ isTraining: false, trainStartTime: null });
                this.trainSource?.close();
                this.trainSource = null;
            }
        };

        // Auto-reconnect if connection drops while training is still running
        this.trainSource.onerror = () => {
            if (this.state.training.isTraining) {
                setTimeout(() => {
                    if (this.state.training.isTraining) {
                        this.connectTrainingStream();
                    }
                }, 1500);
            }
        };
    }


    async startMatch(maxSteps: number = 40, taskId?: string) {
        if (this.state.isRunning) return;
        this.setState({ stats: null, logs: [...this.state.logs, { id: 'start', timestamp: new Date().toLocaleTimeString(), type: 'system', content: `MATCH INITIATED [Task: ${taskId || 'General'}]` }] });
        try {
            const config = this.state.activeTemplate ? { ...this.state.activeTemplate } : {};
            if (taskId) {
                // @ts-ignore
                config.task_id = taskId;
            }

            await fetch(`${this.baseUrl}/api/match/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    env_url: 'http://localhost:7860',
                    red_model: this.state.globalModel,
                    blue_model: this.state.globalModel,
                    max_steps: maxSteps,
                    red_guidance: this.state.redGuidance,
                    blue_guidance: this.state.blueGuidance,
                    config: Object.keys(config).length > 0 ? config : undefined,
                    red_agents: this.state.redAgents,
                    blue_agents: this.state.blueAgents,
                }),
            });
            this.connectMatchStream();
        } catch (e) { console.error(e); }
    }

    async startTraining(role: 'red' | 'blue', episodes: number = 10, model: string = 'dolphin-llama3:latest', guidance: string = '') {
        if (this.state.training.isTraining) return;
        // Clear previous training state immediately to avoid UI desync
        this.setTrainingState({
            isTraining: true,
            role: role,
            episodes: [],
            currentEpisode: 0,
            trainStartTime: Date.now()
        });
        // Connect SSE
        this.connectTrainingStream();
        try {
            await fetch(`${this.baseUrl}/api/train/${role}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ episodes, model, guidance }),
            });
        } catch (e) {
            // If POST fails, close the SSE we opened
            this.trainSource?.close();
            this.setTrainingState({ isTraining: false });
            console.error(e);
        }
    }

    async stopMatch() {
        await fetch(`${this.baseUrl}/api/match/stop`, { method: 'POST' });
        this.setState({ isRunning: false });
        if (this.eventSource) this.eventSource.close();
    }

    async stopTraining() {
        await fetch(`${this.baseUrl}/api/train/stop`, { method: 'POST' });
        this.setTrainingState({ isTraining: false });
        if (this.trainSource) this.trainSource.close();
    }

    addDirective(role: 'red' | 'blue', directive: string) {
        if (role === 'red') this.setState({ redGuidance: directive });
        else this.setState({ blueGuidance: directive });
    }

    setGlobalModel(model: string) {
        this.setState({ globalModel: model });
    }

    setActiveTemplate(template: TemplateConfig | null) {
        this.setState({ activeTemplate: template });
        // Pre-populate the Test map network so topology is visible before match starts
        if (template && template.services) {
            const serviceKeys = Object.keys(template.services);
            const preNodes = serviceKeys.map((svcId, i) => ({
                id: `${svcId}-pre-${i}`,
                label: template.services[svcId]?.label || svcId.toUpperCase(),
                angle: i * (360 / serviceKeys.length),
                status: template.exploitable?.includes(svcId) ? 'open' as const : 'patched' as const,
                discovered: true
            }));
            this.setState({
                network: {
                    ...this.state.network,
                    nodes: preNodes,
                    step: 0,
                    alerts: 0,
                    foothold: false,
                    attacker_at: null,
                } as any
            });
        } else if (!template) {
            // Clear the preview when template is deactivated
            this.setState({ network: null });
        }
    }

    randomizeMap(count: number = 5) {
        const allServices = ['ssh', 'http', 'ftp', 'smb', 'rdp', 'sql', 'nfs'];
        const selected: string[] = [];
        for (let i = 0; i < count; i++) {
            const baseType = allServices[Math.floor(Math.random() * allServices.length)];
            // unique ID for each generated service
            selected.push(`${baseType}_${i}_${Math.floor(Math.random() * 999)}`);
        }

        // Make roughly 30% of nodes exploitable (min 1)
        const numExploitable = Math.max(1, Math.floor(count * 0.3));
        const exploitable = [...selected].sort(() => 0.5 - Math.random()).slice(0, numExploitable);

        const servicesRecord: Record<string, any> = {};
        selected.forEach((s) => {
            const baseLabel = s.split('_')[0].toUpperCase();
            servicesRecord[s] = { label: baseLabel };
        });

        const template: TemplateConfig = {
            name: "Rand_Config_" + Math.floor(Math.random() * 9999),
            services: servicesRecord,
            exploitable: exploitable
        };

        this.setActiveTemplate(template);
    }

    setRedAgents(n: number) { this.setState({ redAgents: Math.max(1, Math.min(5, n)) }); }
    setBlueAgents(n: number) { this.setState({ blueAgents: Math.max(0, Math.min(5, n)) }); }
}

export const apiStore = new ApiStore();

export function useRvsbApi() {
    const [state, setState] = useState(apiStore.state);

    useEffect(() => {
        apiStore.fetchModels();
        // Auto-reconnect training stream if training in progress
        if (apiStore.state.training.isTraining) {
            apiStore.connectTrainingStream();
        }
        return apiStore.subscribe(() => setState(apiStore.state));
    }, []);

    return {
        state,
        startMatch: (steps?: number, tid?: string) => apiStore.startMatch(steps, tid),
        stopMatch: apiStore.stopMatch.bind(apiStore),
        startTraining: apiStore.startTraining.bind(apiStore),
        stopTraining: apiStore.stopTraining.bind(apiStore),
        addDirective: apiStore.addDirective.bind(apiStore),
        setGlobalModel: apiStore.setGlobalModel.bind(apiStore),
        fetchModels: apiStore.fetchModels.bind(apiStore),
        setActiveTemplate: apiStore.setActiveTemplate.bind(apiStore),
        randomizeMap: (count?: number) => apiStore.randomizeMap(count),
        setRedAgents: apiStore.setRedAgents.bind(apiStore),
        setBlueAgents: apiStore.setBlueAgents.bind(apiStore),
    };
}
