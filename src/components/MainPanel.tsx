import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../stores/useStore';

// حذف رشته‌ها از یک خط تا فقط ساختار کد بررسی شود
function stripStrings(s: string): string {
  return s
    .replace(/("""|''')[\s\S]*?\1/g, '""')
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
}

function stripFences(code: string): string {
  return code
    .replace(/^\s*```(?:python|py)?[ \t]*\r?\n?/i, '')
    .replace(/\r?\n?```\s*$/, '')
    .trim();
}

function sanitizePython(rawCode: string): string {
  const code = stripFences(rawCode).replace(/\r/g, '').replace(/\t/g, '    ');
  let inTriple: string | null = null;

  let lines = code.split('\n').map(line => {
    const trimmed = line.trim();

    if (inTriple) {
      if (line.includes(inTriple)) inTriple = null;
      return line;
    }
    const triples = line.match(/"""|'''/g);
    if (triples && triples.length % 2 === 1) { inTriple = triples[0]; return line; }

    if (trimmed === '' || trimmed.startsWith('#')) return line;

    const noStr = stripStrings(trimmed).replace(/#.*$/, '');
    if (/[\u0600-\u06FF]/.test(noStr)) return '# ' + line;

    if (/^[-=*_]{3,}/.test(trimmed)) return '# ' + line;
    if (/^\d+[\.\)]\s/.test(trimmed)) return '# ' + line;

    const isKeyword = /^(import|from|def|class|if|elif|else|for|while|try|except|finally|with|return|pass|break|continue|global|nonlocal|del|assert|raise|yield|await|async|print|not|lambda|None|True|False)\b/.test(trimmed);

    if (!isKeyword && /^[A-Za-z][A-Za-z']*(\s+[A-Za-z][A-Za-z']*){2,}\s*[.:!?]?$/.test(trimmed)) return '# ' + line;

    const hasCodeSymbols = /[\(\)\[\]\{\}'";,.=:<>+\-*\/\\]/.test(trimmed);
    if (!hasCodeSymbols && !isKeyword) return '# ' + line;
    return line;
  });

  const codeLines = lines.filter(l => l.trim() && !l.trim().startsWith('#'));
  const allZeroIndent = codeLines.length > 0 && codeLines.every(l => l === l.trimStart());

  if (allZeroIndent) {
    let blockIndent = 0;
    lines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;

      const isDedent = /^(elif|else|except|finally)\b/.test(trimmed);
      if (isDedent && blockIndent > 0) blockIndent--;

      const finalLine = '    '.repeat(blockIndent) + trimmed;

      const noComment = trimmed.replace(/\s+#.*$/, '');
      const opensBlock = /:\s*$/.test(noComment) && !noComment.endsWith('::');
      if (opensBlock) blockIndent++;

      return finalLine;
    });
  }

  return lines.join('\n');
}

/* ============================================================
   OMNIBLEND — MainPanel (Claude-style) — all styles in this file
   ============================================================ */
const CSS = `
.main.cl {
  --bg: #faf9f5;
  --surface: #ffffff;
  --surface-2: #f3f1ea;
  --raised: #f0eee6;
  --plum: #ffffff;
  --chalk: #1f1e1d;
  --dim: #73726c;
  --line: rgba(31, 30, 29, 0.13);
  --line-strong: rgba(31, 30, 29, 0.24);
  --accent: #c96442;
  --accent-hover: #b5563a;
  --accent-soft: rgba(201, 100, 66, 0.1);
  --danger: #b8463f;
  --danger-soft: rgba(184, 70, 63, 0.08);
  --code-bg: #2b2a27;
  --code-head: #35342f;
  --code-text: #ece9de;
  --shadow: 0 0.25rem 1.5rem rgba(0,0,0,.035), 0 0 0 .5px rgba(31,30,29,.1);
  --shadow-focus: 0 .5rem 2rem rgba(0,0,0,.07), 0 0 0 .5px rgba(31,30,29,.2);
  --serif: ui-serif, 'Iowan Old Style', 'Palatino Linotype', Georgia, Vazirmatn, 'Times New Roman', serif;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI Variable', 'Segoe UI', Inter, Vazirmatn, Tahoma, sans-serif;

  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  min-height: 100vh;
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--chalk);
  font-family: var(--sans);
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
@media (prefers-color-scheme: dark) {
  .main.cl {
    --bg: #262624;
    --surface: #30302e;
    --surface-2: #3a3a37;
    --raised: #3a3936;
    --plum: #30302e;
    --chalk: #f2f0e9;
    --dim: #a09f98;
    --line: rgba(255,255,255,.11);
    --line-strong: rgba(255,255,255,.2);
    --accent: #d97757;
    --accent-hover: #e48a6b;
    --accent-soft: rgba(217,119,87,.14);
    --danger: #e57a72;
    --danger-soft: rgba(229,122,114,.1);
    --code-bg: #1c1c1b;
    --code-head: #262625;
    --shadow: 0 .25rem 1.5rem rgba(0,0,0,.25), 0 0 0 .5px rgba(255,255,255,.1);
    --shadow-focus: 0 .5rem 2rem rgba(0,0,0,.35), 0 0 0 .5px rgba(255,255,255,.22);
  }
}
.main.cl *, .main.cl *::before, .main.cl *::after { box-sizing: border-box; }
.main.cl button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.main.cl svg { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

@keyframes ob-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ob-spin { to { transform: rotate(360deg); } }
@keyframes ob-pop  { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }
@keyframes ob-pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }

/* ---------- sidebar toggle ---------- */
.main.cl .open-btn {
  position: absolute; top: 12px; left: 12px; z-index: 6;
  padding: 8px; line-height: 0; border-radius: 10px; color: var(--dim);
  transition: background .15s, color .15s;
}
.main.cl .open-btn:hover { background: var(--surface-2); color: var(--chalk); }
.main.cl .open-btn svg { width: 19px; height: 19px; margin: auto; }

/* ---------- hero ---------- */
.main.cl .stage {
  width: 100%; max-width: 680px; margin: auto;
  padding: 40px 20px 90px;
  display: flex; flex-direction: column; align-items: center;
  animation: ob-rise .5s cubic-bezier(.2,.7,.2,1) both;
}
.main.cl #hero { display: block; margin: 0 auto 2px; touch-action: none; }
.main.cl .stage h1 {
  margin: 4px 0 26px;
  font-family: var(--serif); font-weight: 400;
  font-size: clamp(28px, 4.5vw, 40px);
  letter-spacing: -.02em; line-height: 1.15; text-align: center;
  color: var(--chalk);
}
.main.cl .chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 18px; }
.main.cl .chips button {
  padding: 7px 15px; border: .5px solid var(--line-strong); border-radius: 999px;
  color: var(--dim); font-size: 13.5px; transition: background .15s, color .15s;
}
.main.cl .chips button:hover { background: var(--surface-2); color: var(--chalk); }

/* ---------- input box ---------- */
.main.cl .box {
  width: 100%; margin: 0; padding: 14px 14px 10px;
  display: flex; flex-direction: column; gap: 8px;
  border: 0; border-radius: 24px; background: var(--surface);
  box-shadow: var(--shadow); transition: box-shadow .2s ease;
}
.main.cl .box:hover, .main.cl .box:focus-within { box-shadow: var(--shadow-focus); }
.main.cl .box textarea {
  width: 100%; min-height: 56px; max-height: 220px; padding: 4px 6px;
  border: 0; outline: 0; resize: none; background: transparent; color: var(--chalk);
  font: inherit; font-family: Vazirmatn, var(--sans); font-size: 16px; line-height: 1.6;
  overflow-y: auto;
}
.main.cl .box textarea::placeholder { color: var(--dim); opacity: .85; }

.main.cl .row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.main.cl .row .sp { flex: 1; }
.main.cl .icon {
  width: 34px; height: 34px; display: grid; place-items: center;
  border-radius: 10px; color: var(--dim); transition: background .15s, color .15s;
}
.main.cl .icon:hover { background: var(--surface-2); color: var(--chalk); }
.main.cl .icon svg { width: 18px; height: 18px; }

.main.cl .detail {
  height: 32px; padding: 0 10px; display: inline-flex; align-items: center; gap: 6px;
  border-radius: 10px; font-size: 13.5px; color: var(--dim);
  transition: background .15s, color .15s;
}
.main.cl .detail:hover { background: var(--surface-2); color: var(--chalk); }
.main.cl .detail b { color: var(--chalk); font-weight: 500; }
.main.cl .detail svg { width: 12px; height: 12px; stroke-width: 2.2; }

.main.cl .pill { display: inline-flex; padding: 2px; border-radius: 10px; background: var(--surface-2); }
.main.cl .pill button {
  padding: 4px 10px; border-radius: 8px; font-size: 12.5px; color: var(--dim);
  transition: background .15s, color .15s;
}
.main.cl .pill button:hover { color: var(--chalk); }
.main.cl .pill button[aria-pressed="true"] {
  background: var(--surface); color: var(--chalk); box-shadow: 0 0 0 .5px var(--line);
}

.main.cl .go {
  width: 34px; height: 34px; display: grid; place-items: center;
  border-radius: 10px; background: var(--accent); color: #fff;
  transition: background .15s, transform .1s, opacity .15s;
}
.main.cl .go:hover:not(:disabled) { background: var(--accent-hover); }
.main.cl .go:active:not(:disabled) { transform: scale(.94); }
.main.cl .go:disabled { opacity: .35; cursor: not-allowed; }
.main.cl .go svg { width: 18px; height: 18px; stroke-width: 2.3; }

/* model dropdown */
.main.cl .mwrap { position: relative; }
.main.cl .mm {
  position: absolute; right: 0; z-index: 50; min-width: 190px; padding: 6px;
  display: flex; flex-direction: column; gap: 2px;
  border-radius: 14px; background: var(--surface); box-shadow: var(--shadow-focus);
  animation: ob-pop .14s ease both; transform-origin: bottom right;
}
.main.cl .mm.up   { bottom: calc(100% + 8px); }
.main.cl .mm.down { top: calc(100% + 8px); transform-origin: top right; }
.main.cl .mi {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 9px 12px; border-radius: 9px; text-align: left; font-size: 13.5px; color: var(--chalk);
  transition: background .12s;
}
.main.cl .mi:hover { background: var(--surface-2); }
.main.cl .mi svg { width: 15px; height: 15px; color: var(--accent); stroke-width: 2.4; }

/* ---------- chat layout ---------- */
.main.cl .chat-wrapper {
  flex: 1; min-height: 0; width: 100%; max-width: 760px; margin: 0 auto; padding: 0 20px;
  display: flex; flex-direction: column;
}
.main.cl .chat-toolbar { display: flex; align-items: center; gap: 4px; padding: 14px 0 6px 44px; }
.main.cl .tb-btn { padding: 5px 10px; border-radius: 8px; font-size: 12.5px; color: var(--dim); transition: background .15s, color .15s; }
.main.cl .tb-btn:hover { background: var(--surface-2); color: var(--chalk); }
.main.cl .tb-btn.warn { color: var(--accent); }

.main.cl .chat-messages {
  flex: 1; min-height: 0; overflow-y: auto; direction: ltr;
  display: flex; flex-direction: column; gap: 18px; padding: 12px 4px 24px;
  scroll-behavior: smooth;
}
.main.cl .chat-messages::-webkit-scrollbar { width: 10px; }
.main.cl .chat-messages::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 10px; border: 3px solid var(--bg); }

.main.cl .msg { display: flex; gap: 10px; animation: ob-rise .3s ease both; }
.main.cl .msg.user { justify-content: flex-end; }
.main.cl .msg.assistant { justify-content: flex-start; }
.main.cl .msg.system { justify-content: center; }

.main.cl .bubble { white-space: pre-wrap; word-break: break-word; }
.main.cl .msg.user .bubble {
  max-width: 85%; padding: 10px 16px; border-radius: 18px;
  background: var(--raised); font-family: Vazirmatn, var(--sans); font-size: 15.5px; line-height: 1.75;
}
.main.cl .msg.assistant .bubble {
  flex: 1; min-width: 0; padding-top: 1px;
  font-family: var(--serif); font-size: 16.5px; line-height: 1.8; color: var(--chalk);
}
.main.cl .msg.system .bubble {
  max-width: 100%; padding: 5px 13px; border: .5px solid var(--line); border-radius: 999px;
  background: var(--surface-2); color: var(--dim);
  font-family: Vazirmatn, var(--sans); font-size: 12.5px; line-height: 1.8; text-align: center;
}
.main.cl .msg.system.err .bubble {
  background: var(--danger-soft); color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 30%, transparent);
}

.main.cl .spark { flex: 0 0 22px; margin-top: 5px; line-height: 0; color: var(--accent); }
.main.cl .spark svg { width: 20px; height: 20px; fill: currentColor; stroke: none; }

.main.cl .thinking { display: flex; align-items: center; gap: 10px; padding: 2px 0; color: var(--dim); font-size: 14px; }
.main.cl .thinking .spark { margin: 0; animation: ob-spin 2.4s linear infinite; }
.main.cl .thinking span.t { animation: ob-pulse 1.6s ease-in-out infinite; }

/* code block */
.main.cl .msg.code .cb { flex: 1; min-width: 0; }
.main.cl .cb { width: 100%; direction: ltr; text-align: left; border-radius: 14px; overflow: hidden; background: var(--code-bg); }
.main.cl .cb-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 8px 6px 14px; background: var(--code-head);
  font-family: var(--sans); font-size: 12px; color: #a8a69b;
}
.main.cl .cb-copy { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 6px; color: #a8a69b; transition: background .15s, color .15s; }
.main.cl .cb-copy:hover { background: rgba(255,255,255,.08); color: #fff; }
.main.cl .cb-copy svg { width: 14px; height: 14px; }
.main.cl .cb pre {
  margin: 0; padding: 14px 16px; max-height: 420px; overflow: auto; white-space: pre;
  color: var(--code-text); font-size: 13px; line-height: 1.65;
  font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace;
}

/* bottom input */
.main.cl .chat-input-wrapper {
  position: relative; padding: 0 0 20px;
  background: linear-gradient(to top, var(--bg) 78%, transparent);
}

/* ---------- timeline card ---------- */
.main.cl .tl-card {
  margin: 0 0 12px; padding: 14px 16px 10px; max-height: 270px; overflow-y: auto; direction: rtl;
  border: .5px solid var(--line); border-radius: 16px; background: var(--surface);
  font-family: Vazirmatn, var(--sans); box-shadow: var(--shadow);
}
.main.cl .tl-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; font-size: 13px; font-weight: 700; color: var(--chalk); }
.main.cl .tl-count { direction: ltr; font-size: 12px; font-weight: 500; color: var(--dim); }
.main.cl .tl-bar { height: 4px; margin-bottom: 14px; border-radius: 4px; background: var(--raised); overflow: hidden; }
.main.cl .tl-bar > i { display: block; height: 100%; background: var(--accent); transition: width .5s ease; }
.main.cl .tl-item { position: relative; display: flex; gap: 12px; align-items: flex-start; padding-bottom: 12px; }
.main.cl .tl-item:last-child { padding-bottom: 2px; }
.main.cl .tl-item::before { content: ''; position: absolute; right: 11px; top: 26px; bottom: 0; width: 2px; background: var(--line); }
.main.cl .tl-item:last-child::before { display: none; }
.main.cl .tl-item.done::before { background: var(--accent); opacity: .5; }
.main.cl .tl-dot {
  flex: 0 0 24px; height: 24px; display: grid; place-items: center; border-radius: 50%;
  border: 2px solid var(--line-strong); background: var(--surface); color: var(--dim);
  font-size: 11px; font-weight: 700; transition: all .3s;
}
.main.cl .tl-dot svg { stroke-width: 3.5; }
.main.cl .tl-item.done .tl-dot { background: var(--accent); border-color: var(--accent); color: #fff; }
.main.cl .tl-item.active .tl-dot { border-color: var(--accent); color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
.main.cl .tl-spin { width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent; animation: ob-spin .8s linear infinite; }
.main.cl .tl-text { padding-top: 1px; font-size: 14px; line-height: 1.7; color: var(--dim); transition: color .3s; }
.main.cl .tl-item.active .tl-text { color: var(--chalk); font-weight: 600; }
.main.cl .tl-item.done .tl-text { opacity: .7; }

/* ---------- mobile / a11y ---------- */
@media (max-width: 560px) {
  .main.cl .chat-wrapper { padding: 0 12px; }
  .main.cl .msg.user .bubble { max-width: 92%; }
  .main.cl .detail { padding: 0 6px; }
}
@media (prefers-reduced-motion: reduce) {
  .main.cl .stage, .main.cl .msg, .main.cl .thinking .spark, .main.cl .mm { animation: none; }
}
`;

const PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'openai', label: 'ChatGPT' },
  { id: 'anthropic', label: 'Claude' },
];
const providerLabel = (id?: string) => PROVIDERS.find(p => p.id === id)?.label || 'Select Model';

const SparkIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M12 1l1.2 7.2L18 2.6l-3 6.2 7-2.4-5.4 5 6.9.2-6.6 2 5.2 4.6-6.8-.7 2.4 6.6-5.2-4.8L12 23l-1.7-6.3-5.2 4.8 2.4-6.6-6.8.7L5.9 13l-6.6-2 6.9-.2-5.4-5 7 2.4-3-6.2 4.8 5.6z" /></svg>
);

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {}
  };
  return (
    <div className="cb">
      <div className="cb-head">
        <span>python</span>
        <button className="cb-copy" onClick={copy}>
          {copied
            ? <svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" /></svg>
            : <svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 012-2h9" /></svg>}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{code}</pre>
    </div>
  );
}

const InputBox = ({ isBottom, prompt, setPrompt, generate, aiConfig, setAiConfig, format, setFormat, detailLv, setDetailLv, isMenuOpen, setIsMenuOpen, levels }: any) => {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // رشد خودکار textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
  }, [prompt]);

  // بستن منوی مدل با کلیک بیرون
  useEffect(() => {
    if (!isMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isMenuOpen]);

  return (
    <div className="box">
      <textarea
        ref={taRef}
        rows={1}
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any).isComposing) { e.preventDefault(); generate(); } }}
        placeholder={isBottom ? 'Reply to OMNIBLEND…' : 'Describe a scene, a prop or a whole room…'}
        dir="auto"
        autoFocus={!isBottom}
      />
      <div className="row">
        <button className="icon" title="Add a reference image"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2.5" /><circle cx="9" cy="10" r="1.5" /><path d="M5 17l5-4 4 3 3-2 3 2" /></svg></button>
        <span className="sp"></span>
        <div className="mwrap" ref={menuRef}>
          <button className="detail" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {providerLabel(aiConfig.provider)}
            <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {isMenuOpen && (
            <div className={'mm ' + (isBottom ? 'up' : 'down')}>
              {PROVIDERS.map(p => (
                <button key={p.id} className="mi" onClick={() => { setAiConfig({ ...aiConfig, provider: p.id }); setIsMenuOpen(false); }}>
                  {p.label}
                  {aiConfig.provider === p.id && <svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" /></svg>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="pill" role="group">
          {['.glb', '.fbx', '.blend'].map(f => (
            <button key={f} onClick={() => setFormat(f)} aria-pressed={format === f}>{f}</button>
          ))}
        </div>
        <button className="detail" onClick={() => setDetailLv((detailLv + 1) % 3)}>Detail <b>{levels[detailLv]}</b></button>
        <button className="go" onClick={generate} disabled={!prompt.trim()} aria-label="Generate"><svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6" /></svg></button>
      </div>
    </div>
  );
};

const MAX_RETRIES = 3;
const MAX_REVIEW = 3;
const NEXT_DELAY = 400;

export default function MainPanel({ onOpen }: { onOpen: () => void }) {
  const aiConfig = useStore(s => s.aiConfig);
  const setAiConfig = useStore(s => s.setAiConfig);
  const pushMessage = useStore(s => s.pushMessage);
  const messages = useStore(s => s.messages);
  const tasks = useStore(s => s.tasks);
  const currentTaskIndex = useStore(s => s.currentTaskIndex);
  const resetTasks = useStore(s => s.resetTasks);
  const bridge = useStore(s => s.bridge);
  const appendLog = useStore(s => s.appendLog);

  const [prompt, setPrompt] = useState('');
  const [format, setFormat] = useState('.glb');
  const [detailLv, setDetailLv] = useState(1);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [reviewState, setReviewState] = useState<'idle' | 'active' | 'done'>('idle');
  const levels = ['Low', 'Medium', 'High'];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const angRef = useRef(0.6);
  const dragRef = useRef({ active: false, x: 0 });
  const isProcessing = useRef(false);
  const hasTimedOut = useRef(false);
  const retryCount = useRef(0);
  const reviewRound = useRef(0);
  const isReviewing = useRef(false);
  const originalRequest = useRef('');

  const detailRef = useRef(1);
  detailRef.current = detailLv;
  const finished = useRef(false);

  const isChatMode = messages.length > 0;

  // text = متن کامل برای AI ، display = متن کوتاه برای نمایش در چت
  const sendPromptToAI = async (text: string, display?: string) => {
    const st = useStore.getState();
    const cfg = st.aiConfig;
    if (!cfg.provider) { st.pushMessage({ role: 'system', content: '⚠️ لطفاً یک مدل هوش مصنوعی انتخاب کنید.' }); return; }
    st.pushMessage({ role: 'user', content: display || text });
    const blenderVer = st.bridge.version || 'Unknown';

    const minParts = [8, 20, 40][detailRef.current] || 20;
    const systemPrompt = `You are a Principal 3D Technical Artist and Blender Python expert. You ONLY do 3D modeling. If the request is not 3D, refuse.

OUTPUT FORMAT (strict):
- Plan: [[TASKS]] one short Persian line per task [[/TASKS]].
- Chat: [[CHAT]] Persian [[/CHAT]]
- Code: [[CODE]] one markdown block starting with \`\`\`python and ending with \`\`\` [[/CODE]]

--- ABSOLUTE PROFESSIONAL RULES (DO NOT BREAK) ---
ORGANIC vs HARD SURFACE (CRITICAL):
- ORGANIC (creature, animal, human, horse head, bird, monster): Build with skin_chain() or limb() and subsurf(). NEVER boolean-union separate spheres/cylinders to fake an organic shape — it produces a melted blob.
- HARD SURFACE (mug, phone, weapon, architecture, mechanical): Build with boxes/cyl/lathe, then boolean_union() for fusing. Do not subsurf these.

0. HANDLE / ATTACHMENT RULE: For ANY object with a handle (mug, teapot, kettle, hammer, basket), use handle_attached("Handle", "Body", radius_curve=[(0.0, 0.007), (0.5, 0.006), (1.0, 0.007)], embed=0.006). This creates a C-shaped handle AND welds it in ONE call. Do NOT place a torus or tube near the body — it will leave a gap. The handle MUST merge with the wall via boolean.
1. SINGLE MANIFOLD OBJECT RULE: If an object is a single physical item (e.g., Dice, Mug, Phone), it MUST be a single connected mesh. NEVER build it by stacking separate floating primitives (e.g., do not place 21 spheres on a cube to make dice pips). 
2. INDENTATION RULE: Never simulate a hole, groove, or engraving by placing a primitive on top of a surface. You MUST use omni_edit's \`inset\` and \`extrude\` (with negative depth) to carve INTO the mesh.
3. MATERIAL SLOT RULE: To color inset geometry (like the black pips on a white dice), you must assign different materials to specific faces using edit().
4. SKILL: Use omni_lib for the coarse base (box, cyl, lathe, sphere, limb, ellipsoid) and omni_edit for ALL precision details.

--- LIBRARIES (Pre-loaded, NEVER import) ---
omni_lib: mat, box, cyl, sphere, torus, lathe, polyext, tube, ring, group, get, ground, set_world, studio_lights, frame_camera, render_setup, finish_scene, bbox, snap_to, center_on, dup, mirror_x, clear_scene, declare_spec, limb, subsurf, ellipsoid, skin_chain, torus_mesh.
omni_edit: edit, edit_report, edit_report_all, EditError, Sel.

--- GOLDEN EXAMPLE (How to make a professional Dice) ---
# 1. Create base
white = mat('WhitePlastic', (0.9,0.9,0.9), rough=0.4)
black = mat('BlackPips', (0.05,0.05,0.05), rough=0.6)
box('Dice', (0.016,0.016,0.016), (0,0,0.008), white, bevel=0.001)

# 2. Edit mesh to add pips and assign materials
with edit('Dice') as e:
    # Assign black material to slot 1
    e.obj.data.materials.append(black)
    
    # Iterate over 6 faces and carve pips
    # (Simplified example for 1 face: 1 pip)
    face = e.faces(normal='+Z')
    inner = e.inset(face, 0.002)
    pip_face = e.extrude(inner, -0.001) # Carve inward
    for f in pip_face:
        f.material_index = 1 # Make it black
        
    # Smooth the edges
    e.bevel(e.edges(sharp=30), 0.0005, segments=2)
print(edit_report('Dice'))

--- GOLDEN EXAMPLE 2: Mug with welded handle ---
ceramic = mat("Ceramic", (0.95,0.95,0.95), rough=0.2)
coffee = mat("Coffee", (0.10,0.05,0.02), rough=0.1)
cyl("Mug_Body", 0.04, 0.09, (0,0,0.045), ceramic)
with edit("Mug_Body") as e:
    top = e.faces(normal="+Z")
    inner = e.inset(top, 0.004)
    e.extrude(inner, -0.086)
    e.apply_bevel_to_sharp(angle_deg=40, width=0.0008, segments=2)
print(edit_report("Mug_Body"))
handle_attached("Handle", "Mug_Body", radius_curve=[(0.0, 0.007), (0.5, 0.006), (1.0, 0.007)], embed=0.008)
cyl("Coffee", 0.0355, 0.045, (0,0,0.0275), coffee)

--- GOLDEN EXAMPLE 3: Chess Knight (ORGANIC, uses skin_chain not boolean) ---
wood = mat("Wood", (0.2, 0.1, 0.05), rough=0.4)
# 1. Base + column (hard surface — boolean ok)
cyl("Base", 0.03, 0.02, (0,0,0.01), wood, bevel=0.003)
cyl("Column", 0.025, 0.08, (0,0,0.06), wood)
boolean_union("Base", "Column")
# 2. Horse neck+head as ONE skin_chain (organic, smooth curve)
joints = [
    (0, 0, 0.10, 0.020),  # base of neck
    (0, -0.01, 0.13, 0.018),  # mid neck
    (0, -0.025, 0.15, 0.022),  # head base
    (0, -0.045, 0.155, 0.018),  # forehead
    (0, -0.06, 0.148, 0.012),  # muzzle
    (0, -0.07, 0.145, 0.008),  # nose tip
]
skin_chain("HorseHead", joints, wood, levels=2)
# 3. Fuse base + horse head
boolean_union("Base", "HorseHead")
print(edit_report("Base"))
print(edit_report("Mug_Body"))

--- WORKFLOW ---
1. Plan & Design brief in [[CHAT]] (real-world dimensions).
2. Task 1: declare_spec(overall=(W,D,H), parts={...}) - ONLY dimensions.
3. Task 2+: Build base, then use edit() to add details, grooves, holes, and materials.
4. Final Task: finish_scene()

SCENE REPORT: Compare the 4 ASCII views (FRONT, SIDE, TOP, ISO) with the user request. If a mesh has OPEN_BOUNDARY or NGONS in EDIT_REPORT, fix it. Ensure minimum ${minParts} parts if applicable.
Wait for the user to approve a task. When asked for a task, output ONLY [[CHAT]] and [[CODE]].`;

    const finalPrompt = systemPrompt + "\n\nUser Request: " + text;
    try { await (window as any).omniblend.ai.openWeb({ provider: cfg.provider, prompt: finalPrompt }); } catch (e) { console.error(e); }
  };

  useEffect(() => {
    const w = window as any;
    if (!w.omniblend) return;

    const removeListener = w.omniblend.ai.onWebResponse(async (rawText: string) => {
      if (isProcessing.current) return;
      if (hasTimedOut.current) {
        useStore.getState().pushMessage({ role: 'system', content: '⏸️ برنامه منتظر Restart Blender است.' });
        return;
      }
      isProcessing.current = true;
      let keepBusy = false;

      const scheduleNext = (nextPrompt: string, display?: string) => {
        keepBusy = true;
        setTimeout(() => { isProcessing.current = false; sendPromptToAI(nextPrompt, display); }, NEXT_DELAY);
      };

      const finishReview = (msg: string) => {
        isReviewing.current = false;
        setReviewState('done');
        pushMessage({ role: 'system', content: msg });
      };

      // اسکن دقیق صحنه (بدون عکس) و ارسال گزارش عددی به AI
      const startReview = async () => {
        if (reviewRound.current >= MAX_REVIEW) {
          finishReview('🏁 همه کارها انجام شد و صحنه بررسی شد.');
          return;
        }
        reviewRound.current++;
        isReviewing.current = true;
        setReviewState('active');
        pushMessage({ role: 'system', content: '🔍 در حال اسکن دقیق صحنه (بدون عکس)...' });

        if (!finished.current) {
          finished.current = true;
          pushMessage({ role: 'system', content: '✨ فینیش خودکار: بوِل، نور استودیویی، دوربین، زمین...' });
          try { await w.omniblend.bridge.exec('finish_scene()'); } catch (e) {}
        }

        let report = '';
        try {
          const res = await w.omniblend.bridge.snapshot();
          report = String(res?.snapshot?.report || '');
        } catch (e) { report = ''; }

        if (!report) {
          finishReview('⚠️ گزارش صحنه از بلندر گرفته نشد.');
          return;
        }
        appendLog({ stream: 'stdout', text: '--- Scene report ---\n' + report + '\n--- End ---' });

        const issueCount = Number((report.match(/ISSUES \((\d+)\)/) || [])[1] || 0);
        pushMessage({ role: 'system', content: `📊 اسکن کامل شد — ${issueCount} مورد برای بررسی` });

        const reviewPrompt = `SCENE REPORT (round ${reviewRound.current}/${MAX_REVIEW}). Real numeric data from Blender, not an image. Units: meters, Z up. The four views (FRONT, SIDE, TOP, ISO) are ray-cast silhouettes of the real geometry: each letter is one object (see LEGEND), "." is empty space, "_" is ground. READ THEM LIKE IMAGES.

${report.substring(0, 15000)}

Original user request: "${originalRequest.current}"

Before answering, check one by one:
1. Does the silhouette in FRONT and SIDE match the real product? Are the proportions right?
2. SPEC lines and every SPEC_* issue.
3. Does every part touch its neighbour? Any FLOATING or deeply buried parts?
4. Do widths flow smoothly? No head wider than its neck without a transition.
5. Is the TOP view symmetric where it should be?
6. At least ${[8, 20, 40][detailRef.current]} parts, varied materials, no LOW_QUALITY lines.
7. **EDIT REPORTS**: every EDIT_ISSUES line must be 'none'. If you see OPEN_BOUNDARY, NON_MANIFOLD, INVERTED_NORMALS, DOUBLE_VERTS, NGONS, or ASYMMETRIC, fix that mesh using omni_edit.edit().

- If everything is excellent reply ONLY: [[CHAT]]SCENE_OK + short Persian summary[[/CHAT]]
- Otherwise reply [[CHAT]]Persian list of the concrete problems[[/CHAT]] and [[CODE]]ONLY the fix[[/CODE]]. Use get('Name'), snap_to, center_on, edit(). To rebuild a bad part, delete it with bpy.data.objects.remove(get('Name'), do_unlink=True) and create it again.`;
        scheduleNext(reviewPrompt, `🔍 گزارش اسکن صحنه ارسال شد (دور ${reviewRound.current}/${MAX_REVIEW})`);
      };

      try {
        const st = useStore.getState();
        let hasCode = false;
        let codeContent = '';
        let textContent = rawText;
        let planJustParsed = false;

        // --- استخراج کد ---
        const tagCodeMatch = textContent.match(/\[\[\s*CODE\s*\]\]([\s\S]*?)\[\[\s*\/\s*CODE\s*\]\]/i);
        if (tagCodeMatch) {
          codeContent = stripFences(tagCodeMatch[1].trim());
          textContent = textContent.replace(tagCodeMatch[0], '');
          hasCode = true;
        } else {
          const mdCodeMatch = textContent.match(/```(?:python|py)?[ \t]*\r?\n([\s\S]*?)```/i);
          if (mdCodeMatch) {
            codeContent = mdCodeMatch[1].trim();
            textContent = textContent.replace(mdCodeMatch[0], '');
            hasCode = true;
          }
        }
        if (hasCode && codeContent.length < 20) { hasCode = false; codeContent = ''; }

        // --- NEW: اعتبارسنجی کد برای جلوگیری از کدهای ناقص (مثل قطع شدن وسط خروجی) ---
        if (hasCode && codeContent) {
          const count = (str: string, char: string) => (str.split(char).length - 1);
          const balanced = count(codeContent, '(') === count(codeContent, ')') &&
                           count(codeContent, '[') === count(codeContent, ']') &&
                           count(codeContent, '{') === count(codeContent, '}');
          if (!balanced) {
            hasCode = false;
            const fixPrompt = 'Your previous code was cut off or incomplete (unbalanced parentheses/brackets). Provide the COMPLETE Python code for the current task. Reply with ONLY [[CODE]]...[[/CODE]].';
            scheduleNext(fixPrompt, '🛠 کد ناقص بود، درخواست ارسال مجدد...');
            return; // کد ناقص رو به بلندر نفرست
          }
        }

        // --- استخراج پلان تسک‌ها ---
        const taskMatch = textContent.match(/\[\[\s*TASKS\s*\]\]([\s\S]*?)\[\[\s*\/\s*TASKS\s*\]\]/i);
        if (taskMatch) {
          if (st.tasks.length === 0) {
            const rawTasks = taskMatch[1].replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('[[') && !l.endsWith(']]'));
            const parsedTasks = rawTasks
              .map((l, i) => ({ id: i + 1, title: l.replace(/^\d+[.)]\s*/, ''), status: i === 0 ? 'active' : 'pending' }))
              .filter(t => t.title.length > 3 && !t.title.includes('...'));
            if (parsedTasks.length > 0) {
              st.setTasks(parsedTasks);
              planJustParsed = true;
              hasCode = false;
              scheduleNext(
                `Task 1 approved. Please generate ONLY the Python code for: "${parsedTasks[0].title}". Do NOT include code for other tasks.`,
                `▶ تسک ۱: ${parsedTasks[0].title}`
              );
            }
          }
          textContent = textContent.replace(taskMatch[0], '');
        }

        // --- متن چت ---
        const chatMatch = textContent.match(/\[\[\s*CHAT\s*\]\]([\s\S]*?)\[\[\s*\/\s*CHAT\s*\]\]/i);
        if (chatMatch) textContent = chatMatch[1].trim();
        textContent = textContent.replace(/\[\[\s*\/?\s*(TASKS|CODE|CHAT|HIDDEN)\s*\]\]/gi, '').replace(/SCENE_OK/g, '✅').trim();

        // --- Guard: reject system prompt echo (AI sometimes copies it back) ---
        const isPromptEcho = textContent.length > 500 && (
          textContent.includes("ABSOLUTE PROFESSIONAL RULES") ||
          textContent.includes("You are a Principal 3D Technical Artist") ||
          (textContent.includes("OUTPUT FORMAT (strict)") && textContent.includes("GOLDEN EXAMPLE"))
        );
        if (isPromptEcho && !planJustParsed && retryCount.current < MAX_RETRIES) {
          retryCount.current++;
          scheduleNext(
            "STOP. Your previous response echoed the system prompt verbatim. Respond ONLY with [[TASKS]]...[[/TASKS]] for the plan, then code in [[CODE]]...[[/CODE]] for the CURRENT task. Do NOT repeat any rules.",
            "↻ AI پرامپت رو تکرار کرد، درخواست مجدد..."
          );
          return;
        }

        if (textContent.length > 0) pushMessage({ role: 'assistant', content: textContent });

        // --- اجرای کد ---
        let executedOk = false;
        if (hasCode && codeContent) {
          pushMessage({ role: 'assistant', content: "```python\n" + codeContent + "\n```" });

          if (useStore.getState().bridge.connected) {
            pushMessage({ role: 'system', content: '⚙️ در حال اجرای کد در بلندر...' });
            const cleanCode = sanitizePython(codeContent);
            appendLog({ stream: 'stdout', text: '--- Code sent to Blender ---\n' + cleanCode + '\n--- End ---' });

            try {
              const execResult = await w.omniblend.bridge.exec(cleanCode);
              if (execResult && execResult.ok) {
                executedOk = true;
                retryCount.current = 0;
                pushMessage({ role: 'system', content: '✅ کد با موفقیت در بلندر اجرا شد.' });
                if (execResult.output) appendLog({ stream: 'stdout', text: execResult.output });
              } else {
                const errText = String(execResult?.error || 'Unknown');
                pushMessage({ role: 'system', content: '❌ خطا: ' + errText.substring(0, 400) });
                if (retryCount.current < MAX_RETRIES) {
                  retryCount.current++;
                  const fixPrompt = `Your previous code had an error. Fix it.\n\nError:\n${errText.substring(0, 800)}\n\nCRITICAL: Every comment line MUST start with #. Every block after : MUST be indented with 4 spaces. Reply with ONLY [[CODE]]...[[/CODE]] (raw Python inside one \`\`\`python block).`;
                  scheduleNext(fixPrompt, `🛠 درخواست اصلاح خطا (تلاش ${retryCount.current}/${MAX_RETRIES})`);
                } else {
                  retryCount.current = 0;
                  pushMessage({ role: 'system', content: '🛑 بعد از چند بار تلاش، کد هنوز خطا دارد. لطفاً درخواست را دقیق‌تر بنویسید.' });
                }
                return;
              }
            } catch (err: any) {
              const msg = String(err?.message || err);
              if (/timeout/i.test(msg)) {
                hasTimedOut.current = true;
                pushMessage({ role: 'system', content: '⚠️ بلندر پاسخ نداد. لطفاً روی «Kill & Restart Blender» کلیک کنید.' });
              } else {
                pushMessage({ role: 'system', content: '❌ خطای ارتباط با بلندر: ' + msg.substring(0, 300) });
              }
              return;
            }
          } else {
            pushMessage({ role: 'system', content: '⚠️ بلندر متصل نیست.' });
          }
        }

        // --- AI کد نداد ---
        if (!hasCode && !planJustParsed) {
          const f = useStore.getState();
          if (isReviewing.current) {
            finishReview('🏁 بررسی نهایی تمام شد. صحنه تأیید شد.');
          } else if (f.tasks.length > 0 && f.currentTaskIndex < f.tasks.length && retryCount.current < MAX_RETRIES) {
            retryCount.current++;
            scheduleNext('You did not provide code. Reply with ONLY [[CODE]]...[[/CODE]] containing the Python code for the CURRENT task.', '↻ درخواست مجدد کد');
          }
        }

        // --- مرحله‌ی بعد ---
        if (executedOk) {
          const fresh = useStore.getState();
          if (isReviewing.current) {
            await startReview();
          } else if (fresh.tasks.length === 0) {
            await startReview();
          } else if (fresh.currentTaskIndex < fresh.tasks.length) {
            const nextIndex = fresh.currentTaskIndex + 1;
            fresh.advanceTask();
            if (nextIndex < fresh.tasks.length) {
              const nextTask = fresh.tasks[nextIndex];
              scheduleNext(
                `Task ${nextTask.id} approved. Please generate ONLY the Python code for: "${nextTask.title}". Do NOT include code for other tasks.`,
                `▶ تسک ${nextTask.id}: ${nextTask.title}`
              );
            } else {
              await startReview();
            }
          }
        }
      } catch (e: any) {
        console.error(e);
        pushMessage({ role: 'system', content: '❌ خطای داخلی: ' + (e?.message || e) });
      } finally {
        if (!keepBusy) isProcessing.current = false;
      }
    });

    return () => { if (removeListener) removeListener(); };
  }, [pushMessage, appendLog]);

  useEffect(() => {
    if (isChatMode) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatMode]);

  useEffect(() => {
    document.querySelector('.tl-item.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentTaskIndex, reviewState, tasks.length]);

  // انیمیشن 3D
  useEffect(() => {
    if (isChatMode) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = 300, H = 190, dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; ctx.scale(dpr, dpr);
    const V = [[-1.2,0,-.8],[1.2,0,-.8],[1.2,0,.8],[-1.2,0,.8],[-1.2,1,-.8],[1.2,1,-.8],[1.2,1,.8],[-1.2,1,.8],[-1.2,1.7,0],[1.2,1.7,0],[-.25,0,.8],[.25,0,.8],[.25,.7,.8],[-.25,.7,.8],[.6,.45,.8],[1,.45,.8],[1,.8,.8],[.6,.8,.8],[-1,.45,.8],[-.6,.45,.8],[-.6,.8,.8],[-1,.8,.8]];
    const E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7],[4,8],[7,8],[5,9],[6,9],[8,9],[10,13],[13,12],[12,11],[14,15],[15,16],[16,17],[17,14],[18,19],[19,20],[20,21],[21,18]];
    const tilt = 0.38, S = 60; let reqId = 0;
    function P(x: number, y: number, z: number) { const c = Math.cos(angRef.current), s = Math.sin(angRef.current); const x1 = x*c+z*s, z1 = -x*s+z*c, y1 = y-.85; const y2 = y1*Math.cos(tilt)-z1*Math.sin(tilt), z2 = y1*Math.sin(tilt)+z1*Math.cos(tilt); const p = 5/(5+z2); return [W/2+x1*p*S, H/2+16-y2*p*S, z2]; }
    // رنگ‌ها: نارنجی Claude برای مدل، خاکستری گرم برای گرید (هم در تم روشن هم تاریک خوانا)
    function draw() { ctx!.clearRect(0,0,W,H); ctx!.lineWidth = 1; ctx!.strokeStyle = 'rgba(128,126,118,.22)'; for(let i=-3;i<=3;i++){ let a = P(i,0,-3), b = P(i,0,3); ctx!.beginPath(); ctx!.moveTo(a[0],a[1]); ctx!.lineTo(b[0],b[1]); ctx!.stroke(); a = P(-3,0,i); b = P(3,0,i); ctx!.beginPath(); ctx!.moveTo(a[0],a[1]); ctx!.lineTo(b[0],b[1]); ctx!.stroke(); } const pts = V.map(v => P(v[0], v[1], v[2])); ctx!.lineWidth = 1.5; E.forEach(([i,j]) => { const a = pts[i], b = pts[j], al = .95-Math.max(0,(a[2]+b[2])/2+1)*.28; ctx!.strokeStyle = 'rgba(217,119,87,'+Math.max(.35,al)+')'; ctx!.beginPath(); ctx!.moveTo(a[0],a[1]); ctx!.lineTo(b[0],b[1]); ctx!.stroke(); }); ctx!.fillStyle = '#d97757'; for(let i=0;i<10;i++){ ctx!.beginPath(); ctx!.arc(pts[i][0],pts[i][1],2.2,0,7); ctx!.fill(); } }
    const loop = () => { draw(); if(!dragRef.current.active) angRef.current += 0.0035; reqId = requestAnimationFrame(loop); }; loop();
    return () => cancelAnimationFrame(reqId);
  }, [isChatMode]);

  const handlePointerDown = (e: React.PointerEvent) => { dragRef.current = { active: true, x: e.clientX }; (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const handlePointerMove = (e: React.PointerEvent) => { if (dragRef.current.active) { angRef.current += (e.clientX - dragRef.current.x) * 0.012; dragRef.current.x = e.clientX; } };
  const handlePointerUp = () => { dragRef.current.active = false; };

  const resetFlow = () => {
    isProcessing.current = false;
    hasTimedOut.current = false;
    retryCount.current = 0;
    reviewRound.current = 0;
    isReviewing.current = false;
    setReviewState('idle');
    finished.current = false;
  };

  const generate = () => {
    if (!prompt.trim()) return;
    const currentInput = prompt;
    setPrompt('');
    resetTasks();
    resetFlow();
    try {
      (window as any).omniblend.bridge.exec(
        "if 'omni_spec' in bpy.context.scene:\n    del bpy.context.scene['omni_spec']"
      );
    } catch (e) {}
    originalRequest.current = currentInput;
    sendPromptToAI(currentInput);
  };

  const handleNewChat = () => {
    useStore.setState({ messages: [] });
    resetTasks();
    resetFlow();
  };

  const handleKillRestartBlender = async () => {
    const w = window as any;
    pushMessage({ role: 'system', content: '🔄 در حال کشتن و راه‌اندازی مجدد بلندر...' });
    try {
      await w.omniblend.bridge.killAll();
      await new Promise(r => setTimeout(r, 500));
      await w.omniblend.bridge.restart();
      hasTimedOut.current = false;
      isProcessing.current = false;
      pushMessage({ role: 'system', content: '✅ بلندر با موفقیت ری‌استارت شد.' });
    } catch (e: any) { pushMessage({ role: 'system', content: '❌ خطا: ' + e.message }); }
  };

  const inputBoxProps = { prompt, setPrompt, generate, aiConfig, setAiConfig, format, setFormat, detailLv, setDetailLv, isMenuOpen, setIsMenuOpen, levels };

  const totalSteps = tasks.length + 1;
  const doneTasks = Math.min(currentTaskIndex, tasks.length);
  const doneSteps = doneTasks + (reviewState === 'done' ? 1 : 0);
  const progress = tasks.length ? Math.round((doneSteps / totalSteps) * 100) : 0;
  const allTasksDone = tasks.length > 0 && currentTaskIndex >= tasks.length;

  const renderDot = (state: 'done' | 'active' | 'pending', n: number) => {
    if (state === 'done') return <svg viewBox="0 0 24 24" width="13" height="13"><path d="M5 12l5 5 9-10" /></svg>;
    if (state === 'active') return <span className="tl-spin"></span>;
    return <span>{n}</span>;
  };

  return (
    <main className={"main cl " + (isChatMode ? "chat-active" : "")}>
      <style>{CSS}</style>
      <button className="open-btn" onClick={onOpen} aria-label="Show sidebar"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></svg></button>
      {!isChatMode ? (
        <div className="stage">
          <canvas ref={canvasRef} id="hero" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} style={{ cursor: dragRef.current.active ? 'grabbing' : 'grab' }}></canvas>
          <h1>What should we build?</h1>
          <InputBox isBottom={false} {...inputBoxProps} />
          <div className="chips">
            <button onClick={() => setPrompt('یک مداد بساز')}>یک مداد بساز</button>
            <button onClick={() => setPrompt('یک کتاب بساز')}>یک کتاب بساز</button>
          </div>
        </div>
      ) : (
        <div className="chat-wrapper">
          <div className="chat-toolbar">
            <button className="tb-btn" onClick={handleNewChat}>New chat</button>
            {bridge.connected && <button className="tb-btn warn" onClick={handleKillRestartBlender}>🔄 Kill & Restart Blender</button>}
          </div>

          {tasks.length > 0 && (
            <div className="tl-card">
              <div className="tl-head">
                <span>🧭 برنامه‌ی اجرا</span>
                <span className="tl-count">{doneSteps}/{totalSteps} · {progress}%</span>
              </div>
              <div className="tl-bar"><i style={{ width: progress + '%' }}></i></div>

              {tasks.map((t, i) => {
                const state: 'done' | 'active' | 'pending' = i < currentTaskIndex ? 'done' : (i === currentTaskIndex ? 'active' : 'pending');
                return (
                  <div key={t.id} className={`tl-item ${state}`}>
                    <div className="tl-dot">{renderDot(state, i + 1)}</div>
                    <div className="tl-text">{t.title}</div>
                  </div>
                );
              })}

              {(() => {
                const state: 'done' | 'active' | 'pending' = reviewState === 'done' ? 'done' : (reviewState === 'active' ? 'active' : 'pending');
                return (
                  <div className={`tl-item review ${state}`}>
                    <div className="tl-dot">{renderDot(state, totalSteps)}</div>
                    <div className="tl-text">🔍 اسکن و بررسی نهایی صحنه{allTasksDone && reviewState === 'idle' ? ' …' : ''}</div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="chat-messages">
            {messages.map((m, i) => {
              const isCode = m.content.startsWith('```python');
              const isSystem = m.role === 'system';
              const isErr = isSystem && /^(❌|⚠️|🛑)/.test(m.content);

              if (isCode) {
                return (
                  <div key={i} className="msg assistant code">
                    <span className="spark"><SparkIcon /></span>
                    <CodeBlock code={m.content.replace(/^```python\n/, '').replace(/\n?```$/, '')} />
                  </div>
                );
              }
              return (
                <div key={i} className={'msg ' + m.role + (isErr ? ' err' : '')}>
                  {m.role === 'assistant' && <span className="spark"><SparkIcon /></span>}
                  <div className="bubble" dir="auto">{m.content}</div>
                </div>
              );
            })}
            {messages[messages.length - 1]?.role === 'user' && (
              <div className="thinking">
                <span className="spark"><SparkIcon /></span>
                <span className="t" dir="auto">در حال دریافت پاسخ از AI...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-wrapper"><InputBox isBottom={true} {...inputBoxProps} /></div>
        </div>
      )}
    </main>
  );
}