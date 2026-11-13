const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const net = require('net');
const EventEmitter = require('events');

function findBlender(){
  const out=[]; const cands=[];
  if(process.platform==='win32'){
    for(const base of ['C:\\Program Files\\Blender Foundation','C:\\Program Files (x86)\\Blender Foundation']){
      try{
        for(const d of fs.readdirSync(base)){
          const exe=path.join(base,d,'blender.exe');
          if(fs.existsSync(exe)) cands.push(exe);
        }
      }catch{}
    }
  } else if(process.platform==='darwin'){
    cands.push('/Applications/Blender.app/Contents/MacOS/Blender');
  } else {
    cands.push('/usr/bin/blender','/usr/local/bin/blender');
  }
  for(const c of cands){ if(fs.existsSync(c)) out.push(c);}
  return out;
}

function killAllBlender(){
  try {
    if (process.platform === 'win32') execSync('taskkill /F /IM blender.exe', { stdio: 'ignore' });
    else execSync('pkill -f blender', { stdio: 'ignore' });
  } catch (e) { /* ignore - no process to kill */ }
}

class BridgeManager {
  constructor({onEvent}={}){
    this.events = new EventEmitter();
    if(onEvent) this.events.on('event', onEvent);
    this.proc = null;
    this.socket = null;
    this.state = { connected: false, exePath: null, version: null };
    this.pending = new Map();
    this.seq = 0;
    this.PORT = 9876 + Math.floor(Math.random() * 1000);
    this._connecting = null; // برای جلوگیری از اتصال همزمان
  }

  emit(type, data){ this.events.emit('event', { type, data, ts: Date.now() }); }

  async detectBlender(){
    const list = findBlender();
    this.emit('detect', { found: list });
    return list;
  }

  status(){ return { ...this.state }; }

  async connect(exePath){
    if (this._connecting) return this._connecting;
    this._connecting = this._doConnect(exePath).finally(() => { this._connecting = null; });
    return this._connecting;
  }

  async _doConnect(exePath){
    if(!exePath){
      const l = await this.detectBlender();
      if(!l.length) throw new Error('No Blender found');
      exePath = l[0];
    }
    if(this.proc) await this.disconnect();
    killAllBlender();
    await new Promise(r => setTimeout(r, 400));

    const script = path.join(__dirname, '..', 'bridge', 'blender_bridge.py');
    this.PORT = 9876 + Math.floor(Math.random() * 1000);

    const proc = spawn(exePath, ['--factory-startup', '--python', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, OMNIBLEND_PORT: this.PORT.toString() }
    });
    this.proc = proc;
    proc.stdout.on('data', b => this.emit('stdout', b.toString()));
    proc.stderr.on('data', b => this.emit('stderr', b.toString()));
    
    proc.on('exit', c => {
      this.emit('exit', { code: c });
      if (this.proc !== proc) return; // پروسه‌ی قدیمی، به وضعیت جدید دست نزن
      this.state.connected = false;
      this.proc = null;
      if (this.socket) { this.socket.destroy(); this.socket = null; }
      this.emit('disconnected');
    });

    await this._connectSocket(this.PORT);
    this.state.exePath = exePath;
    this.emit('connected', { exePath });
    return this.state;
  }

  async _connectSocket(port){
    for (let i = 0; i < 120; i++) {
      try {
        await new Promise((res, rej) => {
          const s = net.createConnection({ host: '127.0.0.1', port });
          s.setEncoding('utf8');
          let buf = '';
          s.on('data', ch => {
            buf += ch;
            let idx;
            while ((idx = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, idx);
              buf = buf.slice(idx + 1);
              try {
                const m = JSON.parse(line);
                const cb = this.pending.get(m.id);
                if (cb) { this.pending.delete(m.id); cb(m); }
              } catch(e) {}
            }
          });
          s.once('connect', () => {
            this.socket = s;
            this.state.connected = true;
            this.emit('socket-connected');
            res();
          });
          s.once('error', rej);
          s.on('close', () => {
            if (this.socket !== s) return; // سوکت قدیمی
            this.state.connected = false;
            this.socket = null;
            this.emit('disconnected');
          });
        });
        return;
      } catch (e) {
        await new Promise(r => setTimeout(r, 250));
      }
    }
    throw new Error('Failed to connect to Blender bridge');
  }

  async _send(p, timeoutMs = 60000){
    if(!this.socket) throw new Error('not connected');
    const id = ++this.seq;
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        rej(new Error('Timeout'));
      }, timeoutMs);
      this.pending.set(id, m => { clearTimeout(t); res(m); });
      this.socket.write(JSON.stringify({ id, ...p }) + '\n');
    });
  }

  async execute(code){
    const r = await this._send({ op: 'exec', code });
    return r.result;
  }

  async snapshot(){
    const r = await this._send({ op: 'snapshot' });
    return r.result;
  }

  async disconnect(){
    try{ this.socket?.destroy(); }catch{}
    try{ this.proc?.kill(); }catch{}
    this.socket = null;
    this.proc = null;
    this.state.connected = false;
    this.emit('disconnected');
  }

  async restart(){
    const exePath = this.state.exePath;
    await this.disconnect();
    killAllBlender();
    await new Promise(r => setTimeout(r, 400));
    if (exePath) await this.connect(exePath);
  }

  killAll(){
    killAllBlender();
    this.socket = null;
    this.proc = null;
    this.state.connected = false;
    this.emit('disconnected');
  }
}

module.exports = { BridgeManager };