import { useState, useEffect } from 'react';

// Types
export interface NetworkNode {
    id: string;
    label: string;
    angle: number;
    status: 'open' | 'patched' | 'hidden';
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
}

export interface TrainingState {
    isTraining: boolean;
    role: 'red' | 'blue' | null;
    currentEpisode: number;
    totalEpisodes: number;
    avgReward: number;
    episodes: any[];
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
        training: {
            isTraining: false,
            role: null,
            currentEpisode: 0,
            totalEpisodes: 0,
            avgReward: 0,
            episodes: []
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
                    role: actingRole
                };
                this.setState({ logs: [...this.state.logs, newLog].slice(-100) });
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
                    episodes: []
                });
            } else if (payload.type === 'episode_done') {
                this.setTrainingState({
                    currentEpisode: payload.data.episode,
                    avgReward: payload.data.avg_reward,
                    episodes: [payload.data, ...this.state.training.episodes].slice(0, 50)
                });
            } else if (payload.type === 'train_end') {
                this.setTrainingState({ isTraining: false });
                this.trainSource?.close();
            }
        };
    }

    async startMatch(maxSteps: number = 40) {
        if (this.state.isRunning) return;
        this.setState({ stats: null, logs: [...this.state.logs, { id: 'start', timestamp: new Date().toLocaleTimeString(), type: 'system', content: 'MATCH INITIATED.' }] });
        try {
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
                    config: this.state.activeTemplate || undefined,
                }),
            });
            this.connectMatchStream();
        } catch (e) { console.error(e); }
    }

    async startTraining(role: 'red' | 'blue', episodes: number = 10, model: string = 'dolphin-llama3:latest', guidance: string = '') {
        if (this.state.training.isTraining) return;
        try {
            await fetch(`${this.baseUrl}/api/train/${role}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ episodes, model, guidance }),
            });
            this.connectTrainingStream();
        } catch (e) { console.error(e); }
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
    }
}

export const apiStore = new ApiStore();

export function useRvsbApi() {
    const [state, setState] = useState(apiStore.state);

    useEffect(() => {
        apiStore.fetchModels();
        return apiStore.subscribe(() => setState(apiStore.state));
    }, []);

    return {
        state,
        startMatch: apiStore.startMatch.bind(apiStore),
        stopMatch: apiStore.stopMatch.bind(apiStore),
        startTraining: apiStore.startTraining.bind(apiStore),
        stopTraining: apiStore.stopTraining.bind(apiStore),
        addDirective: apiStore.addDirective.bind(apiStore),
        setGlobalModel: apiStore.setGlobalModel.bind(apiStore),
        fetchModels: apiStore.fetchModels.bind(apiStore),
        setActiveTemplate: apiStore.setActiveTemplate.bind(apiStore),
    };
}
