// Motor das DEIXAS: cada ENTER dispara a próxima deixa do roteiro.
// Guarda o "estado" do palco (imagem, efeitos, sons em loop) para poder
// DESFAZER a última deixa ou PREPARAR o palco para começar do meio.
import { nomeCurto } from './motor-audio.js';

// Ordem importa: "filtro" e "tremor" também aparecem como opções de outras ações
// (ex.: raios com tremor, vídeo com filtro), então ficam por último.
export const VERBOS = [
  'musica', 'musicaVolume', 'pararMusica', 'ambiente', 'ambienteVolume', 'pararAmbiente', 'som', 'pararSons', 'silencio',
  'imagem', 'video', 'sobrepor', 'raios', 'efeito', 'titulo', 'pararTitulo', 'limparFundo', 'pararVideo', 'parar', 'disparar',
  'tirar', 'flash', 'escuro', 'tinta', 'blackout', 'filtro', 'tremor'
];
export const verbo = (a) => VERBOS.find((v) => v in a);

const rnd = (a, b) => a + Math.random() * (b - a);
const escolher = (l) => l[Math.floor(Math.random() * l.length)];
const clonar = (o) => JSON.parse(JSON.stringify(o));
const SEM = new Set(['em', 'fadeIn', 'efeito']);
export function specEfeito(a) {
  const s = { tipo: a.efeito, id: a.id || a.efeito };
  for (const [k, v] of Object.entries(a)) if (!SEM.has(k) && k !== 'id') s[k] = v;
  return s;
}

export function lerRoteiro(dados) {
  const itens = [];
  const deixas = [];
  let cena = '';
  for (const it of dados.roteiro || []) {
    if (it.cena) { cena = it.cena; itens.push({ tipo: 'cena', texto: it.cena }); }
    else if (it.fala) itens.push({ tipo: 'fala', quem: it.fala, texto: it.texto || '' });
    else if (it.rubrica) itens.push({ tipo: 'rubrica', texto: it.rubrica });
    else if (it.nota) itens.push({ tipo: 'nota', texto: it.nota });
    else if (it.deixa) {
      const d = { ...it.deixa, i: deixas.length, n: deixas.length + 1, cena, acoes: it.deixa.acoes || [] };
      deixas.push(d);
      itens.push({ tipo: 'deixa', deixa: d });
    }
  }
  return { itens, deixas };
}

export function modeloVazio() {
  return {
    visual: { fundo: null, video: null, efeitos: {}, sobreposicoes: {}, titulo: null, escuro: 0, tinta: null, blackout: false },
    audio: { musica: null, ambientes: {} },
    geradores: {}
  };
}

// como cada ação muda o estado (usado ao vivo e para "começar daqui")
export function reduzir(m, a) {
  const v = m.visual, au = m.audio;
  switch (verbo(a)) {
    case 'musica': au.musica = { arquivo: a.musica, volume: a.volume ?? 80, loop: !!a.loop }; break;
    case 'musicaVolume': if (au.musica) au.musica.volume = a.musicaVolume; break;
    case 'pararMusica': au.musica = null; break;
    case 'ambiente': au.ambientes[a.id || a.ambiente] = { arquivo: a.ambiente, volume: a.volume ?? 50 }; break;
    case 'ambienteVolume': if (au.ambientes[a.ambienteVolume]) au.ambientes[a.ambienteVolume].volume = a.volume; break;
    case 'pararAmbiente':
      if (a.pararAmbiente === 'todos' || a.pararAmbiente === true) au.ambientes = {};
      else delete au.ambientes[a.pararAmbiente];
      break;
    case 'silencio': au.musica = null; au.ambientes = {}; break;
    case 'imagem':
      v.fundo = { arquivo: a.imagem, filtro: a.filtro || null, movimento: a.movimento || null, posicao: a.posicao || null };
      v.video = null;
      if (a.limparEfeitos !== false) for (const [id, e] of Object.entries(v.efeitos)) if (!e.fixo) delete v.efeitos[id];
      for (const [id, s] of Object.entries(v.sobreposicoes)) if (!s.fixo) delete v.sobreposicoes[id];
      break;
    case 'limparFundo': v.fundo = null; v.video = null; break;
    case 'filtro': if (v.fundo) v.fundo.filtro = { ...(v.fundo.filtro || {}), ...a.filtro }; break;
    case 'video': v.video = { arquivo: a.video }; break;
    case 'pararVideo': v.video = null; break;
    case 'efeito': if (!a.duracao && !a.solto) v.efeitos[a.id || a.efeito] = specEfeito(a); break;
    case 'parar':
      if (a.parar === 'todos') { v.efeitos = {}; m.geradores = {}; v.sobreposicoes = {}; }
      else { delete v.efeitos[a.parar]; delete m.geradores[a.parar]; }
      break;
    case 'sobrepor': if (!a.duracao && a.animacao !== 'piscar' && a.animacao !== 'subir') v.sobreposicoes[a.id || a.sobrepor] = specSobre(a); break;
    case 'tirar': if (a.tirar === 'todos') v.sobreposicoes = {}; else delete v.sobreposicoes[a.tirar]; break;
    case 'escuro': v.escuro = a.escuro; break;
    case 'tinta': v.tinta = a.tinta ? { cor: a.tinta, intensidade: a.intensidade ?? 0.5, modo: a.modo || 'soft-light' } : null; break;
    case 'blackout': v.blackout = !!a.blackout; break;
    case 'titulo': v.titulo = { texto: a.titulo, subtitulo: a.subtitulo || '', estilo: a.estilo || 'abertura' }; break;
    case 'pararTitulo': v.titulo = null; break;
    case 'raios': if (!a.duracao) m.geradores[a.id || 'raios'] = clonar(a); break;
  }
  return m;
}
function specSobre(a) {
  const { em, sobrepor, ...resto } = a;
  return { arquivo: sobrepor, ...resto };
}

const NOMES_EFEITOS = {
  brilhos: 'brilhos', nevoa: 'névoa', tremeluzir: 'luz tremendo', fumaca: 'fumaça', coracao: 'coração', raiosDeLuz: 'raios de luz',
  vagalumes: 'vaga-lumes', redemoinho: 'redemoinho', detritos: 'vento com folhas', poeira: 'poeira de luz', chamas: 'fogo',
  bolha: 'bolha da fada', vapor: 'vapor', estrelas: 'estrelas', vinheta: 'bordas escuras', anel: 'anel de luz', chuva: 'chuva', relampago: 'relâmpago'
};
export const nomeEfeito = (t) => NOMES_EFEITOS[t] || t;

const MOMENTANEOS = new Set(['som', 'flash', 'tremor', 'disparar', 'video', 'pararSons']);
function eEstado(a) {
  const v = verbo(a);
  if (MOMENTANEOS.has(v)) return false;
  if ((v === 'efeito' || v === 'sobrepor') && (a.duracao || a.solto || a.modo === 'explosao' || ['anel', 'clarao', 'relampago'].includes(a.efeito))) return false;
  return true;
}
function rapido(a) {
  const r = { ...a };
  for (const k of ['fade', 'fadeIn', 'duracao', 'transicao']) if (typeof r[k] === 'number') r[k] = Math.min(r[k], 0.6);
  if (verbo(a) === 'imagem') r.duracao = Math.min(a.duracao ?? 2, 0.6);
  return r;
}

export function resumo(acoes) {
  const chips = [];
  const add = (icone, texto, cls) => { if (!chips.some((c) => c.texto === texto && c.icone === icone)) chips.push({ icone, texto, cls }); };
  for (const a of acoes) {
    switch (verbo(a)) {
      case 'musica': add('♪', nomeCurto(a.musica), 'mus'); break;
      case 'musicaVolume': add('♪', `música ${a.musicaVolume > 0 ? 'a ' + a.musicaVolume + '%' : 'some'}`, 'mus'); break;
      case 'pararMusica': add('♪', 'música sai', 'mus'); break;
      case 'ambiente': add('≈', nomeCurto(a.ambiente), 'amb'); break;
      case 'ambienteVolume': add('≈', `${nomeCurto(a.ambienteVolume)} ${a.volume}%`, 'amb'); break;
      case 'pararAmbiente': add('≈', a.pararAmbiente === 'todos' ? 'sons de fundo saem' : `${nomeCurto(a.pararAmbiente)} sai`, 'amb'); break;
      case 'som': add('🔊', nomeCurto(a.som), 'som'); break;
      case 'silencio': add('🔇', 'silêncio', 'som'); break;
      case 'imagem': add('🖼', nomeCurto(a.imagem), 'img'); break;
      case 'filtro': add('🖼', 'muda a luz da imagem', 'img'); break;
      case 'video': add('🎞', nomeCurto(a.video), 'img'); break;
      case 'limparFundo': add('■', 'imagem sai', 'img'); break;
      case 'efeito': add('✨', nomeEfeito(a.efeito), 'fx'); break;
      case 'sobrepor': add('🖼', nomeCurto(a.sobrepor), 'img'); break;
      case 'raios': add('⚡', 'raios e trovões', 'fx'); break;
      case 'flash': add('⚡', 'clarão', 'fx'); break;
      case 'tremor': add('〰', 'tremor', 'fx'); break;
      case 'escuro': add('◐', a.escuro > 0 ? 'escurece' : 'clareia', 'img'); break;
      case 'tinta': add('◐', a.tinta ? 'cor na luz' : 'tira a cor', 'img'); break;
      case 'blackout': add('■', a.blackout ? 'tela preta' : 'volta a imagem', 'img'); break;
      case 'titulo': add('T', a.titulo, 'img'); break;
      case 'pararTitulo': add('T', 'título sai', 'img'); break;
      case 'parar': add('✖', a.parar === 'todos' ? 'para os efeitos' : `para ${a.parar}`, 'fx'); break;
    }
  }
  return chips;
}

export class MotorDeixas {
  constructor({ deixas, audio, palco, aoMudar, log }) {
    this.deixas = deixas;
    this.audio = audio;
    this.palco = palco;
    this.aoMudar = aoMudar || (() => {});
    this.log = log || (() => {});
    this.proxima = 0;
    this.historico = [];
    this.modelo = modeloVazio();
    this.geradores = new Map();
    this.ultima = null;
  }

  ir() { return this.disparar(this.proxima); }

  disparar(i) {
    const d = this.deixas[i];
    if (!d) return false;
    const dur = Math.max(0, ...d.acoes.map((a) => (a.em || 0) + (a.video ? (a.fim || 0) - (a.inicio || 0) : 0)));
    const reg = { i, foto: { modelo: clonar(this.modelo), audio: this.audio.fotografia() }, timers: [], quando: Date.now(), duracao: dur };
    this.historico.push(reg);
    if (this.historico.length > 200) this.historico.shift();
    this.concluirPendentes();
    reg.pendentes = [];
    for (const a of d.acoes) {
      reduzir(this.modelo, a);
      const em = a.em || 0;
      if (em > 0) {
        const p = { a, feita: false };
        p.timer = setTimeout(() => { p.feita = true; this.executar(a, i); }, em * 1000);
        reg.timers.push(p.timer);
        reg.pendentes.push(p);
      } else this.executar(a, i);
    }
    this.ultima = i;
    this.proxima = Math.min(i + 1, this.deixas.length);
    this.log(`ENTER ${d.n} – ${d.nome}`);
    this.prepararAdiante();
    this.aoMudar();
    return true;
  }

  // ENTER antes de uma sequência acabar: as mudanças de estado que faltavam da deixa
  // anterior (imagem, tela preta, música, sons de fundo) acontecem já, rapidinho;
  // os sons e clarões avulsos que ainda iam tocar são descartados.
  concluirPendentes() {
    for (const r of this.historico) {
      if (!r.pendentes) continue;
      for (const p of r.pendentes) {
        if (p.feita) continue;
        clearTimeout(p.timer);
        p.feita = true;
        if (eEstado(p.a)) this.executar(rapido(p.a), r.i);
      }
    }
  }

  executar(a, i) {
    const P = this.palco, A = this.audio;
    try {
      switch (verbo(a)) {
        case 'musica': A.tocarMusica({ arquivo: a.musica, volume: a.volume ?? 80, fadeIn: a.fadeIn ?? 0, inicio: a.inicio || 0, fim: a.fim || null, loop: !!a.loop, transicao: a.transicao ?? 2, deixa: i }); break;
        case 'musicaVolume': A.volumeMusica(a.musicaVolume, a.fade ?? 2); break;
        case 'pararMusica': A.pararMusica(a.fade ?? 2); break;
        case 'ambiente': A.ambiente({ arquivo: a.ambiente, id: a.id, volume: a.volume ?? 50, fadeIn: a.fadeIn ?? 2, deixa: i }); break;
        case 'ambienteVolume': A.volumeAmbiente(a.ambienteVolume, a.volume ?? 50, a.fade ?? 2); break;
        case 'pararAmbiente': A.pararAmbiente(a.pararAmbiente, a.fade ?? 2); break;
        case 'som': A.som({ arquivo: a.som, volume: a.volume ?? 80, velocidade: a.velocidade || 1, pan: a.pan || 0, inicio: a.inicio || 0, duracao: a.duracao || null, fadeOut: a.fadeOut || 0, deixa: i }); break;
        case 'pararSons': A.pararSons(null, a.fade ?? 0.5); break;
        case 'silencio': A.silencio(a.fade ?? 2); break;
        case 'imagem': {
          const { imagem, em, ...resto } = a;
          P({ cmd: 'imagem', arquivo: imagem, ...resto });
          break;
        }
        case 'filtro': P({ cmd: 'filtro', filtro: a.filtro, fade: a.fade ?? 2 }); break;
        case 'video': {
          const { video, em, ...resto } = a;
          P({ cmd: 'video', arquivo: video, ...resto });
          break;
        }
        case 'pararVideo': P({ cmd: 'pararVideo', fade: a.fade ?? 1 }); break;
        case 'limparFundo': P({ cmd: 'limparFundo', fade: a.fade ?? 1.5 }); break;
        case 'efeito': P({ cmd: 'efeito', spec: { ...specEfeito(a), fadeIn: a.fadeIn ?? 0 }, deixa: i }); break;
        case 'parar': P({ cmd: 'parar', id: a.parar, fade: a.fade ?? 1 }); this.pararGerador(a.parar); if (a.parar === 'todos') P({ cmd: 'tirar', id: 'todos', fade: a.fade ?? 1 }); break;
        case 'disparar': P({ cmd: 'disparar', id: a.disparar }); break;
        case 'sobrepor': P({ cmd: 'sobrepor', ...specSobre(a), deixa: i }); break;
        case 'tirar': P({ cmd: 'tirar', id: a.tirar, fade: a.fade ?? 1 }); break;
        case 'flash': P({ cmd: 'flash', cor: a.flash === true ? '#ffffff' : a.flash, intensidade: a.intensidade ?? 0.9, duracao: a.duracao ?? 0.5, padrao: a.padrao || 'simples', relampago: !!a.relampago, x: a.x, fotos: a.fotos }); break;
        case 'tremor': P({ cmd: 'tremor', intensidade: a.tremor, duracao: a.duracao ?? 1 }); break;
        case 'escuro': P({ cmd: 'escuro', valor: a.escuro, fade: a.fade ?? 2 }); break;
        case 'tinta': P({ cmd: 'tinta', cor: a.tinta, intensidade: a.intensidade ?? 0.5, modo: a.modo || 'soft-light', fade: a.fade ?? 2 }); break;
        case 'blackout': P({ cmd: 'blackout', ligado: !!a.blackout, fade: a.fade ?? 1 }); break;
        case 'titulo': P({ cmd: 'titulo', texto: a.titulo, subtitulo: a.subtitulo || '', estilo: a.estilo || 'abertura', fadeIn: a.fadeIn ?? 2.5 }); break;
        case 'pararTitulo': P({ cmd: 'pararTitulo', fade: a.fade ?? 2 }); break;
        case 'raios': this.iniciarGerador(a, i); break;
        default: this.log('Ação desconhecida: ' + JSON.stringify(a));
      }
    } catch (e) { this.log('Erro: ' + e.message); }
  }

  // raios com trovões, nos tempos marcados (sincronizados com a música) ou ao acaso
  iniciarGerador(a, i) {
    const id = a.id || 'raios';
    this.pararGerador(id);
    const g = { id, a, i, timers: [], ativo: true };
    const um = (forte) => {
      if (!g.ativo) return;
      const x = rnd(0.15, 0.85);
      const I = (a.intensidade ?? 0.85) * (forte ? 1 : rnd(0.6, 1));
      const dur = rnd(0.5, 0.85);
      this.palco({ cmd: 'flash', padrao: 'raio', intensidade: I, duracao: dur, relampago: a.relampago !== false, x, fotos: a.fotos });
      if (a.clarao) this.palco({ cmd: 'efeito', spec: { tipo: 'clarao', padrao: 'raio', duracao: dur * 1.2, ...a.clarao }, deixa: i });
      if (a.tremor) this.palco({ cmd: 'tremor', intensidade: a.tremor * rnd(0.5, 1), duracao: 0.9 });
      if (a.trovoes && a.trovoes.length) {
        const [d0, d1] = a.atrasoTrovao || [0.05, 0.6];
        g.timers.push(setTimeout(() => g.ativo && this.audio.som({ arquivo: escolher(a.trovoes), volume: (a.volume ?? 85) * rnd(0.75, 1), velocidade: rnd(0.93, 1.05), pan: rnd(-0.5, 0.5), deixa: i }), rnd(d0, d1) * 1000));
      }
    };
    if (a.tempos) for (const t of a.tempos) g.timers.push(setTimeout(() => um(true), t * 1000));
    if (a.intervalo) {
      const [i0, i1] = a.intervalo;
      const laco = () => { if (!g.ativo) return; um(false); g.timers.push(setTimeout(laco, rnd(i0, i1) * 1000)); };
      g.timers.push(setTimeout(laco, (a.primeiro ?? rnd(i0, i1)) * 1000));
    }
    if (a.duracao) g.timers.push(setTimeout(() => this.pararGerador(id), a.duracao * 1000));
    this.geradores.set(id, g);
  }
  pararGerador(id) {
    const ids = id === 'todos' ? [...this.geradores.keys()] : [id];
    for (const k of ids) {
      const g = this.geradores.get(k);
      if (!g) continue;
      g.ativo = false;
      g.timers.forEach(clearTimeout);
      this.geradores.delete(k);
    }
  }

  // aplica o estado guardado (visual + sons em loop + geradores)
  aplicarModelo(fotoAudio, fade = 1.2) {
    this.palco({ cmd: 'estado', visual: this.modelo.visual, fade });
    if (fotoAudio) this.audio.restaurar(fotoAudio, fade);
    for (const id of [...this.geradores.keys()]) if (!this.modelo.geradores[id]) this.pararGerador(id);
    for (const [id, a] of Object.entries(this.modelo.geradores)) {
      if (!this.geradores.has(id)) {
        const { tempos, ...resto } = a;
        this.iniciarGerador({ ...resto, id, intervalo: a.intervalo || [5, 11], primeiro: 1.5 }, -1);
      }
    }
  }

  desfazer() {
    const reg = this.historico.pop();
    if (!reg) return false;
    reg.timers.forEach(clearTimeout);
    for (const g of [...this.geradores.values()]) if (g.i === reg.i) this.pararGerador(g.id);
    this.audio.pararSons((s) => s.deixa === reg.i, 0.4);
    this.palco({ cmd: 'desfazerDeixa', deixa: reg.i, fade: 0.5 });
    this.modelo = reg.foto.modelo;
    this.aplicarModelo(reg.foto.audio, 1);
    this.proxima = reg.i;
    this.ultima = this.historico.length ? this.historico[this.historico.length - 1].i : null;
    this.log(`Desfeita a deixa ${this.deixas[reg.i].n}`);
    this.aoMudar();
    return true;
  }

  selecionar(i) {
    this.proxima = Math.max(0, Math.min(i, this.deixas.length));
    this.prepararAdiante();
    this.aoMudar();
  }

  // monta o palco como ele estaria logo antes da deixa i (para ensaiar a partir daí)
  comecarDe(i, fade = 1.5) {
    for (const r of this.historico) r.timers.forEach(clearTimeout);
    this.historico = [];
    this.pararGerador('todos');
    this.audio.pararSons(null, 0.5);
    const m = modeloVazio();
    for (const d of this.deixas.slice(0, i)) for (const a of d.acoes) reduzir(m, a);
    this.modelo = m;
    const mus = m.audio.musica && m.audio.musica.loop ? { ...m.audio.musica, pos: 0, quando: 0 } : null;
    const foto = { musica: mus, ambientes: Object.entries(m.audio.ambientes).map(([id, x]) => ({ id, ...x })) };
    this.aplicarModelo(foto, fade);
    this.proxima = i;
    this.ultima = null;
    this.log(i ? `Palco preparado para começar na deixa ${i + 1}` : 'Palco zerado: começar do início');
    this.prepararAdiante();
    this.aoMudar();
  }

  silenciar(fade = 2) {
    this.audio.silencio(fade);
    this.pararGerador('todos');
    this.modelo.audio = { musica: null, ambientes: {} };
    this.modelo.geradores = {};
    this.log(fade > 0.2 ? 'Som silenciado' : 'Som cortado');
    this.aoMudar();
  }

  alternarBlackout() {
    const v = this.modelo.visual;
    v.blackout = !v.blackout;
    this.palco({ cmd: 'blackout', ligado: v.blackout, fade: 0.8 });
    this.log(v.blackout ? 'Tela preta' : 'Imagem de volta');
    this.aoMudar();
  }

  // carrega antes as imagens e a música das próximas deixas
  prepararAdiante() {
    const prox = this.deixas.slice(this.proxima, this.proxima + 4);
    const imgs = [];
    let musica = null;
    for (const d of prox) {
      for (const a of d.acoes) {
        if (a.imagem) imgs.push(a.imagem);
        if (a.sobrepor) imgs.push(a.sobrepor);
        if (a.fotos) imgs.push(...a.fotos);
        if (a.musica && !musica) musica = a.musica;
      }
    }
    if (imgs.length) this.palco({ cmd: 'precarregar', arquivos: [...new Set(imgs)] });
    if (musica) this.audio.preparar(musica);
  }

  sessao() { return { proxima: this.proxima, feitas: this.historico.map((r) => r.i) }; }
}
