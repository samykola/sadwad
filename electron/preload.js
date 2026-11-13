const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('omniblend',{
  bridge:{
    detect:()=>ipcRenderer.invoke('bridge:detect'),
    connect:p=>ipcRenderer.invoke('bridge:connect',p),
    disconnect:()=>ipcRenderer.invoke('bridge:disconnect'),
    restart:()=>ipcRenderer.invoke('bridge:restart'),
    killAll:()=>ipcRenderer.invoke('bridge:killAll'),
    status:()=>ipcRenderer.invoke('bridge:status'),
    exec:c=>ipcRenderer.invoke('bridge:exec',c),
    snapshot:()=>ipcRenderer.invoke('bridge:snapshot'),
    getVersion:()=>ipcRenderer.invoke('bridge:getVersion'),
    onEvent:cb=>ipcRenderer.on('bridge:event',(_e,d)=>cb(d))
  },
  ai: { 
    openWeb: (config) => ipcRenderer.invoke('ai:openWeb', config), 
    onWebResponse: (cb) => {
      const handler = (_e, text) => cb(text);
      ipcRenderer.on('ai:web-response', handler);
      return () => ipcRenderer.removeListener('ai:web-response', handler);
    }
  },
  win: { minimize: () => ipcRenderer.send('window-minimize'), maximize: () => ipcRenderer.send('window-maximize'), close: () => ipcRenderer.send('window-close') }
});