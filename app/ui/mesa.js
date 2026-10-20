// MESA do operador: mostra o roteiro com as deixas e dispara cada uma no ENTER.
import { MotorAudio } from './motor-audio.js';
import { MotorDeixas, lerRoteiro, resumo } from './motor-deixas.js';

const $ = (s) => document.querySelector(s);
const url = (rel) => 'oz://local/midia/' + String(rel).split('/').map(encodeURIComponent).join('/');
const PADRAO = { intervalo: 0.6, passador: true, previa: true, ajuste: 'cobrir', saida: '', volumes: { mestre: 100, musica: 100, ambiente: 100, efeitos: 100 } };

let info, prefs, roteiro, audio, motor;
let ultimoGo = -1e9, ultimoEsc = -1e9, inicioPeca = null, escolhida = null, ultimaRolada = null;
let palcoInfo = null;
const elDeixa = [];

const paraPalco = (cmd) => window.mesa.paraPalco(cmd);
const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function log(m) { $('#log').textContent = `${hora()} · ${m}`; console.log('[mesa]', m); }
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tempo = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function aviso(msg, tipo = 'alerta', ms = 0, botoes = []) {
  const el = document.createElement('div');
  el.className = 'aviso ' + tipo;
  el.innerHTML = `<div class="msg"></div>`;
  el.querySelector('.msg').textContent = msg;
  for (const [rotulo, acao] of botoes) {
    const b = document.createElement('button');
    b.textContent = rotulo;
    b.tabIndex = -1;
    b.onclick = () => { el.remove(); acao(); };
    el.append(b);
  }
  const x = document.createElement('button');
  x.textContent = '✕';
  x.tabIndex = -1;
  x.onclick = () => el.remove();
  el.append(x);
  $('#avisos').append(el);
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
}

// ---------- início ----------
async function iniciar() {
  info = await window.mesa.info();
  const p = info.preferencias || {};
  prefs = { ...PADRAO, ...p, volumes: { ...PADRAO.volumes, ...(p.volumes || {}) } };
  window.mesa.aoReceber(receber);
  ligarTeclado();
  if (info.erro || !info.deixas) {
    $('#btGo').disabled = true;
    $('#pxNome').textContent = 'Não foi possível abrir as deixas';
    aviso(info.erro || 'Não encontrei a pasta da peça (com o arquivo deixas.json, as imagens e as músicas).', 'erro', 0,
      [['Escolher a pasta da peça…', () => window.mesa.escolherPasta()]]);
    return;
  }
  const titulo = info.deixas.titulo || 'Peça';
  $('#nomePeca').textContent = titulo;
  document.title = `Mesa de Cena – ${titulo}`;
  roteiro = lerRoteiro(info.deixas);
  audio = new MotorAudio(url, info.deixas.midia || {});
  audio.onErro = (m) => { aviso(m, 'erro', 10000); log(m); };
  motor = new MotorDeixas({ deixas: roteiro.deixas, audio, palco: paraPalco, aoMudar: atualizar, log });
  window.__mesa = { motor, audio, roteiro };
  aplicarVolumes();
  if (prefs.saida) audio.saida(prefs.saida);
  desenharRoteiro();
  ligarBotoes();
  atualizar();
  atualizarPalcoEstado(info.palco);
  if (info.faltando.length) {
    aviso(`Faltam ${info.faltando.length} arquivo(s) na pasta da peça: ${info.faltando.slice(0, 8).join(' · ')}${info.faltando.length > 8 ? ' …' : ''}`, 'erro');
  }
  oferecerContinuar(info.sessao);
  precarregarSons();
  setInterval(painelSom, 250);
  requestAnimationFrame(medidor);
  setInterval(previa, 700);
  setInterval(relogio, 1000);
  setInterval(andamento, 200);
  paraPalco({ cmd: 'ping' });
  log(`${roteiro.deixas.length} deixas carregadas`);
}

function receber(m) {
  if (m.tipo === 'tecla') { tratarTecla(m); return; }
  if (m.tipo === 'palco-estado') { atualizarPalcoEstado(m.palco); return; }
  if (m.tipo === 'palco') {
    if (m.evento === 'pronto' || m.evento === 'pong') sincronizarPalco();
    else if (m.evento === 'erro') { aviso(m.msg, 'erro', 10000); log(m.msg); }
  }
}

function sincronizarPalco() {
  if (!motor) return;
  paraPalco({ cmd: 'ajuste', modo: prefs.ajuste });
  paraPalco({ cmd: 'estado', visual: motor.modelo.visual, fade: 0.05 });
  motor.prepararAdiante();
}

// ---------- teclado ----------
function ligarTeclado() {
  addEventListener('keydown', (e) => {
    const t = { key: e.key, code: e.code, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, repeat: e.repeat };
    if (tratarTecla(t)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  addEventListener('blur', () => { $('#foco').hidden = false; });
  addEventListener('focus', () => { $('#foco').hidden = true; });
  $('#foco').onclick = () => { $('#foco').hidden = true; window.mesa.focarMesa(); };
  document.addEventListener('click', () => {
    const a = document.activeElement;
    if (a && a.tagName === 'BUTTON' && !a.closest('dialog')) a.blur();
  });
  document.addEventListener('pointerup', () => {
    const a = document.activeElement;
    if (a && a.type === 'range') setTimeout(() => a.blur(), 50);
  });
}

function tratarTecla(t) {
  if (document.querySelector('dialog[open]')) return false;
  if (!motor) return false;
  const k = t.key;
  if (k === 'Enter' || (prefs.passador && k === 'PageDown')) { if (!t.repeat) go(); return true; }
  if (k === 'Backspace' || (prefs.passador && k === 'PageUp')) { if (!t.repeat) desfazer(); return true; }
  if (k === 'ArrowDown') { escolher(motor.proxima + 1); return true; }
  if (k === 'ArrowUp') { escolher(motor.proxima - 1); return true; }
  if (k === 'Escape') { silenciar(); return true; }
  if (k === 'b' || k === 'B') { if (!t.repeat) motor.alternarBlackout(); return true; }
  if (k === 'F1') { $('#dlgAjuda').showModal(); return true; }
  if (k === ' ' || k === 'Tab') return true;
  return false;
}

function go() {
  const agora = performance.now();
  if (agora - ultimoGo < prefs.intervalo * 1000) {
    sacudir();
    log('ENTER repetido ignorado (apertado rápido demais)');
    return;
  }
  if (motor.proxima >= roteiro.deixas.length) { log('Não há mais deixas'); sacudir(); return; }
  ultimoGo = agora;
  if (!inicioPeca) inicioPeca = Date.now();
  escolhida = null;
  motor.ir();
  const c = $('#proxima');
  c.classList.remove('disparou');
  void c.offsetWidth;
  c.classList.add('disparou');
  salvarSessao();
}

function desfazer() {
  if (!motor.desfazer()) { log('Nada para desfazer'); return; }
  escolhida = null;
  ultimoGo = -1e9;
  salvarSessao();
}

function escolher(i) {
  motor.selecionar(i);
  escolhida = motor.proxima;
  salvarSessao();
}

function silenciar() {
  const agora = performance.now();
  if (agora - ultimoEsc < 1500) motor.silenciar(0.05);
  else motor.silenciar(2);
  ultimoEsc = agora;
}

function sacudir() {
  const c = $('#proxima');
  c.classList.remove('ignorado');
  void c.offsetWidth;
  c.classList.add('ignorado');
}

function salvarSessao() {
  window.mesa.salvarSessao({ ...motor.sessao(), inicioPeca, total: roteiro.deixas.length });
}

function oferecerContinuar(s) {
  if (!s || !s.proxima || s.proxima >= roteiro.deixas.length || s.total !== roteiro.deixas.length) return;
  if (Date.now() - (s.quando || 0) > 12 * 3600 * 1000) return;
  const d = roteiro.deixas[s.proxima];
  aviso(`Da última vez a peça parou antes da deixa ${d.n} (${d.nome} – ${d.cena}).`, 'alerta', 0, [
    [`Continuar da deixa ${d.n}`, () => { motor.comecarDe(s.proxima); inicioPeca = s.inicioPeca || null; salvarSessao(); }],
    ['Começar do início', () => { motor.comecarDe(0, 0.5); inicioPeca = null; salvarSessao(); }]
  ]);
}

// ---------- roteiro ----------
function chipsHTML(acoes) {
  return resumo(acoes).map((c) => `<span class="${c.cls}">${c.icone} ${esc(c.texto)}</span>`).join('');
}

function desenharRoteiro() {
  const box = $('#texto');
  const partes = [];
  for (const it of roteiro.itens) {
    if (it.tipo === 'cena') partes.push(`<h2>${esc(it.texto)}</h2>`);
    else if (it.tipo === 'fala') partes.push(`<p class="fala"><b>${esc(it.quem)} –</b> ${esc(it.texto)}</p>`);
    else if (it.tipo === 'rubrica') partes.push(`<p class="rubrica">(${esc(it.texto)})</p>`);
    else if (it.tipo === 'nota') partes.push(`<p class="nota">${esc(it.texto)}</p>`);
    else if (it.tipo === 'deixa') {
      const d = it.deixa;
      partes.push(`<div class="deixa" data-i="${d.i}"><div class="n">${d.n}</div><div class="corpo">
        <div class="dn">${esc(d.nome)}</div>${d.quando ? `<div class="dq">⏵ ${esc(d.quando)}</div>` : ''}
        <div class="chips">${chipsHTML(d.acoes)}</div>
        <button class="comecar" tabindex="-1">▶ Preparar o palco para começar aqui</button></div></div>`);
    }
  }
  box.innerHTML = partes.join('');
  box.querySelectorAll('.deixa').forEach((el) => {
    const i = Number(el.dataset.i);
    elDeixa[i] = el;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.comecar')) { motor.comecarDe(i); escolhida = null; salvarSessao(); return; }
      escolher(i);
    });
  });
}

function atualizar() {
  if (!motor) return;
  const ds = roteiro.deixas;
  const d = ds[motor.proxima];
  if (d) {
    $('#pxNum').textContent = d.n;
    $('#pxNome').textContent = d.nome;
    $('#pxCena').textContent = d.cena;
    $('#pxQuando').textContent = d.quando ? `⏵ ${d.quando}` : '';
    $('#pxAcoes').innerHTML = chipsHTML(d.acoes);
    $('#btGo').disabled = false;
  } else {
    $('#pxNum').textContent = '✓';
    $('#pxNome').textContent = 'Fim das deixas';
    $('#pxCena').textContent = '';
    $('#pxQuando').textContent = '';
    $('#pxAcoes').innerHTML = '';
    $('#btGo').disabled = true;
  }
  const u = motor.ultima != null ? ds[motor.ultima] : null;
  $('#ulTexto').textContent = u ? `${u.n} · ${u.nome}` : 'Nada ainda.';
  $('#cenaAtual').textContent = (u || d || {}).cena || '';
  const feitas = new Set(motor.historico.map((r) => r.i));
  elDeixa.forEach((el, i) => {
    el.classList.toggle('feita', feitas.has(i));
    el.classList.toggle('noar', i === motor.ultima);
    el.classList.toggle('proxima', i === motor.proxima);
    el.classList.toggle('escolhida', i === escolhida);
  });
  $('#pvPreto').hidden = !motor.modelo.visual.blackout;
  $('#btBlackout').innerHTML = motor.modelo.visual.blackout ? '□ Voltar a imagem <small>(B)</small>' : '■ Tela preta <small>(B)</small>';
  const alvo = elDeixa[motor.proxima];
  if (alvo && ultimaRolada !== motor.proxima) {
    ultimaRolada = motor.proxima;
    const r = $('#roteiro');
    r.scrollTo({ top: alvo.offsetTop - r.clientHeight * 0.55, behavior: 'smooth' });
  }
}

// ---------- som ----------
function aplicarVolumes() {
  const mapa = { mestre: '#vMestre', musica: '#vMusica', ambiente: '#vAmbiente', efeitos: '#vEfeitos' };
  for (const [nome, sel] of Object.entries(mapa)) {
    const inp = $(sel);
    inp.value = prefs.volumes[nome];
    inp.nextElementSibling.textContent = inp.value;
    audio.volumeBus(nome, Number(inp.value));
    inp.oninput = () => {
      prefs.volumes[nome] = Number(inp.value);
      inp.nextElementSibling.textContent = inp.value;
      audio.volumeBus(nome, Number(inp.value));
      salvarPrefs();
    };
  }
}

let tSalvar = 0;
function salvarPrefs() { clearTimeout(tSalvar); tSalvar = setTimeout(() => window.mesa.salvarPreferencias(prefs), 400); }

async function precarregarSons() {
  const lista = [];
  for (const d of roteiro.deixas) for (const a of d.acoes) {
    if (a.som) lista.push(a.som);
    if (a.ambiente) lista.push(a.ambiente);
    if (a.trovoes) lista.push(...a.trovoes);
  }
  const unicos = [...new Set(lista)];
  let n = 0;
  for (const arq of unicos) {
    await audio.buffer(arq);
    n++;
    if (n % 3 === 0 || n === unicos.length) estadoSom(`carregando ${n}/${unicos.length}`);
    await new Promise((r) => setTimeout(r, 15));
  }
  estadoSom();
}

function estadoSom(extra) {
  const el = $('#stSom');
  const ok = audio.ctx.state === 'running';
  el.className = 'chip ' + (ok ? 'ok' : 'alerta');
  el.textContent = ok ? `Som: ${extra || 'pronto'}` : 'Som: clique na mesa para ativar';
}

function painelSom() {
  const p = audio.painel();
  const linhas = [];
  for (const m of p.musicas) {
    const fim = m.fim || m.dur;
    const pct = fim ? Math.min(100, (m.pos / fim) * 100) : 0;
    linhas.push(`<div class="faixa ${m.saindo ? 'saindo' : ''}"><div class="linha1"><span>♪ ${esc(m.nome)}</span><span>${tempo(m.pos)} / ${tempo(fim)} · ${m.volume}%</span></div><div class="barra"><i style="width:${pct}%"></i></div></div>`);
  }
  for (const a of p.ambientes) linhas.push(`<div class="faixa amb"><div class="linha1"><span>≈ ${esc(a.nome)} (loop)</span><span>${a.volume}%</span></div></div>`);
  const sons = p.sons.slice(-4);
  for (const s of sons) linhas.push(`<div class="faixa efe"><div class="linha1"><span>🔊 ${esc(s.nome)}</span><span>${s.resta.toFixed(1)} s</span></div></div>`);
  $('#tocando').innerHTML = linhas.join('') || '<div class="vazio">Silêncio</div>';
  if (!$('#stSom').textContent.includes('carregando')) estadoSom();
}

let pico = 0;
function medidor() {
  const c = $('#medidor');
  const g = c.getContext('2d');
  const v = audio ? audio.nivel() : 0;
  pico = Math.max(v, pico * 0.92);
  g.clearRect(0, 0, c.width, c.height);
  const w = Math.min(1, pico) * c.width;
  const gr = g.createLinearGradient(0, 0, c.width, 0);
  gr.addColorStop(0, '#3ddc84'); gr.addColorStop(0.7, '#ffd23f'); gr.addColorStop(1, '#ff5a5f');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, c.height);
  requestAnimationFrame(medidor);
}

function testarSom() {
  audio.retomar();
  const c = audio.ctx, t = c.currentTime + 0.03;
  [[880, 0], [1318.5, 0.2], [1760, 0.4]].forEach(([f, d]) => {
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t + d);
    g.gain.linearRampToValueAtTime(0.3, t + d + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.4);
    o.connect(g).connect(audio.bus.efeitos);
    o.start(t + d); o.stop(t + d + 1.5);
  });
  log('Teste de som');
}

// ---------- projeção ----------
let capturando = false;
async function previa() {
  if (!prefs.previa || capturando || document.hidden) return;
  capturando = true;
  try {
    const b64 = await window.mesa.capturarPalco(400);
    if (b64) $('#pvImg').src = 'data:image/jpeg;base64,' + b64;
  } finally { capturando = false; }
}

function atualizarPalcoEstado(p) {
  palcoInfo = p;
  const el = $('#stProjecao');
  if (!p) { el.className = 'chip erro'; el.textContent = 'Projeção: fechada'; return; }
  const n = p.telas ? p.telas.length : 1;
  if (!p.primaria && p.telaCheia) {
    el.className = 'chip ok';
    el.textContent = `Projeção: tela ${p.telaN} · ${p.largura}×${p.altura}`;
  } else if (n < 2) {
    el.className = 'chip alerta';
    el.textContent = 'Só 1 tela: projeção numa janela';
  } else {
    el.className = 'chip alerta';
    el.textContent = p.telaCheia ? 'Projeção cobrindo a tela do notebook' : 'Projeção numa janela';
  }
  $('#pvInfo').textContent = p.telaCheia ? `tela ${p.telaN} · ${p.largura}×${p.altura}` : 'janela';
}

// ---------- ajustes ----------
async function abrirAjustes() {
  const { telas, palco } = await window.mesa.telas();
  const box = $('#cfgTelas');
  box.innerHTML = telas.map((t) => `<label class="tela-op"><input type="radio" name="tela" value="${t.id}" ${palco && palco.telaId === t.id ? 'checked' : ''}>
    Tela ${t.n}${t.primaria ? ' (notebook / principal)' : ''} – ${t.largura}×${t.altura}</label>`).join('');
  box.querySelectorAll('input').forEach((inp) => {
    inp.onchange = async () => {
      const id = Number(inp.value);
      const t = telas.find((x) => x.id === id);
      const r = await window.mesa.configurarPalco({ telaId: id, telaCheia: !t.primaria });
      $('#cfgCheia').checked = r ? r.telaCheia : false;
    };
  });
  $('#cfgCheia').checked = !!(palco && palco.telaCheia);
  $('#cfgCheia').onchange = () => window.mesa.configurarPalco({ telaCheia: $('#cfgCheia').checked });
  document.querySelectorAll('input[name=ajuste]').forEach((r) => {
    r.checked = r.value === prefs.ajuste;
    r.onchange = () => { prefs.ajuste = r.value; paraPalco({ cmd: 'ajuste', modo: r.value }); salvarPrefs(); };
  });
  $('#cfgPrevia').checked = prefs.previa;
  $('#cfgPrevia').onchange = () => { prefs.previa = $('#cfgPrevia').checked; salvarPrefs(); if (!prefs.previa) $('#pvImg').removeAttribute('src'); };
  $('#cfgIntervalo').value = String(prefs.intervalo);
  $('#cfgIntervalo').onchange = () => { prefs.intervalo = Number($('#cfgIntervalo').value); salvarPrefs(); };
  $('#cfgPassador').checked = prefs.passador;
  $('#cfgPassador').onchange = () => { prefs.passador = $('#cfgPassador').checked; salvarPrefs(); };
  const sel = $('#cfgSaida');
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default');
    sel.innerHTML = '<option value="">Padrão do Windows</option>' + devs.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Saída ' + (i + 1))}</option>`).join('');
  } catch {}
  sel.value = prefs.saida || '';
  sel.onchange = async () => { prefs.saida = sel.value; await audio.saida(sel.value); salvarPrefs(); };
  $('#cfgPasta').textContent = info.pasta || '(não encontrada)';
  $('#cfgFaltando').innerHTML = info.faltando.length
    ? `<div class="falta">Faltando: ${info.faltando.map(esc).join(' · ')}</div>`
    : '<div class="ok">Todos os arquivos usados nas deixas foram encontrados.</div>';
  $('#dlgConfig').showModal();
}

function ligarBotoes() {
  $('#btGo').onclick = go;
  $('#btDesfazer').onclick = desfazer;
  $('#btSilencio').onclick = () => motor.silenciar(2);
  $('#btTesteSom').onclick = testarSom;
  $('#btBlackout').onclick = () => motor.alternarBlackout();
  let teste = false;
  $('#btTeste').onclick = () => { teste = !teste; paraPalco({ cmd: 'teste', mostrar: teste }); $('#btTeste').textContent = teste ? 'Tirar tela de teste' : 'Tela de teste'; };
  $('#btConfig').onclick = abrirAjustes;
  $('#stProjecao').onclick = abrirAjustes;
  $('#btAjuda').onclick = () => $('#dlgAjuda').showModal();
  $('#cfgEscolher').onclick = () => window.mesa.escolherPasta();
  $('#cfgRecarregar').onclick = () => window.mesa.recarregarPalco();
}

function andamento() {
  const el = $('#andamento');
  const r = motor && motor.historico[motor.historico.length - 1];
  const passou = r ? (Date.now() - r.quando) / 1000 : 0;
  if (!r || r.duracao < 2 || passou >= r.duracao) { el.hidden = true; return; }
  el.hidden = false;
  el.querySelector('i').style.width = `${(passou / r.duracao) * 100}%`;
  el.querySelector('span').textContent = `em andamento: faltam ${Math.ceil(r.duracao - passou)} s`;
}

function relogio() {
  $('#relogio').textContent = '⏱ ' + (inicioPeca ? tempo((Date.now() - inicioPeca) / 1000) : '00:00');
}

iniciar().catch((e) => { console.error(e); aviso('Erro ao iniciar a mesa: ' + e.message, 'erro'); });
