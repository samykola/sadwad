const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { BridgeManager } = require('./bridgeManager');
const isDev = !app.isPackaged;
let win=null, bridge=null, aiWindow=null, aiInterval=null, aiProvider=null, pendingPrompt=null, promptToken=0;

function sendToRenderer(channel, payload) {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload);
}

function stopPolling() {
  if (aiInterval) { clearTimeout(aiInterval); aiInterval = null; }
}

function createWindow(){ 
  win=new BrowserWindow({
    width:1600, height:1000, minWidth:1000, minHeight:700, 
    frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false }
  }); 
  win.on('closed', () => {
    stopPolling();
    promptToken++;
    if (aiWindow && !aiWindow.isDestroyed()) aiWindow.destroy();
    win = null;
  });
  if(isDev) win.loadURL('http://localhost:5173'); 
  else win.loadFile(path.join(__dirname,'../dist/index.html')); 
}

// آخرین پیامی که تگ دارد + ایندکس آن را برمی‌گرداند
const READ_RESPONSE_SCRIPT = `
  (function () {
    const F = String.fromCharCode(96).repeat(3);
    const blocks = new Set(['p','div','li','h1','h2','h3','h4','h5','h6','ul','ol','tr','blockquote']);
    function ser(node) {
      if (node.nodeType === 3) return node.nodeValue;
      if (node.nodeType !== 1) return '';
      const tag = node.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'button') return '';
      if (tag === 'br') return '\\n';
      if (tag === 'pre') {
        const code = node.querySelector('code') || node;
        const body = code.textContent.replace(/^\\s*(python|py)\\s*\\n/i, '');
        return '\\n' + F + 'python\\n' + body + '\\n' + F + '\\n';
      }
      let s = '';
      for (const c of node.childNodes) s += ser(c);
      return blocks.has(tag) ? '\\n' + s + '\\n' : s;
    }
    const msgs = Array.from(document.querySelectorAll('div[class*="markdown"], .ds-markdown, .font-claude-response, [class*="font-claude-message"]'));
    for (let i = msgs.length - 1; i >= 0; i--) {
      const txt = ser(msgs[i]).replace(/\\n{3,}/g, '\\n\\n').trim();
      if (txt && (txt.includes('[[TASKS]]') || txt.includes('[[CHAT]]') || txt.includes('[[CODE]]'))) {
        return { index: i, text: txt };
      }
    }
    return { index: -1, text: '' };
  })();
`;

const IS_GENERATING_SCRIPT = `
  !!(
    document.querySelector('button[aria-label="Stop"]') ||
    document.querySelector('button[aria-label="Stop response"]') ||
    document.querySelector('button[aria-label="Stop streaming"]') ||
    document.querySelector('div[role="button"][aria-label="Stop"]') ||
    document.querySelector('[data-testid="stop-button"]')
  )
`;

// هر تگ بازشده باید بسته هم شده باشد
function tagsClosed(text) {
  const tags = ['TASKS', 'CHAT', 'CODE'];
  let anyOpen = false;
  for (const t of tags) {
    if (text.includes('[[' + t + ']]')) {
      anyOpen = true;
      if (!text.includes('[[/' + t + ']]')) return false;
    }
  }
  return anyOpen;
}

async function processPrompt(browserWin, prompt) {
  stopPolling();
  const token = ++promptToken;
  const alive = () => token === promptToken && browserWin && !browserWin.isDestroyed();

  sendToRenderer('bridge:event', { type: 'stdout', data: 'Injecting prompt...' });

  let baseline = { index: -1, text: '' };
  try {
    const b = await browserWin.webContents.executeJavaScript(READ_RESPONSE_SCRIPT);
    if (b) baseline = b;
  } catch (e) {}
  if (!alive()) return;

  const injectScript = `
    (async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      let inputBox = null;
      for (let i = 0; i < 150; i++) {
        const inputs = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]'));
        inputBox = inputs.find(el => !el.disabled && el.offsetParent !== null && el.getAttribute('aria-disabled') !== 'true');
        if (inputBox) break;
        await wait(100);
      }
      if (!inputBox) return 'NO_INPUT_BOX';
      inputBox.focus();
      await wait(100);
      if (inputBox.tagName === 'TEXTAREA') {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
        setter.call(inputBox, '');
        inputBox.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        inputBox.innerHTML = '';
        inputBox.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await wait(100);
      document.execCommand('insertText', false, ${JSON.stringify(prompt)});
      inputBox.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ${JSON.stringify(prompt)}, bubbles: true, cancelable: true }));
      await wait(250);
      let clicked = false;
      const selectors = [
        'button[data-testid="send-button"]',
        'button[aria-label="Send"]',
        'button[aria-label="Send message"]',
        'div[role="button"][aria-label="Send"]'
      ];
      for (let i = 0; i < 60; i++) {
        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
            btn.click(); clicked = true; break;
          }
        }
        if (clicked) break;
        await wait(100);
      }
      if (!clicked) {
        inputBox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      }
      return 'SENT';
    })();
  `;

  let sendResult;
  try {
    sendResult = await browserWin.webContents.executeJavaScript(injectScript);
  } catch (e) {
    if (alive()) {
      pendingPrompt = prompt;
      sendToRenderer('ai:web-response', 'Error: ' + e.message);
    }
    return;
  }
  if (!alive()) return;

  if (sendResult === 'NO_INPUT_BOX') {
    pendingPrompt = prompt;
    sendToRenderer('ai:web-response', 'Error: لطفا در پنجره باز شده به سایت لاگین کنید.');
    return;
  }

  const POLL_MS = 150;
  const STABLE_NEEDED = 5; // 5 * 150ms = حدود 0.75 ثانیه
  let lastText = ''; let stableCount = 0; const startTime = Date.now();

  const tick = async () => {
    if (!alive()) return;
    if (Date.now() - startTime > 180000) {
      aiInterval = null;
      sendToRenderer('ai:web-response', 'Error: زمان پاسخگویی به پایان رسید.');
      return;
    }
    try {
      const isGenerating = await browserWin.webContents.executeJavaScript(IS_GENERATING_SCRIPT);
      if (!alive()) return;
      if (isGenerating) {
        stableCount = 0;
      } else {
        const r = await browserWin.webContents.executeJavaScript(READ_RESPONSE_SCRIPT);
        if (!alive()) return;
        const text = r && r.text;
        const isNew = !!r && (r.index > baseline.index || text !== baseline.text);

        if (text && isNew && text.trim().length > 20 && tagsClosed(text)) {
          if (text === lastText) {
            stableCount++;
            if (stableCount >= STABLE_NEEDED) {
              aiInterval = null;
              sendToRenderer('ai:web-response', text.trim());
              return;
            }
          } else {
            lastText = text; stableCount = 0;
          }
        }
      }
    } catch (e) {}
    if (alive()) aiInterval = setTimeout(tick, POLL_MS);
  };
  aiInterval = setTimeout(tick, POLL_MS);
}

app.whenReady().then(async ()=>{
  bridge=new BridgeManager({ onEvent:e=>sendToRenderer('bridge:event', e) });
  createWindow();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

  setTimeout(async () => {
    try {
      const list = await bridge.detectBlender();
      if (list.length > 0) {
        await bridge.connect(list[0]);
        sendToRenderer('bridge:event', { type: 'connected', data: { exePath: list[0] } });
      }
    } catch(e) { console.error('Auto connect failed:', e); }
  }, 1000);

  ipcMain.on('window-minimize', () => win?.minimize());
  ipcMain.on('window-maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
  ipcMain.on('window-close', () => win?.close());

  ipcMain.handle('bridge:detect',()=>bridge.detectBlender());
  ipcMain.handle('bridge:connect',(_e,p)=>bridge.connect(p));
  ipcMain.handle('bridge:disconnect',()=>bridge.disconnect());
  ipcMain.handle('bridge:restart',()=>bridge.restart());
  ipcMain.handle('bridge:killAll',()=>bridge.killAll());
  ipcMain.handle('bridge:status',()=>bridge.status());
  ipcMain.handle('bridge:exec',async (_e,c)=>{ const res = await bridge.execute(c); return res; });
  ipcMain.handle('bridge:snapshot',()=>bridge.snapshot());
  ipcMain.handle('bridge:getVersion', async () => {
    try {
      const res = await bridge.execute("import bpy; print(bpy.app.version_string)");
      return ((res && res.output) ? String(res.output).trim() : '') || 'Unknown';
    } catch(e) { return 'Unknown'; }
  });

  ipcMain.handle('ai:openWeb', async (event, { provider, prompt }) => {
    if (aiWindow && !aiWindow.isDestroyed() && aiProvider === provider) {
      pendingPrompt = null;
      aiWindow.focus();
      processPrompt(aiWindow, prompt).catch(e => console.error(e));
      return { ok: true };
    }

    if (aiWindow && !aiWindow.isDestroyed()) {
      stopPolling();
      promptToken++;
      aiWindow.destroy();
    }

    aiProvider = provider;
    pendingPrompt = prompt;
    let url = provider === 'deepseek' ? 'https://chat.deepseek.com/' : provider === 'openai' ? 'https://chatgpt.com/' : 'https://claude.ai/new';
    const thisWindow = new BrowserWindow({
      width: 1200, height: 800, title: 'OMNIBLEND AI - Web Mode', backgroundColor: '#1f1f1e',
      webPreferences: { partition: 'persist:omniblend-ai-session', nodeIntegration: false, contextIsolation: true }
    });
    aiWindow = thisWindow;
    thisWindow.setMenuBarVisibility(false);
    thisWindow.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    thisWindow.on('closed', () => {
      if (aiWindow === thisWindow) { aiWindow = null; aiProvider = null; pendingPrompt = null; stopPolling(); promptToken++; }
    });
    thisWindow.webContents.on('did-finish-load', () => {
      if (pendingPrompt && !thisWindow.isDestroyed()) {
        const p = pendingPrompt; pendingPrompt = null;
        processPrompt(thisWindow, p).catch(e => console.error(e));
      }
    });
    thisWindow.loadURL(url);
    return { ok: true };
  });
});

app.on('window-all-closed',()=>{ if(process.platform!=='darwin') app.quit(); });
app.on('before-quit',()=>{ stopPolling(); bridge?.disconnect(); });