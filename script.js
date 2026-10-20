import { CONTROLS } from "./controls.js?v=20261020d";

/* ================= 1. 톤암 / LP / 음악 ================= */
const deck = document.getElementById("deck");
const lp = document.getElementById("lp");
const arm = document.getElementById("arm");
const DW = 734, DH = 412;                 // 덱 원본 좌표계
const PIVOT = { x: 400, y: 80 };           // 톤암 회전축(힌지)
const REST = -20, PLAY_START = -9, PLAY_END = 2; // 각도(도). 음수 = 반시계 = LP 바깥(오른쪽)
const LP_C = { x: 212, y: 203 };

// lp 요소를 정사각형으로 맞춤 (aspect 보정)
lp.style.height = "auto"; lp.style.aspectRatio = "1/1";
lp.style.top = `calc(${(LP_C.y / DH) * 100}% - ${(171 / DW) * 100 / 2 * 0}px)`;
function layoutLP() {
  const w = deck.clientWidth, s = w / DW;
  lp.style.width = 342 * s + "px"; lp.style.height = 342 * s + "px";
  lp.style.left = (LP_C.x - 171) * s + "px"; lp.style.top = (LP_C.y - 171) * s + "px";
}
layoutLP(); addEventListener("resize", layoutLP);

const TRACK = window.DJ_TRACK || { index: 2, mp3: "assets/song1.mp3", lp: "assets/lp/03.png" };
lp.src = TRACK.lp + "?v=20261020d";
const audio = new Audio(TRACK.mp3 + "?v=20261020d");
audio.preload = "auto";
let angle = REST, targetAngle = REST, animating = false;
let playing = false, dragging = false, spin = 0, spinSpeed = 0, scratching = false, pitchRate = 1;

function setArm(a) { angle = a; arm.style.transform = `rotate(${a}deg)`; }
setArm(REST);

function glideTo(a, ms = 700) {
  const from = angle, t0 = performance.now(); targetAngle = a; animating = true;
  const id = glideTo.id = (glideTo.id || 0) + 1;
  (function step(t) {
    if (id !== glideTo.id) return;
    const k = Math.min(1, (t - t0) / ms), e = k < .5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2) / 2;
    setArm(from + (a - from) * e);
    if (k < 1) requestAnimationFrame(step); else animating = false;
  })(t0);
}
function startPlay() {
  if (playing) return; playing = true;
  glideTo(PLAY_START);
  audio.play().catch(e => { console.warn("재생 실패", e); playing = false; glideTo(REST); });
}
function stopPlay() {
  if (!playing && angle === REST) return; playing = false; audio.pause(); glideTo(REST);
}
audio.addEventListener("ended", () => { playing = false; audio.currentTime = 0; glideTo(REST, 900); });

// 회전 루프 (33⅓ rpm ≈ 200°/s) + 재생 중 톤암 미세 이동
let last = performance.now();
(function loop(t) {
  const dt = (t - last) / 1000; last = t;
  if (!scratching) { spinSpeed += ((playing ? 200 * pitchRate : 0) - spinSpeed) * Math.min(1, dt * 4); spin = (spin + spinSpeed * dt) % 360; }
  else scratchTick(dt);
  lp.style.transform = `rotate(${spin}deg)`;
  if (playing && !dragging && !animating && audio.duration)
    setArm(PLAY_START + (PLAY_END - PLAY_START) * (audio.currentTime / audio.duration));
  requestAnimationFrame(loop);
})(last);


/* ===== LP 스크래치 (삐끼삐끼): LP를 잡고 흔들면 손의 회전 속도만큼 음악이 앞뒤로 재생됨 ===== */
const AC = new (window.AudioContext || window.webkitAudioContext)();
let songBuf = null;
fetch(TRACK.mp3 + "?v=20261020d").then(r => r.arrayBuffer()).then(b => AC.decodeAudioData(b)).then(b => { songBuf = b; console.log("스크래치용 오디오 준비 완료"); }).catch(e => console.warn("오디오 디코드 실패", e));

/* ===== 믹서 오디오 체인: song1.mp3 → [채널A / 채널B: 트림→LOW→MID→HIGH→필터→에코→팬→볼륨→크로스페이더] → 마스터 ===== */
const input = AC.createGain();
AC.createMediaElementSource(audio).connect(input);
audio.preservesPitch = false; audio.webkitPreservesPitch = false; audio.mozPreservesPitch = false;
const master = AC.createDynamicsCompressor(); master.connect(AC.destination);
function mkChain() {
  const o = { trim: AC.createGain(), lo: AC.createBiquadFilter(), mid: AC.createBiquadFilter(), hi: AC.createBiquadFilter(), flt: AC.createBiquadFilter(),
    pan: AC.createStereoPanner(), dly: AC.createDelay(1), fb: AC.createGain(), wet: AC.createGain(), vol: AC.createGain(), xf: AC.createGain() };
  o.lo.type = "lowshelf"; o.lo.frequency.value = 200; o.mid.type = "peaking"; o.mid.frequency.value = 1000; o.mid.Q.value = 1;
  o.hi.type = "highshelf"; o.hi.frequency.value = 4000; o.flt.type = "allpass"; o.flt.Q.value = 1;
  o.fb.gain.value = .4; o.wet.gain.value = 0; o.dly.delayTime.value = .36;
  input.connect(o.trim); o.trim.connect(o.lo); o.lo.connect(o.mid); o.mid.connect(o.hi); o.hi.connect(o.flt); o.flt.connect(o.pan);
  o.pan.connect(o.vol); o.pan.connect(o.dly); o.dly.connect(o.fb); o.fb.connect(o.dly); o.dly.connect(o.wet); o.wet.connect(o.vol);
  o.vol.connect(o.xf); o.xf.connect(master); return o;
}
const CH = { A: mkChain(), B: mkChain() };
const setP = (p, v) => p.setTargetAtTime(v, AC.currentTime, .02);
function applyCtl(c) {
  const v = c.v, b = (v - .5) * 2, k = CH[c.ch];
  switch (c.fn) {
    case "hi":  setP(k.hi.gain, b * 12); break;
    case "mid": setP(k.mid.gain, b * 12); break;
    case "low": setP(k.lo.gain, b <= -.98 ? -40 : b * 15); break;
    case "filter":
      if (Math.abs(b) < .04) k.flt.type = "allpass";
      else if (b < 0) { k.flt.type = "lowpass"; setP(k.flt.frequency, 20000 * Math.pow(.012, -b)); }
      else { k.flt.type = "highpass"; setP(k.flt.frequency, 20 * Math.pow(100, b)); }
      break;
    case "echo": setP(k.wet.gain, Math.abs(b) * .7); setP(k.dly.delayTime, b < 0 ? .12 : .36); break;
    case "pan":  setP(k.pan.pan, b); break;
    case "trim": setP(k.trim.gain, Math.pow(10, b * 12 / 20)); break;
    case "vol":  setP(k.vol.gain, 1.4 * Math.pow(v, 1.2)); break;
    case "xfade": setP(CH.A.xf.gain, Math.cos(v * Math.PI / 2)); setP(CH.B.xf.gain, Math.sin(v * Math.PI / 2)); break;
    case "pitch": { const d = v - c.v0; pitchRate = 1 + (d > 0 ? d / (1 - c.v0) : d / c.v0) * .08; audio.playbackRate = pitchRate; break; }
  }
}
let sc = null; // {lastA, acc, pos, wasPlaying, rate}
const lpAngle = p => Math.atan2(p.y - LP_C.y, p.x - LP_C.x) * 180 / Math.PI;
const onLP = p => Math.hypot(p.x - LP_C.x, p.y - LP_C.y) < 171;
function beginScratch(p) {
  AC.resume();
  sc = { lastA: lpAngle(p), acc: 0, pos: audio.currentTime, wasPlaying: playing, rate: 0 };
  if (playing) audio.pause();
  scratching = true; spinSpeed = 0;
}
function moveScratch(p) {
  const a = lpAngle(p); let d = a - sc.lastA; sc.lastA = a;
  if (d > 180) d -= 360; if (d < -180) d += 360;
  sc.acc += d; spin += d; // LP가 손을 따라 돈다
}
function scratchTick(dt) {
  if (!sc || !songBuf) return;
  const deg = sc.acc; sc.acc = 0;
  const target = Math.max(-5, Math.min(5, (deg / Math.max(dt, .001)) / 200)); // 200°/s = 1배속
  sc.rate += (target - sc.rate) * .6;
  const r = sc.rate;
  if (Math.abs(r) < .08) return;
  const dur = Math.max(.045, dt * 2.2), sr = songBuf.sampleRate, n = Math.max(32, Math.floor(dur * Math.abs(r) * sr));
  const fwd = r > 0; let start = Math.floor((fwd ? sc.pos : sc.pos - n / sr) * sr);
  if (start < 0) start = 0; if (start + n > songBuf.length) start = Math.max(0, songBuf.length - n);
  const seg = AC.createBuffer(songBuf.numberOfChannels, n, sr);
  for (let c = 0; c < seg.numberOfChannels; c++) {
    const src = songBuf.getChannelData(c).subarray(start, start + n), dst = seg.getChannelData(c);
    if (fwd) dst.set(src); else for (let i = 0; i < n; i++) dst[i] = src[n - 1 - i];
  }
  const node = AC.createBufferSource(); node.buffer = seg; node.playbackRate.value = Math.abs(r);
  const g = AC.createGain(), t0 = AC.currentTime, len = n / sr / Math.abs(r);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(1, t0 + .006);
  g.gain.setValueAtTime(1, t0 + Math.max(.007, len - .01)); g.gain.linearRampToValueAtTime(0, t0 + len);
  node.connect(g).connect(input); node.start(t0);
  sc.pos = Math.max(0, Math.min(songBuf.duration, sc.pos + r * dt));
}
function endScratch() {
  if (!sc) return;
  audio.currentTime = Math.min(sc.pos, (audio.duration || sc.pos) - .05);
  if (sc.wasPlaying && playing) audio.play();
  sc = null; scratching = false; spinSpeed = 0;
}


/* ===== 믹서/피치 컨트롤 레이어 (원본 이미지에서 잘라낸 부품을 위에 얹어 직접 조작) ===== */
for (const c of CONTROLS) {
  c.cx = c.x; c.cy = c.y;
  if (c.kind === "vf" || c.kind === "pitch") c.v0 = (c.ybot - c.y) / (c.ybot - c.ytop);
  if (c.kind === "hf") c.v0 = (c.x - c.xl) / (c.xr - c.xl);
  c.v = c.v0;
  const el = document.createElement("img"); el.src = `assets/ctl/${c.id}.png?v=20261020d`; el.draggable = false; c.el = el;
  el.style.width = (c.w / DW * 100) + "%"; el.style.height = (c.h / DH * 100) + "%";
  deck.insertBefore(el, arm); placeCtl(c); applyCtl(c);
}
function placeCtl(c) {
  if (c.kind === "knob") c.el.style.transform = `rotate(${(c.v - c.v0) * 270}deg)`;
  else if (c.kind === "hf") c.cx = c.xl + c.v * (c.xr - c.xl);
  else c.cy = c.ybot - c.v * (c.ybot - c.ytop);
  c.el.style.left = ((c.cx - c.w / 2) / DW * 100) + "%"; c.el.style.top = ((c.cy - c.h / 2) / DH * 100) + "%";
}
let ctl = null, lastTap = { id: "", t: 0 };
function ctlDown(e, p) {
  for (const c of CONTROLS) {
    const hit = c.kind === "knob" ? Math.hypot(p.x - c.cx, p.y - c.cy) < c.w / 2 + 2
      : Math.abs(p.x - c.cx) < c.w / 2 + 4 && Math.abs(p.y - c.cy) < c.h / 2 + 4;
    if (!hit) continue;
    const now = performance.now();
    if (lastTap.id === c.id && now - lastTap.t < 350) { c.v = c.v0; placeCtl(c); applyCtl(c); lastTap = { id: "", t: 0 }; return true; } // 더블클릭 = 초기화
    lastTap = { id: c.id, t: now };
    ctl = { c, sy: e.clientY, v: c.v, off: c.kind === "hf" ? p.x - c.cx : p.y - c.cy };
    deck.setPointerCapture(e.pointerId); return true;
  } return false;
}
function ctlMove(e) {
  const c = ctl.c, p = toDeck(e);
  if (c.kind === "knob") c.v = Math.max(0, Math.min(1, ctl.v + (ctl.sy - e.clientY) / 160));
  else if (c.kind === "hf") c.v = Math.max(0, Math.min(1, (p.x - ctl.off - c.xl) / (c.xr - c.xl)));
  else c.v = Math.max(0, Math.min(1, (c.ybot - (p.y - ctl.off)) / (c.ybot - c.ytop)));
  placeCtl(c); applyCtl(c);
}

// 톤암 픽셀 히트 테스트 (알파 채널)
const hit = document.createElement("canvas"); hit.width = 1468; hit.height = 824;
const hctx = hit.getContext("2d", { willReadFrequently: true });
const armImg = new Image(); armImg.src = "assets/tonearm.png?v=20261020a";
armImg.onload = () => hctx.drawImage(armImg, 0, 0);
function toDeck(e) { const r = deck.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * DW, y: (e.clientY - r.top) / r.height * DH }; }
function onArm(p) {
  const a = -angle * Math.PI / 180, dx = p.x - PIVOT.x, dy = p.y - PIVOT.y;
  const ux = PIVOT.x + dx * Math.cos(a) - dy * Math.sin(a), uy = PIVOT.y + dx * Math.sin(a) + dy * Math.cos(a);
  const px = Math.round(ux * 2), py = Math.round(uy * 2);
  for (let oy = -10; oy <= 10; oy += 5) for (let ox = -10; ox <= 10; ox += 5) {
    if (px+ox < 0 || py+oy < 0 || px+ox >= 1468 || py+oy >= 824) continue;
    if (hctx.getImageData(px + ox, py + oy, 1, 1).data[3] > 40) return true;
  } return false;
}
const ang = p => Math.atan2(p.y - PIVOT.y, p.x - PIVOT.x) * 180 / Math.PI;
let grab = null;
deck.addEventListener("pointerdown", e => {
  const p = toDeck(e); AC.resume();
  if (ctlDown(e, p)) return;
  if (p.x > 14 && p.x < 70 && p.y > 355 && p.y < 396) { playing ? stopPlay() : startPlay(); return; } // START/STOP
  if (!onArm(p)) { if (onLP(p) && songBuf) { beginScratch(p); deck.setPointerCapture(e.pointerId); } return; }
  grab = { offset: angle - ang(p), x: e.clientX, y: e.clientY, moved: false };
  deck.setPointerCapture(e.pointerId); glideTo.id++; animating = false;
});
deck.addEventListener("pointermove", e => {
  if (ctl) { ctlMove(e); return; }
  if (sc) { moveScratch(toDeck(e)); return; }
  if (!grab) return;
  if (Math.hypot(e.clientX - grab.x, e.clientY - grab.y) > 5) grab.moved = true;
  if (!grab.moved) return; dragging = true;
  setArm(Math.max(REST, Math.min(PLAY_END + 6, ang(toDeck(e)) + grab.offset)));
});
deck.addEventListener("pointerup", e => {
  if (ctl) { ctl = null; return; }
  if (sc) { endScratch(); return; }
  if (!grab) return; const g = grab; grab = null; dragging = false;
  if (!g.moved) { playing ? stopPlay() : startPlay(); return; }   // 클릭
  if (angle > REST + 10) { if (playing) glideTo(Math.max(PLAY_START, Math.min(PLAY_END, angle)), 250); else startPlay(); } // LP 위에 놓음
  else stopPlay();                                                  // 거치대로 복귀
});
document.getElementById("startstop").style.pointerEvents = "none";

/* ================= 2. 웹캠 + 피쉬아이 + 헤드폰 ================= */
const video = document.getElementById("video");
const out = document.getElementById("fisheye");
const SRC = document.createElement("canvas"); SRC.width = 960; SRC.height = 960;   // 정사각 합성 캔버스
const sctx = SRC.getContext("2d");
const hp = new Image(); hp.src = "assets/headphones2.png?v=20261020d";
const gl = out.getContext("webgl", { premultipliedAlpha: false });
const vs = `attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
const fs = `precision highp float;varying vec2 uv;uniform sampler2D t;
void main(){vec2 c=uv*2.-1.;float r=length(c);if(r>1.){gl_FragColor=vec4(0.,0.,0.,1.);return;}
 // 볼록렌즈(배럴) 피쉬아이: 중앙은 크게 확대, 가장자리는 압축
 float a=1.15;float src=tan(r*a)/tan(a);
 vec2 d=r>0.?c/r*src:vec2(0.);vec2 u=d*.5+.5;u.y=1.-u.y;gl_FragColor=texture2D(t,u);}`;
function sh(type, s) { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); return o; }
const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
gl.linkProgram(prog); gl.useProgram(prog);
const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
[gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(f => gl.texParameteri(gl.TEXTURE_2D, f, gl.LINEAR));
[gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(f => gl.texParameteri(gl.TEXTURE_2D, f, gl.CLAMP_TO_EDGE));
function fit() { const s = Math.round(out.clientWidth * devicePixelRatio) || 800; out.width = out.height = s; gl.viewport(0, 0, s, s); }
fit(); addEventListener("resize", fit);

let landmarker = null, face = null; // face = 부드럽게 보정된 {x,y,w,roll}
try {
  const { FaceLandmarker, FilesetResolver } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs");
  const fileset = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" },
    runningMode: "VIDEO", numFaces: 1 });
} catch (e) { console.warn("MediaPipe 로드 실패 (헤드폰 추적 없이 피쉬아이만 동작):", e); }

const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" }, audio: false }).catch(e => { console.error("카메라 권한 필요", e); return null; });
if (stream) { video.srcObject = stream; await video.play(); }

const lerp = (a, b, k) => a + (b - a) * k;
function frame(now) {
  requestAnimationFrame(frame);
  if (!stream || video.readyState < 2) return;
  const vw = video.videoWidth, vh = video.videoHeight, side = Math.min(vw, vh), sx = (vw - side) / 2, sy = (vh - side) / 2, S = SRC.width / side;
  // 거울 모드 + 정사각 크롭
  sctx.save(); sctx.setTransform(-1, 0, 0, 1, SRC.width, 0); sctx.drawImage(video, sx, sy, side, side, 0, 0, SRC.width, SRC.height); sctx.restore();
  if (landmarker) {
    const r = landmarker.detectForVideo(video, now);
    if (r.faceLandmarks && r.faceLandmarks[0]) {
      const L = r.faceLandmarks[0], P = i => ({ x: SRC.width - ((L[i].x * vw - sx) * S), y: (L[i].y * vh - sy) * S });
      const a = P(234), b = P(454), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const left = a.x < b.x ? a : b, right = a.x < b.x ? b : a;
      const cur = { x: m.x, y: m.y, w: Math.hypot(b.x - a.x, b.y - a.y), roll: Math.atan2(right.y - left.y, right.x - left.x) };
      face = face ? { x: lerp(face.x, cur.x, .5), y: lerp(face.y, cur.y, .5), w: lerp(face.w, cur.w, .4), roll: lerp(face.roll, cur.roll, .5) } : cur;
    } else face = null;
  }
  if (face && hp.complete) {
    // 이어컵 안쪽 가장자리(간격 327px)를 얼굴 외곽(234↔454)에 맞춰, 컵이 얼굴 바깥에 오도록 배치
    const scale = face.w * 1.03 / 327;
    sctx.save(); sctx.translate(face.x, face.y); sctx.rotate(face.roll); sctx.scale(scale, scale);
    sctx.drawImage(hp, -375.5, -506); sctx.restore();  // 컵 중심(375.5, 506)이 귀 높이
  }
  gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, SRC);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
requestAnimationFrame(frame);
