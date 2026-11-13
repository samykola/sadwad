import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../stores/useStore';

/* ============================================================
   OMNIBLEND — ChatPanel (Claude-style) — single file
   ============================================================ */
const CSS = `
.main {
  --bg: #faf9f5;
  --surface: #ffffff;
  --surface-2: #f3f1ea;
  --text: #1f1e1d;
  --text-dim: #73726c;
  --border: rgba(31, 30, 29, 0.12);
  --border-strong: rgba(31, 30, 29, 0.22);
  --accent: #c96442;
  --accent-hover: #b5563a;
  --accent-soft: rgba(201, 100, 66, 0.1);
  --user-bubble: #f0eee6;
  --shadow: 0 0.25rem 1.5rem rgba(0, 0, 0, 0.035), 0 0 0 0.5px rgba(31, 30, 29, 0.1);
  --shadow-focus: 0 0.5rem 2rem rgba(0, 0, 0, 0.07), 0 0 0 0.5px rgba(31, 30, 29, 0.2);
  --serif: ui-serif, 'Iowan Old Style', 'Palatino Linotype', Georgia, 'Times New Roman', serif;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI Variable', 'Segoe UI', Inter, Vazirmatn, Tahoma, sans-serif;

  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}

@media (prefers-color-scheme: dark) {
  .main {
    --bg: #262624;
    --surface: #30302e;
    --surface-2: #3a3a37;
    --text: #f2f0e9;
    --text-dim: #a09f98;
    --border: rgba(255, 255, 255, 0.1);
    --border-strong: rgba(255, 255, 255, 0.2);
    --accent: #d97757;
    --accent-hover: #e48a6b;
    --accent-soft: rgba(217, 119, 87, 0.14);
    --user-bubble: #3a3936;
    --shadow: 0 0.25rem 1.5rem rgba(0, 0, 0, 0.25), 0 0 0 0.5px rgba(255, 255, 255, 0.1);
    --shadow-focus: 0 0.5rem 2rem rgba(0, 0, 0, 0.35), 0 0 0 0.5px rgba(255, 255, 255, 0.22);
  }
}

.main svg {
  width: 18px; height: 18px;
  fill: none; stroke: currentColor; stroke-width: 1.8;
  stroke-linecap: round; stroke-linejoin: round;
  flex-shrink: 0;
}

/* ---------- Top chrome ---------- */
.corner {
  position: absolute; top: 14px; right: 16px; z-index: 5;
  display: grid; place-items: center;
  width: 36px; height: 36px;
  border: 0; border-radius: 10px;
  background: transparent; color: var(--text-dim);
  cursor: pointer; transition: background .15s, color .15s;
}
.corner:hover { background: var(--surface-2); color: var(--text); }

.plan {
  position: absolute; top: 18px; left: 50%; transform: translateX(-50%); z-index: 5;
  padding: 5px 14px;
  border: 0.5px solid var(--border); border-radius: 999px;
  background: var(--surface); color: var(--text-dim);
  font-size: 12.5px; white-space: nowrap;
}
.plan b { margin: 0 4px; opacity: .5; }
.plan a { color: var(--accent); font-weight: 500; cursor: pointer; text-decoration: none; }
.plan a:hover { text-decoration: underline; }

/* ---------- Empty state ---------- */
.center-wrap { flex: 1; display: grid; place-items: center; padding: 80px 20px 120px; }
.center { width: 100%; max-width: 672px; animation: ob-rise .5s cubic-bezier(.2,.7,.2,1) both; }
@keyframes ob-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.greet {
  display: flex; align-items: center; justify-content: center; gap: 14px;
  margin: 0 0 28px;
  font-family: var(--serif);
  font-size: clamp(30px, 5vw, 42px);
  font-weight: 400; letter-spacing: -0.02em; line-height: 1.15;
  color: var(--text);
}
.greet svg { width: 34px; height: 34px; fill: var(--accent); stroke: none; animation: ob-spin 24s linear infinite; }
@keyframes ob-spin { to { transform: rotate(360deg); } }

.notice {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin: 0 18px -10px; padding: 10px 14px 24px;
  border: 0.5px solid var(--border); border-radius: 14px 14px 0 0;
  background: var(--surface-2); color: var(--text-dim); font-size: 13px;
}
.notice u { color: var(--text); text-decoration: none; font-weight: 500; }
.notice button {
  padding: 3px 12px; border: 0; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent);
  font-size: 12px; font-weight: 600; cursor: default;
}

/* ---------- Input box ---------- */
.box {
  position: relative;
  display: flex; flex-direction: column; gap: 6px;
  padding: 14px 14px 10px;
  border-radius: 24px;
  background: var(--surface);
  box-shadow: var(--shadow);
  transition: box-shadow .2s ease;
}
.box:hover, .box:focus-within { box-shadow: var(--shadow-focus); }

.box textarea {
  width: 100%; min-height: 52px; max-height: 200px;
  padding: 4px 6px;
  border: 0; outline: none; resize: none;
  background: transparent; color: var(--text);
  font: inherit; font-size: 16px; line-height: 1.55;
  overflow-y: auto;
}
.box textarea::placeholder { color: var(--text-dim); opacity: .8; }

.tools { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.tools .right { display: flex; align-items: center; gap: 4px; }

.tools button {
  display: grid; place-items: center;
  width: 34px; height: 34px;
  border: 0; border-radius: 10px;
  background: transparent; color: var(--text-dim);
  cursor: pointer; transition: background .15s, color .15s, transform .1s;
}
.tools button:hover { background: var(--surface-2); color: var(--text); }
.tools button:active { transform: scale(.94); }

.model { display: flex; align-items: center; padding: 0 4px 0 10px; height: 34px; border-radius: 10px; transition: background .15s; }
.model:hover { background: var(--surface-2); }
.model select { appearance: none; -webkit-appearance: none; padding-right: 4px; font: inherit; font-size: 13.5px; }
.model option { background: #fff; color: #000; }
.tools .chev { width: 14px; height: 14px; margin-left: -4px; margin-right: 4px; color: var(--text-dim); pointer-events: none; }

.tools .wave { display: grid; }
.tools .send { display: none; }
.box.has-text .wave, .box.has-text .mic { display: none; }
.box.has-text .send { display: grid; }

.tools .send { background: var(--accent); color: #fff; border-radius: 10px; animation: ob-pop .18s ease both; }
.tools .send:hover { background: var(--accent-hover); color: #fff; }
.tools .send:disabled { opacity: .4; cursor: not-allowed; }
.tools .send svg { stroke-width: 2.2; }
@keyframes ob-pop { from { opacity: 0; transform: scale(.8); } to { opacity: 1; transform: scale(1); } }

/* ---------- Slash menu ---------- */
.menu {
  position: absolute; left: 0; right: 0; top: calc(100% + 8px); z-index: 20;
  padding: 6px; border-radius: 16px;
  background: var(--surface); box-shadow: var(--shadow-focus);
  opacity: 0; transform: translateY(-4px); pointer-events: none;
  transition: opacity .15s ease, transform .15s ease;
}
.box.menu-up .menu { top: auto; bottom: calc(100% + 8px); transform: translateY(4px); }
.menu.show { opacity: 1; transform: translateY(0); pointer-events: auto; }
.menu div {
  display: flex; flex-direction: column; gap: 2px;
  padding: 10px 12px; border-radius: 10px;
  font-size: 14px; font-weight: 500; cursor: pointer; transition: background .12s;
}
.menu div:hover { background: var(--surface-2); }
.menu small { color: var(--text-dim); font-size: 12.5px; font-weight: 400; }

/* ---------- Active chat ---------- */
.chat-scroll { flex: 1; overflow-y: auto; padding: 72px 20px 24px; scroll-behavior: smooth; }
.chat-scroll::-webkit-scrollbar { width: 10px; }
.chat-scroll::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 10px; border: 3px solid var(--bg); }

.chat-inner { display: flex; flex-direction: column; gap: 22px; max-width: 720px; margin: 0 auto; }

.msg-wrap { display: flex; animation: ob-rise .3s ease both; }
.msg-wrap.user { justify-content: flex-end; }
.msg-wrap.assistant { justify-content: flex-start; }
.msg-wrap.system { justify-content: center; }

.msg-bubble { max-width: 85%; font-size: 16px; line-height: 1.7; word-break: break-word; }
.msg-wrap.user .msg-bubble { padding: 10px 16px; border-radius: 18px; background: var(--user-bubble); }
.msg-wrap.assistant .msg-bubble { max-width: 100%; font-family: var(--serif); font-size: 17px; }
.msg-wrap.system .msg-bubble {
  max-width: 100%; padding: 7px 14px;
  border: 0.5px solid var(--border); border-radius: 999px;
  background: var(--accent-soft); color: var(--accent);
  font-size: 13.5px; text-align: center;
}

.bottom-wrap {
  position: relative; display: flex; justify-content: center;
  padding: 0 20px 22px;
  background: linear-gradient(to top, var(--bg) 70%, transparent);
}
.bottom-wrap .box { border-radius: 22px; }
.bottom-wrap .box textarea { min-height: 28px; }

/* ---------- Mobile / a11y ---------- */
@media (max-width: 520px) {
  .plan { display: none; }
  .greet { font-size: 28px; gap: 10px; }
  .greet svg { width: 26px; height: 26px; }
  .msg-bubble { max-width: 92%; }
}
@media (prefers-reduced-motion: reduce) {
  .center, .msg-wrap, .greet svg, .tools .send { animation: none; }
}
`;

export default function ChatPanel() {
  const messages = useStore(s => s.messages);
  const pushMessage = useStore(s => s.pushMessage);
  const aiConfig = useStore(s => s.aiConfig);
  const setAiConfig = useStore(s => s.setAiConfig);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // رشد خودکار textarea بر اساس طول متن
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [input, messages.length]);

  const send = async () => {
    if (!input.trim()) return;
    if (!aiConfig.provider) {
      pushMessage({ role: 'system', content: 'لطفاً یک مدل هوش مصنوعی از منوی داخل باکس انتخاب کنید.' });
      return;
    }
    pushMessage({ role: 'user', content: input });
    const currentInput = input;
    setInput('');
    try {
      await (window as any).omniblend.ai.openWeb({ provider: aiConfig.provider, prompt: currentInput });
    } catch (e) {
      pushMessage({ role: 'system', content: 'خطا در ارتباط با مرورگر.' });
    }
  };

  const h = new Date().getHours();
  const greeting = (h < 5 ? 'Night' : h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening') + ', Sam';
  const hasText = input.trim().length > 0;
  const isMenu = input === '/';

  // تابع رندر معمولی (نه کامپوننت) تا DOM بین رندرها حفظ شود و فوکوس textarea نپرد
  const renderInputBox = (isBottom: boolean = false) => (
    <div className={'box ' + (hasText ? 'has-text ' : '') + (isBottom ? 'menu-up' : '')}>
      <textarea
        ref={taRef}
        rows={1}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          // هنگام کامپوز با کیبورد فارسی/IME، Enter نباید ارسال کند
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={isBottom ? 'Reply to OMNIBLEND...' : 'How can I help you today?  (Type / for skills)'}
        autoFocus
        dir="auto"
      />
      <div className={'menu ' + (isMenu ? 'show' : '')}>
        <div onClick={() => setInput('/docx ')}>/docx<small>Create Word documents</small></div>
        <div onClick={() => setInput('/pdf ')}>/pdf<small>Work with PDF files</small></div>
      </div>
      <div className="tools">
        <button title="Add"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></button>
        <div className="right">
          <div className="model">
            <select
              value={aiConfig.provider || ''}
              onChange={e => setAiConfig({ provider: e.target.value as any })}
              style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text)', cursor: 'pointer', fontWeight: 500 }}
            >
              <option value="" disabled>Select Model</option>
              <option value="deepseek">DeepSeek</option>
              <option value="openai">ChatGPT</option>
              <option value="anthropic">Claude</option>
            </select>
            <svg className="chev" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
          </div>
          <button className="mic" title="Voice"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg></button>
          <button className="wave" title="Voice mode"><svg viewBox="0 0 24 24"><path d="M4 12h0M8 8v8M12 4v16M16 8v8M20 12h0" /></svg></button>
          <button className="send" title="Send" onClick={send} disabled={!hasText}><svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" /></svg></button>
        </div>
      </div>
    </div>
  );

  return (
    <main className="main">
      <style>{CSS}</style>

      <button className="corner" title="Incognito"><svg viewBox="0 0 24 24"><path d="M5 10l1.5-5h11L19 10M3 10h18M7 19a3 3 0 100-6 3 3 0 000 6zM17 19a3 3 0 100-6 3 3 0 000 6zM10 16h4" /></svg></button>
      <div className="plan">Free plan <b>·</b> <a>Upgrade</a></div>

      {messages.length === 0 ? (
        // حالت اولیه (صفحه وسط)
        <div className="center-wrap">
          <div className="center">
            <h1 className="greet">
              <svg viewBox="0 0 24 24"><path d="M12 1l1.2 7.2L18 2.6l-3 6.2 7-2.4-5.4 5 6.9.2-6.6 2 5.2 4.6-6.8-.7 2.4 6.6-5.2-4.8L12 23l-1.7-6.3-5.2 4.8 2.4-6.6-6.8.7L5.9 13l-6.6-2 6.9-.2-5.4-5 7 2.4-3-6.2 4.8 5.6z" /></svg>
              <span>{greeting}</span>
            </h1>
            <div className="notice">
              <span>OMNIBLEND is ready to build in <u>Blender</u>.</span>
              <button>Ready</button>
            </div>
            {renderInputBox()}
          </div>
        </div>
      ) : (
        // حالت چت فعال
        <>
          <div className="chat-scroll">
            <div className="chat-inner">
              {messages.map((m, i) => (
                <div key={i} className={'msg-wrap ' + m.role}>
                  <div className="msg-bubble" dir="auto" style={{ whiteSpace: 'pre-wrap' }}>
                    {m.content}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </div>
          <div className="bottom-wrap">
            <div style={{ width: '720px', maxWidth: '100%' }}>
              {renderInputBox(true)}
            </div>
          </div>
        </>
      )}
    </main>
  );
}