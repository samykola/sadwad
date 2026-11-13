
import React from 'react';
import { useStore } from '../stores/useStore';

export default function AIProviders() {
  const aiConfig = useStore(s => s.aiConfig);
  const setAiConfig = useStore(s => s.setAiConfig);

  return (
    <main className="main" style={{padding: '40px', alignItems: 'flex-start', justifyContent: 'flex-start'}}>
      <div style={{maxWidth: '600px', width: '100%', margin: '0 auto', marginTop: '40px'}}>
        <h1 style={{fontSize: '24px', fontWeight: 600, marginBottom: '8px', fontFamily: 'var(--head)'}}>AI Settings</h1>
        <p style={{color: 'var(--dim)', fontSize: '14px', marginBottom: '32px'}}>Select the default web provider. OMNIBLEND will open a secure window for you to log in.</p>
        
        <div style={{background: 'var(--plum)', border: '1px solid var(--line)', borderRadius: '16px', padding: '24px'}}>
          <label style={{display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '8px'}}>Default AI Model</label>
          <select 
            value={aiConfig.provider} 
            onChange={e => setAiConfig({ provider: e.target.value as any })} 
            style={{width: '100%', background: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px', fontSize: '14px', color: 'var(--chalk)', outline: 'none', cursor: 'pointer'}}
          >
            <option value="">Select...</option>
            <option value="openai">ChatGPT (OpenAI)</option>
            <option value="anthropic">Claude (Anthropic)</option>
            <option value="deepseek">DeepSeek</option>
          </select>
          
          <div style={{marginTop: '24px', padding: '16px', background: 'rgba(234, 167, 156, 0.1)', border: '1px solid rgba(234, 167, 156, 0.2)', borderRadius: '12px', fontSize: '13px', lineHeight: '1.6', color: 'var(--accent)'}}>
            <strong style={{display: 'block', marginBottom: '4px'}}>Web Automation Active</strong>
            When you send a message, a browser window opens. Log in once, and OMNIBLEND will automatically type your prompt and extract the response.
          </div>
        </div>
      </div>
    </main>
  );
}
