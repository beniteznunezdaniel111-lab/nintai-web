// Orquesta la página: vuelo ligado al scroll, capas del hero, horario en vivo y revelados.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const lim = (v, a = 0, b = 1) => Math.min(Math.max(v, a), b);
const tramo = (v, a, b) => lim((v - a) / (b - a));
const suave = (t) => t * t * (3 - 2 * t);

// ---------- Horario (hora de Madrid) ----------
// minutos desde medianoche; 1 = lunes … 7 = domingo
const TRAMOS = { laborable: [[480, 780], [960, 1200]], finde: [[510, 780], [990, 1200]] };
const tramosDe = (dia) => (dia >= 6 ? TRAMOS.finde : TRAMOS.laborable);
const hora = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

function ahoraEnRonda() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(new Date());
  const v = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  const dia = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(v.weekday) + 1;
  return { dia, min: Number(v.hour) * 60 + Number(v.minute) };
}

function pintarHorario() {
  const { dia, min } = ahoraEnRonda();
  const hoy = tramosDe(dia);
  const abierto = hoy.find(([a, b]) => min >= a && min < b);
  let mas;
  if (abierto) mas = `cierra a las ${hora(abierto[1])}`;
  else {
    const luego = hoy.find(([a]) => min < a);
    mas = luego ? `abrimos a las ${hora(luego[0])}` : `mañana a las ${hora(tramosDe((dia % 7) + 1)[0][0])}`;
  }
  const estado = $('[data-estado]');
  estado.classList.toggle('abierto', Boolean(abierto));
  $('[data-estado-texto]').innerHTML = `${abierto ? 'Abierto' : 'Cerrado'}<span class="estado__mas"> · ${mas}</span>`;
  $('[data-hoy]').textContent = `Hoy ${hoy.map(([a, b]) => `${hora(a)}–${hora(b)}`).join(' y ')}`;
  const h = Math.floor(min / 60);
  $('[data-saludo]').textContent = h >= 6 && h < 14 ? 'Buenos días,' : h >= 14 && h < 21 ? 'Buenas tardes,' : 'Buenas noches,';
  $$('[data-horario] tr').forEach((tr) => {
    const [a, b] = tr.dataset.dias.split('-').map(Number);
    tr.classList.toggle('hoy', dia >= a && dia <= b);
  });
}
pintarHorario();
setInterval(pintarHorario, 60_000);
$('[data-anio]').textContent = new Date().getFullYear();

// ---------- Revelado al entrar en pantalla ----------
const revelar = new IntersectionObserver((entradas) => {
  for (const e of entradas) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('visible');
    revelar.unobserve(e.target);
  }
}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
$$('[data-revelar]').forEach((el) => {
  const hermanos = [...el.parentElement.children].filter((n) => n.hasAttribute('data-revelar'));
  el.style.transitionDelay = `${(hermanos.indexOf(el) % 4) * 90}ms`;
  revelar.observe(el);
});

// ---------- Cabecera sólida fuera del hero ----------
const cabecera = $('[data-cabecera]');
const seccion = $('[data-vuelo]');
function cabeceraSegunScroll() {
  cabecera.classList.toggle('solida', seccion.getBoundingClientRect().bottom <= 70);
}
addEventListener('scroll', cabeceraSegunScroll, { passive: true });
cabeceraSegunScroll();

// ---------- Hero: vuelo + capas ----------
const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
const capas = {
  portada: $('[data-capa="portada"]'),
  tajo: $('[data-capa="tajo"]'),
  si: $('[data-capa="si"]'),
  pin: $('[data-pin]'),
  hud: $('[data-hud]'),
  saltar: $('.vuelo__saltar'),
  credito: $('.vuelo__credito'),
  entrar: $('[data-plano="entrar"]'),
  cafe: $('[data-plano="cafe"]'),
  cruzan: $('[data-plano="cruzan"]'),
};
const hud = { coord: $('[data-hud-coord]'), alt: $('[data-hud-alt]'), dist: $('[data-hud-dist]') };

// Vídeos de los planos de suelo que avanzan con el scroll:
// <video data-scrub data-desde="0.70" data-hasta="0.80" muted playsinline preload="auto" src="…">
const videos = $$('video[data-scrub]').map((v) => ({ v, desde: Number(v.dataset.desde), hasta: Number(v.dataset.hasta) }));
function moverVideos(P) {
  for (const { v, desde, hasta } of videos) {
    if (!v.duration || v.seeking) continue;
    const t = tramo(P, desde, hasta) * (v.duration - 0.05);
    if (Math.abs(v.currentTime - t) > 1 / 30) v.currentTime = t;
  }
}

// «Ronda no te pregunta cómo estás.» palabra a palabra
const palabras = [];
capas.tajo.innerHTML = capas.tajo.textContent.trim().split(/\s+/)
  .map((p) => `<span class="palabra">${p}</span>`).join(' ');
palabras.push(...$$('.palabra', capas.tajo));

// Puerta de Almu's en metros locales (nodo de OpenStreetMap del local)
const PUERTA = [3.4, -4.0];
const FIN_VUELO = 0.7; // parte del recorrido del hero dedicada al vuelo
const R = 6378137, LAT0 = 36.7434611, LON0 = -5.1648079;
const K = Math.cos(LAT0 * Math.PI / 180);
const Y0 = R * Math.log(Math.tan(Math.PI / 4 + LAT0 * Math.PI / 360));
const num = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num4 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

function latLon(x, y) {
  const lon = LON0 + (x / K / R) * 180 / Math.PI;
  const lat = (2 * Math.atan(Math.exp((Y0 + y / K) / R)) - Math.PI / 2) * 180 / Math.PI;
  return [lat, lon];
}

function estilo(el, opacidad, transform = '') {
  el.style.opacity = opacidad.toFixed(3);
  el.style.transform = transform;
  el.style.visibility = opacidad < 0.002 ? 'hidden' : 'visible';
}

let vuelo = null;
let objetivo = 0;
let visual = 0;

function aplicar(P) {
  // Portada
  const salida = suave(tramo(P, 0.025, 0.085));
  estilo(capas.portada, 1 - salida, `translateY(${-50 * salida}px)`);

  // Frase del Tajo, palabra a palabra
  const nP = palabras.length;
  palabras.forEach((pal, i) => pal.style.setProperty('--op', suave(tramo(P, 0.165 + i * 0.013, 0.19 + i * 0.013)).toFixed(3)));
  estilo(capas.tajo, (P > 0.15 ? 1 : 0) * (1 - suave(tramo(P, 0.36, 0.4))), `translateY(${-40 * tramo(P, 0.36, 0.4)}px)`);

  // «Nosotros sí.» y el pin sobre la puerta
  const si = suave(tramo(P, 0.55, 0.59)) * (1 - suave(tramo(P, 0.695, 0.725)));
  estilo(capas.si, si, `translateY(${(1 - suave(tramo(P, 0.55, 0.59))) * 40}px)`);
  capas.pin.dataset.o = (suave(tramo(P, 0.5, 0.54)) * (1 - suave(tramo(P, 0.69, 0.71)))).toFixed(3);

  // Telemetría, enlace para saltar y crédito del IGN (solo mientras se ve el vuelo)
  const hudO = tramo(P, 0.06, 0.1) * (1 - tramo(P, 0.66, 0.7));
  estilo(capas.hud, hudO);
  estilo(capas.saltar, hudO);
  estilo(capas.credito, 1 - tramo(P, FIN_VUELO, FIN_VUELO + 0.03));
  cabecera.classList.toggle('sobre-claro', P > 0.915);

  // Suelo: dentro del local
  const entra = tramo(P, FIN_VUELO, 0.745);
  estilo(capas.entrar, suave(entra), `scale(${1.14 - 0.14 * suave(tramo(P, FIN_VUELO, 0.8))})`);
  for (const [el, a, b] of [[capas.cafe, 0.8, 0.845], [capas.cruzan, 0.9, 0.945]]) {
    const t = suave(tramo(P, a, b));
    el.style.opacity = t > 0 ? '1' : '0';
    el.style.visibility = t > 0 ? 'visible' : 'hidden';
    el.style.clipPath = `inset(${((1 - t) * 100).toFixed(2)}% 0 0 0)`;
  }
  if (videos.length) moverVideos(P);

  if (vuelo) {
    // con el local ya en pantalla no hace falta seguir pintando el vuelo
    if (P < FIN_VUELO + 0.06) vuelo.iniciar(); else vuelo.parar();
    const d = vuelo.fijar(lim(P / FIN_VUELO));
    const [lat, lon] = latLon(d.cam[0], d.cam[1]);
    hud.coord.textContent = `${num4.format(lat)}° N · ${num4.format(-lon)}° O`;
    hud.alt.textContent = `Altitud ${num.format(d.altitud)} m`;
    hud.dist.textContent = d.distancia >= 1000
      ? `A ${num1.format(d.distancia / 1000)} km de Almu's`
      : `A ${num.format(d.distancia)} m de Almu's`;
  }
}

function colocarPin() {
  const o = Number(capas.pin.dataset.o || 0);
  const p = o > 0 && vuelo ? vuelo.proyectar(PUERTA[0], PUERTA[1]) : null;
  if (!p) { capas.pin.style.opacity = '0'; return; }
  capas.pin.style.opacity = o.toFixed(3);
  capas.pin.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
}

function leerScroll() {
  const r = seccion.getBoundingClientRect();
  objetivo = lim(-r.top / Math.max(r.height - innerHeight, 1));
}

let ultimo = performance.now();
let activo = true;
let corriendo = false;
function arrancar() {
  if (corriendo) return;
  corriendo = true;
  ultimo = performance.now();
  requestAnimationFrame(cuadro);
}
function cuadro(t) {
  if (!activo) { corriendo = false; vuelo?.parar(); return; }
  const dt = Math.min(Math.max(t - ultimo, 0) / 1000, 0.1);
  ultimo = t;
  leerScroll();
  // saltos grandes (anclas) sin animar todo el vuelo de golpe
  if (Math.abs(objetivo - visual) > 0.3) visual = objetivo;
  else visual += (objetivo - visual) * (1 - Math.exp(-dt * 6.5));
  if (Math.abs(objetivo - visual) < 0.00002) visual = objetivo;
  aplicar(visual);
  requestAnimationFrame(cuadro);
}

async function iniciarVuelo() {
  const lienzo = $('[data-lienzo]');
  let gl2 = false;
  try { gl2 = Boolean(document.createElement('canvas').getContext('webgl2')); } catch { gl2 = false; }
  // ?sin-vuelo muestra la versión estática (la misma que ve quien pide menos movimiento)
  if (reducido || !gl2 || new URLSearchParams(location.search).has('sin-vuelo')) {
    seccion.classList.add('estatico');
    return;
  }

  // el hero sólo trabaja mientras se ve
  new IntersectionObserver(([e]) => {
    activo = e.isIntersecting;
    if (activo) arrancar();
  }).observe(seccion);

  const { crearVuelo } = await import('./vuelo.js');
  const memoria = navigator.deviceMemory || 8;
  const movil = Math.min(screen.width, screen.height) < 700;
  try {
    vuelo = await crearVuelo(lienzo, { calidad: memoria <= 4 || movil ? 'baja' : 'alta', alDibujar: colocarPin });
  } catch (e) {
    console.warn('El vuelo no está disponible en este navegador:', e);
    seccion.classList.add('estatico');
    return;
  }
  vuelo.iniciar();
  requestAnimationFrame(() => seccion.classList.add('listo'));
  window.__vuelo = vuelo;
}

aplicar(0);
iniciarVuelo();
