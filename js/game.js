// RPG エンジン本体: マップ・移動・会話・パズル・アイテム・証明ノート
(function () {
  'use strict';
  const { ITEMS, CHAPTERS } = window.GAME_DATA;
  const PUZZLES = window.PUZZLES;
  const TILE = 32, MW = 20, MH = 15;
  const SAVE_KEY = 'grh-quest-save-v2';
  const $ = (id) => document.getElementById(id);
  const itemById = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
  const chapterById = (id) => CHAPTERS.find((c) => c.id === id);

  const canvas = $('screen');
  const ctx = canvas.getContext('2d');

  // ------------------------------------------------------------------
  // 状態
  // ------------------------------------------------------------------
  const state = {
    chapter: 1, x: 0, y: 0, dir: 'down',
    items: new Set(), theorems: new Set(), met: new Set(), cleared: false,
  };
  let mode = 'title'; // title | walk | dialog | puzzle | menu | fade
  let map = null;      // 現在の章のマップ情報
  let anim = null;     // 移動アニメーション {fx,fy,t0}
  let path = [];       // クリック移動の経路
  let pendingInteract = null;
  const keys = new Set();
  let soundOn = true;

  let debug = false; // デバッグモードではセーブデータを読み書きしない
  function save() {
    if (debug) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        chapter: state.chapter, x: state.x, y: state.y, dir: state.dir,
        items: [...state.items], theorems: [...state.theorems], met: [...state.met], cleared: state.cleared,
      }));
    } catch (e) { /* 保存できない環境では何もしない */ }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!s || !chapterById(s.chapter)) return false;
      Object.assign(state, { chapter: s.chapter, x: s.x, y: s.y, dir: s.dir || 'down', cleared: !!s.cleared });
      state.items = new Set(s.items || []); state.theorems = new Set(s.theorems || []); state.met = new Set(s.met || []);
      return true;
    } catch (e) { return false; }
  }
  function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }

  // ------------------------------------------------------------------
  // 効果音 (WebAudio)
  // ------------------------------------------------------------------
  let actx = null;
  function tone(freq, dur, delay = 0, type = 'square', vol = 0.04) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      const t = actx.currentTime + delay;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur);
    } catch (e) { /* 音が出せなくても続行 */ }
  }
  const sfx = {
    talk: () => tone(660, 0.05),
    bad: () => { tone(160, 0.18, 0, 'sawtooth'); tone(120, 0.22, 0.1, 'sawtooth'); },
    item: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, i * 0.09)),
    theorem: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, i * 0.11, 'triangle', 0.07)),
    door: () => { tone(220, 0.12); tone(330, 0.2, 0.1); },
  };

  // ------------------------------------------------------------------
  // マップ
  // ------------------------------------------------------------------
  function parseMap(ch) {
    const m = { ch, rows: ch.map, objs: {}, start: [3, 7], gate: null, back: null };
    ch.map.forEach((row, y) => [...row].forEach((c, x) => {
      const key = x + ',' + y;
      if (c >= '1' && c <= '9') m.objs[key] = { type: 'shrine', item: ch.shrines[+c - 1], x, y };
      else if (c === 'N') m.objs[key] = { type: 'sage', x, y };
      else if (c === 'G') { m.objs[key] = { type: 'gate', x, y }; m.gate = [x, y]; }
      else if (c === 'B') { m.objs[key] = { type: 'back', x, y }; m.back = [x, y]; }
      else if (c === 'A') m.objs[key] = { type: 'altar', x, y };
      else if (c === 'P') m.start = [x, y];
    }));
    return m;
  }
  function tileAt(x, y) { return (x < 0 || y < 0 || x >= MW || y >= MH) ? '#' : map.rows[y][x]; }
  function objAt(x, y) { return map.objs[x + ',' + y]; }
  function gateOpen() { return state.theorems.has(map.ch.theorem.id); }
  function passable(x, y) {
    const c = tileAt(x, y);
    if (c === '#' || c === '~') return false;
    const o = objAt(x, y);
    if (!o) return true;
    if (o.type === 'back') return true;
    if (o.type === 'gate') return gateOpen() && map.ch.id < CHAPTERS.length;
    return false;
  }
  function enterChapter(id, from) {
    state.chapter = id;
    map = parseMap(chapterById(id));
    if (from === 'next' && map.gate) { state.x = map.gate[0] - 1; state.y = map.gate[1]; state.dir = 'left'; }
    else if (from === 'keep') { /* セーブ位置を使う */ }
    else { state.x = map.start[0]; state.y = map.start[1]; state.dir = 'right'; }
    anim = null; path = []; pendingInteract = null;
    updateHud(); save();
  }
  function transition(id, from) {
    mode = 'fade'; sfx.door();
    const f = $('fade'); f.classList.add('on');
    setTimeout(() => {
      enterChapter(id, from);
      f.classList.remove('on');
      mode = 'walk';
      toast(map.ch.name);
      if (!state.met.has('intro' + id) && from !== 'next') { state.met.add('intro' + id); }
    }, 420);
  }

  // ------------------------------------------------------------------
  // 描画
  // ------------------------------------------------------------------
  const THEMES = {
    cape:   { floor: '#5fa85a', floor2: '#6cb565', wall: 'rock', water: '#2f6fb3', water2: '#4b8fd1', sky: '#1b2a4a' },
    pass:   { floor: '#b9a06b', floor2: '#c4ac78', wall: 'rock', water: '#2f6fb3', water2: '#4b8fd1', sky: '#3a2f25' },
    forest: { floor: '#3f7d48', floor2: '#488852', wall: 'tree', water: '#2a6a8a', water2: '#3f86a8', sky: '#12301c' },
    cave:   { floor: '#4a4658', floor2: '#524e61', wall: 'cave', water: '#1f4d73', water2: '#2f6a96', sky: '#15131c' },
    plain:  { floor: '#7fc46a', floor2: '#8bd076', wall: 'tree', water: '#3b83c9', water2: '#5aa0e0', sky: '#24512c' },
    library: { floor: '#8a6a4a', floor2: '#947452', wall: 'shelf', water: '#191428', water2: '#2a2140', sky: '#20150f' },
    tower:  { floor: '#6b5a7a', floor2: '#746384', wall: 'brick', water: '#191428', water2: '#2a2140', sky: '#150f20' },
    altar:  { floor: '#c9c3d9', floor2: '#d6d0e6', wall: 'pillar', water: '#0d0b24', water2: '#1d1a45', sky: '#0d0b24' },
  };
  let ox = 0, oy = 0;
  function R(c, x, y, w, h) { ctx.fillStyle = c; ctx.fillRect(ox + x * 2, oy + y * 2, w * 2, h * 2); }
  const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

  function drawFloor(th, x, y, c) {
    R((x + y) % 2 ? th.floor : th.floor2, 0, 0, 16, 16);
    const hsh = hash(x, y);
    if (hsh % 5 === 0) R('rgba(0,0,0,0.10)', hsh % 11 + 1, (hsh >> 4) % 11 + 2, 2, 1);
    if (hsh % 7 === 0) R('rgba(255,255,255,0.10)', (hsh >> 3) % 12 + 1, (hsh >> 6) % 12 + 1, 1, 1);
    if (c === ',') {
      const cols = ['#ffe36e', '#ff9ec7', '#ffffff'];
      for (let i = 0; i < 3; i++) {
        const fx = ((hsh >> (i * 4)) % 11) + 2, fy = ((hsh >> (i * 4 + 2)) % 10) + 3;
        R('#2f6b35', fx, fy + 1, 1, 2); R(cols[(hsh + i) % 3], fx - 1, fy, 3, 1); R(cols[(hsh + i) % 3], fx, fy - 1, 1, 3);
      }
    }
  }
  function drawWall(th, x, y) {
    const hsh = hash(x, y);
    switch (th.wall) {
      case 'tree':
        R((x + y) % 2 ? th.floor : th.floor2, 0, 0, 16, 16);
        R('#5a3d22', 7, 10, 3, 6);
        R('#1f5a2c', 2, 3, 12, 8); R('#2a7038', 3, 1, 10, 8); R('#3a8a49', 5, 2, 5, 4);
        R('#184a23', 3, 9, 10, 2);
        break;
      case 'rock':
        R((x + y) % 2 ? th.floor : th.floor2, 0, 0, 16, 16);
        R('#6c6a72', 1, 4, 14, 11); R('#8a8892', 2, 3, 11, 9); R('#a7a5af', 3, 4, 5, 3);
        R('#4c4a52', 1, 13, 14, 2);
        if (hsh % 3 === 0) R('#5d5b64', 9, 8, 4, 1);
        break;
      case 'cave':
        R('#2a2733', 0, 0, 16, 16); R('#353241', 1, 1, 14, 13); R('#423e50', 2, 2, 6, 4);
        R('#1c1a23', 0, 14, 16, 2);
        if (hsh % 4 === 0) { R('#7fd6ff', 10, 6, 2, 3); R('#c9f0ff', 10, 6, 1, 1); }
        break;
      case 'brick':
        R('#3d3050', 0, 0, 16, 16);
        for (let r = 0; r < 4; r++) for (let b = 0; b < 2; b++) R('#54436e', (b * 8 + (r % 2) * 4) % 16, r * 4, 7, 3);
        R('#2a2038', 0, 15, 16, 1);
        break;
      case 'shelf': {
        R('#3b2616', 0, 0, 16, 16); R('#5a3d22', 0, 0, 16, 1); R('#5a3d22', 0, 7, 16, 1); R('#5a3d22', 0, 14, 16, 2);
        const cols = ['#b5483b', '#3f6fb0', '#4f9a5a', '#c9a23f', '#7d5aa8', '#d9d2c0'];
        for (let r = 0; r < 2; r++) for (let b = 0; b < 7; b++) {
          const hh = 4 + ((hsh >> (b + r * 7)) & 1);
          R(cols[(hsh >> (b * 2 + r * 3)) % 6], 1 + b * 2, 1 + r * 7 + (6 - hh), 2, hh);
        }
        break;
      }
      case 'pillar':
        R('#0d0b24', 0, 0, 16, 16);
        if (y > 0 && y < MH - 1 && x > 0 && x < MW - 1) {
          R('#c9c3d9', 0, 0, 16, 16); R('#8f89a8', 3, 0, 10, 16); R('#e9e5f5', 5, 0, 3, 16); R('#6f6a88', 2, 0, 12, 2); R('#6f6a88', 2, 14, 12, 2);
        } else if (hsh % 3 === 0) { R('#fff', hsh % 13 + 1, (hsh >> 5) % 13 + 1, 1, 1); }
        break;
    }
  }
  function drawWater(th, x, y, t) {
    R(th.water, 0, 0, 16, 16);
    if (th === THEMES.altar || th === THEMES.tower) {
      const hsh = hash(x, y);
      const tw = (Math.floor(t / 400) + hsh) % 5;
      if (hsh % 2 === 0) R(tw === 0 ? '#ffffff' : '#8d86c9', hsh % 13 + 1, (hsh >> 5) % 13 + 1, 1, 1);
      if (hsh % 5 === 0) R('#5e56a8', (hsh >> 3) % 13 + 1, (hsh >> 8) % 13 + 1, 1, 1);
      return;
    }
    const ph = Math.floor(t / 350 + x + y * 2) % 4;
    R(th.water2, (ph * 4) % 16, 4, 5, 1); R(th.water2, (ph * 4 + 8) % 16, 11, 4, 1);
  }
  function drawShrine(o, t) {
    const got = state.items.has(o.item);
    R('rgba(0,0,0,0.25)', 2, 14, 12, 2);
    R('#77737f', 3, 10, 10, 5); R('#9a96a3', 2, 9, 12, 2); R('#5a5661', 3, 14, 10, 1);
    R('#b9b5c4', 4, 11, 2, 3); R('#b9b5c4', 10, 11, 2, 3);
    const bob = got ? 0 : Math.round(Math.sin(t / 300 + o.x) * 1);
    const col = got ? '#ffd45e' : '#6fd0ff';
    R(got ? 'rgba(255,212,94,0.35)' : 'rgba(111,208,255,0.3)', 3, 0 + bob, 10, 9);
    R(col, 5, 1 + bob, 6, 7); R(col, 4, 2 + bob, 8, 5);
    ctx.fillStyle = '#1a1830'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(got ? itemById[o.item].icon[0] : '?', ox + 16, oy + 10 + bob * 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  function drawSage(o, t) {
    const b = Math.floor(t / 600) % 2;
    R('rgba(0,0,0,0.25)', 3, 14, 10, 2);
    R('#5b3fa0', 4, 7, 8, 8); R('#7556c2', 5, 8, 2, 6); R('#3f2a78', 4, 14, 8, 1);
    R('#f0c9a0', 5, 4, 6, 4); R('#1a1830', 6, 5, 1, 1); R('#1a1830', 9, 5, 1, 1);
    R('#f2f2f2', 5, 7, 6, 3 + b); R('#f2f2f2', 6, 10 + b, 4, 1);
    R('#5b3fa0', 4, 3, 8, 1); R('#5b3fa0', 5, 2, 6, 1); R('#5b3fa0', 6, 1, 4, 1); R('#5b3fa0', 7, 0, 2, 1); R('#ffd45e', 4, 3, 8, 1);
    R('#8a5a2b', 13, 3, 1, 12); R('#6fd0ff', 12, 1, 3, 3);
  }
  function drawGate(o, t, open) {
    R('#4a4658', 0, 0, 16, 16); R('#6b6780', 1, 1, 14, 15); R('#8f8ba6', 2, 1, 12, 2);
    if (open) {
      R('#fff3b0', 3, 3, 10, 13); R('#ffe36e', 4, 4, 8, 12);
      const p = Math.floor(t / 200) % 4; R('#ffffff', 5 + p, 6 + (p * 3) % 7, 1, 1); R('#ffffff', 10 - p, 12 - p, 1, 1);
    } else {
      R('#6b4a2b', 3, 3, 10, 13); R('#8a6238', 4, 4, 4, 12); R('#8a6238', 9, 4, 3, 12);
      R('#ffd45e', 7, 8, 3, 3); R('#1a1830', 8, 9, 1, 1);
    }
  }
  function drawBack() {
    R('#4a4658', 0, 0, 16, 16); R('#6b6780', 1, 1, 14, 15); R('#23202e', 3, 3, 10, 13); R('#3a3650', 4, 4, 8, 12);
    R('#9a96a3', 9, 9, 3, 1); R('#9a96a3', 9, 8, 1, 3);
  }
  function drawAltar(o, t) {
    const done = state.theorems.has('grh');
    R('rgba(0,0,0,0.25)', 0, 14, 16, 2);
    R('#8f89a8', 0, 11, 16, 4); R('#b7b1cf', 1, 9, 14, 3); R('#ffd45e', 1, 9, 14, 1);
    const g = Math.round(Math.sin(t / 250) * 1);
    R(done ? 'rgba(255,212,94,0.5)' : 'rgba(160,140,255,0.4)', 3, -2 + g, 10, 11);
    R(done ? '#ffd45e' : '#b9a8ff', 5, 0 + g, 6, 8); R('#ffffff', 6, 1 + g, 2, 2);
    ctx.fillStyle = '#1a1830'; ctx.font = 'bold 12px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ζ', ox + 16, oy + 9 + g * 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  function drawHero(dir, frame) {
    R('rgba(0,0,0,0.28)', 3, 14, 10, 2);
    const l = frame === 1 ? 1 : 0, r = frame === 2 ? 1 : 0;
    R('#2b2d5c', 5, 12, 2, 3 - l); R('#2b2d5c', 9, 12, 2, 3 - r);       // 脚
    R('#c0392b', 4, 7, 8, 6); R('#e25b4a', 5, 8, 6, 2);                 // 服
    R('#ffd45e', 4, 11, 8, 1);                                          // ベルト
    R('#f0c9a0', 3, 8, 1, 3); R('#f0c9a0', 12, 8, 1, 3);                // 腕
    R('#f0c9a0', 5, 3, 6, 5);                                           // 顔
    R('#3b2a1a', 4, 1, 8, 3); R('#3b2a1a', 4, 3, 1, 2); R('#3b2a1a', 11, 3, 1, 2); // 髪
    if (dir === 'down') { R('#1a1830', 6, 5, 1, 1); R('#1a1830', 9, 5, 1, 1); }
    else if (dir === 'left') { R('#1a1830', 5, 5, 1, 1); R('#3b2a1a', 9, 3, 3, 4); }
    else if (dir === 'right') { R('#1a1830', 10, 5, 1, 1); R('#3b2a1a', 4, 3, 3, 4); }
    else { R('#3b2a1a', 4, 3, 8, 4); }
  }

  function render(t) {
    if (!map) { ctx.fillStyle = '#0d0b24'; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }
    const th = THEMES[map.ch.theme];
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      ox = x * TILE; oy = y * TILE;
      const c = tileAt(x, y);
      if (c === '#') drawWall(th, x, y);
      else if (c === '~') drawWater(th, x, y, t);
      else drawFloor(th, x, y, c);
    }
    // オブジェクトと主人公を y 順に描く
    let hx = state.x * TILE, hy = state.y * TILE, frame = 0;
    if (anim) {
      const k = Math.min(1, (t - anim.t0) / anim.dur);
      hx = (anim.fx + (state.x - anim.fx) * k) * TILE; hy = (anim.fy + (state.y - anim.fy) * k) * TILE;
      frame = k < 0.5 ? 1 : 2;
    }
    const list = Object.values(map.objs).map((o) => ({ y: o.y * TILE, o }));
    list.push({ y: hy + 1, hero: true });
    list.sort((a, b) => a.y - b.y);
    for (const e of list) {
      if (e.hero) { ox = hx; oy = hy - 4; drawHero(state.dir, frame); continue; }
      const o = e.o; ox = o.x * TILE; oy = o.y * TILE;
      if (o.type === 'shrine') drawShrine(o, t);
      else if (o.type === 'sage') drawSage(o, t);
      else if (o.type === 'gate') drawGate(o, t, gateOpen());
      else if (o.type === 'back') drawBack();
      else if (o.type === 'altar') drawAltar(o, t);
    }
    // 経路の目印
    if (path.length) {
      const [px, py] = path[path.length - 1];
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
      ctx.strokeRect(px * TILE + 4, py * TILE + 4, TILE - 8, TILE - 8);
    }
  }

  // ------------------------------------------------------------------
  // 移動と操作
  // ------------------------------------------------------------------
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };

  function tryStep(dir, now) {
    state.dir = dir;
    const [dx, dy] = DIRS[dir];
    const nx = state.x + dx, ny = state.y + dy;
    if (!passable(nx, ny)) return false;
    anim = { fx: state.x, fy: state.y, t0: now, dur: 130 };
    state.x = nx; state.y = ny;
    return true;
  }
  function onArrive() {
    const o = objAt(state.x, state.y);
    if (o && o.type === 'gate') { transition(state.chapter + 1, 'start'); return; }
    if (o && o.type === 'back') { transition(state.chapter - 1, 'next'); return; }
    save();
  }
  function bfs(tx, ty) {
    const prev = {}; const q = [[state.x, state.y]]; prev[state.x + ',' + state.y] = null;
    while (q.length) {
      const [x, y] = q.shift();
      if (x === tx && y === ty) { const out = []; let k = x + ',' + y; while (prev[k]) { out.unshift(k.split(',').map(Number)); k = prev[k]; } return out; }
      for (const d of Object.values(DIRS)) {
        const nx = x + d[0], ny = y + d[1], k = nx + ',' + ny;
        if (k in prev || !passable(nx, ny)) continue;
        prev[k] = x + ',' + y; q.push([nx, ny]);
      }
    }
    return null;
  }
  function dirTo(fx, fy, tx, ty) { return tx > fx ? 'right' : tx < fx ? 'left' : ty > fy ? 'down' : 'up'; }
  function clickTile(tx, ty) {
    if (mode !== 'walk') return;
    const o = objAt(tx, ty);
    pendingInteract = null;
    if (o && !passable(tx, ty)) {
      // 隣まで歩いて調べる
      let best = null;
      for (const d of Object.values(DIRS)) {
        const ax = tx + d[0], ay = ty + d[1];
        if (!passable(ax, ay)) continue;
        const p = (ax === state.x && ay === state.y) ? [] : bfs(ax, ay);
        if (p && (!best || p.length < best.length)) best = p;
      }
      if (best) { path = best; pendingInteract = [tx, ty]; }
      return;
    }
    const p = bfs(tx, ty);
    if (p) path = p;
  }
  function update(now) {
    if (anim && now - anim.t0 >= anim.dur) { anim = null; onArrive(); }
    if (mode !== 'walk' || anim) return;
    let dir = null;
    for (const k of keys) if (KEYMAP[k]) dir = KEYMAP[k];
    if (dir) { path = []; pendingInteract = null; tryStep(dir, now); return; }
    if (path.length) {
      const [nx, ny] = path.shift();
      if (!tryStep(dirTo(state.x, state.y, nx, ny), now)) path = [];
      return;
    }
    if (pendingInteract) {
      const [tx, ty] = pendingInteract; pendingInteract = null;
      state.dir = dirTo(state.x, state.y, tx, ty);
      interact();
    }
  }

  function interact() {
    if (mode !== 'walk' || anim) return;
    const [dx, dy] = DIRS[state.dir];
    const o = objAt(state.x + dx, state.y + dy);
    if (!o) return;
    const ch = map.ch;
    if (o.type === 'sage') {
      const missing = ch.shrines.filter((s) => !state.items.has(s));
      const pages = ch.sage.map((t) => ['賢者', t]);
      if (state.met.has('sage' + ch.id)) {
        if (ch.theme === 'altar') pages.splice(0, pages.length, ['賢者', state.theorems.has('grh') ? '見事じゃった。証明の全体像は「証明ノート」でいつでも振り返れるぞ。' : '北の祭壇へ行きなさい。手にした定理を正しい順に組み上げるのじゃ。']);
        else if (missing.length) pages.splice(0, pages.length, ['賢者', `まだ見つけていない概念が ${missing.length} つある。光る祠を調べなさい。`]);
        else if (!gateOpen()) pages.splice(0, pages.length, ['賢者', 'すべて揃ったな。東の門番のところへ行きなさい。']);
        else pages.splice(0, pages.length, ['賢者', '門は開いておる。先へ進みなさい。']);
      }
      state.met.add('sage' + ch.id); save();
      dialog(pages);
    } else if (o.type === 'shrine') {
      const it = itemById[o.item];
      if (state.items.has(o.item)) dialog([['祠', `『${it.name}』の祠。もう力は受け取っている。`], [it.name, it.desc]]);
      else openPuzzle(o.item);
    } else if (o.type === 'altar') {
      if (state.theorems.has('grh')) dialog([['祭壇', '祭壇は静かに輝いている。Q.E.D.']], showEnding);
      else openPuzzle('final');
    } else if (o.type === 'gate') {
      gateTalk();
    }
  }

  function gateTalk() {
    const ch = map.ch, th = ch.theorem;
    if (gateOpen()) { dialog([['門番', '門は開いている。進むがよい。']]); return; }
    const missing = ch.shrines.filter((s) => !state.items.has(s));
    if (missing.length) {
      sfx.bad();
      dialog([['門番', `この先へ進むには『${th.name}』が要る。`], ['門番', `だが、そのための概念がまだ ${missing.length} つ足りぬ。この地の祠をすべて巡ってくるのだ。`]]);
      return;
    }
    const pages = th.synthesis.map((t) => ['門番', t]);
    dialog(pages, () => {
      state.theorems.add(th.id); save(); updateHud(); sfx.theorem();
      dialog([['★ 定理を得た', `『${th.name}』\n${th.statement}`], ['門番', '門を開こう。証明の次の一歩へ進むがよい。']]);
    });
  }

  // ------------------------------------------------------------------
  // 会話
  // ------------------------------------------------------------------
  let dq = [], dcb = null;
  function dialog(pages, cb) {
    dq = pages.slice(); dcb = cb || null; mode = 'dialog'; keys.clear();
    $('dialog').hidden = false; nextPage();
  }
  function nextPage() {
    if (!dq.length) {
      $('dialog').hidden = true; mode = 'walk';
      const cb = dcb; dcb = null; if (cb) cb();
      return;
    }
    const [who, text] = dq.shift();
    $('dialog-who').textContent = who; $('dialog-text').textContent = text;
    sfx.talk();
  }
  let toastTimer = null;
  function toast(text) {
    const t = $('toast'); t.textContent = text; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  }

  // ------------------------------------------------------------------
  // パズル
  // ------------------------------------------------------------------
  let current = null;
  function openPuzzle(id) {
    const pz = PUZZLES[id]; if (!pz) return;
    mode = 'puzzle'; keys.clear();
    const it = itemById[id];
    $('modal-title').textContent = pz.title + (it ? ` ― ${it.name}` : '');
    $('modal-intro').innerHTML = pz.intro;
    const body = $('modal-body'); body.innerHTML = '';
    const msg = $('modal-msg'); msg.textContent = ''; msg.className = '';
    current = { id, pz, ctl: pz.build(body) };
    const foot = $('modal-foot'); foot.innerHTML = '';
    const mk = (label, cls, fn) => { const b = document.createElement('button'); b.textContent = label; b.className = cls; b.addEventListener('click', fn); foot.appendChild(b); return b; };
    mk('判定する', 'primary', checkPuzzle);
    mk('ヒント', '', () => { msg.textContent = 'ヒント: ' + pz.hint; msg.className = 'hint'; });
    mk('やめる', '', () => closeModal());
    if (debug) mk('[debug] 正解をセット', 'debug', () => { current.ctl.cheat(); msg.textContent = '正解をセットした。「判定する」で確認できる。'; msg.className = 'hint'; });
    $('modal').hidden = false;
  }
  function checkPuzzle() {
    if (!current) return;
    const r = current.ctl.check();
    const msg = $('modal-msg');
    if (!r.ok) { msg.textContent = r.msg; msg.className = 'bad'; sfx.bad(); return; }
    const id = current.id;
    closeModal();
    if (id === 'final') { finishGame(); return; }
    const it = itemById[id];
    state.items.add(id); save(); updateHud(); sfx.item();
    const left = map.ch.shrines.filter((s) => !state.items.has(s)).length;
    dialog([
      ['★ 概念を得た', `『${it.name}』を手に入れた!`],
      [it.name, it.desc],
      ['', left ? `この章の残りの祠: ${left}` : 'この章の概念がすべて揃った。東の門番のところへ行こう。'],
    ]);
  }
  function closeModal() { $('modal').hidden = true; current = null; if (mode === 'puzzle' || mode === 'menu') mode = 'walk'; }

  function finishGame() {
    const th = CHAPTERS[CHAPTERS.length - 1].theorem;
    state.theorems.add('main'); state.theorems.add(th.id); state.cleared = true; save(); updateHud(); sfx.theorem();
    dialog([
      ['祭壇', '6 枚のカードが正しい順に並び、祭壇がまばゆく輝く……'],
      ['★ 定理を得た', '『主不等式』\n主量 ≤ (V + 2δ)/dim ≤ 主量 − (n/dim)·m·rem。主量は打ち消し合う。'],
      ['★ 定理を得た', `『${th.name}』\n${th.statement}`],
      ['賢者', 'Q.E.D. ―― おぬしは証明の道筋を最後まで歩ききった。'],
    ], showEnding);
  }
  function showEnding() {
    mode = 'menu';
    $('modal-title').textContent = 'Q.E.D. ― 旅の終わり';
    $('modal-intro').innerHTML =
      'すべてのディリクレ指標 χ について、<b>Re s &gt; 1/2 で L(s, χ) ≠ 0</b>。<br>とくに ζ の非自明な零点はすべて Re s = 1/2 上にある。';
    $('modal-body').innerHTML =
      `<p>集めた概念: <b>${state.items.size} / ${ITEMS.length}</b>　得た定理: <b>${state.theorems.size}</b></p>` +
      '<p class="pz-note">このゲームのパズルは、証明に現れる概念の<b>小さな模型</b>です。本物の証明は約 30 万行の Lean 4 コードで、' +
      'テータリフト、ガロア表現、p 進ホッジ理論など、ここでは触れきれない膨大な理論の上に成り立っています。</p>' +
      '<p class="pz-note">参考にした証明: Lean 4 による形式化 (grh-lean/grh)。README によれば証明は Levent Alpöge 氏 (Claude と共同) によるもの。</p>';
    $('modal-msg').textContent = ''; $('modal-msg').className = '';
    const foot = $('modal-foot'); foot.innerHTML = '';
    const b = document.createElement('button'); b.textContent = '世界に戻る'; b.className = 'primary'; b.addEventListener('click', closeModal); foot.appendChild(b);
    $('modal').hidden = false;
  }

  // ------------------------------------------------------------------
  // メニュー (もちもの / 証明ノート)
  // ------------------------------------------------------------------
  function openMenu(kind) {
    if (mode !== 'walk') return;
    mode = 'menu'; keys.clear();
    const body = $('modal-body'); body.innerHTML = '';
    $('modal-msg').textContent = ''; $('modal-msg').className = '';
    if (kind === 'items') {
      $('modal-title').textContent = 'もちもの ― 集めた概念';
      $('modal-intro').textContent = 'アイテムを選ぶと説明が表示される。';
      const detail = document.createElement('div'); detail.className = 'inv-detail';
      for (const ch of CHAPTERS) {
        if (!ch.shrines.length) continue;
        const sec = document.createElement('div'); sec.className = 'inv-sec';
        const hd = document.createElement('div'); hd.className = 'inv-head'; hd.textContent = ch.name; sec.appendChild(hd);
        const row = document.createElement('div'); row.className = 'inv-row';
        for (const id of ch.shrines) {
          const it = itemById[id], got = state.items.has(id);
          const b = document.createElement('button'); b.className = 'inv-item' + (got ? ' got' : '');
          b.innerHTML = `<span class="inv-icon">${got ? it.icon : '?'}</span><span>${got ? it.name : '？？？'}</span>`;
          b.addEventListener('click', () => {
            detail.innerHTML = got ? `<b>${it.name}</b><p>${it.desc}</p><code>${it.lean}</code>` : '<p>まだ手に入れていない。</p>';
          });
          row.appendChild(b);
        }
        sec.appendChild(row); body.appendChild(sec);
      }
      body.appendChild(detail);
    } else {
      $('modal-title').textContent = '証明ノート';
      $('modal-intro').textContent = '門をくぐるたびに、証明の一歩がここに書き込まれる。';
      for (const ch of CHAPTERS) {
        const th = ch.theorem, got = state.theorems.has(th.id);
        const d = document.createElement('div'); d.className = 'note' + (got ? ' got' : '');
        d.innerHTML = `<div class="note-head">${got ? '✔' : '□'} ${ch.name} ― ${got ? th.name : '？？？'}</div>` +
          (got ? `<p>${th.statement}</p><code>${th.lean}</code>` : `<p>必要な概念: ${ch.shrines.length ? ch.shrines.map((s) => (state.items.has(s) ? itemById[s].name : '？？？')).join('、') : 'これまでのすべての定理'}</p>`);
        body.appendChild(d);
      }
    }
    const foot = $('modal-foot'); foot.innerHTML = '';
    const b = document.createElement('button'); b.textContent = 'とじる'; b.className = 'primary'; b.addEventListener('click', closeModal); foot.appendChild(b);
    $('modal').hidden = false;
  }

  // ------------------------------------------------------------------
  // デバッグメニュー (?debug を付けて開いたときだけ)
  // ------------------------------------------------------------------
  function debugJump(c, opts) {
    // 第 c 章の入口へ。それより前の章はクリア済み、c 章以降は未取得の状態にする
    state.items = new Set(); state.theorems = new Set(); state.met = new Set(); state.cleared = false;
    for (const ch of CHAPTERS) if (ch.id < c) { ch.shrines.forEach((x) => state.items.add(x)); state.theorems.add(ch.theorem.id); }
    if (opts && opts.clear) { const ch = chapterById(c); ch.shrines.forEach((x) => state.items.add(x)); if (ch.theme !== 'altar') state.theorems.add(ch.theorem.id); }
    enterChapter(c, 'start'); $('title').hidden = true; $('dialog').hidden = true; mode = 'walk';
  }
  function openDebugMenu() {
    if (mode !== 'walk') return;
    mode = 'menu'; keys.clear();
    $('modal-title').textContent = 'デバッグメニュー';
    $('modal-intro').textContent = 'デバッグモード中はセーブデータを読み書きしない。通常のプレイには影響しない。';
    $('modal-msg').textContent = ''; $('modal-msg').className = '';
    const body = $('modal-body'); body.innerHTML = '';
    const btn = (label, fn, cls) => { const b = document.createElement('button'); b.textContent = label; b.className = 'dbg-btn ' + (cls || ''); b.addEventListener('click', fn); return b; };
    const sec = (title) => { const h = document.createElement('div'); h.className = 'inv-head'; h.textContent = title; body.appendChild(h); const r = document.createElement('div'); r.className = 'inv-row'; body.appendChild(r); return r; };
    let r = sec('章の入口へ移動 (前の章まではクリア済み、その章は未着手)');
    for (const ch of CHAPTERS) r.appendChild(btn(ch.name, () => { closeModal(); debugJump(ch.id); toast(ch.name); }));
    r = sec('章をクリア済みにして移動 (概念をすべて取得し、門が開いた状態)');
    for (const ch of CHAPTERS) if (ch.theme !== 'altar') r.appendChild(btn(ch.name, () => { closeModal(); debugJump(ch.id, { clear: true }); toast(ch.name + ' (クリア済み)'); }));
    for (const ch of CHAPTERS) {
      if (!ch.shrines.length) continue;
      r = sec('パズルを開く ― ' + ch.name);
      for (const id of ch.shrines) r.appendChild(btn((state.items.has(id) ? '✔ ' : '') + itemById[id].name, () => { closeModal(); if (state.chapter !== ch.id) debugJump(ch.id); state.items.delete(id); updateHud(); openPuzzle(id); }));
    }
    r = sec('終章');
    r.appendChild(btn('祭壇のパズルを開く', () => { closeModal(); debugJump(CHAPTERS.length); openPuzzle('final'); }));
    r.appendChild(btn('エンディングを見る', () => { closeModal(); debugJump(CHAPTERS.length); finishGame(); }));
    r = sec('いまの章');
    r.appendChild(btn('この章の概念をすべて取得', () => { map.ch.shrines.forEach((x) => state.items.add(x)); updateHud(); closeModal(); toast('概念を取得した'); }));
    r.appendChild(btn('門番の会話 (定理の獲得) を見る', () => { closeModal(); if (map.ch.theme === 'altar') return; map.ch.shrines.forEach((x) => state.items.add(x)); state.theorems.delete(map.ch.theorem.id); updateHud(); gateTalk(); }));
    r.appendChild(btn('賢者の最初の会話を見る', () => { closeModal(); dialog(map.ch.sage.map((t) => ['賢者', t])); }));
    const foot = $('modal-foot'); foot.innerHTML = '';
    foot.appendChild(btn('とじる', closeModal, 'primary'));
    $('modal').hidden = false;
  }

  function updateHud() {
    if (!map) return;
    const ch = map.ch;
    $('hud-chapter').textContent = ch.name;
    const n = ch.shrines.filter((s) => state.items.has(s)).length;
    $('hud-items').textContent = ch.shrines.length ? `概念 ${n}/${ch.shrines.length}` : '';
    $('hud-total').textContent = `定理 ${[...state.theorems].filter((t) => t !== 'main').length}/${CHAPTERS.length}`;
  }

  // ------------------------------------------------------------------
  // 入力
  // ------------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (mode === 'title') return;
    if (KEYMAP[e.key]) { if (mode === 'walk') keys.add(e.key); e.preventDefault(); return; }
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'z' || e.key === 'Z') {
      if (mode === 'puzzle' || mode === 'menu') return;
      e.preventDefault();
      if (e.repeat) return;
      if (mode === 'dialog') nextPage(); else interact();
    } else if (e.key === 'Escape') {
      if (mode === 'puzzle' || mode === 'menu') closeModal();
    } else if (e.key === 'i' || e.key === 'I') openMenu('items');
    else if (e.key === 'n' || e.key === 'N') openMenu('notes');
    else if (debug && e.key === '0') openDebugMenu();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    clickTile(Math.floor((e.clientX - r.left) / r.width * MW), Math.floor((e.clientY - r.top) / r.height * MH));
  });
  $('dialog').addEventListener('click', () => { if (mode === 'dialog') nextPage(); });
  $('btn-items').addEventListener('click', () => openMenu('items'));
  $('btn-notes').addEventListener('click', () => openMenu('notes'));
  $('btn-sound').addEventListener('click', () => { soundOn = !soundOn; $('btn-sound').textContent = soundOn ? '♪ ON' : '♪ OFF'; });
  document.querySelectorAll('#dpad [data-dir]').forEach((b) => {
    const key = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[b.dataset.dir];
    const on = (e) => { e.preventDefault(); if (mode === 'walk') keys.add(key); };
    const off = (e) => { e.preventDefault(); keys.delete(key); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
  });
  $('dpad-act').addEventListener('click', () => { if (mode === 'dialog') nextPage(); else interact(); });

  // ------------------------------------------------------------------
  // タイトルと起動
  // ------------------------------------------------------------------
  function startGame(fresh) {
    if (fresh) {
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 無視 */ }
      Object.assign(state, { chapter: 1, dir: 'down', cleared: false });
      state.items = new Set(); state.theorems = new Set(); state.met = new Set();
      enterChapter(1, 'start');
    } else if (load()) enterChapter(state.chapter, 'keep');
    else enterChapter(1, 'start');
    $('title').hidden = true; mode = 'walk';
    if (fresh || !state.met.size) {
      dialog([
        ['', '素数の並びに潜む秩序 ―― リーマン予想。'],
        ['', 'その証明は、数えきれない概念を積み上げた長い長い道のりである。'],
        ['', 'あなたは証明をたどる旅人。祠で概念の具体例を自らの手で構成し、門をくぐって証明を一歩ずつ進めよう。'],
        ['', 'まずは近くの賢者に話しかけてみよう。(移動: 矢印キー / クリック、調べる: スペース)'],
      ]);
    } else toast(map.ch.name);
  }
  $('btn-new').addEventListener('click', () => {
    if (hasSave() && !window.confirm('セーブデータを消して最初から始めますか?')) return;
    startGame(true);
  });
  $('btn-continue').addEventListener('click', () => startGame(false));
  $('btn-continue').hidden = !hasSave();

  function loop(t) { update(t); render(t); requestAnimationFrame(loop); }

  // デバッグモード: URL に ?debug を付ける。HUD に「デバッグ」ボタンが出て、章の移動やパズルの直接起動ができる。
  //   ?debug&ch=4          第 4 章の入口から (前の章まではクリア済み)
  //   ?debug&puzzle=theta  そのパズルを直接開く (cheat=1 を足すと正解をセットした状態で開く)
  // ?ch= や ?puzzle= だけでもデバッグモードになる。
  const qs = new URLSearchParams(location.search);
  if (qs.has('debug') || qs.has('ch') || qs.has('puzzle')) {
    debug = true;
    $('btn-debug').hidden = false;
    $('btn-debug').addEventListener('click', openDebugMenu);
    const pid = qs.get('puzzle');
    const pch = pid && itemById[pid] ? itemById[pid].chapter : pid === 'final' ? CHAPTERS.length : 1;
    debugJump(Math.max(1, Math.min(CHAPTERS.length, +(qs.get('ch') || pch))));
    if (pid) openPuzzle(pid);
    if (qs.has('cheat') && current) current.ctl.cheat();
    if (qs.has('menu')) { if (qs.get('menu') === 'debug') openDebugMenu(); else openMenu(qs.get('menu')); }
  } else {
    map = parseMap(chapterById(1));
  }
  window.__game = { state, openPuzzle, interact, clickTile, get mode() { return mode; }, get current() { return current; }, checkPuzzle };
  requestAnimationFrame(loop);
})();
