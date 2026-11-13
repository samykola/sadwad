
import React, { useEffect, useRef } from 'react';
import { useStore } from '../stores/useStore';

export default function Logs() {
  const logs = useStore(s => s.logs);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  return (
    <main className="main" style={{padding: '40px', alignItems: 'flex-start', justifyContent: 'flex-start', overflow: 'hidden'}}>
      <div style={{maxWidth: '800px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100%'}}>
        <h1 style={{fontSize: '24px', marginBottom: '8px', fontFamily: 'var(--head)'}}>System Logs</h1>
        <p style={{color: 'var(--dim)', fontSize: '13px', marginBottom: '24px'}}>Blender & Bridge stdout/stderr</p>
        <div ref={ref} style={{flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6', background: 'var(--plum)', border: '1px solid var(--line)', borderRadius: '16px', padding: '16px'}}>
          {logs.length === 0 && <div style={{color: 'var(--dim)'}}>No logs yet...</div>}
          {logs.map((l, i) => (
            <div key={i} style={{color: l.stream === 'stderr' ? '#e06c75' : l.stream === 'stdout' ? 'var(--cool)' : 'var(--dim)', marginBottom: '6px'}}>
              <span style={{opacity: 0.5, marginRight: '8px'}}>{new Date().toLocaleTimeString()}</span>
              {l.text}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
