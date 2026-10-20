'use strict';
// Mesa de Cena – processo principal.
// Abre duas janelas: a MESA (operador, na tela do notebook) e o PALCO
// (projeção, em tela cheia no projetor). As mídias e o arquivo deixas.json
// ficam na pasta da peça, ao lado do .exe.

const { app, BrowserWindow, screen, ipcMain, dialog, powerSaveBlocker, protocol, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

protocol.registerSchemesAsPrivileged([{
  scheme: 'oz',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true }
}]);

const temLock = app.requestSingleInstanceLock();
if (!temLock) app.quit();

const PASTA_APP = path.join(__dirname, 'ui');
let pastaPeca = null;          // pasta com deixas.json e as mídias
let mesa = null;               // janela do operador
let palco = null;              // janela da projeção
let saindo = false;
let cfg = {};
const arqCfg = () => path.join(app.getPath('userData'), 'config.json');
const arqSessao = () => path.join(app.getPath('userData'), 'sessao.json');

function lerJSON(arq, padrao) {
  try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return padrao; }
}
function gravarJSON(arq, obj) {
  try {
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq + '.tmp', JSON.stringify(obj, null, 1));
    fs.renameSync(arq + '.tmp', arq);
  } catch (e) { console.error('gravar', arq, e); }
}
function salvarCfg() { gravarJSON(arqCfg(), cfg); }

// ---------- pasta da peça ----------
function pastaValida(p) {
  return !!p && fs.existsSync(path.join(p, 'deixas.json'));
}
function procurarPasta() {
  const c = [];
  if (process.env.MESA_PASTA) c.push(process.env.MESA_PASTA);
  if (process.env.PORTABLE_EXECUTABLE_DIR) c.push(process.env.PORTABLE_EXECUTABLE_DIR);
  if (app.isPackaged) c.push(path.dirname(process.execPath));
  c.push(path.resolve(__dirname, '..'));
  if (cfg.pasta) c.push(cfg.pasta);
  return c.find(pastaValida) || null;
}

// ---------- protocolo oz:// ----------
// oz://local/app/...   -> arquivos da interface (dentro do programa)
// oz://local/midia/... -> arquivos da pasta da peça (imagens, sons, vídeo)
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8'
};

function responderArquivo(arq, req) {
  let st;
  try { st = fs.statSync(arq); } catch { return new Response('não encontrado', { status: 404 }); }
  if (!st.isFile()) return new Response('não encontrado', { status: 404 });
  const tipo = TIPOS[path.extname(arq).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.get('range');
  const base = { 'Content-Type': tipo, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let ini = m && m[1] ? parseInt(m[1], 10) : 0;
    let fim = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
    if (m && !m[1] && m[2]) { ini = Math.max(0, st.size - parseInt(m[2], 10)); fim = st.size - 1; }
    if (ini >= st.size || ini > fim) {
      return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${st.size}` } });
    }
    fim = Math.min(fim, st.size - 1);
    const corpo = Readable.toWeb(fs.createReadStream(arq, { start: ini, end: fim }));
    return new Response(corpo, {
      status: 206,
      headers: { ...base, 'Content-Range': `bytes ${ini}-${fim}/${st.size}`, 'Content-Length': String(fim - ini + 1) }
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(arq)), {
    status: 200, headers: { ...base, 'Content-Length': String(st.size) }
  });
}

function registrarProtocolo() {
  protocol.handle('oz', (req) => {
    const u = new URL(req.url);
    const partes = decodeURIComponent(u.pathname).replace(/^\/+/, '').split('/');
    const raiz = partes.shift();
    let base;
    if (raiz === 'app') base = PASTA_APP;
    else if (raiz === 'midia' && pastaPeca) base = pastaPeca;
    else return new Response('não encontrado', { status: 404 });
    const arq = path.resolve(base, ...partes);
    if (arq !== base && !arq.startsWith(base + path.sep)) return new Response('proibido', { status: 403 });
    return responderArquivo(arq, req);
  });
}

// ---------- deixas ----------
function carregarDeixas() {
  if (!pastaPeca) return { erro: 'Não encontrei a pasta da peça. O programa precisa ficar na mesma pasta do arquivo deixas.json, das imagens e das músicas.' };
  const arq = path.join(pastaPeca, 'deixas.json');
  let texto;
  try { texto = fs.readFileSync(arq, 'utf8'); } catch (e) { return { erro: `Não consegui abrir ${arq}: ${e.message}` }; }
  try {
    return { dados: JSON.parse(texto.replace(/^﻿/, '')), arquivo: arq };
  } catch (e) {
    // localiza a linha do erro para ajudar quem editou o arquivo
    const m = /position (\d+)/.exec(e.message);
    let onde = '';
    if (m) {
      const pos = parseInt(m[1], 10);
      const linha = texto.slice(0, pos).split('\n').length;
      onde = ` (linha ${linha})`;
    }
    return { erro: `O arquivo deixas.json tem um erro de digitação${onde}: ${e.message}`, arquivo: arq };
  }
}

function arquivosReferenciados(dados) {
  const lista = new Set();
  const chaves = ['musica', 'ambiente', 'som', 'imagem', 'video', 'sobrepor'];
  const visitar = (v) => {
    if (Array.isArray(v)) return v.forEach(visitar);
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (chaves.includes(k) && typeof x === 'string') lista.add(x);
        else if (k === 'trovoes' && Array.isArray(x)) x.forEach((t) => typeof t === 'string' && lista.add(t));
        else visitar(x);
      }
    }
  };
  visitar(dados.roteiro || []);
  return [...lista];
}

// ---------- telas ----------
function infoTelas() {
  const prim = telaDaMesa().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id, n: i + 1, primaria: d.id === prim, x: d.bounds.x, y: d.bounds.y,
    largura: d.bounds.width, altura: d.bounds.height, escala: d.scaleFactor, nome: d.label || ''
  }));
}
// A mesa fica na tela do notebook (a "interna"); a projeção, numa tela externa.
function telaDaMesa() {
  const telas = screen.getAllDisplays();
  return telas.find((d) => d.internal) || screen.getPrimaryDisplay();
}
function telaDoPalco() {
  const telas = screen.getAllDisplays();
  const daMesa = telaDaMesa();
  if (cfg.telaPalco) {
    const t = telas.find((d) => d.id === cfg.telaPalco);
    if (t && (t.id !== daMesa.id || telas.length === 1)) return t;
  }
  return telas.find((d) => d.id !== daMesa.id && !d.internal) || telas.find((d) => d.id !== daMesa.id) || daMesa;
}
function estadoPalco() {
  if (!palco || palco.isDestroyed()) return null;
  const b = palco.getBounds();
  const d = screen.getDisplayMatching(b);
  return {
    telaId: d.id, telaN: screen.getAllDisplays().findIndex((x) => x.id === d.id) + 1,
    primaria: d.id === telaDaMesa().id, telaCheia: palco.isFullScreen(),
    largura: d.bounds.width, altura: d.bounds.height, telas: infoTelas()
  };
}
function avisarMesa(tipo, dados) {
  if (mesa && !mesa.isDestroyed()) mesa.webContents.send('msg', { tipo, ...dados });
}

function posicionarPalco(tela, telaCheia) {
  if (!palco || palco.isDestroyed()) return;
  const cheia = telaCheia !== undefined ? telaCheia : tela.id !== telaDaMesa().id;
  if (palco.isFullScreen()) palco.setFullScreen(false);
  if (cheia) {
    palco.setBounds(tela.bounds);
    palco.setFullScreen(true);
  } else {
    const w = Math.round(tela.workArea.width * 0.5), h = Math.round(w * 9 / 16);
    palco.setBounds({ x: tela.workArea.x + tela.workArea.width - w - 20, y: tela.workArea.y + 20, width: w, height: h });
  }
  setTimeout(() => avisarMesa('palco-estado', { palco: estadoPalco() }), 400);
}

function criarPalco() {
  const tela = telaDoPalco();
  palco = new BrowserWindow({
    x: tela.bounds.x + 40, y: tela.bounds.y + 40, width: 960, height: 540,
    backgroundColor: '#000000', show: false, title: 'Projeção – O Mágico de Oz',
    autoHideMenuBar: true, fullscreenable: true, minimizable: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, sandbox: true, contextIsolation: true
    }
  });
  palco.setMenuBarVisibility(false);
  palco.loadURL('oz://local/app/palco.html');
  palco.once('ready-to-show', () => {
    palco.showInactive();
    posicionarPalco(tela);
    if (mesa && !mesa.isDestroyed()) mesa.focus();
  });
  // a projeção nunca fica com o foco do teclado: o ENTER é sempre da mesa
  palco.on('focus', () => {
    if (!palco.isFullScreen() || !mesa || mesa.isDestroyed()) return;
    const telaPalco = screen.getDisplayMatching(palco.getBounds()).id;
    const telaMesa = screen.getDisplayMatching(mesa.getBounds()).id;
    if (telaPalco !== telaMesa) setTimeout(() => mesa.focus(), 50);
  });
  palco.on('close', (e) => { if (!saindo) { e.preventDefault(); } });
  palco.webContents.on('render-process-gone', () => {
    if (!saindo) setTimeout(() => palco && !palco.isDestroyed() && palco.reload(), 500);
  });
  palco.webContents.on('before-input-event', (e, inp) => {
    if (inp.type === 'keyDown') {
      avisarMesa('tecla', { key: inp.key, code: inp.code, shift: inp.shift, ctrl: inp.control, alt: inp.alt, repeat: inp.isAutoRepeat });
      e.preventDefault();
    }
  });
}

function criarMesa() {
  const prim = telaDaMesa();
  mesa = new BrowserWindow({
    x: prim.workArea.x, y: prim.workArea.y, width: Math.min(1400, prim.workArea.width), height: Math.min(860, prim.workArea.height),
    minWidth: 980, minHeight: 600, backgroundColor: '#14161b', show: false,
    title: 'Mesa de Cena – O Mágico de Oz', icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false, sandbox: true, contextIsolation: true
    }
  });
  mesa.loadURL('oz://local/app/mesa.html');
  mesa.once('ready-to-show', () => { mesa.maximize(); mesa.show(); mesa.focus(); });
  mesa.on('close', async (e) => {
    if (saindo || process.env.MESA_TESTE) { saindo = true; return; }
    e.preventDefault();
    const r = await dialog.showMessageBox(mesa, {
      type: 'question', buttons: ['Continuar na peça', 'Fechar o programa'], defaultId: 0, cancelId: 0,
      title: 'Fechar a Mesa de Cena?', message: 'Fechar a Mesa de Cena?',
      detail: 'O som e a projeção vão parar. A posição atual fica guardada para você continuar depois.'
    });
    if (r.response === 1) { saindo = true; app.quit(); }
  });
  mesa.webContents.on('render-process-gone', () => {
    if (!saindo) setTimeout(() => mesa && !mesa.isDestroyed() && mesa.reload(), 500);
  });
  // impede recarregar a página por acidente (Ctrl+R, F5) no meio da peça
  mesa.webContents.on('before-input-event', (e, inp) => {
    const k = (inp.key || '').toLowerCase();
    if ((inp.control && k === 'r') || k === 'f5') e.preventDefault();
    if (inp.control && inp.shift && k === 'f12') mesa.webContents.toggleDevTools();
  });
}

// ---------- IPC ----------
ipcMain.handle('info', () => {
  const r = carregarDeixas();
  let faltando = [];
  if (r.dados && pastaPeca) {
    faltando = arquivosReferenciados(r.dados).filter((a) => !fs.existsSync(path.join(pastaPeca, a)));
  }
  return {
    versao: app.getVersion(), pasta: pastaPeca, deixas: r.dados || null, erro: r.erro || null,
    arquivoDeixas: r.arquivo || null, faltando, palco: estadoPalco(), telas: infoTelas(),
    sessao: lerJSON(arqSessao(), null), preferencias: cfg.preferencias || {}
  };
});
ipcMain.on('para-palco', (_e, msg) => {
  if (palco && !palco.isDestroyed()) palco.webContents.send('msg', msg);
});
ipcMain.on('para-mesa', (_e, msg) => avisarMesa(msg.tipo || 'palco', msg));
ipcMain.handle('telas', () => ({ telas: infoTelas(), palco: estadoPalco() }));
ipcMain.handle('configurar-palco', (_e, op) => {
  if (!palco || palco.isDestroyed()) return null;
  if (op.telaId !== undefined) {
    const t = screen.getAllDisplays().find((d) => d.id === op.telaId);
    if (t) {
      cfg.telaPalco = t.id; salvarCfg();
      posicionarPalco(t, op.telaCheia);
    }
  } else if (op.telaCheia !== undefined) {
    const t = screen.getDisplayMatching(palco.getBounds());
    posicionarPalco(t, op.telaCheia);
  }
  return estadoPalco();
});
ipcMain.handle('capturar-palco', async (_e, largura) => {
  if (!palco || palco.isDestroyed() || !palco.isVisible()) return null;
  try {
    const img = await palco.webContents.capturePage();
    if (img.isEmpty()) return null;
    return img.resize({ width: largura || 400, quality: 'good' }).toJPEG(72).toString('base64');
  } catch { return null; }
});
ipcMain.on('salvar-sessao', (_e, s) => gravarJSON(arqSessao(), { ...s, quando: Date.now() }));
ipcMain.on('salvar-preferencias', (_e, p) => { cfg.preferencias = p; salvarCfg(); });
ipcMain.handle('escolher-pasta', async () => {
  const r = await dialog.showOpenDialog(mesa, {
    title: 'Escolha a pasta da peça (onde estão o deixas.json, as imagens e as músicas)',
    properties: ['openDirectory']
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  if (!pastaValida(p)) {
    await dialog.showMessageBox(mesa, { type: 'warning', message: 'Esta pasta não tem o arquivo deixas.json.', detail: p });
    return null;
  }
  pastaPeca = p; cfg.pasta = p; salvarCfg();
  if (palco && !palco.isDestroyed()) palco.reload();
  mesa.reload();
  return p;
});
ipcMain.on('recarregar-palco', () => { if (palco && !palco.isDestroyed()) palco.reload(); });
ipcMain.on('focar-mesa', () => { if (mesa && !mesa.isDestroyed()) mesa.focus(); });

// ---------- início ----------
app.on('second-instance', () => { if (mesa) { if (mesa.isMinimized()) mesa.restore(); mesa.focus(); } });

app.whenReady().then(() => {
  if (!temLock) return;
  cfg = lerJSON(arqCfg(), {});
  pastaPeca = procurarPasta();
  Menu.setApplicationMenu(null);
  registrarProtocolo();
  powerSaveBlocker.start('prevent-display-sleep');
  criarMesa();
  criarPalco();

  const mudou = () => {
    // projetor ligado ou desligado com o programa aberto
    if (!palco || palco.isDestroyed()) return;
    const atual = screen.getDisplayMatching(palco.getBounds());
    const existe = screen.getAllDisplays().some((d) => d.id === atual.id);
    const daMesa = telaDaMesa();
    const externa = telaDoPalco();
    if (!existe || (externa.id === daMesa.id && atual.id === daMesa.id && palco.isFullScreen())) posicionarPalco(daMesa, false);
    else if (externa.id !== daMesa.id && atual.id === daMesa.id && !palco.isFullScreen()) posicionarPalco(externa, true);
    avisarMesa('palco-estado', { palco: estadoPalco() });
  };
  screen.on('display-added', () => setTimeout(mudou, 800));
  screen.on('display-removed', () => setTimeout(mudou, 800));
  screen.on('display-metrics-changed', () => setTimeout(() => avisarMesa('palco-estado', { palco: estadoPalco() }), 500));
});

app.on('before-quit', () => { saindo = true; });
app.on('window-all-closed', () => app.quit());
