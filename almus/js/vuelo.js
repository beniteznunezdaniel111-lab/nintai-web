// Hero «desde el cielo»: relieve MDT y ortofotos PNOA del IGN (CC BY 4.0) en WebGL2.
// Coordenadas locales en metros: x = este, y = norte, z = altitud sobre el mar.
// El origen es la puerta de Almu's (C. Sevilla 5). Ver tools/geo_comun.py.

const GEO = new URL('../assets/geo/', import.meta.url).href;
const COTA_LOCAL = 723; // suelo frente a Almu's (MDT05)

// ---------- Ruta de la cámara ----------
// p: avance del vuelo (0–1). foco: punto al que mira (m). alt: altura de la cámara
// sobre el foco (m). rumbo: hacia dónde mira, en grados desde el norte.
// incl: 0 = cenital (mirando abajo), 90 = horizonte. fov: vertical, en grados.
export const RUTA = [
  { p: 0.00, x: -250, y: -260, alt: 2000, rumbo: 82, incl: 77, fov: 40 },
  { p: 0.14, x: -250, y: -280, alt: 1300, rumbo: 80, incl: 74, fov: 40 },
  { p: 0.28, x: -220, y: -310, alt: 750, rumbo: 74, incl: 64, fov: 41 },
  { p: 0.42, x: -110, y: -315, alt: 480, rumbo: 100, incl: 56, fov: 42 },
  { p: 0.56, x: -50, y: -220, alt: 420, rumbo: 150, incl: 40, fov: 42 },
  { p: 0.70, x: -5, y: -50, alt: 330, rumbo: 200, incl: 16, fov: 42 },
  { p: 0.85, x: 4, y: 4, alt: 170, rumbo: 224, incl: 0, fov: 42 },
  { p: 1.00, x: 6, y: 5, alt: 75, rumbo: 229, incl: 0, fov: 44 },
];

// ---------- Matemáticas mínimas (matrices en orden de columnas, como WebGL) ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norma = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function perspectiva(fovy, asp, n, f) {
  const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
  return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]);
}
function rotacionVista(dir, up) {
  const f = norma(dir), s = norma(cruz(f, up)), u = cruz(s, f);
  return new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, 0, 0, 0, 1]);
}
function mult(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function invertir(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  return new Float32Array([
    (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det,
    (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det,
    (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det,
    (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det,
    (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ]);
}

// Interpolación cúbica monótona (Fritsch–Carlson): sin rebotes que metan la cámara en el suelo
function curva(ps, vs) {
  const n = ps.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((vs[i + 1] - vs[i]) / (ps[i + 1] - ps[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (p) => {
    if (p <= ps[0]) return vs[0];
    if (p >= ps[n - 1]) return vs[n - 1];
    let i = 0;
    while (p > ps[i + 1]) i++;
    const h = ps[i + 1] - ps[i], t = (p - ps[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * vs[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * vs[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

function prepararRuta(ruta) {
  const ps = ruta.map((k) => k.p);
  const c = {
    x: curva(ps, ruta.map((k) => k.x)),
    y: curva(ps, ruta.map((k) => k.y)),
    alt: curva(ps, ruta.map((k) => Math.log(k.alt))),
    rumbo: curva(ps, ruta.map((k) => k.rumbo)),
    incl: curva(ps, ruta.map((k) => k.incl)),
    fov: curva(ps, ruta.map((k) => k.fov)),
  };
  return (p) => ({ x: c.x(p), y: c.y(p), alt: Math.exp(c.alt(p)), rumbo: c.rumbo(p), incl: c.incl(p), fov: c.fov(p) });
}

// ---------- Shaders ----------
const COMUN = `
uniform vec2 uRes;
uniform float uTiempo;
const vec3 SOL = normalize(vec3(-0.35, -0.55, 0.76));
vec3 cielo(vec3 d) {
  float h = clamp(d.z, -0.2, 1.0);
  vec3 horizonte = vec3(0.80, 0.85, 0.89);
  vec3 cenit = vec3(0.30, 0.50, 0.77);
  vec3 c = mix(horizonte, cenit, pow(smoothstep(0.0, 1.0, h), 0.42));
  float s = max(dot(d, SOL), 0.0);
  c += vec3(1.0, 0.86, 0.66) * (pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.06);
  return c;
}
vec3 acabado(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.14);                           // algo más de color
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.3);          // un punto de contraste
  c *= vec3(1.04, 1.0, 0.95);                          // luz cálida de mañana
  vec2 q = gl_FragCoord.xy / uRes - 0.5;
  q.x *= uRes.x / uRes.y;
  c *= mix(0.72, 1.0, smoothstep(1.15, 0.28, length(q))); // viñeta
  float g = fract(sin(dot(gl_FragCoord.xy + fract(uTiempo) * 97.0, vec2(12.9898, 78.233))) * 43758.5453);
  return c + (g - 0.5) * (2.2 / 255.0);                // grano fino, evita bandas
}`;

const VS_TERRENO = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uProjVista;
uniform vec3 uCam;
out vec3 vPos;
void main() {
  vPos = aPos;
  gl_Position = uProjVista * vec4(aPos - uCam, 1.0);
}`;

function fsTerreno(niveles) {
  let muestras = '';
  for (let i = niveles - 1; i >= 0; i--) {
    muestras += `
  if (resto > 0.003 && uN[${i}].w > 0.5) {
    float k = 1.0 / (2.0 * uN[${i}].z);
    vec2 q = (vPos.xy - uN[${i}].xy) * k;
    vec2 uv = vec2(q.x + 0.5, 0.5 - q.y);
    vec2 e = min(uv, 1.0 - uv);
    float w = smoothstep(0.0, 0.035, min(e.x, e.y));
    if (w > 0.0) {
      col += resto * w * textureGrad(uT${i}, uv, gx * k, gy * k).rgb;
      resto *= 1.0 - w;
    }
  }`;
  }
  const samplers = Array.from({ length: niveles }, (_, i) => `uniform sampler2D uT${i};`).join('\n');
  return `#version 300 es
precision highp float;
in vec3 vPos;
uniform vec3 uCam;
uniform vec4 uN[${niveles}];
uniform float uDensidad;
${samplers}
${COMUN}
out vec4 oColor;
void main() {
  vec2 dx = dFdx(vPos.xy), dy = dFdy(vPos.xy);
  vec2 gx = vec2(dx.x, -dx.y), gy = vec2(dy.x, -dy.y);
  vec3 col = vec3(0.0);
  float resto = 1.0;
  ${muestras}
  vec3 d = vPos - uCam;
  float L = length(d);
  vec3 dir = d / L;
  vec3 calima = cielo(vec3(dir.xy, max(dir.z, 0.0)));
  col += resto * calima;
  // calima: densidad exponencial con la altura, integrada a lo largo del rayo
  const float H = 1500.0;
  float d0 = exp(-vPos.z / H), d1 = exp(-uCam.z / H);
  float dz = uCam.z - vPos.z;
  float media = abs(dz) > 1.0 ? (d0 - d1) * H / dz : d0;
  float niebla = 1.0 - exp(-uDensidad * L * media);
  // el borde del terreno se funde con el cielo, sin línea de horizonte dura
  float r = max(abs(vPos.x), abs(vPos.y));
  niebla = max(niebla, smoothstep(30000.0, 60000.0, r));
  col = mix(col, calima, niebla);
  oColor = vec4(acabado(col), 1.0);
}`;
}

const VS_CIELO = `#version 300 es
uniform mat4 uInvProjVista;
out vec3 vDir;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0;
  gl_Position = vec4(p, 1.0, 1.0);
  vec4 w = uInvProjVista * vec4(p, 1.0, 1.0);
  vDir = w.xyz / w.w;
}`;
const FS_CIELO = `#version 300 es
precision highp float;
in vec3 vDir;
${COMUN}
out vec4 oColor;
void main() { oColor = vec4(acabado(cielo(normalize(vDir))), 1.0); }`;

function compilar(gl, vs, fs) {
  const prog = gl.createProgram();
  for (const [tipo, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(tipo);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}

// ---------- Relieve ----------
function muestreador(anillo) {
  const { alt, n, mitad } = anillo, paso = (2 * mitad) / (n - 1);
  return (x, y) => {
    const fc = Math.min(Math.max((x + mitad) / paso, 0), n - 1.0001);
    const fr = Math.min(Math.max((mitad - y) / paso, 0), n - 1.0001);
    const c = Math.floor(fc), r = Math.floor(fr), tx = fc - c, ty = fr - r;
    const i = r * n + c;
    return (alt[i] * (1 - tx) + alt[i + 1] * tx) * (1 - ty) + (alt[i + n] * (1 - tx) + alt[i + n + 1] * tx) * ty;
  };
}

function mallaAnillo(anillo, exterior, hueco) {
  const { alt, n, mitad } = anillo, paso = (2 * mitad) / (n - 1);
  const pos = new Float32Array(n * n * 3);
  const fuera = exterior ? muestreador(exterior) : null;
  const BANDA = 6;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = -mitad + c * paso, y = mitad - r * paso;
      let h = alt[r * n + c];
      if (fuera) {
        // cose el borde con el anillo exterior para que no haya grietas
        const k = Math.min(r, c, n - 1 - r, n - 1 - c);
        if (k < BANDA) h += (fuera(x, y) - h) * (1 - k / BANDA);
      }
      const o = (r * n + c) * 3;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = h;
    }
  }
  const idx = [];
  const e = 0.01;
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      if (hueco) {
        const x0 = -mitad + c * paso, x1 = x0 + paso, y1 = mitad - r * paso, y0 = y1 - paso;
        if (x0 >= -hueco - e && x1 <= hueco + e && y0 >= -hueco - e && y1 <= hueco + e) continue;
      }
      const a = r * n + c, b = a + 1, d = a + n, f = d + 1;
      idx.push(a, d, b, b, d, f);
    }
  }
  return { pos, idx: new Uint32Array(idx) };
}

// ---------- Vuelo ----------
export async function crearVuelo(canvas, { calidad = 'alta', alCargar, alDibujar } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('sin-webgl2');

  const [orto, relieve] = await Promise.all([
    fetch(GEO + 'orto.json').then((r) => r.json()),
    fetch(GEO + 'relieve.json').then((r) => r.json()),
  ]);
  const niveles = orto.niveles;
  const N = niveles.length;

  // Relieve: anillos de fino (0) a grueso (3)
  const anillos = await Promise.all(relieve.anillos.map(async (a) => {
    const buf = await fetch(GEO + a.archivo).then((r) => r.arrayBuffer());
    const dm = new Uint16Array(buf);
    const alt = new Float32Array(dm.length);
    for (let i = 0; i < dm.length; i++) alt[i] = dm[i] / 10;
    return { alt, n: a.n, mitad: a.mitad };
  }));
  const altura = anillos.map(muestreador);
  const sueloEn = (x, y) => {
    for (let i = 0; i < anillos.length; i++) {
      const m = anillos[i].mitad;
      if (Math.abs(x) < m && Math.abs(y) < m) return altura[i](x, y);
    }
    return 0;
  };

  const progT = compilar(gl, VS_TERRENO, fsTerreno(N));
  const progC = compilar(gl, VS_CIELO, FS_CIELO);
  const U = (prog, nombre) => gl.getUniformLocation(prog, nombre);
  const uT = {
    projVista: U(progT, 'uProjVista'), cam: U(progT, 'uCam'), n: U(progT, 'uN'), densidad: U(progT, 'uDensidad'),
    res: U(progT, 'uRes'), tiempo: U(progT, 'uTiempo'),
  };
  const uC = { inv: U(progC, 'uInvProjVista'), res: U(progC, 'uRes'), tiempo: U(progC, 'uTiempo') };
  gl.useProgram(progT);
  for (let i = 0; i < N; i++) gl.uniform1i(U(progT, `uT${i}`), i);

  const mallas = anillos.map((a, i) => {
    const m = mallaAnillo(a, anillos[i + 1] || null, i > 0 ? anillos[i - 1].mitad : 0);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, cuenta: m.idx.length };
  });
  const vaoCielo = gl.createVertexArray();

  // Texturas: se cargan de grueso a fino; las que faltan se sustituyen por el nivel anterior
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const maxAniso = aniso ? Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)) : 0;
  const texturas = new Array(N).fill(null);
  const datosN = new Float32Array(N * 4);
  niveles.forEach((nv, i) => { datosN.set([nv.centro[0], nv.centro[1], nv.mitad, 0], i * 4); });
  // En calidad baja, los niveles lejanos (hasta z16) van a la mitad de resolución;
  // los cercanos se mantienen enteros porque la llegada a la puerta los necesita.
  const ligero = (z) => calidad === 'baja' && z <= 16;

  let sucio = true;
  let cargadas = 0;
  const listas = niveles.map(async (nv, i) => {
    const url = GEO + (ligero(nv.z) ? nv.archivo.replace('.webp', '-m.webp') : nv.archivo);
    const blob = await fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.blob(); });
    const bmp = await createImageBitmap(blob);
    // subida espaciada: un nivel por fotograma para no dar tirones al hacer scroll
    // (con tope de tiempo: en pestañas ocultas requestAnimationFrame no llega)
    await new Promise((res) => { requestAnimationFrame(res); setTimeout(res, 60); });
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, bmp);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, maxAniso);
    bmp.close();
    texturas[i] = t;
    datosN[i * 4 + 3] = 1;
    cargadas++;
    sucio = true;
    alCargar?.(cargadas / N, nv.z);
  });
  // Los tres niveles más gruesos bastan para empezar
  await Promise.all(listas.slice(0, 3));

  const camino = prepararRuta(RUTA);
  let estado = null;
  let avance = 0;
  let ultimaPV = null;

  let manual = null; // solo para afinar planos desde la consola

  function camara(p) {
    const k = manual || camino(p);
    const rad = Math.PI / 180;
    // en vertical el campo es muy alto: se baja un poco la mirada para no llenar media pantalla de cielo
    const asp = canvas.width / Math.max(canvas.height, 1);
    const vertical = Math.min(Math.max((1 - asp) / 0.54, 0), 1);
    const incl = k.incl - 14 * vertical * Math.min(Math.max((k.incl - 55) / 20, 0), 1);
    const h = k.rumbo * rad, t = Math.min(incl, 88) * rad;
    const adelante = [Math.sin(h), Math.cos(h), 0];
    const dir = [adelante[0] * Math.sin(t), adelante[1] * Math.sin(t), -Math.cos(t)];
    const foco = [k.x, k.y, COTA_LOCAL];
    const dist = k.alt / Math.cos(t);
    const cam = [foco[0] - dir[0] * dist, foco[1] - dir[1] * dist, foco[2] + k.alt];
    // nunca por debajo del terreno
    const suelo = sueloEn(cam[0], cam[1]);
    cam[2] = Math.max(cam[2], suelo + 25);
    return { cam, dir, up: adelante, fov: fovPantalla(k.fov * rad), suelo, foco, k };
  }

  // La ruta está pensada en 16:9. En pantallas más estrechas (móvil en vertical)
  // se abre el campo vertical para conservar buena parte del horizontal.
  function fovPantalla(fov) {
    const asp = canvas.width / Math.max(canvas.height, 1);
    const ref = 16 / 9;
    if (asp >= ref) return fov;
    const hRef = 2 * Math.atan(Math.tan(fov / 2) * ref);
    const t = Math.min(Math.max((asp - 0.45) / (ref - 0.45), 0), 1);
    const h = hRef * (0.74 + 0.26 * t);
    return Math.min(2 * Math.atan(Math.tan(h / 2) / asp), 1.75);
  }

  function dibujar(tiempo = 0) {
    const ancho = canvas.width, alto = canvas.height;
    gl.viewport(0, 0, ancho, alto);
    const c = estado;
    const sobreSuelo = Math.max(c.cam[2] - Math.max(c.suelo, sueloEn(c.foco[0], c.foco[1])), 5);
    const cerca = Math.min(Math.max(sobreSuelo * 0.25, 1.5), 3000);
    const proj = perspectiva(c.fov, ancho / alto, cerca, 400000);
    const pv = mult(proj, rotacionVista(c.dir, c.up));
    ultimaPV = pv;

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(progC);
    gl.uniformMatrix4fv(uC.inv, false, invertir(pv));
    gl.uniform2f(uC.res, ancho, alto);
    gl.uniform1f(uC.tiempo, tiempo);
    gl.bindVertexArray(vaoCielo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(progT);
    gl.uniformMatrix4fv(uT.projVista, false, pv);
    gl.uniform3f(uT.cam, c.cam[0], c.cam[1], c.cam[2]);
    gl.uniform4fv(uT.n, datosN);
    gl.uniform1f(uT.densidad, 0.00011);
    gl.uniform2f(uT.res, ancho, alto);
    gl.uniform1f(uT.tiempo, tiempo);
    for (let i = 0; i < N; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, texturas[i]);
    }
    for (const m of mallas) {
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.cuenta, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
  }

  function redimensionar() {
    const dpr = Math.min(window.devicePixelRatio || 1, calidad === 'baja' ? 1.5 : 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; sucio = true; }
  }

  let animando = false;
  function bucle(t) {
    if (!animando) return;
    redimensionar();
    if (sucio) {
      estado = camara(avance);
      dibujar(t / 1000);
      sucio = false;
      alDibujar?.(estado);
    }
    requestAnimationFrame(bucle);
  }

  return {
    listas: Promise.all(listas),
    // Avance del vuelo (0–1); devuelve datos para el HUD
    fijar(p) {
      if (p !== avance || !estado) { avance = p; sucio = true; }
      const c = camara(p);
      return { cam: c.cam, altitud: c.cam[2], foco: c.foco, distancia: Math.hypot(c.cam[0], c.cam[1], c.cam[2] - COTA_LOCAL) };
    },
    // Punto del mundo (m locales; z por defecto, el suelo) -> píxeles CSS del lienzo
    proyectar(x, y, z = COTA_LOCAL) {
      if (!ultimaPV || !estado) return null;
      const c = estado.cam, m = ultimaPV;
      const px = x - c[0], py = y - c[1], pz = z - c[2];
      const cx = m[0] * px + m[4] * py + m[8] * pz + m[12];
      const cy = m[1] * px + m[5] * py + m[9] * pz + m[13];
      const cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
      if (cw <= 0) return null;
      return { x: (cx / cw * 0.5 + 0.5) * canvas.clientWidth, y: (0.5 - cy / cw * 0.5) * canvas.clientHeight };
    },
    probar(k) { manual = k; sucio = true; },
    iniciar() { if (!animando) { animando = true; requestAnimationFrame(bucle); } },
    parar() { animando = false; },
    marcar() { sucio = true; },
    gl,
  };
}
