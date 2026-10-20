// Motor de som da Mesa de Cena.
// Três barramentos: MÚSICA (uma por vez, com transição), AMBIENTE (sons em
// loop, vários ao mesmo tempo) e EFEITOS (sons curtos disparados uma vez).
// Volumes são em % (0 a 100). O "ganho" de cada arquivo (em dB, em
// deixas.json > midia) iguala o volume das músicas entre si.

export function curvaVolume(v) {
  if (!v || v <= 0) return 0;
  return Math.pow(Math.min(v, 150) / 100, 2);
}

function suave(x) { return x * x * (3 - 2 * x); }

// Leva um AudioParam até "alvo" em "dur" segundos com uma curva suave.
export function rampa(ctx, param, alvo, dur) {
  const t = ctx.currentTime;
  try { param.cancelAndHoldAtTime(t); } catch { param.cancelScheduledValues(t); }
  const ini = param.value;
  if (!dur || dur < 0.02 || Math.abs(ini - alvo) < 1e-5) {
    param.setValueAtTime(alvo, t);
    return;
  }
  const n = Math.max(3, Math.ceil(dur * 50));
  const curva = new Float32Array(n);
  const vi = Math.sqrt(Math.max(ini, 0)), va = Math.sqrt(Math.max(alvo, 0));
  for (let i = 0; i < n; i++) {
    const v = vi + (va - vi) * suave(i / (n - 1));
    curva[i] = v * v;
  }
  param.setValueAtTime(ini, t);
  param.setValueCurveAtTime(curva, t + 0.004, dur);
}

let seq = 0;

export class MotorAudio {
  constructor(urlMidia, midiaInfo) {
    this.url = urlMidia;
    this.info = midiaInfo || {};
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.limitador = c.createDynamicsCompressor();
    this.limitador.threshold.value = -2;
    this.limitador.knee.value = 2;
    this.limitador.ratio.value = 20;
    this.limitador.attack.value = 0.002;
    this.limitador.release.value = 0.2;
    this.mestre = c.createGain();
    this.analisador = c.createAnalyser();
    this.analisador.fftSize = 1024;
    this.mestre.connect(this.limitador).connect(this.analisador).connect(c.destination);
    this.bus = {};
    for (const nome of ['musica', 'ambiente', 'efeitos']) {
      const g = c.createGain();
      g.connect(this.mestre);
      this.bus[nome] = g;
    }
    this.musicas = [];          // a última é a atual; as outras estão saindo
    this.ambientes = new Map(); // id -> {arquivo, fonte, ganho, volume, deixa}
    this.sons = new Set();
    this.buffers = new Map();
    this.preparadas = new Map(); // arquivo -> <audio> já carregado
    this.erros = [];
    this._amostras = new Float32Array(this.analisador.fftSize);
    this._vigia = setInterval(() => this._vigiar(), 100);
  }

  ganhoArquivo(arquivo) {
    const db = this.info[arquivo] && this.info[arquivo].ganho;
    return db ? Math.pow(10, db / 20) : 1;
  }
  alvo(arquivo, volume) { return curvaVolume(volume) * this.ganhoArquivo(arquivo); }

  async retomar() { if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch {} } }

  volumeBus(nome, v) { rampa(this.ctx, (nome === 'mestre' ? this.mestre : this.bus[nome]).gain, curvaVolume(v), 0.15); }

  async saida(deviceId) {
    if (typeof this.ctx.setSinkId !== 'function') return false;
    try { await this.ctx.setSinkId(deviceId || ''); return true; } catch (e) { this._erro('Saída de som: ' + e.message); return false; }
  }

  _erro(m) { this.erros.push({ quando: Date.now(), m }); if (this.onErro) this.onErro(m); }

  buffer(arquivo) {
    if (!this.buffers.has(arquivo)) {
      const p = fetch(this.url(arquivo))
        .then((r) => { if (!r.ok) throw new Error('arquivo não encontrado'); return r.arrayBuffer(); })
        .then((b) => this.ctx.decodeAudioData(b))
        .catch((e) => { this.buffers.delete(arquivo); this._erro(`Som "${arquivo}": ${e.message}`); return null; });
      this.buffers.set(arquivo, p);
    }
    return this.buffers.get(arquivo);
  }

  // Carrega antes a música da próxima deixa para ela começar sem atraso.
  preparar(arquivo) {
    if (this.preparadas.has(arquivo) || this.musicas.some((m) => m.arquivo === arquivo && !m.saindo)) return;
    const el = new Audio();
    el.preload = 'auto';
    el.src = this.url(arquivo);
    el.load();
    this.preparadas.set(arquivo, el);
    if (this.preparadas.size > 4) {
      const [k] = this.preparadas.keys();
      const v = this.preparadas.get(k);
      v.removeAttribute('src'); v.load();
      this.preparadas.delete(k);
    }
  }

  // ---------- música ----------
  async tocarMusica({ arquivo, volume = 80, fadeIn = 0, inicio = 0, fim = null, loop = false, transicao = 2, deixa = null }) {
    await this.retomar();
    for (const m of this.musicas) if (!m.saindo) this._encerrarMusica(m, transicao);
    let el = this.preparadas.get(arquivo);
    this.preparadas.delete(arquivo);
    if (!el) { el = new Audio(); el.preload = 'auto'; el.src = this.url(arquivo); }
    el.loop = !!loop;
    const fonte = this.ctx.createMediaElementSource(el);
    const ganho = this.ctx.createGain();
    ganho.gain.value = 0;
    fonte.connect(ganho).connect(this.bus.musica);
    const m = { id: ++seq, arquivo, el, fonte, ganho, volume, fim, loop, deixa, saindo: false, nome: nomeCurto(arquivo) };
    this.musicas.push(m);
    el.addEventListener('ended', () => this._removerMusica(m));
    el.addEventListener('error', () => { this._erro(`Música "${arquivo}" não pôde ser tocada`); this._removerMusica(m); });
    try {
      if (inicio > 0) {
        if (el.readyState < 1) await new Promise((ok) => el.addEventListener('loadedmetadata', ok, { once: true }));
        el.currentTime = inicio;
      }
      await el.play();
    } catch (e) {
      this._erro(`Música "${arquivo}": ${e.message}`);
      this._removerMusica(m);
      return null;
    }
    if (m.saindo) return m;
    rampa(this.ctx, ganho.gain, this.alvo(arquivo, volume), fadeIn > 0 ? fadeIn : 0.03);
    return m;
  }

  musicaAtual() {
    for (let i = this.musicas.length - 1; i >= 0; i--) if (!this.musicas[i].saindo) return this.musicas[i];
    return null;
  }

  volumeMusica(volume, fade = 2) {
    const m = this.musicaAtual();
    if (!m) return;
    m.volume = volume;
    rampa(this.ctx, m.ganho.gain, this.alvo(m.arquivo, volume), fade);
  }

  pararMusica(fade = 2) { for (const m of this.musicas) if (!m.saindo) this._encerrarMusica(m, fade); }

  _encerrarMusica(m, fade) {
    m.saindo = true;
    rampa(this.ctx, m.ganho.gain, 0, Math.max(fade || 0, 0.05));
    clearTimeout(m.timer);
    m.timer = setTimeout(() => this._removerMusica(m), (Math.max(fade || 0, 0.05) + 0.2) * 1000);
  }

  _removerMusica(m) {
    const i = this.musicas.indexOf(m);
    if (i < 0) return;
    this.musicas.splice(i, 1);
    clearTimeout(m.timer);
    try { m.el.pause(); } catch {}
    try { m.fonte.disconnect(); m.ganho.disconnect(); } catch {}
    m.el.removeAttribute('src');
    try { m.el.load(); } catch {}
  }

  // ---------- ambientes (loop) ----------
  async ambiente({ arquivo, id, volume = 50, fadeIn = 2, deixa = null }) {
    await this.retomar();
    id = id || arquivo;
    const atual = this.ambientes.get(id);
    if (atual && atual.arquivo === arquivo && !atual.saindo) {
      atual.volume = volume;
      rampa(this.ctx, atual.ganho.gain, this.alvo(arquivo, volume), fadeIn);
      return;
    }
    if (atual) this._encerrarAmbiente(id, fadeIn);
    const reserva = { arquivo, volume, deixa, saindo: false, carregando: true };
    this.ambientes.set(id, reserva);
    const buf = await this.buffer(arquivo);
    if (!buf || this.ambientes.get(id) !== reserva || reserva.saindo) {
      if (this.ambientes.get(id) === reserva) this.ambientes.delete(id);
      return;
    }
    const fonte = this.ctx.createBufferSource();
    fonte.buffer = buf;
    fonte.loop = true;
    const ganho = this.ctx.createGain();
    ganho.gain.value = 0;
    fonte.connect(ganho).connect(this.bus.ambiente);
    fonte.start(this.ctx.currentTime + 0.01, Math.random() * Math.max(0, buf.duration - 1) * 0.5);
    Object.assign(reserva, { fonte, ganho, carregando: false, nome: nomeCurto(arquivo) });
    rampa(this.ctx, ganho.gain, this.alvo(arquivo, reserva.volume), fadeIn > 0 ? fadeIn : 0.03);
  }

  volumeAmbiente(id, volume, fade = 2) {
    const a = this.ambientes.get(id);
    if (!a || a.saindo) return;
    a.volume = volume;
    if (a.ganho) rampa(this.ctx, a.ganho.gain, this.alvo(a.arquivo, volume), fade);
  }

  pararAmbiente(id, fade = 2) {
    if (id === 'todos' || id === true) { for (const k of [...this.ambientes.keys()]) this._encerrarAmbiente(k, fade); return; }
    this._encerrarAmbiente(id, fade);
  }

  _encerrarAmbiente(id, fade) {
    const a = this.ambientes.get(id);
    if (!a) return;
    this.ambientes.delete(id);
    a.saindo = true;
    if (!a.fonte) return;
    const d = Math.max(fade || 0, 0.05);
    rampa(this.ctx, a.ganho.gain, 0, d);
    setTimeout(() => { try { a.fonte.stop(); a.fonte.disconnect(); a.ganho.disconnect(); } catch {} }, (d + 0.2) * 1000);
  }

  // ---------- efeitos ----------
  async som({ arquivo, volume = 80, velocidade = 1, pan = 0, inicio = 0, duracao = null, fadeOut = 0, deixa = null }) {
    await this.retomar();
    const buf = await this.buffer(arquivo);
    if (!buf) return;
    const c = this.ctx;
    const fonte = c.createBufferSource();
    fonte.buffer = buf;
    fonte.playbackRate.value = velocidade;
    const ganho = c.createGain();
    const alvo = this.alvo(arquivo, volume);
    ganho.gain.value = alvo;
    let saida = ganho;
    fonte.connect(ganho);
    if (pan) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      ganho.connect(p);
      saida = p;
    }
    saida.connect(this.bus.efeitos);
    const item = { arquivo, fonte, ganho, deixa, ini: c.currentTime, dur: (duracao || buf.duration - inicio) / velocidade, nome: nomeCurto(arquivo) };
    this.sons.add(item);
    fonte.onended = () => { this.sons.delete(item); try { saida.disconnect(); } catch {} };
    const t = c.currentTime + 0.005;
    if (duracao) {
      fonte.start(t, inicio, duracao + (fadeOut || 0.05));
      if (fadeOut) { ganho.gain.setValueAtTime(alvo, t + duracao); ganho.gain.linearRampToValueAtTime(0, t + duracao + fadeOut); }
    } else fonte.start(t, inicio);
    return item;
  }

  pararSons(filtro, fade = 0.3) {
    for (const s of [...this.sons]) {
      if (filtro && !filtro(s)) continue;
      rampa(this.ctx, s.ganho.gain, 0, fade);
      const f = s.fonte;
      setTimeout(() => { try { f.stop(); } catch {} }, (fade + 0.1) * 1000);
      this.sons.delete(s);
    }
  }

  silencio(fade = 2) {
    this.pararMusica(fade);
    this.pararAmbiente('todos', fade);
    this.pararSons(null, Math.min(fade, 1));
  }

  // ---------- para "desfazer" ----------
  fotografia() {
    const m = this.musicaAtual();
    return {
      musica: m ? { arquivo: m.arquivo, volume: m.volume, pos: m.el.currentTime, dur: m.el.duration, loop: m.loop, fim: m.fim, quando: performance.now() } : null,
      ambientes: [...this.ambientes.entries()].filter(([, a]) => !a.saindo).map(([id, a]) => ({ id, arquivo: a.arquivo, volume: a.volume }))
    };
  }

  restaurar(foto, fade = 1) {
    const m = this.musicaAtual();
    const t = foto.musica;
    if (t && m && m.arquivo === t.arquivo) this.volumeMusica(t.volume, fade);
    else {
      if (m) this._encerrarMusica(m, fade);
      if (t) {
        let pos = t.pos + (t.quando ? (performance.now() - t.quando) / 1000 : 0);
        if (t.loop && t.dur) pos %= t.dur;
        if (!t.dur || pos < t.dur - 1 || t.loop) this.tocarMusica({ arquivo: t.arquivo, volume: t.volume, inicio: pos || 0, fadeIn: fade, loop: t.loop, fim: t.fim });
      }
    }
    const quero = new Map(foto.ambientes.map((a) => [a.id, a]));
    for (const id of [...this.ambientes.keys()]) if (!quero.has(id)) this._encerrarAmbiente(id, fade);
    for (const a of quero.values()) this.ambiente({ arquivo: a.arquivo, id: a.id, volume: a.volume, fadeIn: fade });
  }

  // ---------- painel ----------
  _vigiar() {
    for (const m of this.musicas) {
      if (m.fim && !m.saindo && m.el.currentTime >= m.fim) this._encerrarMusica(m, 1.2);
    }
  }

  nivel() {
    this.analisador.getFloatTimeDomainData(this._amostras);
    let pico = 0;
    for (const v of this._amostras) { const a = Math.abs(v); if (a > pico) pico = a; }
    return pico;
  }

  painel() {
    const agora = this.ctx.currentTime;
    return {
      estado: this.ctx.state,
      musicas: this.musicas.map((m) => ({
        nome: m.nome, arquivo: m.arquivo, pos: m.el.currentTime || 0, dur: isFinite(m.el.duration) ? m.el.duration : 0,
        volume: m.volume, saindo: m.saindo, loop: m.loop, fim: m.fim
      })),
      ambientes: [...this.ambientes.entries()].map(([id, a]) => ({ id, nome: a.nome || nomeCurto(a.arquivo), volume: a.volume })),
      sons: [...this.sons].map((s) => ({ nome: s.nome, resta: Math.max(0, s.ini + s.dur - agora) }))
    };
  }
}

export function nomeCurto(arquivo) {
  return String(arquivo).split('/').pop().replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
}
