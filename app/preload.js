'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mesa', {
  info: () => ipcRenderer.invoke('info'),
  paraPalco: (msg) => ipcRenderer.send('para-palco', msg),
  paraMesa: (msg) => ipcRenderer.send('para-mesa', msg),
  aoReceber: (cb) => ipcRenderer.on('msg', (_e, m) => cb(m)),
  telas: () => ipcRenderer.invoke('telas'),
  configurarPalco: (op) => ipcRenderer.invoke('configurar-palco', op),
  capturarPalco: (largura) => ipcRenderer.invoke('capturar-palco', largura),
  salvarSessao: (s) => ipcRenderer.send('salvar-sessao', s),
  salvarPreferencias: (p) => ipcRenderer.send('salvar-preferencias', p),
  escolherPasta: () => ipcRenderer.invoke('escolher-pasta'),
  recarregarPalco: () => ipcRenderer.send('recarregar-palco'),
  focarMesa: () => ipcRenderer.send('focar-mesa')
});
