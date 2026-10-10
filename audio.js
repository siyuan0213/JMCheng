
/* ============================================================
   恒组织 · 音频引擎（全部在运行时用 Web Audio 合成，不依赖任何音频文件）
   —— 背景音乐、音效、音量控制
   ============================================================ */
(function () {
"use strict";

var ctx = null, master = null, musicGain = null, sfxGain = null;
var started = false, mode = null, timers = [], seqId = 0;
var audioOK = (typeof window !== "undefined") &&
              (window.AudioContext || window.webkitAudioContext);

function ensure() {
  if (!audioOK) return false;
  if (ctx) return true;
  try {
    var AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();  master.gain.value = 0.5;  master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.30; musicGain.connect(master);
    sfxGain = ctx.createGain();  sfxGain.gain.value = 0.60;  sfxGain.connect(master);
    return true;
  } catch (e) { audioOK = false; return false; }
}
function now() { return ctx ? ctx.currentTime : 0; }
function clearSeq() {
  for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
  timers = [];
  seqId++;
}
function later(ms, fn) {
  var id = seqId;
  var t = setTimeout(function () { if (id === seqId) fn(); }, ms);
  timers.push(t);
  return t;
}

/* ---------- 基础发声单元 ---------- */
function tone(o) {
  if (!ensure()) return;
  var t0 = now() + (o.delay || 0);
  var dur = o.dur || 0.3;
  var osc = ctx.createOscillator();
  osc.type = o.type || "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
  if (o.detune) osc.detune.value = o.detune;
  var g = ctx.createGain();
  var vol = o.vol === undefined ? 0.5 : o.vol;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + (o.atk || 0.02));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  var node = osc;
  if (o.filter) {
    var f = ctx.createBiquadFilter();
    f.type = o.filter; f.frequency.value = o.cut || 1200; f.Q.value = o.q || 1;
    osc.connect(f); node = f;
  }
  node.connect(g);
  g.connect(o.bus === "sfx" ? sfxGain : musicGain);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
  return osc;
}
function noise(o) {
  if (!ensure()) return;
  var t0 = now() + (o.delay || 0);
  var dur = o.dur || 0.2;
  var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  var buf = ctx.createBuffer(1, len, ctx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < len; i++) {
    var env = Math.pow(1 - i / len, o.decay || 2);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  var src2 = ctx.createBufferSource();
  src2.buffer = buf;
  var f = ctx.createBiquadFilter();
  f.type = o.filter || "bandpass";
  f.frequency.value = o.freq || 2000;
  f.Q.value = o.q || 1.2;
  var g = ctx.createGain();
  g.gain.value = o.vol === undefined ? 0.4 : o.vol;
  src2.connect(f); f.connect(g); g.connect(o.bus === "music" ? musicGain : sfxGain);
  src2.start(t0);
}

/* ---------- 音效 ---------- */
var SFX = {
  click:   function () { tone({ type:"triangle", freq:660, to:440, dur:0.07, vol:0.20, bus:"sfx" }); },
  press:   function () { tone({ type:"square", freq:220, to:150, dur:0.05, vol:0.10, bus:"sfx", filter:"lowpass", cut:900 }); },
  coin:    function () { tone({ type:"triangle", freq:1320, to:1760, dur:0.10, vol:0.16, bus:"sfx" }); },
  coinT:   function () { tone({ type:"triangle", freq:520, to:360, dur:0.10, vol:0.13, bus:"sfx" }); },
  shatter: function () { noise({ freq:2600, dur:0.22, vol:0.34, decay:3, bus:"sfx" });
                         tone({ type:"sawtooth", freq:300, to:90, dur:0.18, vol:0.14, bus:"sfx" }); },
  clashWin:function () { [0,90,180].forEach(function (d,i) { tone({ type:"square", freq:523*(1+i*0.26), dur:0.16, vol:0.20, delay:d/1000, bus:"sfx" }); }); },
  clashLose:function(){ [0,110].forEach(function (d,i) { tone({ type:"sawtooth", freq:220/(1+i*0.4), to:110, dur:0.24, vol:0.18, delay:d/1000, bus:"sfx" }); }); },
  descend: function () {
    // 降神：上升扫频 + 撞击 + 余响
    tone({ type:"sine", freq:120, to:900, dur:0.9, vol:0.26, bus:"sfx" });
    tone({ type:"sawtooth", freq:60, to:30, dur:1.4, vol:0.20, bus:"sfx", filter:"lowpass", cut:600 });
    noise({ freq:3600, dur:0.9, vol:0.22, decay:2, bus:"sfx" });
    later(650, function () {
      tone({ type:"triangle", freq:180, to:60, dur:1.0, vol:0.30, bus:"sfx" });
      noise({ freq:900, dur:0.7, vol:0.26, decay:1.6, bus:"sfx", filter:"lowpass" });
    });
  },
  win:  function () { [523,659,784,1047].forEach(function (f,i) { tone({ type:"triangle", freq:f, dur:0.42, vol:0.22, delay:i*0.13, bus:"sfx" }); }); },
  lose: function () { [392,330,262,196].forEach(function (f,i) { tone({ type:"sine", freq:f, dur:0.55, vol:0.20, delay:i*0.17, bus:"sfx" }); }); },
  type: function () { noise({ freq:4200, dur:0.035, vol:0.055, decay:4, bus:"sfx", filter:"highpass" }); },
  page: function () { tone({ type:"sine", freq:880, to:1180, dur:0.18, vol:0.12, bus:"sfx" }); },
  dev:  function () { [440,660,880,1320].forEach(function (f,i) { tone({ type:"square", freq:f, dur:0.14, vol:0.14, delay:i*0.06, bus:"sfx" }); }); }
};
function sfx(name) {
  if (typeof S !== "undefined" && S && S.muted) return;
  if (typeof S !== "undefined" && S && S.sfx === false) return;
  var f = SFX[name];
  if (f) { try { f(); } catch (e) {} }
}

/* ---------- 音乐：两首自创曲子 ----------
   调式都取自游戏气质：小调、空五度、单音拨弦，避免甜腻。
   曲一 · 列传（探索/剧情/菜单）：C 小调，缓慢拨弦 + 低音垫
   曲二 · 无垠（战斗/无垠厅/拼点）：A 小调，低音脉冲 + 弦乐推进 + 打击
----------------------------------------------- */
var SCALE_MINOR = [0, 2, 3, 5, 7, 8, 10];      // 自然小调
var SCALE_PENTA = [0, 3, 5, 7, 10];            // 小调五声
function hz(semi, base) { return base * Math.pow(2, semi / 12); }

/* 曲一：列传 */
function seqLore() {
  if (mode !== "lore") return;
  var root = 130.81;               // C3
  var bar = 0;
  function step() {
    if (mode !== "lore") return;
    // 低音长垫（每两小节换一次）
    if (bar % 2 === 0) {
      var bassSemi = [0, -4, -5, -7][Math.floor(bar / 2) % 4];
      tone({ freq: hz(bassSemi - 12, root), dur: 3.4, vol: 0.24, type:"sine", atk: 0.6 });
      tone({ freq: hz(bassSemi, root), dur: 3.4, vol: 0.10, type:"triangle", atk: 0.8 });
    }
    // 空五度泛音
    tone({ freq: hz([0,-4,-5,-7][Math.floor(bar/2)%4] + 7, root), dur: 2.6, vol: 0.055, type:"sine", atk: 1.2 });
    // 拨弦旋律：小调五声随机游走
    var n = 2 + (Math.random() < 0.4 ? 1 : 0);
    for (var i = 0; i < n; i++) {
      var idx = Math.floor(Math.random() * SCALE_PENTA.length);
      var oct = Math.random() < 0.35 ? 12 : 0;
      var semis = SCALE_PENTA[idx] + oct;
      tone({ freq: hz(semis, root * 2), dur: 0.9 + Math.random() * 0.5,
             vol: 0.10 + Math.random() * 0.05, type:"triangle",
             atk: 0.01, delay: (i * 0.45) });
    }
    // 偶尔一颗高音点缀
    if (Math.random() < 0.25) {
      tone({ freq: hz(SCALE_PENTA[Math.floor(Math.random()*5)] + 24, root), dur: 1.4, vol: 0.05, type:"sine", delay: 1.1 });
    }
    bar++;
    later(1850, step);
  }
  step();
}

/* 曲二：无垠 */
function seqBattle() {
  if (mode !== "battle") return;
  var root = 110.0;                 // A2
  var prog = [0, 0, -3, -5];        // Am - Am - F - G 感觉
  var step16 = 0;
  function step() {
    if (mode !== "battle") return;
    var beat = step16 % 16;
    var chord = prog[Math.floor(step16 / 16) % prog.length];
    // 低音脉冲（每拍）
    if (beat % 4 === 0) {
      tone({ freq: hz(chord - 12, root), dur: 0.42, vol: 0.30, type:"sawtooth",
             filter:"lowpass", cut: 420, atk: 0.005 });
    }
    // 弦乐长音（每两拍）
    if (beat % 8 === 0) {
      tone({ freq: hz(chord + 3, root * 2), dur: 1.6, vol: 0.075, type:"triangle", atk: 0.4 });
      tone({ freq: hz(chord + 7, root * 2), dur: 1.6, vol: 0.06,  type:"sine",     atk: 0.4 });
    }
    // 旋律：小调音阶上行/下行片段
    if (beat % 2 === 0) {
      var steps = [0, 3, 5, 7, 8, 10, 12];
      var s = steps[Math.floor(Math.random() * steps.length)];
      tone({ freq: hz(chord + s, root * 4), dur: 0.30, vol: 0.10 + Math.random()*0.05,
             type:"square", filter:"lowpass", cut: 2400, atk: 0.005 });
    }
    // 打击：底鼓 + 军鼓感
    if (beat === 0 || beat === 6 || beat === 10) {
      tone({ freq: 90, to: 42, dur: 0.20, vol: 0.34, type:"sine", atk: 0.004 });
    }
    if (beat === 4 || beat === 12) {
      noise({ freq: 1900, dur: 0.14, vol: 0.20, decay: 3.5, bus:"music" });
    }
    if (beat % 2 === 1) {
      noise({ freq: 7000, dur: 0.045, vol: 0.075, decay: 5, bus:"music", filter:"highpass" });
    }
    step16++;
    later(168, step);
  }
  step();
}

/* ---------- 对外接口 ---------- */
function playMusic(which) {
  if (typeof S !== "undefined" && S && S.music === false) { mode = which; return; }
  if (!audioOK) return;
  if (!ensure()) return;
  if (mode === which && started) return;
  mode = which;
  started = true;
  clearSeq();
  try { if (ctx.state === "suspended") ctx.resume(); } catch (e) {}
  if (which === "lore") seqLore();
  else if (which === "battle") seqBattle();
}
function stopMusic() {
  mode = null; started = false; clearSeq();
}
/* 按界面自动切换曲目 */
function musicForScreen(screen) {
  if (screen === "battle") playMusic("battle");
  else playMusic("lore");
}
function unlock() {
  if (!ensure()) return;
  try { if (ctx.state === "suspended") ctx.resume(); } catch (e) {}
}
function setVolume(kind, v) {
  if (!ensure()) return;
  try {
    if (kind === "music" && musicGain) musicGain.gain.value = Math.max(0, Math.min(1, v)) * 0.42;
    if (kind === "sfx" && sfxGain) sfxGain.gain.value = Math.max(0, Math.min(1, v)) * 0.75;
    if (kind === "master" && master) master.gain.value = Math.max(0, Math.min(1, v)) * 0.6;
  } catch (e) {}
}

window.HengAudio = {
  play: playMusic, stop: stopMusic, forScreen: musicForScreen,
  sfx: sfx, unlock: unlock, setVolume: setVolume,
  get state() { return { ctx: !!ctx, mode: mode, started: started }; }
};
})();
