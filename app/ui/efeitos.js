// Efeitos visuais desenhados num <canvas> por cima da imagem de fundo.
// Cada efeito tem um "tipo" (chuva, brilhos, nevoa, fumaca...) e parâmetros.
// Posições (x, y) são frações da tela: 0 = esquerda/topo, 1 = direita/base.

const CORES = {
  branco: [255, 255, 255], ouro: [255, 214, 110], dourado: [255, 200, 80], amarelo: [255, 236, 120],
  rosa: [255, 140, 215], verde: [90, 255, 150], esmeralda: [40, 230, 120], rubi: [255, 40, 70],
  vermelho: [255, 50, 50], azul: [120, 180, 255], lilas: [200, 150, 255], laranja: [255, 150, 50],
  cinza: [150, 150, 150], marrom: [120, 90, 60], palha: [205, 170, 100], preto: [10, 10, 10],
  verdeBruxa: [70, 200, 60], vapor: [235, 240, 245], prata: [210, 220, 235]
};

export function cor(c, padrao = 'branco') {
  if (Array.isArray(c)) return c;
  if (typeof c === 'string' && c[0] === '#') {
    const h = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  return CORES[c] || CORES[padrao] || CORES.branco;
}
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const rnd = (a, b) => a + Math.random() * (b - a);
const escolher = (l) => l[Math.floor(Math.random() * l.length)];
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- sprites (desenhados uma vez e reaproveitados) ----------
const cache = new Map();
function sprite(chave, tam, desenhar) {
  if (!cache.has(chave)) {
    const c = document.createElement('canvas');
    c.width = c.height = tam;
    desenhar(c.getContext('2d'), tam);
    cache.set(chave, c);
  }
  return cache.get(chave);
}
function spriteSuave(c, nucleo = 0) {
  return sprite('suave' + c + nucleo, 128, (g, t) => {
    const r = g.createRadialGradient(t / 2, t / 2, 0, t / 2, t / 2, t / 2);
    r.addColorStop(0, rgba(c, 1));
    r.addColorStop(limitar(nucleo, 0, 0.9), rgba(c, 0.9));
    r.addColorStop(0.55, rgba(c, 0.35));
    r.addColorStop(1, rgba(c, 0));
    g.fillStyle = r;
    g.fillRect(0, 0, t, t);
  });
}
function spriteBrilho(c) {
  return sprite('brilho' + c, 96, (g, t) => {
    const m = t / 2;
    const r = g.createRadialGradient(m, m, 0, m, m, m);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.12, rgba(c, 0.9));
    r.addColorStop(0.35, rgba(c, 0.25));
    r.addColorStop(1, rgba(c, 0));
    g.fillStyle = r;
    g.fillRect(0, 0, t, t);
    g.globalCompositeOperation = 'lighter';
    for (const [w, h] of [[m * 0.95, 2.2], [2.2, m * 0.95]]) {
      const lg = g.createRadialGradient(m, m, 0, m, m, m);
      lg.addColorStop(0, 'rgba(255,255,255,0.95)');
      lg.addColorStop(1, rgba(c, 0));
      g.fillStyle = lg;
      g.beginPath();
      g.ellipse(m, m, w, h, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}
function spriteFumaca(c, variante) {
  return sprite('fumaca' + c + variante, 256, (g, t) => {
    let s = variante * 9973 + 17;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 16; i++) {
      const x = t / 2 + (r() - 0.5) * t * 0.5, y = t / 2 + (r() - 0.5) * t * 0.5, rr = t * (0.14 + r() * 0.22);
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, rgba(c, 0.13));
      gr.addColorStop(0.6, rgba(c, 0.06));
      gr.addColorStop(1, rgba(c, 0));
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    }
  });
}
function spriteChama() {
  return sprite('chama', 96, (g, t) => {
    const m = t / 2;
    const r = g.createRadialGradient(m, m, 0, m, m, m);
    r.addColorStop(0, 'rgba(255,255,220,1)');
    r.addColorStop(0.2, 'rgba(255,220,90,0.95)');
    r.addColorStop(0.45, 'rgba(255,120,20,0.55)');
    r.addColorStop(0.75, 'rgba(200,40,0,0.15)');
    r.addColorStop(1, 'rgba(120,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, t, t);
  });
}

// ---------- base ----------
class Efeito {
  constructor(p, cena) {
    this.p = p;
    this.cena = cena;
    this.t = 0;
    this.alfa = p.fadeIn > 0 ? 0 : 1;
    this.alvoAlfa = 1;
    this.velAlfa = p.fadeIn > 0 ? 1 / p.fadeIn : 999;
    this.intensidade = p.intensidade ?? 1;
    this.fim = false;
  }
  get W() { return this.cena.W; }
  get H() { return this.cena.H; }
  sair(fade) {
    this.saindo = true;
    this.alvoAlfa = 0;
    this.velAlfa = fade > 0 ? this.alfa / fade : 999;
  }
  passo(dt) {
    this.t += dt;
    if (this.alfa < this.alvoAlfa) this.alfa = Math.min(this.alvoAlfa, this.alfa + this.velAlfa * dt);
    else if (this.alfa > this.alvoAlfa) this.alfa = Math.max(this.alvoAlfa, this.alfa - this.velAlfa * dt);
    if (this.p.duracao && !this.saindo && this.t >= this.p.duracao) this.sair(this.p.fadeOut ?? 0.8);
    if (this.saindo && this.alfa <= 0.001) this.fim = true;
    this.atualizar(dt);
  }
  atualizar() {}
  desenhar() {}
  redimensionar() {}
}

// ---------- chuva ----------
class Chuva extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.gotas = [];
    this.vento = p.vento ?? 0.25;
    const n = Math.round(500 * this.intensidade);
    for (let i = 0; i < n; i++) this.gotas.push(this.nova(true));
  }
  nova(qualquer) {
    const z = rnd(0.4, 1);
    return { x: rnd(-0.2, 1.2) * this.W, y: qualquer ? rnd(-0.1, 1) * this.H : rnd(-0.2, -0.02) * this.H, z, v: (900 + 900 * z) };
  }
  atualizar(dt) {
    for (const g of this.gotas) {
      g.y += g.v * dt;
      g.x += g.v * this.vento * dt;
      if (g.y > this.H * 1.05) Object.assign(g, this.nova(false));
    }
  }
  desenhar(ctx) {
    ctx.strokeStyle = 'rgba(200,215,235,0.42)';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const g of this.gotas) {
      const l = 18 + 26 * g.z;
      ctx.moveTo(g.x, g.y);
      ctx.lineTo(g.x - l * this.vento, g.y - l);
    }
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

// ---------- detritos (vento / redemoinho) ----------
class Detritos extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.modo = p.modo || 'vento';
    this.cores = (p.cores || ['palha', 'marrom', '#6b5a3a', '#a08050']).map((c) => cor(c));
    this.ps = [];
    const n = Math.round((p.quantidade || 90) * this.intensidade);
    for (let i = 0; i < n; i++) this.ps.push(this.nova(true));
  }
  nova(qualquer) {
    const W = this.W, H = this.H;
    const forma = escolher(['folha', 'palha', 'palha', 'poeira', 'poeira']);
    const base = { forma, c: escolher(this.cores), rot: rnd(0, 6.28), vr: rnd(-6, 6), tam: forma === 'poeira' ? rnd(2, 5) : rnd(8, 22), z: rnd(0.5, 1.3) };
    if (this.modo === 'redemoinho') {
      return { ...base, ang: rnd(0, 6.28), raio: rnd(0.05, 0.6) * Math.min(W, H), h: qualquer ? rnd(0, 1) : 1.05 };
    }
    return { ...base, x: qualquer ? rnd(-0.1, 1.1) * W : rnd(-0.25, -0.05) * W, y: rnd(-0.1, 1.05) * H, vx: rnd(500, 1300), vy: rnd(-120, 160) };
  }
  atualizar(dt) {
    const W = this.W, H = this.H, cx = (this.p.x ?? 0.5) * W;
    for (const q of this.ps) {
      q.rot += q.vr * dt;
      if (this.modo === 'redemoinho') {
        q.ang += dt * (2.2 + 140 / (q.raio + 40)) * (this.p.velocidade || 1);
        q.h -= dt * 0.12 * q.z;
        q.raio *= 1 + dt * 0.03;
        if (q.h < -0.1) Object.assign(q, this.nova(false));
        q.x = cx + Math.cos(q.ang) * q.raio * (0.35 + 0.65 * (1 - q.h));
        q.y = q.h * H + Math.sin(q.ang) * q.raio * 0.18;
      } else {
        q.x += q.vx * dt * q.z * (this.p.velocidade || 1);
        q.y += (q.vy + Math.sin(this.t * 3 + q.rot) * 80) * dt;
        if (q.x > W * 1.15) Object.assign(q, this.nova(false));
      }
    }
  }
  desenhar(ctx) {
    for (const q of this.ps) {
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.fillStyle = rgba(q.c, q.forma === 'poeira' ? 0.5 : 0.85);
      if (q.forma === 'folha') { ctx.beginPath(); ctx.ellipse(0, 0, q.tam * 0.5 * q.z, q.tam * 0.22 * q.z, 0, 0, 6.28); ctx.fill(); }
      else if (q.forma === 'palha') ctx.fillRect(-q.tam * 0.6 * q.z, -1, q.tam * 1.2 * q.z, 2.2);
      else { ctx.beginPath(); ctx.arc(0, 0, q.tam * q.z, 0, 6.28); ctx.fill(); }
      ctx.restore();
    }
  }
}

// ---------- poeira / pólen / partículas de luz ----------
class Poeira extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.c = cor(p.cor, 'ouro');
    this.ps = [];
    const n = Math.round((p.quantidade || 70) * this.intensidade);
    for (let i = 0; i < n; i++) this.ps.push(this.nova());
  }
  nova() {
    const a = this.p.area || [0, 0, 1, 1];
    return {
      x: rnd(a[0], a[2]) * this.W, y: rnd(a[1], a[3]) * this.H, r: rnd(1.5, 4.5) * (this.p.tamanho || 1),
      vx: rnd(-12, 12), vy: rnd(-14, 4) + (this.p.subir ? -25 : 0), fase: rnd(0, 6.28), vel: rnd(0.5, 1.6)
    };
  }
  atualizar(dt) {
    for (const q of this.ps) {
      q.x += (q.vx + Math.sin(this.t * 0.6 + q.fase) * 10) * dt;
      q.y += q.vy * dt;
      if (q.y < -20 || q.x < -20 || q.x > this.W + 20 || q.y > this.H + 20) Object.assign(q, this.nova(), this.p.subir ? { y: this.H + 10 } : {});
    }
  }
  desenhar(ctx) {
    const s = spriteSuave(this.c, 0.15);
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.ps) {
      const a = 0.35 + 0.35 * Math.sin(this.t * q.vel * 2 + q.fase);
      ctx.globalAlpha = this.alfa * a * 0.8;
      const d = q.r * 6;
      ctx.drawImage(s, q.x - d / 2, q.y - d / 2, d, d);
    }
  }
}

// ---------- brilhos mágicos ----------
class Brilhos extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.modo = p.modo || 'campo';
    this.paleta = (Array.isArray(p.cor) && typeof p.cor[0] === 'string' ? p.cor : [p.cor || 'ouro']);
    this.ps = [];
    this.taxa = (p.quantidade || 60) * this.intensidade;
    this.acumulado = 0;
    if (this.modo === 'explosao') {
      const n = Math.round((p.quantidade || 140) * this.intensidade);
      for (let i = 0; i < n; i++) this.ps.push(this.nova());
    }
    if (this.modo === 'campo') for (let i = 0; i < this.taxa; i++) this.ps.push(this.nova(true));
  }
  corDe() {
    const c = escolher(this.paleta);
    if (c === 'arcoiris') return [Math.round(rnd(120, 255)), Math.round(rnd(120, 255)), Math.round(rnd(120, 255))];
    return cor(c, 'ouro');
  }
  nova(inicio) {
    const W = this.W, H = this.H, p = this.p;
    const cx = (p.x ?? 0.5) * W, cy = (p.y ?? 0.5) * H;
    const tam = rnd(10, 30) * (p.tamanho || 1);
    const c = this.corDe();
    const vida = rnd(0.8, 2.2);
    if (this.modo === 'explosao') {
      const a = rnd(0, 6.28), v = rnd(80, 650) * (p.forca || 1);
      return { x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, g: 260, tam, c, vida: rnd(0.9, 2.4), idade: 0 };
    }
    if (this.modo === 'chuva') return { x: rnd(0, 1) * W, y: rnd(-0.1, 0) * H, vx: rnd(-20, 20), vy: rnd(60, 160), g: 0, tam, c, vida: rnd(3, 6), idade: 0 };
    if (this.modo === 'subir') return { x: rnd(0, 1) * W, y: H * rnd(1, 1.05), vx: rnd(-15, 15), vy: rnd(-180, -60), g: 0, tam, c, vida: rnd(3, 6), idade: 0 };
    if (this.modo === 'espiral') {
      return { ang: rnd(0, 6.28), raio: rnd(0.02, 0.1) * Math.min(W, H), vr: rnd(90, 220), va: rnd(2.5, 5), tam, c, vida: rnd(1.5, 3), idade: 0 };
    }
    const a = p.area || [0.05, 0.05, 0.95, 0.95];
    return { x: rnd(a[0], a[2]) * W, y: rnd(a[1], a[3]) * H, vx: 0, vy: rnd(-8, 8), g: 0, tam, c, vida, idade: inicio ? rnd(0, vida) : 0 };
  }
  atualizar(dt) {
    if (this.modo !== 'explosao' && !this.saindo) {
      this.acumulado += dt * this.taxa / (this.modo === 'campo' ? 1.5 : 1);
      while (this.acumulado >= 1) { this.acumulado -= 1; this.ps.push(this.nova()); }
    }
    const cx = (this.p.x ?? 0.5) * this.W, cy = (this.p.y ?? 0.5) * this.H;
    for (const q of this.ps) {
      q.idade += dt;
      if (this.modo === 'espiral') {
        q.ang += q.va * dt;
        q.raio += q.vr * dt;
        q.x = cx + Math.cos(q.ang) * q.raio;
        q.y = cy + Math.sin(q.ang) * q.raio * 0.8;
      } else {
        q.vy += (q.g || 0) * dt;
        if (this.modo === 'explosao') { q.vx *= 1 - 1.6 * dt; q.vy *= 1 - 1.2 * dt; }
        q.x += q.vx * dt;
        q.y += q.vy * dt;
      }
    }
    this.ps = this.ps.filter((q) => q.idade < q.vida);
    if (this.modo === 'explosao' && this.ps.length === 0 && !this.saindo) this.sair(0);
  }
  desenhar(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.ps) {
      const f = q.idade / q.vida;
      const pisca = 0.65 + 0.35 * Math.sin(q.idade * 18 + q.tam);
      const a = Math.sin(Math.PI * Math.min(1, f)) * pisca;
      ctx.globalAlpha = this.alfa * limitar(a, 0, 1);
      const s = spriteBrilho(q.c);
      const d = q.tam * (0.7 + 0.5 * Math.sin(Math.PI * f));
      ctx.drawImage(s, q.x - d, q.y - d, d * 2, d * 2);
    }
  }
}

// ---------- vagalumes ----------
class Vagalumes extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.c = cor(p.cor || [200, 255, 120]);
    this.ps = [];
    const n = Math.round((p.quantidade || 35) * this.intensidade);
    const a = p.area || [0, 0.35, 1, 1];
    for (let i = 0; i < n; i++) this.ps.push({ x: rnd(a[0], a[2]) * this.W, y: rnd(a[1], a[3]) * this.H, dir: rnd(0, 6.28), fase: rnd(0, 6.28), vel: rnd(0.4, 1.1) });
  }
  atualizar(dt) {
    for (const q of this.ps) {
      q.dir += rnd(-2, 2) * dt;
      q.x += Math.cos(q.dir) * 22 * dt;
      q.y += Math.sin(q.dir) * 14 * dt;
      if (q.x < 0 || q.x > this.W) q.dir = Math.PI - q.dir;
      if (q.y < this.H * 0.2 || q.y > this.H) q.dir = -q.dir;
    }
  }
  desenhar(ctx) {
    const s = spriteSuave(this.c, 0.08);
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.ps) {
      const b = Math.max(0, Math.sin(this.t * q.vel * 2.2 + q.fase));
      ctx.globalAlpha = this.alfa * b * b * 0.9;
      ctx.drawImage(s, q.x - 14, q.y - 14, 28, 28);
    }
  }
}

// ---------- névoa ----------
class Nevoa extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.c = cor(p.cor || [220, 225, 235]);
    this.ps = [];
    const n = Math.round(22 * this.intensidade) + 4;
    const faixa = p.faixa || [0.55, 1.05];
    for (let i = 0; i < n; i++) {
      this.ps.push({ x: rnd(-0.2, 1.2) * this.W, y: rnd(faixa[0], faixa[1]) * this.H, r: rnd(0.25, 0.5) * this.W, v: rnd(8, 30) * (Math.random() < 0.5 ? -1 : 1) * (p.velocidade || 1), var: i % 4 });
    }
  }
  atualizar(dt) {
    for (const q of this.ps) {
      q.x += q.v * dt;
      if (q.x - q.r > this.W * 1.1) q.x = -q.r;
      if (q.x + q.r < -this.W * 0.1) q.x = this.W + q.r;
    }
  }
  desenhar(ctx) {
    for (const q of this.ps) {
      ctx.globalAlpha = this.alfa * 0.26 * (this.p.densidade ?? 0.7);
      const s = spriteFumaca(this.c, q.var);
      ctx.drawImage(s, q.x - q.r, q.y - q.r * 0.5, q.r * 2, q.r);
    }
  }
}

// ---------- fumaça e vapor ----------
class Fumaca extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.c = cor(p.cor || 'cinza');
    this.pontos = p.pontos || [[p.x ?? 0.5, p.y ?? 0.95]];
    this.taxa = (p.taxa || 14) * this.intensidade;
    this.ps = [];
    this.acc = 0;
    this.rajadas = (p.rajadas || []).slice().sort((a, b) => a - b);
    this.continuo = p.continuo !== false && !p.rajadas;
    this.vel = p.velocidade || 1;
    this.aditivo = !!p.aditivo;
  }
  emitir(n, forte) {
    for (let i = 0; i < n; i++) {
      const [px, py] = escolher(this.pontos);
      const esp = this.p.espalhar ?? 0.06;
      this.ps.push({
        x: (px + rnd(-esp, esp)) * this.W, y: py * this.H, r: rnd(40, 90) * (this.p.tamanho || 1) * (forte ? 1.3 : 1),
        vx: rnd(-30, 30) * (this.p.tamanho || 1) + (this.p.ventoX || 0), vy: -rnd(60, 160) * this.vel * (forte ? 1.8 : 1), cresce: rnd(40, 110) * (this.p.crescer ?? 0.6) * (this.p.tamanho || 1),
        rot: rnd(0, 6.28), vr: rnd(-0.6, 0.6), vida: rnd(2.5, 5) * (this.p.vida || 1), idade: 0, var: Math.floor(rnd(0, 4))
      });
    }
  }
  atualizar(dt) {
    if (!this.saindo && this.continuo) {
      this.acc += this.taxa * dt;
      while (this.acc >= 1) { this.acc -= 1; this.emitir(1); }
    }
    while (this.rajadas.length && this.t >= this.rajadas[0]) { this.rajadas.shift(); this.emitir(Math.round(18 * this.intensidade), true); }
    for (const q of this.ps) {
      q.idade += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vy *= 1 - 0.25 * dt;
      q.r += q.cresce * dt;
      q.rot += q.vr * dt;
    }
    this.ps = this.ps.filter((q) => q.idade < q.vida);
    if (!this.continuo && !this.rajadas.length && !this.ps.length && this.t > 0.5 && !this.saindo && !this.p.manter) this.sair(0);
  }
  desenhar(ctx) {
    if (this.aditivo) ctx.globalCompositeOperation = 'lighter';
    for (const q of this.ps) {
      const f = q.idade / q.vida;
      ctx.globalAlpha = this.alfa * (this.p.opacidade ?? 0.6) * Math.min(1, f * 5) * (1 - f) * (1 - f * 0.3);
      const s = spriteFumaca(this.c, q.var);
      ctx.save();
      ctx.translate(q.x, q.y);
      ctx.rotate(q.rot);
      ctx.drawImage(s, -q.r, -q.r, q.r * 2, q.r * 2);
      ctx.restore();
    }
  }
}

// ---------- chamas ----------
class Chamas extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.pontos = p.pontos || [[0.5, 0.9]];
    this.ps = [];
    this.acc = 0;
    this.rajadas = (p.rajadas || []).slice().sort((a, b) => a - b);
    this.continuo = p.continuo !== false;
    this.taxa = (p.taxa || 110) * this.intensidade;
  }
  emitir(n, forte) {
    for (let i = 0; i < n; i++) {
      const [px, py] = escolher(this.pontos);
      const f = forte ? 2.6 : 1;
      this.ps.push({ x: px * this.W + rnd(-12, 12) * f * (this.p.tamanho || 1), y: py * this.H, vx: rnd(-20, 20) * f, vy: -rnd(120, 280) * f * (this.p.altura || 1), r: rnd(10, 24) * f * (this.p.tamanho || 1), vida: rnd(0.4, 0.85) * (forte ? 1.4 : 1), idade: 0 });
    }
  }
  disparar() { this.emitir(Math.round(70 * this.intensidade), true); }
  atualizar(dt) {
    if (!this.saindo && this.continuo) {
      this.acc += this.taxa * this.pontos.length * dt;
      while (this.acc >= 1) { this.acc -= 1; this.emitir(1); }
    }
    while (this.rajadas.length && this.t >= this.rajadas[0]) { this.rajadas.shift(); this.disparar(); }
    for (const q of this.ps) {
      q.idade += dt;
      q.x += (q.vx + Math.sin(q.idade * 9 + q.r) * 30) * dt;
      q.y += q.vy * dt;
      q.r *= 1 - 0.9 * dt;
    }
    this.ps = this.ps.filter((q) => q.idade < q.vida);
    if (!this.continuo && !this.rajadas.length && !this.ps.length && this.t > 0.3 && !this.saindo) this.sair(0);
  }
  desenhar(ctx) {
    const s = spriteChama();
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.ps) {
      const f = q.idade / q.vida;
      ctx.globalAlpha = this.alfa * (1 - f) * 0.8;
      const d = q.r * 2.2;
      ctx.drawImage(s, q.x - d / 2, q.y - d * 0.9, d, d * 1.8);
    }
    // brilho no chão em volta de cada braseiro
    for (const [px, py] of this.pontos) {
      const g = ctx.createRadialGradient(px * this.W, py * this.H, 0, px * this.W, py * this.H, 220 * (this.p.tamanho || 1));
      const b = 0.18 + 0.06 * Math.sin(this.t * 13 + px * 10) * Math.sin(this.t * 7.3);
      g.addColorStop(0, `rgba(255,140,40,${b * this.alfa})`);
      g.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(px * this.W - 240, py * this.H - 240, 480, 480);
    }
  }
}

// ---------- raios de luz ----------
class RaiosDeLuz extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.c = cor(p.cor || 'ouro');
    this.n = p.quantidade || 9;
    this.fases = Array.from({ length: this.n }, () => [rnd(0, 6.28), rnd(0.4, 1)]);
  }
  desenhar(ctx) {
    const W = this.W, H = this.H;
    const x = (this.p.x ?? 0.5) * W, y = (this.p.y ?? -0.05) * H;
    const L = Math.hypot(W, H) * 1.1;
    ctx.globalCompositeOperation = 'lighter';
    const base = ((this.p.angulo ?? 90) * Math.PI) / 180;
    const ab = (this.p.abertura || 1.1);
    for (let i = 0; i < this.n; i++) {
      const [fase, peso] = this.fases[i];
      const a = base + (i / (this.n - 1) - 0.5) * ab + Math.sin(this.t * 0.17 + fase) * 0.05;
      const w = 0.035 + 0.03 * peso;
      const br = (0.35 + 0.25 * Math.sin(this.t * 0.5 + fase)) * peso * this.intensidade;
      const g = ctx.createRadialGradient(x, y, 0, x, y, L);
      g.addColorStop(0, rgba(this.c, 0.85 * br));
      g.addColorStop(0.55, rgba(this.c, 0.25 * br));
      g.addColorStop(1, rgba(this.c, 0));
      ctx.globalAlpha = this.alfa;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a - w) * L, y + Math.sin(a - w) * L);
      ctx.lineTo(x + Math.cos(a + w) * L, y + Math.sin(a + w) * L);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ---------- bolha da fada ----------
class Bolha extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.de = p.de || [0.85, 0.2];
    this.ate = p.ate || [0.5, 0.45];
    this.dur = p.viagem || 4;
    this.estoura = p.estourar ?? (this.dur + 0.8);
    this.estourou = false;
    this.c = cor(p.cor || 'rosa');
  }
  atualizar() {
    if (!this.estourou && this.t >= this.estoura) {
      this.estourou = true;
      const [x, y] = this.pos();
      this.cena.iniciar({ tipo: 'brilhos', modo: 'explosao', x: x / this.W, y: y / this.H, cor: ['rosa', 'branco', 'lilas', 'ouro'], quantidade: 160, forca: 1.2, tamanho: 1.1 });
      this.sair(0.12);
    }
  }
  pos() {
    const f = Math.min(1, this.t / this.dur);
    const e = 1 - Math.pow(1 - f, 3);
    const x = (this.de[0] + (this.ate[0] - this.de[0]) * e) * this.W + Math.sin(this.t * 1.7) * 14;
    const y = (this.de[1] + (this.ate[1] - this.de[1]) * e) * this.H + Math.cos(this.t * 1.3) * 10;
    return [x, y];
  }
  desenhar(ctx) {
    const f = Math.min(1, this.t / this.dur);
    const r = (0.04 + 0.16 * (1 - Math.pow(1 - f, 2))) * this.H * (this.p.tamanho || 1);
    const [x, y] = this.pos();
    const w = 1 + Math.sin(this.t * 5) * 0.025;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(w, 2 - w);
    // halo
    let g = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, r * 1.35);
    g.addColorStop(0, rgba(this.c, 0.35 * this.alfa));
    g.addColorStop(1, rgba(this.c, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.35, 0, 6.28); ctx.fill();
    // corpo da bolha
    g = ctx.createRadialGradient(0, r * 0.15, r * 0.2, 0, 0, r);
    g.addColorStop(0, `rgba(255,235,250,${0.12 * this.alfa})`);
    g.addColorStop(0.7, rgba(this.c, 0.22 * this.alfa));
    g.addColorStop(0.92, `rgba(255,200,240,${0.65 * this.alfa})`);
    g.addColorStop(1, `rgba(255,255,255,${0.9 * this.alfa})`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.28); ctx.fill();
    // borda furta-cor
    const h = (this.t * 70) % 360;
    ctx.lineWidth = Math.max(3, r * 0.035);
    ctx.strokeStyle = `hsla(${h},100%,82%,${0.85 * this.alfa})`;
    ctx.shadowColor = rgba(this.c, 1);
    ctx.shadowBlur = 25;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.985, 0, 6.28); ctx.stroke();
    ctx.shadowBlur = 0;
    // reflexo
    g = ctx.createRadialGradient(-r * 0.42, -r * 0.45, 0, -r * 0.42, -r * 0.45, r * 0.32);
    g.addColorStop(0, `rgba(255,255,255,${0.95 * this.alfa})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(-r * 0.42, -r * 0.45, r * 0.32, 0, 6.28); ctx.fill();
    ctx.restore();
  }
}

// ---------- coração que pulsa ----------
class Coracao extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.batidas = (p.batidas || []).slice();
    this.bpm = p.bpm || 0;
    this.ultima = -10;
    this.c = cor(p.cor || [255, 60, 90]);
  }
  atualizar() {
    while (this.batidas.length && this.t >= this.batidas[0]) { this.batidas.shift(); this.ultima = this.t; }
    if (this.bpm && !this.p.batidas) {
      const per = 60 / this.bpm;
      if (this.t - this.ultima >= per) this.ultima = this.t;
    }
  }
  desenhar(ctx) {
    const W = this.W, H = this.H;
    const d = this.t - this.ultima;
    const pulso = Math.exp(-d * 6);
    const s = (this.p.tamanho || 0.22) * H * (1 + 0.14 * pulso);
    const x = (this.p.x ?? 0.5) * W, y = (this.p.y ?? 0.5) * H;
    ctx.globalCompositeOperation = 'lighter';
    // brilho da tela inteira
    const gg = ctx.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * 0.7);
    gg.addColorStop(0, rgba(this.c, 0.28 * pulso + 0.06));
    gg.addColorStop(1, rgba(this.c, 0));
    ctx.globalAlpha = this.alfa * this.intensidade;
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 100, s / 100);
    ctx.shadowColor = rgba(this.c, 1);
    ctx.shadowBlur = 40 + 60 * pulso;
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.bezierCurveTo(-10, 20, -50, -5, -50, -30);
    ctx.bezierCurveTo(-50, -55, -20, -62, 0, -38);
    ctx.bezierCurveTo(20, -62, 50, -55, 50, -30);
    ctx.bezierCurveTo(50, -5, 10, 20, 0, 30);
    const g = ctx.createRadialGradient(-12, -30, 2, 0, -15, 60);
    g.addColorStop(0, rgba([255, 200, 210], 0.9));
    g.addColorStop(1, rgba(this.c, 0.75));
    ctx.fillStyle = g;
    ctx.globalAlpha = this.alfa * (0.55 + 0.45 * pulso);
    ctx.fill();
    ctx.restore();
  }
}

// ---------- redemoinho (ciclone) ----------
class Redemoinho extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.c = cor(p.cor || [90, 75, 60]);
    this.bracos = p.bracos || 7;
  }
  desenhar(ctx) {
    const W = this.W, H = this.H;
    const cx = (this.p.x ?? 0.5) * W, cy = (this.p.y ?? 0.5) * H;
    const R = Math.hypot(W, H) * 0.75;
    const giro = this.t * (this.p.velocidade || 1.4);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, this.p.achatar ?? 0.6);
    for (let b = 0; b < this.bracos; b++) {
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const f = i / 60;
        const ang = giro + b * (6.283 / this.bracos) + f * 4.2;
        const r = 30 + f * R;
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba(this.c, 0.22 * this.intensidade);
      ctx.lineWidth = 60 + 40 * Math.sin(this.t + b);
      ctx.globalAlpha = this.alfa;
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ---------- estrelas (fundo do título) ----------
class Estrelas extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.ps = Array.from({ length: p.quantidade || 160 }, () => ({ x: Math.random(), y: Math.random() * 0.8, r: rnd(0.6, 2.2), f: rnd(0, 6.28), v: rnd(0.5, 2) }));
  }
  desenhar(ctx) {
    ctx.fillStyle = '#fff';
    for (const s of this.ps) {
      ctx.globalAlpha = this.alfa * (0.4 + 0.6 * Math.abs(Math.sin(this.t * s.v + s.f)));
      ctx.beginPath(); ctx.arc(s.x * this.W, s.y * this.H, s.r, 0, 6.28); ctx.fill();
    }
  }
}

// ---------- luz tremeluzindo (tochas, lampião, tempestade) ----------
class Tremeluzir extends Efeito {
  constructor(p, cena) { super(p, cena); this.c = cor(p.cor || 'preto'); this.v = 0; }
  atualizar(dt) {
    const alvo = Math.random() < 0.08 * (this.p.velocidade || 1) ? Math.random() : this.v;
    this.v += (alvo - this.v) * Math.min(1, dt * 14);
  }
  desenhar(ctx) {
    ctx.globalAlpha = this.alfa * this.v * (this.intensidade * 0.35);
    ctx.fillStyle = rgba(this.c, 1);
    ctx.fillRect(0, 0, this.W, this.H);
  }
}

// ---------- vinheta ----------
class Vinheta extends Efeito {
  desenhar(ctx) {
    const W = this.W, H = this.H;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, rgba(cor(this.p.cor || 'preto'), 0.85 * this.intensidade));
    ctx.globalAlpha = this.alfa;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------- anel de luz (magia, sapatos) ----------
class Anel extends Efeito {
  constructor(p, cena) { super(p, cena); this.c = cor(p.cor || 'rubi'); this.dur = p.duracao || 1.4; }
  desenhar(ctx) {
    const f = Math.min(1, this.t / this.dur);
    const x = (this.p.x ?? 0.5) * this.W, y = (this.p.y ?? 0.75) * this.H;
    const r = (0.02 + f * (this.p.tamanho || 0.6)) * Math.max(this.W, this.H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = this.alfa * (1 - f) * this.intensidade;
    ctx.strokeStyle = rgba(this.c, 0.9);
    ctx.shadowColor = rgba(this.c, 1);
    ctx.shadowBlur = 30;
    ctx.lineWidth = 6 + 18 * (1 - f);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.45, 0, 0, 6.28);
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (f >= 1 && !this.saindo) this.sair(0);
  }
}

// ---------- relâmpago desenhado ----------
class Relampago extends Efeito {
  constructor(p, cena) {
    super(p, cena);
    this.dur = p.duracao || 0.55;
    this.ramos = [];
    const x0 = (p.x ?? rnd(0.15, 0.85)) * this.W;
    this.gerar(x0, -10, x0 + rnd(-0.25, 0.25) * this.W, (p.altura ?? rnd(0.55, 0.95)) * this.H, 3.2, 0);
  }
  gerar(x1, y1, x2, y2, larg, nivel) {
    const pts = [[x1, y1]];
    const n = 14;
    for (let i = 1; i < n; i++) {
      const f = i / n;
      pts.push([x1 + (x2 - x1) * f + rnd(-1, 1) * this.W * 0.035, y1 + (y2 - y1) * f + rnd(-1, 1) * 8]);
    }
    pts.push([x2, y2]);
    this.ramos.push({ pts, larg });
    if (nivel < 2) {
      for (let i = 3; i < pts.length - 2; i++) {
        if (Math.random() < 0.22) {
          const [bx, by] = pts[i];
          this.gerar(bx, by, bx + rnd(-0.18, 0.18) * this.W, by + rnd(0.08, 0.3) * this.H, larg * 0.5, nivel + 1);
        }
      }
    }
  }
  desenhar(ctx) {
    const f = this.t / this.dur;
    if (f >= 1) { if (!this.saindo) this.sair(0); return; }
    const pisca = [1, 0.25, 0.9, 0.15, 0.7, 0.4, 0.2, 0][Math.min(7, Math.floor(f * 8))];
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = this.alfa * pisca;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const passo of [[16, 'rgba(140,170,255,0.25)'], [6, 'rgba(200,220,255,0.6)'], [1, 'rgba(255,255,255,1)']]) {
      for (const r of this.ramos) {
        ctx.strokeStyle = passo[1];
        ctx.lineWidth = r.larg * passo[0] * 0.6;
        ctx.beginPath();
        r.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      }
    }
  }
}

// ---------- clarão localizado (relâmpago visto pela janela, explosão de luz) ----------
class Clarao extends Efeito {
  constructor(p, cena) { super(p, cena); this.dur = p.duracao || 0.7; this.c = cor(p.cor || [230, 238, 255]); }
  desenhar(ctx) {
    const f = this.t / this.dur;
    if (f >= 1) { if (!this.saindo) this.sair(0); return; }
    const pisca = this.p.padrao === 'raio'
      ? [1, 0.2, 0.85, 0.1, 0.6, 0.35, 0.15, 0][Math.min(7, Math.floor(f * 8))]
      : Math.sin(Math.PI * f);
    const x = (this.p.x ?? 0.5) * this.W, y = (this.p.y ?? 0.5) * this.H;
    const r = (this.p.tamanho ?? 0.25) * Math.max(this.W, this.H);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(this.c, 0.95 * this.intensidade));
    g.addColorStop(0.35, rgba(this.c, 0.45 * this.intensidade));
    g.addColorStop(1, rgba(this.c, 0));
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = this.alfa * pisca;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

export const TIPOS = {
  clarao: Clarao,
  chuva: Chuva, detritos: Detritos, poeira: Poeira, brilhos: Brilhos, vagalumes: Vagalumes, nevoa: Nevoa,
  fumaca: Fumaca, vapor: Fumaca, chamas: Chamas, raiosDeLuz: RaiosDeLuz, bolha: Bolha, coracao: Coracao,
  redemoinho: Redemoinho, estrelas: Estrelas, tremeluzir: Tremeluzir, vinheta: Vinheta, anel: Anel, relampago: Relampago
};

const PADROES = {
  vapor: { cor: 'vapor', velocidade: 3.2, tamanho: 0.28, crescer: 1.4, vida: 0.32, espalhar: 0.008, opacidade: 0.55 }
};

// "luz" = canvas somado à imagem (mix-blend-mode: screen): brilho, fogo, raios.
// "normal" = canvas por cima (fumaça, névoa, chuva, escurecimento).
const CAMADA = {
  brilhos: 'luz', vagalumes: 'luz', poeira: 'luz', chamas: 'luz', raiosDeLuz: 'luz', coracao: 'luz',
  anel: 'luz', relampago: 'luz', estrelas: 'luz', clarao: 'luz'
};

// ---------- gerenciador ----------
export class Cena {
  constructor(canvasNormal, canvasLuz) {
    this.telas = { normal: canvasNormal, luz: canvasLuz };
    this.ctxs = { normal: canvasNormal.getContext('2d'), luz: canvasLuz.getContext('2d') };
    this.ativos = new Map();
    this.soltos = new Set();
    this.rodando = false;
    this.redimensionar();
    addEventListener('resize', () => this.redimensionar());
  }
  redimensionar() {
    this.W = Math.round(innerWidth);
    this.H = Math.round(innerHeight);
    for (const c of Object.values(this.telas)) { c.width = this.W; c.height = this.H; }
    for (const e of this.todos()) e.redimensionar();
  }
  todos() { return [...this.ativos.values(), ...this.soltos]; }
  iniciar(spec) {
    const Tipo = TIPOS[spec.tipo];
    if (!Tipo) { console.warn('efeito desconhecido', spec.tipo); return null; }
    const p = { ...(PADROES[spec.tipo] || {}), ...spec };
    const e = new Tipo(p, this);
    e.camada = p.camada || CAMADA[p.tipo] || 'normal';
    if (p.duracao || p.solto || p.tipo === 'relampago' || p.tipo === 'anel' || p.tipo === 'clarao' || (p.tipo === 'brilhos' && p.modo === 'explosao')) {
      this.soltos.add(e);
    } else {
      const id = p.id || p.tipo;
      const velho = this.ativos.get(id);
      if (velho) { velho.sair(0.4); this.soltos.add(velho); }
      e.id = id;
      this.ativos.set(id, e);
    }
    this.ligar();
    return e;
  }
  pegar(id) { return this.ativos.get(id); }
  parar(id, fade = 1) {
    if (id === 'todos') {
      for (const [k, e] of this.ativos) { e.sair(fade); this.soltos.add(e); this.ativos.delete(k); }
      for (const e of this.soltos) e.sair(Math.min(fade, 0.5));
      return;
    }
    const e = this.ativos.get(id);
    if (e) { e.sair(fade); this.soltos.add(e); this.ativos.delete(id); }
  }
  pararDaDeixa(deixa, fade = 0.5) {
    for (const [k, e] of this.ativos) if (e.deixa === deixa) { e.sair(fade); this.soltos.add(e); this.ativos.delete(k); }
    for (const e of this.soltos) if (e.deixa === deixa) e.sair(fade);
  }
  pararDaCena(fade = 1) {
    for (const [k, e] of this.ativos) if (!e.p.fixo) { e.sair(fade); this.soltos.add(e); this.ativos.delete(k); }
  }
  ids() { return [...this.ativos.keys()]; }
  ligar() {
    if (this.rodando) return;
    this.rodando = true;
    this.ultimo = performance.now();
    const quadro = (agora) => {
      const dt = Math.min(0.05, (agora - this.ultimo) / 1000);
      this.ultimo = agora;
      for (const ctx of Object.values(this.ctxs)) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, this.W, this.H);
      }
      for (const e of this.todos()) {
        e.passo(dt);
        if (e.fim) { this.soltos.delete(e); if (this.ativos.get(e.id) === e) this.ativos.delete(e.id); continue; }
        const ctx = this.ctxs[e.camada];
        ctx.save();
        ctx.globalAlpha = e.alfa;
        ctx.globalCompositeOperation = 'source-over';
        e.desenhar(ctx);
        ctx.restore();
      }
      if (this.ativos.size || this.soltos.size) requestAnimationFrame(quadro);
      else {
        this.rodando = false;
        for (const ctx of Object.values(this.ctxs)) ctx.clearRect(0, 0, this.W, this.H);
      }
    };
    requestAnimationFrame(quadro);
  }
}
