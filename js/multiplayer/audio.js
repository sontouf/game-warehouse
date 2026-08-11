"use strict";
// 미니게임 오디오 엔진 — Web Audio API 실시간 합성 (BGM + 효과음, 오디오 파일 불필요)
window.MGA = (function () {
  let ctx = null, master = null, bgmGain = null, sfxGain = null;
  let muted = localStorage.getItem("mg_muted") === "1";
  let bgmTimer = null, bgmKey = null, nextNoteTime = 0, step = 0, curSong = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.85; master.connect(ctx.destination);
    bgmGain = ctx.createGain(); bgmGain.gain.value = 0.32; bgmGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.95; sfxGain.connect(master);
    return ctx;
  }
  function resume() { ensure(); if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {}); }
  function setMuted(m) { muted = m; localStorage.setItem("mg_muted", m ? "1" : "0"); if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.02); }
  function toggle() { setMuted(!muted); if (!muted) resume(); return muted; }
  function isMuted() { return muted; }

  // ── 합성 프리미티브 ──
  function tone(freq, t, dur, o) {
    o = o || {};
    if (!ctx) return;
    const osc = ctx.createOscillator(); osc.type = o.type || "sine"; osc.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain != null ? o.gain : 0.3, t + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.dest || sfxGain);
    osc.start(t); osc.stop(t + dur + 0.06);
  }
  function slide(f1, f2, t, dur, o) {
    o = o || {};
    if (!ctx) return;
    const osc = ctx.createOscillator(); osc.type = o.type || "sawtooth";
    osc.frequency.setValueAtTime(f1, t); osc.frequency.exponentialRampToValueAtTime(Math.max(28, f2), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(o.gain != null ? o.gain : 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.dest || sfxGain); osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(t, dur, o) {
    o = o || {};
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = o.type || "highpass"; f.frequency.value = o.freq || 1000;
    const g = ctx.createGain(); g.gain.setValueAtTime(o.gain != null ? o.gain : 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxGain); src.start(t); src.stop(t + dur);
  }

  // ── 효과음 ──
  function sfx(name) {
    if (!ensure() || muted) return;
    resume();
    const t = ctx.currentTime;
    switch (name) {
      case "click": tone(520, t, 0.06, { type: "triangle", gain: 0.16 }); break;
      case "nav": tone(700, t, 0.07, { type: "triangle", gain: 0.16 }); tone(1040, t + 0.05, 0.07, { type: "triangle", gain: 0.12 }); break;
      case "shoot": slide(720, 190, t, 0.11, { type: "square", gain: 0.14 }); break;
      case "nade": slide(300, 900, t, 0.22, { type: "sine", gain: 0.16 }); break;
      case "explode": noise(t, 0.4, { gain: 0.5, type: "lowpass", freq: 900 }); slide(220, 46, t, 0.45, { type: "sawtooth", gain: 0.34 }); break;
      case "hit": tone(150, t, 0.13, { type: "square", gain: 0.26 }); break;
      case "item": tone(660, t, 0.1, { type: "triangle", gain: 0.24 }); tone(990, t + 0.09, 0.14, { type: "triangle", gain: 0.24 }); break;
      case "wall": tone(110, t, 0.16, { type: "square", gain: 0.3 }); noise(t, 0.1, { gain: 0.14, type: "lowpass", freq: 380 }); break;
      case "dash": noise(t, 0.22, { gain: 0.26, type: "bandpass", freq: 1500 }); slide(320, 1200, t, 0.2, { type: "sine", gain: 0.1 }); break;
      case "laser": slide(1250, 320, t, 0.17, { type: "sawtooth", gain: 0.2 }); break;
      case "stab": noise(t, 0.12, { gain: 0.3, type: "highpass", freq: 2600 }); slide(900, 400, t, 0.1, { type: "square", gain: 0.1 }); break;
      case "safe": tone(880, t, 0.09, { type: "square", gain: 0.2 }); tone(1320, t + 0.08, 0.12, { type: "square", gain: 0.2 }); break;
      case "spin": slide(400, 1400, t, 0.5, { type: "square", gain: 0.12 }); break;
      case "draw": tone(520, t, 0.05, { type: "triangle", gain: 0.2 }); slide(520, 940, t, 0.12, { type: "triangle", gain: 0.13 }); break;
      case "win": [0, 4, 7, 12].forEach((n, i) => tone(440 * Math.pow(2, n / 12), t + i * 0.11, 0.24, { type: "triangle", gain: 0.28 })); break;
      case "lose": [0, -2, -4, -7].forEach((n, i) => tone(440 * Math.pow(2, n / 12), t + i * 0.13, 0.3, { type: "sawtooth", gain: 0.2 })); break;
      case "start": [0, 7, 12].forEach((n, i) => tone(330 * Math.pow(2, n / 12), t + i * 0.08, 0.18, { type: "square", gain: 0.22 })); break;
      case "catch": slide(1250, 320, t, 0.17, { type: "sawtooth", gain: 0.2 }); tone(150, t + 0.06, 0.13, { type: "square", gain: 0.24 }); break;
    }
  }

  // ── BGM (스텝 시퀀서) ──
  const NOTE = (n) => 55 * Math.pow(2, n / 12); // A1 기준 반음
  const SONGS = {
    lobby: { bpm: 100, wave: "triangle", bassWave: "sine",
      mel: [24, 26, 28, 31, 28, 26, 24, -1, 26, 28, 31, 33, 31, 28, 26, -1], bass: [12, 12, 7, 7, 12, 12, 9, 9] },
    roulette: { bpm: 134, wave: "square", bassWave: "triangle",
      mel: [24, 28, 31, 28, 33, 31, 28, 24, 26, 29, 33, 29, 28, -1, 26, -1], bass: [12, 12, 17, 17, 14, 14, 12, 12] },
    ladder: { bpm: 118, wave: "triangle", bassWave: "sine",
      mel: [24, 26, 28, 29, 31, 29, 28, 26, 24, 26, 28, 29, 31, 33, 31, -1], bass: [12, 12, 16, 16, 14, 14, 12, 12] },
    draw: { bpm: 82, wave: "sine", bassWave: "sine",
      mel: [31, -1, 28, -1, 26, -1, 28, -1, 24, -1, 26, -1, 28, -1, -1, -1], bass: [12, -1, 7, -1, 9, -1, 7, -1] },
    arena: { bpm: 152, wave: "sawtooth", bassWave: "square",
      mel: [24, 24, 31, 24, 27, 24, 29, 24, 24, 24, 31, 24, 34, 31, 29, 27], bass: [12, 12, 12, 12, 10, 10, 10, 10] },
    cops: { bpm: 94, wave: "triangle", bassWave: "sine",
      mel: [24, -1, 25, -1, 27, -1, 25, -1, 24, -1, -1, -1, 20, -1, 22, -1], bass: [12, -1, -1, -1, 11, -1, -1, -1] },
  };
  function scheduler() {
    if (!ctx || !curSong) return;
    if (muted) { nextNoteTime = ctx.currentTime + 0.12; return; }
    const spb = 60 / curSong.bpm / 2; // 8분음표 스텝
    while (nextNoteTime < ctx.currentTime + 0.13) {
      const s = curSong;
      const mi = s.mel[step % s.mel.length];
      if (mi > 0) tone(NOTE(mi), nextNoteTime, spb * 0.9, { type: s.wave, gain: 0.15, dest: bgmGain });
      const bi = s.bass[step % s.bass.length];
      if (bi > 0) tone(NOTE(bi - 12), nextNoteTime, spb * 1.7, { type: s.bassWave, gain: 0.17, dest: bgmGain });
      nextNoteTime += spb; step++;
    }
  }
  function bgm(key) {
    if (!ensure()) return;
    const song = SONGS[key] || SONGS.lobby;
    if (bgmKey === key && bgmTimer) return;
    bgmKey = key; curSong = song; step = 0;
    resume();
    nextNoteTime = ctx.currentTime + 0.1;
    if (bgmTimer) clearInterval(bgmTimer);
    bgmTimer = setInterval(scheduler, 25);
  }
  function stopBgm() { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } curSong = null; bgmKey = null; }

  return { resume, setMuted, toggle, isMuted, sfx, bgm, stopBgm };
})();
