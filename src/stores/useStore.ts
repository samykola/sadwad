import { create } from 'zustand';

export interface LogLine { stream: 'stdout' | 'stderr' | 'system'; text: string; }
export interface Task { id: number; title: string; status: 'pending' | 'active' | 'done'; }

interface State {
  activeTab: 'Chat' | 'Logs' | 'Settings';
  setActiveTab: (tab: 'Chat' | 'Logs' | 'Settings') => void;
  bridge: { connected: boolean; exePath?: string | null; version?: string | null };
  setBridgeStatus: (s: Partial<State['bridge']>) => void;
  logs: LogLine[];
  appendLog: (l: LogLine) => void;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  pushMessage: (m: State['messages'][0]) => void;
  aiConfig: { provider: 'openai' | 'anthropic' | 'deepseek' | ''; };
  setAiConfig: (c: Partial<State['aiConfig']>) => void;
  tasks: Task[];
  currentTaskIndex: number;
  setTasks: (t: Task[]) => void;
  advanceTask: () => void;
  resetTasks: () => void;
}

export const useStore = create<State>((set, get) => ({
  activeTab: 'Chat',
  setActiveTab: (tab) => set({ activeTab: tab }),
  bridge: { connected: false, exePath: null, version: null },
  setBridgeStatus: (s) => set(st => ({ bridge: { ...st.bridge, ...s } })),
  logs: [],
  appendLog: (l) => set(st => ({ logs: [...st.logs.slice(-500), l] })),
  messages: [],
  pushMessage: (m) => set(st => ({ messages: [...st.messages, m] })),
  aiConfig: { provider: 'deepseek' },
  setAiConfig: (c) => set(st => ({ aiConfig: { ...st.aiConfig, ...c } })),
  tasks: [],
  currentTaskIndex: 0,
  setTasks: (tasks) => set({ tasks, currentTaskIndex: 0 }),
  advanceTask: () => set(st => {
    const next = st.currentTaskIndex + 1;
    const newTasks = st.tasks.map((t, i) => {
      if (i === st.currentTaskIndex) return { ...t, status: 'done' };
      if (i === next) return { ...t, status: 'active' };
      return t;
    });
    return { currentTaskIndex: next, tasks: newTasks };
  }),
  resetTasks: () => set({ tasks: [], currentTaskIndex: 0 }),
}));