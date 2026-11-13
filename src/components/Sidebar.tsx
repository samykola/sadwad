
import React from 'react';
import { useStore } from '../stores/useStore';

const cube = <svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>;

export default function Sidebar({ onClose }: { onClose: () => void }) {
  const bridge = useStore(s => s.bridge);
  const activeTab = useStore(s => s.activeTab);
  const setActiveTab = useStore(s => s.setActiveTab);
  const resetTasks = useStore(s => s.resetTasks);

  const handleNewChat = () => {
    useStore.setState({ messages: [] });
    resetTasks();
    setActiveTab('Chat');
  };

  return (
    <aside className="side">
      <div className="brand">
        <svg viewBox="0 0 24 24"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></svg>
        <span>OMNIBLEND</span>
        <button onClick={onClose} title="Hide sidebar"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg></button>
      </div>

      <nav className="nav">
        <button className="primary" onClick={handleNewChat}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>New scene
        </button>
        <button onClick={() => setActiveTab('Chat')}>
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>Search
        </button>
        <button onClick={() => setActiveTab('Logs')}>
          <svg viewBox="0 0 24 24"><path d="M5 5h14v14H5zM9 9h6M9 13h4"/></svg>System Logs
        </button>
        <button onClick={() => setActiveTab('Settings')}>
          <svg viewBox="0 0 24 24"><rect x="4" y="8" width="12" height="12" rx="2"/><path d="M8 4h11a1 1 0 011 1v11"/></svg>Settings
        </button>
      </nav>

      <div className="group">Today</div>
      <div className="scenes">
        <div style={{padding: '10px', fontSize: '13px', color: 'var(--dim)'}}>No recent scenes</div>
      </div>

      <div className="foot">
        <div className="link">
          <span className={"dot " + (bridge.connected ? "" : "off")}></span>
          Blender {bridge.connected ? 'Connected' : 'Disconnected'}
        </div>
        <div className="me">
          <div className="av">S</div>
          <div>Sam <small>· Free</small></div>
        </div>
      </div>
    </aside>
  );
}
