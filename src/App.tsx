import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import MainPanel from './components/MainPanel';
import Logs from './pages/Logs';
import AIProviders from './pages/AIProviders';
import { useStore } from './stores/useStore';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 820);
  const setBridgeStatus = useStore(s => s.setBridgeStatus);
  const appendLog = useStore(s => s.appendLog);
  const activeTab = useStore(s => s.activeTab);

  useEffect(() => {
    const w = window as any;
    if (!w.omniblend) return;
    w.omniblend.bridge.onEvent(async (ev: any) => {
      if (ev.type === 'connected') {
        setBridgeStatus({ connected: true, exePath: ev.data.exePath });
        const ver = await w.omniblend.bridge.getVersion();
        setBridgeStatus({ version: ver });
      }
      if (ev.type === 'disconnected') setBridgeStatus({ connected: false });
      if (ev.type === 'stdout') appendLog({ stream: 'stdout', text: ev.data });
      if (ev.type === 'stderr') appendLog({ stream: 'stderr', text: ev.data });
    });
  }, []);

  const win = (window as any).omniblend?.win;

  return (
    <div className={"app " + (sidebarOpen ? "" : "closed")}>
      <div className="window-controls">
        <button onClick={() => win?.minimize()} title="Minimize">&#xE921;</button>
        <button onClick={() => win?.maximize()} title="Maximize">&#xE922;</button>
        <button className="close-btn" onClick={() => win?.close()} title="Close">&#xE8BB;</button>
      </div>
      <Sidebar onClose={() => setSidebarOpen(false)} />
      {activeTab === 'Chat' && <MainPanel onOpen={() => setSidebarOpen(true)} />}
      {activeTab === 'Logs' && <Logs />}
      {activeTab === 'Settings' && <AIProviders />}
    </div>
  );
}