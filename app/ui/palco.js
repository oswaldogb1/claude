// Janela da PROJEÇÃO. Só recebe comandos da mesa e desenha.
import { Cena } from './efeitos.js';

const $ = (s) => document.querySelector(s);
const url = (rel) => 'oz://local/midia/' + String(rel).split('/').map(encodeURIComponent).join('/');
const cena = new Cena($('#fx'), $('#fxluz'));
const fundo = $('#fundo');
const video = $('#video');

let ajuste = 'cobrir';
let camadas = [];               // camadas de fundo, da mais antiga para a mais nova
let atual = null;               // {el, filtroEl, movEl, spec}
const sobreposicoes = new Map();
const cacheImg = new Map();
let estadoTitulo = null;
let vigiaVideo = 0;

function avisar(evento, dados = {}) { window.mesa.paraMesa({ tipo: 'palco', evento, ...dados }); }

// anima de onde está até "props" (Web Animations), cancelando a anterior da mesma chave
function para(el, props, seg, easing = 'ease-in-out', chave = 'p') {
  el._a = el._a || {};
  const ant = el._a[chave];
  if (ant) { try { ant.commitStyles(); } catch {} ant.cancel(); }
  const a = el.animate([props], { duration: Math.max(1, seg * 1000), easing, fill: 'forwards' });
  el._a[chave] = a;
  a.finished.then(() => { try { a.commitStyles(); a.cancel(); } catch {} if (el._a[chave] === a) delete el._a[chave]; }).catch(() => {});
  return a;
}

export function filtroCSS(f) {
  f = f || {};
  return `brightness(${f.brilho ?? 1}) contrast(${f.contraste ?? 1}) saturate(${f.saturacao ?? 1}) sepia(${f.sepia ?? 0}) hue-rotate(${f.matiz ?? 0}deg) blur(${f.desfoque ?? 0}px)`;
}

function carregarImagem(arquivo) {
  if (!cacheImg.has(arquivo)) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url(arquivo);
    cacheImg.set(arquivo, img.decode().then(() => img).catch(() => {
      cacheImg.delete(arquivo);
      avisar('erro', { msg: `Imagem não encontrada: ${arquivo}` });
      return null;
    }));
  }
  return cacheImg.get(arquivo);
}

const MOVIMENTOS = {
  lento: { zoom: [1.0, 1.07], duracao: 70 },
  estrada: { zoom: [1.0, 1.22], y: [0, 2], duracao: 40 },
  esquerda: { zoom: [1.1, 1.1], x: [3, -3], duracao: 50 },
  direita: { zoom: [1.1, 1.1], x: [-3, 3], duracao: 50 },
  afastar: { zoom: [1.15, 1.0], duracao: 30 },
  subir: { zoom: [1.12, 1.12], y: [3, -3], duracao: 50 }
};
function mover(el, m) {
  if (!m) return;
  if (typeof m === 'string') m = MOVIMENTOS[m] || MOVIMENTOS.lento;
  const z = m.zoom || [1, 1.06], x = m.x || [0, 0], y = m.y || [0, 0];
  el.animate([
    { transform: `scale(${z[0]}) translate(${x[0]}%, ${y[0]}%)` },
    { transform: `scale(${z[1]}) translate(${x[1]}%, ${y[1]}%)` }
  ], { duration: (m.duracao || 40) * 1000, easing: 'ease-in-out', fill: 'forwards' });
}

function criarCamada(img, spec) {
  const el = document.createElement('div');
  el.className = 'camada' + (ajuste === 'conter' ? ' conter' : '');
  const filtroEl = document.createElement('div');
  filtroEl.className = 'mov';
  filtroEl.style.filter = filtroCSS(spec.filtro);
  const movEl = document.createElement('div');
  movEl.className = 'mov';
  const borrao = img.cloneNode();
  borrao.className = 'borrao';
  const im = img.cloneNode();
  if (spec.posicao) im.style.objectPosition = spec.posicao;
  movEl.append(borrao, im);
  filtroEl.append(movEl);
  el.append(filtroEl);
  return { el, filtroEl, movEl, spec: { ...spec } };
}

function limparAntigas(cam) {
  const i = camadas.indexOf(cam);
  if (i <= 0) return;
  for (const c of camadas.slice(0, i)) c.el.remove();
  camadas = camadas.slice(i);
}

let seqImagem = 0;
async function imagem(spec) {
  const meu = ++seqImagem;
  const img = await carregarImagem(spec.arquivo);
  if (!img || meu !== seqImagem) return;
  const nova = criarCamada(img, spec);
  const velha = atual;
  const d = Math.max(0, spec.duracao ?? 2);
  const ms = d * 1000;
  const tr = spec.transicao || 'dissolver';
  if (tr === 'cortina' && velha) fundo.insertBefore(nova.el, velha.el); else fundo.append(nova.el);
  camadas.push(nova);
  atual = nova;
  mover(nova.movEl, spec.movimento);
  const saida = tr === 'corte' ? 0.3 : Math.min(d || 0.5, 2.5);
  if (spec.limparEfeitos !== false) cena.pararDaCena(saida);
  for (const [id, s] of sobreposicoes) if (!s.spec.fixo) tirar({ id, fade: saida });
  if (video.getAttribute('src')) esconderVideo(Math.min(d || 0.3, 2));

  const fim = () => limparAntigas(nova);
  const el = nova.el;
  if (!velha && tr !== 'corte') {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms || 1, easing: 'ease-in-out' }).finished.then(fim, fim);
    return;
  }
  switch (tr) {
    case 'corte': fim(); break;
    case 'preto': {
      el.style.opacity = '0';
      if (velha) await para(velha.el, { opacity: 0 }, d / 2, 'ease-in', 't').finished.catch(() => {});
      await para(el, { opacity: 1 }, d / 2, 'ease-out', 't').finished.catch(() => {});
      fim();
      break;
    }
    case 'branco': {
      const b = $('#flash');
      b.style.background = '#fff';
      el.style.opacity = '0';
      await para(b, { opacity: 1 }, d / 2, 'ease-in', 'branco').finished.catch(() => {});
      el.style.opacity = '1';
      fim();
      await para(b, { opacity: 0 }, d / 2, 'ease-out', 'branco').finished.catch(() => {});
      break;
    }
    case 'redemoinho': {
      if (velha) velha.el.animate([
        { transform: 'rotate(0deg) scale(1)', filter: 'blur(0px)', opacity: 1 },
        { transform: 'rotate(40deg) scale(1.7)', filter: 'blur(12px)', opacity: 0 }
      ], { duration: ms, easing: 'ease-in', fill: 'forwards' });
      el.animate([
        { opacity: 0, transform: 'rotate(-25deg) scale(1.4)', filter: 'blur(10px)' },
        { opacity: 1, transform: 'rotate(0deg) scale(1)', filter: 'blur(0px)' }
      ], { duration: ms, easing: 'ease-out' }).finished.then(fim, fim);
      break;
    }
    case 'cortina': {
      // a imagem antiga corre para o lado como uma cortina puxada
      const lado = spec.lado === 'esquerda' ? -1 : 1;
      velha.el.style.boxShadow = `${-lado * 40}px 0 60px rgba(0,0,0,0.85)`;
      velha.el.animate([
        { transform: 'translateX(0) skewX(0deg)' },
        { transform: `translateX(${lado * 18}%) skewX(${lado * -3}deg)`, offset: 0.25 },
        { transform: `translateX(${lado * 105}%) skewX(0deg)` }
      ], { duration: ms, easing: 'ease-in-out', fill: 'forwards' }).finished.then(fim, fim);
      break;
    }
    case 'revelar': {
      // a imagem nova aparece por baixo, como uma cortina puxada da esquerda para a direita
      fundo.insertBefore(nova.el, velha.el);
      const lado = spec.lado === 'esquerda' ? 'to left' : 'to right';
      const m = `linear-gradient(${lado}, transparent 0%, transparent 40%, #000 60%, #000 100%)`;
      for (const k of ['maskImage', 'webkitMaskImage']) velha.el.style[k] = m;
      for (const k of ['maskSize', 'webkitMaskSize']) velha.el.style[k] = '250% 100%';
      velha.el.animate([{ maskPosition: '100% 0', webkitMaskPosition: '100% 0' }, { maskPosition: '0% 0', webkitMaskPosition: '0% 0' }],
        { duration: ms, easing: 'ease-in-out', fill: 'forwards' }).finished.then(fim, fim);
      break;
    }
    case 'zoom':
      el.animate([{ opacity: 0, transform: 'scale(1.18)' }, { opacity: 1, transform: 'scale(1)' }], { duration: ms, easing: 'ease-out' }).finished.then(fim, fim);
      break;
    case 'magia':
      el.animate([{ opacity: 0, filter: 'blur(22px) brightness(1.9)' }, { opacity: 1, filter: 'blur(0px) brightness(1)' }], { duration: ms, easing: 'ease-out' }).finished.then(fim, fim);
      cena.iniciar({ tipo: 'brilhos', modo: 'explosao', x: 0.5, y: 0.5, cor: spec.cor || ['ouro', 'branco', 'rosa', 'verde'], quantidade: 220, forca: 1.6 });
      break;
    default:
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms || 1, easing: 'ease-in-out' }).finished.then(fim, fim);
  }
}

function filtro({ filtro: f, fade = 2 }) {
  if (!atual) return;
  atual.spec.filtro = { ...(atual.spec.filtro || {}), ...f };
  para(atual.filtroEl, { filter: filtroCSS(atual.spec.filtro) }, fade, 'ease-in-out', 'filtro');
}

function limparFundo(fade = 1.5) {
  seqImagem++;
  const velhas = camadas;
  camadas = [];
  atual = null;
  for (const c of velhas) para(c.el, { opacity: 0 }, fade, 'ease-in', 't').finished.then(() => c.el.remove(), () => c.el.remove());
}

// ---------- vídeo ----------
async function tocarVideo(spec) {
  cancelAnimationFrame(vigiaVideo);
  video.pause();
  video.src = url(spec.arquivo);
  video.playbackRate = spec.velocidade || 1;
  video.style.filter = filtroCSS(spec.filtro);
  video.style.objectFit = ajuste === 'conter' ? 'contain' : 'cover';
  try {
    if (spec.inicio) {
      await new Promise((ok) => video.readyState >= 1 ? ok() : video.addEventListener('loadedmetadata', ok, { once: true }));
      video.currentTime = spec.inicio;
    }
    await video.play();
  } catch (e) { avisar('erro', { msg: `Vídeo ${spec.arquivo}: ${e.message}` }); return; }
  para(video, { opacity: 1 }, spec.duracao ?? 1, 'ease-in-out', 'v');
  if (spec.fim) {
    const olhar = () => {
      if (video.currentTime >= spec.fim) {
        video.pause();
        if (spec.depois === 'sumir') esconderVideo(spec.fadeOut ?? 1);
        return;
      }
      vigiaVideo = requestAnimationFrame(olhar);
    };
    vigiaVideo = requestAnimationFrame(olhar);
  }
}
function esconderVideo(fade = 1) {
  cancelAnimationFrame(vigiaVideo);
  para(video, { opacity: 0 }, fade, 'ease-in-out', 'v').finished.then(() => { video.pause(); video.removeAttribute('src'); video.load(); }, () => {});
}

// ---------- imagens sobrepostas ----------
async function sobrepor(spec) {
  const id = spec.id || spec.arquivo;
  const img = await carregarImagem(spec.arquivo);
  if (!img) return;
  if (sobreposicoes.has(id)) tirar({ id, fade: 0.3 });
  const el = img.cloneNode();
  const tam = spec.tamanho ?? 0.5;
  el.style.height = `${tam * 100}vh`;
  el.style.left = `${(spec.x ?? 0.5) * 100}vw`;
  el.style.top = `${(spec.y ?? 0.5) * 100}vh`;
  el.style.translate = '-50% -50%';
  el.style.mixBlendMode = spec.mistura || 'normal';
  if (spec.mascara !== false && spec.mistura !== 'screen') {
    const m = 'radial-gradient(ellipse at center, #000 45%, transparent 71%)';
    el.style.maskImage = m;
    el.style.webkitMaskImage = m;
  }
  el.style.filter = filtroCSS(spec.filtro);
  el.style.opacity = '0';
  $('#sobre').append(el);
  const item = { el, spec, deixa: spec.deixa };
  sobreposicoes.set(id, item);
  const d = (spec.fadeIn ?? 1) * 1000;
  const an = spec.animacao || 'surgir';
  if (an === 'piscar') {
    el.style.opacity = '1';
    el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 0.2, offset: 0.2 }, { opacity: 0.9, offset: 0.32 }, { opacity: 0.1, offset: 0.6 }, { opacity: 0 }],
      { duration: (spec.duracao || 0.7) * 1000, fill: 'forwards' }).finished.then(() => { el.remove(); sobreposicoes.delete(id); }, () => {});
    return;
  }
  if (an === 'subir') {
    el.style.opacity = '1';
    el.animate([{ transform: 'translateY(60vh) scale(0.8)', opacity: 0 }, { opacity: 1, offset: 0.1 }, { transform: 'translateY(-90vh) scale(0.35)', opacity: 0.9 }],
      { duration: (spec.duracao || 12) * 1000, easing: 'ease-in', fill: 'forwards' }).finished.then(() => { el.remove(); sobreposicoes.delete(id); }, () => {});
    return;
  }
  el.animate([{ opacity: 0, transform: 'scale(0.86)' }, { opacity: spec.opacidade ?? 1, transform: 'scale(1)' }], { duration: d, easing: 'ease-out', fill: 'forwards' });
  if (an === 'flutuar' || an === 'pulsar') {
    el.animate(an === 'flutuar'
      ? [{ translate: '-50% -50%' }, { translate: '-50% -53%' }, { translate: '-50% -50%' }]
      : [{ scale: '1' }, { scale: '1.05' }, { scale: '1' }],
    { duration: 3200, iterations: Infinity, easing: 'ease-in-out', composite: 'add' });
  }
  if (spec.duracao) setTimeout(() => tirar({ id, fade: spec.fadeOut ?? 1 }), spec.duracao * 1000);
}
function tirar({ id, fade = 1 }) {
  const ids = id === 'todos' ? [...sobreposicoes.keys()] : [id];
  for (const k of ids) {
    const s = sobreposicoes.get(k);
    if (!s) continue;
    sobreposicoes.delete(k);
    const op = getComputedStyle(s.el).opacity;
    s.el.getAnimations().forEach((a) => a.cancel());
    s.el.style.opacity = op;
    s.el.animate([{ opacity: op }, { opacity: 0 }], { duration: fade * 1000, fill: 'forwards' }).finished.then(() => s.el.remove(), () => s.el.remove());
  }
}

// ---------- flash, tremor, escuro, tinta ----------
function flash({ cor = '#ffffff', intensidade = 0.9, duracao = 0.5, padrao = 'simples', relampago = false, x, fotos }) {
  const el = $('#flash');
  el.style.background = cor;
  const I = intensidade;
  let frames;
  if (padrao === 'raio') frames = [{ opacity: 0 }, { opacity: I, offset: 0.05 }, { opacity: I * 0.15, offset: 0.14 }, { opacity: I * 0.85, offset: 0.22 }, { opacity: I * 0.05, offset: 0.36 }, { opacity: I * 0.45, offset: 0.46 }, { opacity: 0 }];
  else if (padrao === 'pulso') frames = [{ opacity: 0 }, { opacity: I, offset: 0.5 }, { opacity: 0 }];
  else frames = [{ opacity: I }, { opacity: 0 }];
  el._a = el._a || {};
  if (el._a.flash) el._a.flash.cancel();
  el._a.flash = el.animate(frames, { duration: duracao * 1000, easing: 'linear' });
  if (relampago) cena.iniciar(paraTela({ tipo: 'relampago', x, duracao: duracao * 1.1 }));
  if (fotos && fotos.length) {
    const f = fotos[Math.floor(Math.random() * fotos.length)];
    sobrepor({ arquivo: f, id: 'foto-raio', mistura: 'screen', animacao: 'piscar', tamanho: 1, duracao: duracao * 1.3, x: x ?? 0.5, y: 0.5, mascara: false });
  }
}

let tremorRaf = 0;
function tremor({ intensidade = 0.5, duracao = 1 }) {
  const el = $('#palco');
  cancelAnimationFrame(tremorRaf);
  const ini = performance.now();
  const passo = (agora) => {
    const f = (agora - ini) / (duracao * 1000);
    if (f >= 1) { el.style.transform = ''; return; }
    const amp = intensidade * 22 * Math.pow(1 - f, 1.4);
    const r = () => (Math.random() * 2 - 1) * amp;
    el.style.transform = `scale(${1 + 0.05 * intensidade}) translate(${r()}px, ${r()}px) rotate(${r() * 0.03}deg)`;
    tremorRaf = requestAnimationFrame(passo);
  };
  tremorRaf = requestAnimationFrame(passo);
}

let estadoEscuro = 0, estadoTinta = null, estadoBlackout = false;
function escuro({ valor = 0, fade = 2 }) { estadoEscuro = valor; para($('#escuro'), { opacity: valor }, fade, 'ease-in-out', 'e'); }
function tinta({ cor: c, intensidade = 0.5, modo = 'soft-light', fade = 2 }) {
  const el = $('#tinta');
  estadoTinta = c ? { cor: c, intensidade, modo } : null;
  if (c) { el.style.background = c; el.style.mixBlendMode = modo; }
  para(el, { opacity: c ? intensidade : 0 }, fade, 'ease-in-out', 't');
}
function blackout({ ligado = true, fade = 1 }) { estadoBlackout = ligado; para($('#preto'), { opacity: ligado ? 1 : 0 }, fade, 'ease-in-out', 'b'); }

// ---------- títulos ----------
function titulo(spec) {
  const el = $('#titulo');
  estadoTitulo = spec;
  el.className = spec.estilo || 'abertura';
  el.querySelector('h1').textContent = spec.texto || '';
  el.querySelector('p').textContent = spec.subtitulo || '';
  el.getAnimations().forEach((a) => a.cancel());
  el.animate([
    { opacity: 0, transform: 'scale(0.93)', filter: 'blur(8px)' },
    { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }
  ], { duration: (spec.fadeIn ?? 2.5) * 1000, easing: 'ease-out', fill: 'forwards' });
}
function pararTitulo({ fade = 2 } = {}) {
  const el = $('#titulo');
  estadoTitulo = null;
  const op = getComputedStyle(el).opacity;
  el.getAnimations().forEach((a) => a.cancel());
  el.animate([{ opacity: op }, { opacity: 0, filter: 'blur(4px)' }], { duration: fade * 1000, easing: 'ease-in', fill: 'forwards' });
}

// ---------- estado completo (desfazer / começar do meio) ----------
const chave = (o) => JSON.stringify(o || null);
function estado({ visual: v, fade = 1.2 }) {
  if (!v.fundo) { if (atual) limparFundo(fade); }
  else if (!atual || atual.spec.arquivo !== v.fundo.arquivo) {
    imagem({ ...v.fundo, transicao: 'dissolver', duracao: fade, limparEfeitos: false });
  } else if (chave(atual.spec.filtro) !== chave(v.fundo.filtro)) {
    atual.spec.filtro = {};
    filtro({ filtro: v.fundo.filtro || {}, fade });
  }
  if (!v.video && video.getAttribute('src')) esconderVideo(fade);
  const quero = v.efeitos || {};
  for (const id of cena.ids()) {
    const e = cena.pegar(id);
    if (!quero[id] || chave(stripSpec({ ...quero[id], id })) !== chave(e.p.spec)) cena.parar(id, fade);
  }
  for (const [id, s] of Object.entries(quero)) {
    if (!cena.pegar(id)) iniciarEfeito({ ...s, id, fadeIn: fade });
  }
  const sob = v.sobreposicoes || {};
  for (const id of [...sobreposicoes.keys()]) if (!sob[id]) tirar({ id, fade });
  for (const [id, s] of Object.entries(sob)) if (!sobreposicoes.has(id)) sobrepor({ ...s, id, fadeIn: fade });
  if (chave(v.titulo) !== chave(estadoTitulo)) { if (v.titulo) titulo({ ...v.titulo, fadeIn: fade }); else if (estadoTitulo) pararTitulo({ fade }); }
  if ((v.escuro || 0) !== estadoEscuro) escuro({ valor: v.escuro || 0, fade });
  if (chave(v.tinta) !== chave(estadoTinta)) tinta({ ...(v.tinta || { cor: null }), fade });
  if (!!v.blackout !== estadoBlackout) blackout({ ligado: !!v.blackout, fade });
}

// As posições dos efeitos são marcadas sobre a imagem de fundo (0..1 da imagem).
// Converte para a tela, levando em conta o corte (cobrir) ou as sobras (conter).
function paraTela(spec) {
  const img = atual && atual.el.querySelector('img:not(.borrao)');
  if (!img || !img.naturalWidth || spec.coord === 'tela') return spec;
  const W = innerWidth, H = innerHeight, iw = img.naturalWidth, ih = img.naturalHeight;
  const k = ajuste === 'conter' ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih);
  const dw = iw * k, dh = ih * k, ox = (W - dw) / 2, oy = (H - dh) / 2;
  const cx = (x) => (ox + x * dw) / W, cy = (y) => (oy + y * dh) / H;
  const ponto = (p) => [cx(p[0]), cy(p[1])];
  const r = { ...spec };
  if (typeof r.x === 'number') r.x = cx(r.x);
  if (typeof r.y === 'number') r.y = cy(r.y);
  for (const k2 of ['de', 'ate']) if (Array.isArray(r[k2])) r[k2] = ponto(r[k2]);
  if (Array.isArray(r.pontos)) r.pontos = r.pontos.map(ponto);
  return r;
}

function iniciarEfeito(spec, deixa) {
  const e = cena.iniciar(paraTela(spec));
  if (e) { e.p.spec = stripSpec(spec); e.deixa = deixa; }
}
function stripSpec(s) { const { fadeIn, em, ...resto } = s; return resto; }

// ---------- comandos vindos da mesa ----------
const comandos = {
  imagem, filtro, video: tocarVideo, pararVideo: (m) => esconderVideo(m.fade ?? 1),
  limparFundo: (m) => limparFundo(m.fade ?? 1.5),
  efeito: (m) => iniciarEfeito(m.spec, m.deixa),
  desfazerDeixa: (m) => {
    cena.pararDaDeixa(m.deixa, m.fade ?? 0.5);
    for (const [id, s] of sobreposicoes) if (s.deixa === m.deixa) tirar({ id, fade: m.fade ?? 0.5 });
    const f = $('#flash'); if (f._a && f._a.flash) f._a.flash.cancel();
  },
  parar: (m) => cena.parar(m.id, m.fade ?? 1),
  disparar: (m) => { const e = cena.pegar(m.id); if (e && e.disparar) e.disparar(); },
  sobrepor, tirar, flash, tremor, escuro, tinta, blackout, titulo, pararTitulo, estado,
  precarregar: (m) => (m.arquivos || []).forEach(carregarImagem),
  ajuste: (m) => {
    ajuste = m.modo === 'conter' ? 'conter' : 'cobrir';
    for (const c of camadas) c.el.classList.toggle('conter', ajuste === 'conter');
    video.style.objectFit = ajuste === 'conter' ? 'contain' : 'cover';
  },
  teste: (m) => {
    const t = $('#teste');
    t.hidden = !m.mostrar;
    t.innerHTML = `<span>TELA DE TESTE DA PROJEÇÃO<br>${innerWidth} × ${innerHeight}<br><small>O círculo deve ficar redondo e a borda amarela visível.</small></span>`;
  },
  tudoParar: (m) => {
    const f = m.fade ?? 1;
    cena.parar('todos', f);
    tirar({ id: 'todos', fade: f });
  },
  ping: () => avisar('pong')
};

window.mesa.aoReceber((m) => {
  const f = comandos[m.cmd];
  if (!f) return;
  try {
    const r = f(m);
    if (r && r.catch) r.catch((e) => avisar('erro', { msg: `${m.cmd}: ${e.message}` }));
  } catch (e) { avisar('erro', { msg: `${m.cmd}: ${e.message}` }); }
});

document.fonts.load('900 10vh "Cinzel Decorative"').finally(() => avisar('pronto', { largura: innerWidth, altura: innerHeight }));
addEventListener('resize', () => avisar('tamanho', { largura: innerWidth, altura: innerHeight }));
window.__palco = { cena, comandos, get camadas() { return camadas; }, get atual() { return atual; } };
