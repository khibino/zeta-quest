// パズル: 各アイテム (概念) の具体例をプレイヤーに構成させる。
// PuzzleLogic は DOM に依存しない純粋な判定ロジック (node でテストする)。
(function (root) {
  'use strict';

  // =====================================================================
  // 判定ロジック
  // =====================================================================
  const L = {};

  L.mod = (a, n) => ((a % n) + n) % n;
  L.smallestFactor = (n) => {
    for (let i = 2; i * i <= n; i++) if (n % i === 0) return i;
    return n;
  };
  L.isPrime = (n) => n >= 2 && L.smallestFactor(n) === n;
  L.gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

  // ルジャンドル記号 (n/p)
  L.legendre = (n, p) => {
    n = L.mod(n, p);
    if (n === 0) return 0;
    for (let x = 1; x < p; x++) if ((x * x) % p === n) return 1;
    return -1;
  };

  // 法 7 の指標の表 vals[1..6] (±1) が乗法的かつ非自明か
  L.checkCharacter = (vals, p = 7) => {
    for (let a = 1; a < p; a++) for (let b = a; b < p; b++) {
      const c = (a * b) % p;
      if (vals[a] * vals[b] !== vals[c]) return { ok: false, kind: 'mult', a, b, c };
    }
    let trivial = true;
    for (let a = 1; a < p; a++) if (vals[a] !== 1) trivial = false;
    if (trivial) return { ok: false, kind: 'trivial' };
    return { ok: true };
  };

  // Λ(n) = log p となる p (素数べきでなければ 1)
  L.mangoldtPrime = (n) => {
    if (n < 2) return 1;
    const p = L.smallestFactor(n);
    while (n % p === 0) n /= p;
    return n === 1 ? p : 1;
  };
  // choice[n] = p (Λ(n)=log p) または 1 (Λ(n)=0)。Σ_{d|n} Λ(d) = log n を n=2..max で確認。
  L.checkMangoldt = (choice, max = 12) => {
    const bad = [];
    for (let n = 2; n <= max; n++) {
      let prod = 1;
      for (let d = 2; d <= n; d++) if (n % d === 0) prod *= choice[d];
      if (prod !== n) bad.push(n);
    }
    return bad;
  };

  // λ(n) = Λ(n)(1 − χ_d(n)) [n ≡ 1 mod q] が 0 でない n ≤ max
  L.lambdaSupport = (q, d, max) => {
    const out = [];
    for (let n = 2; n <= max; n++) {
      if (n % q !== 1) continue;
      if (L.mangoldtPrime(n) === 1) continue;
      if (L.legendre(n, d) === 1) continue;
      out.push(n);
    }
    return out;
  };

  // ℚ(√−7) の整数環 ℤ[ω], ω = (1+√−7)/2 のノルム
  L.norm7 = (x, y) => x * x + x * y + 2 * y * y;

  L.unitsMod = (n) => {
    const out = [];
    for (let a = 1; a < n; a++) if (L.gcd(a, n) === 1) out.push(a);
    return out;
  };
  L.placeKind = (u, q0) => (u % q0 === 1 ? 'a' : u % q0 === q0 - 1 ? 'b' : '-');

  // 3 項等差数列を探す (なければ null)
  L.findAP3 = (arr) => {
    const s = new Set(arr);
    const v = [...s].sort((a, b) => a - b);
    for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
      const c = 2 * v[j] - v[i];
      if (s.has(c)) return [v[i], v[j], c];
    }
    return null;
  };

  // n! における素数 p の指数 (ルジャンドルの公式)
  L.factorialExp = (n, p) => { let e = 0; for (let q = p; q <= n; q *= p) e += Math.floor(n / q); return e; };

  // 長さ 4 の巡回行列の行列式 = フーリエ係数の積
  L.circulant4 = (p) => {
    const s = p[0] + p[1] + p[2] + p[3];
    const alt = p[0] - p[1] + p[2] - p[3];
    const re = p[0] - p[2], im = p[1] - p[3];
    return { s, alt, re, im, det: s * alt * (re * re + im * im) || 0 };
  };

  // 位数 n の巡回群の指標 χ(g) = ζ_n^k について、χ^j (1≤j≤m) がすべて非自明か
  L.isMFold = (k, n, m) => { for (let j = 1; j <= m; j++) if ((j * k) % n === 0) return false; return true; };

  L.dot = (u, v) => u.reduce((s, x, i) => s + x * v[i], 0);
  L.gram2 = (u, v) => [[L.dot(u, u), L.dot(u, v)], [L.dot(v, u), L.dot(v, v)]];

  // F_3^2 上の線形条件 [a,b] (a·c1 + b·c2 ≡ 0) をすべてみたす点
  L.selmerSolutions = (conds) => {
    const out = [];
    for (let c1 = 0; c1 < 3; c1++) for (let c2 = 0; c2 < 3; c2++) {
      if (conds.every(([a, b]) => (a * c1 + b * c2) % 3 === 0)) out.push([c1, c2]);
    }
    return out;
  };

  // 3×3 の盤で 90° 回転群 C4 による軌道和 (ポアンカレ級数)
  L.poincareSum = (seed) => {
    const out = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      let rr = r, cc = c, sum = 0;
      for (let g = 0; g < 4; g++) { sum += seed[rr * 3 + cc]; [rr, cc] = [cc, 2 - rr]; }
      out[r * 3 + c] = sum;
    }
    return out;
  };

  // --- 追加の概念用 ---
  // f(x) = x² + x + 2 (根は ω = (−1+√−7)/2。K = ℚ(√−7) を定める方程式)
  L.fK = (x) => x * x + x + 2;
  L.rootsMod = (m) => { const out = []; for (let x = 0; x < m; x++) if (L.fK(x) % m === 0) out.push(x); return out; };
  // n の素因数分解 [[p, e], …]
  L.factorize = (n) => { const out = []; for (let p = 2; n > 1; p++) { let e = 0; while (n % p === 0) { n /= p; e++; } if (e) out.push([p, e]); } return out; };
  // 2×2 行列 [a,b,c,d]
  L.mul2 = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
  L.pow2 = (A, n) => { let R = [1, 0, 0, 1]; for (let i = 0; i < n; i++) R = L.mul2(R, A); return R; };
  L.isId2 = (A) => A[0] === 1 && A[1] === 0 && A[2] === 0 && A[3] === 1;
  // C₂ = ⟨σ⟩ が ℤ/n に a 倍で作用するとき、c(σ) = m の種類: 'x' コサイクルでない / '0' コバウンダリ / '*' 非自明な類
  L.cocycleKind = (m, n, a) => {
    if (((1 + a) * m) % n !== 0) return 'x';
    for (let k = 0; k < n; k++) if (L.mod((a - 1) * k, n) === m) return '0';
    return '*';
  };
  L.val2 = (v, cap) => { if (v === 0) return cap; let e = 0; while (v % 2 === 0) { v /= 2; e++; } return e; };

  L.matVec = (K, f) => K.map((row) => L.dot(row, f));
  L.transpose = (K) => K[0].map((_, j) => K.map((row) => row[j]));

  // =====================================================================
  // UI ヘルパ
  // =====================================================================
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === 'class') e.className = props[k];
      else if (k === 'html') e.innerHTML = props[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]);
      else if (k === 'style') e.style.cssText = props[k];
      else e.setAttribute(k, props[k]);
    }
    for (const kid of kids.flat()) {
      if (kid == null) continue;
      e.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return e;
  }
  const sup = (n) => String(n).split('').map((c) => ({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }[c])).join('');
  const sgn = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + (-n) : '0');
  const fmt = (n) => (n < 0 ? '−' + (-n) : String(n));

  // 値を順に切り替えるボタン
  function cycler(values, labels, init, onchange, cls) {
    let i = Math.max(0, values.indexOf(init));
    const b = h('button', { class: 'pz-cycle ' + (cls || ''), type: 'button' });
    const show = () => { b.textContent = labels[i]; b.dataset.v = String(values[i]); };
    b.addEventListener('click', () => { i = (i + 1) % values.length; show(); onchange(values[i]); });
    b.set = (v) => { i = Math.max(0, values.indexOf(v)); show(); };
    show();
    return b;
  }
  // − 値 + のステッパ
  function stepper(min, max, init, onchange, format) {
    let v = init;
    const f = format || fmt;
    const val = h('span', { class: 'pz-step-val' }, f(v));
    const set = (nv, silent) => { v = Math.min(max, Math.max(min, nv)); val.textContent = f(v); if (!silent) onchange(v); };
    const box = h('span', { class: 'pz-step' },
      h('button', { type: 'button', onclick: () => set(v - 1) }, '−'), val,
      h('button', { type: 'button', onclick: () => set(v + 1) }, '+'));
    box.set = (nv) => set(nv, true);
    return box;
  }

  // ℤ[ω] (ω = (1+√−7)/2) の格子点を描くキャンバス
  function latticeCanvas({ multi, onChange }) {
    const Wd = 420, Ht = 290, S = 40, cx = Wd / 2, cy = Ht / 2, SQ = Math.sqrt(7) / 2;
    const cv = h('canvas', { width: Wd, height: Ht, class: 'pz-canvas' });
    const ctx = cv.getContext('2d');
    const pts = [];
    for (let y = -2; y <= 2; y++) for (let x = -6; x <= 6; x++) {
      const px = cx + (x + y / 2) * S, py = cy - y * SQ * S;
      if (px > 14 && px < Wd - 14) pts.push({ x, y, px, py, key: x + ',' + y });
    }
    const sel = new Set();
    function draw() {
      ctx.fillStyle = '#10131f'; ctx.fillRect(0, 0, Wd, Ht);
      ctx.strokeStyle = '#2c3350'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(Wd, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, Ht); ctx.stroke();
      ctx.fillStyle = '#5d6890'; ctx.font = '11px sans-serif';
      ctx.fillText('実軸', Wd - 30, cy - 5); ctx.fillText('虚軸', cx + 5, 12);
      for (const p of pts) {
        const on = sel.has(p.key);
        ctx.beginPath(); ctx.arc(p.px, p.py, on ? 9 : 6, 0, 7);
        ctx.fillStyle = on ? '#ffd45e' : (p.x === 0 && p.y === 0 ? '#e96a6a' : '#7fa6e8');
        ctx.fill();
        if (on) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
      }
      const o = pts.find((p) => p.x === 1 && p.y === 0), w = pts.find((p) => p.x === 0 && p.y === 1);
      ctx.fillStyle = '#c9d2f0'; ctx.font = '12px sans-serif';
      ctx.fillText('0', cx - 14, cy + 16); ctx.fillText('1', o.px - 3, o.py + 22); ctx.fillText('ω', w.px + 9, w.py - 7);
    }
    function toggle(p) {
      if (multi) { if (sel.has(p.key)) sel.delete(p.key); else sel.add(p.key); }
      else { sel.clear(); sel.add(p.key); }
      draw(); onChange(api);
    }
    cv.addEventListener('click', (ev) => {
      const r = cv.getBoundingClientRect();
      const mx = (ev.clientX - r.left) * (Wd / r.width), my = (ev.clientY - r.top) * (Ht / r.height);
      let best = null, bd = 18 * 18;
      for (const p of pts) { const d = (p.px - mx) ** 2 + (p.py - my) ** 2; if (d < bd) { bd = d; best = p; } }
      if (best) toggle(best);
    });
    const api = {
      el: cv, pts,
      selected: () => pts.filter((p) => sel.has(p.key)),
      setSelected: (keys) => { sel.clear(); keys.forEach((k) => sel.add(k)); draw(); onChange(api); },
    };
    draw();
    return api;
  }

  const fail = (msg) => ({ ok: false, msg });
  const OK = { ok: true };

  // =====================================================================
  // パズル定義   build(body) -> { check(): {ok,msg}, cheat() }
  // =====================================================================
  const P = {};

  // ---------- 第1章 ----------
  P.chi = {
    title: '二次指標の祠',
    intro: 'd = 7 として、法 7 の<b>非自明な実指標</b> χ を構成せよ。各 n = 1,…,6 に +1 か −1 を割り当て、すべての a, b について <b>χ(a)·χ(b) = χ(ab mod 7)</b> が成り立つようにする。',
    hint: 'χ(1) は必ず +1。2 ≡ 3² (mod 7) なので、χ(2) = χ(3)² に注目。平方数はどんな値になる?',
    build(body) {
      const vals = [0, 1, 1, 1, 1, 1, 1];
      const btns = [];
      const row = h('div', { class: 'pz-row' });
      for (let n = 1; n <= 6; n++) {
        const b = cycler([1, -1], ['+1', '−1'], 1, (v) => { vals[n] = v; }, 'pz-pm');
        btns[n] = b;
        row.appendChild(h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, 'χ(' + n + ')'), b));
      }
      body.appendChild(row);
      body.appendChild(h('p', { class: 'pz-note' }, 'ボタンを押すと +1 / −1 が切り替わる。'));
      return {
        check() {
          const r = L.checkCharacter(vals);
          if (r.ok) return OK;
          if (r.kind === 'trivial') return fail('これは自明な指標 (すべて +1)。非自明なものを作ろう。');
          return fail(`乗法的でない: χ(${r.a})·χ(${r.b}) = ${sgn(vals[r.a] * vals[r.b])} だが、${r.a}·${r.b} ≡ ${r.c} (mod 7) で χ(${r.c}) = ${sgn(vals[r.c])}。`);
        },
        cheat() { for (let n = 1; n <= 6; n++) { vals[n] = L.legendre(n, 7); btns[n].set(vals[n]); } },
      };
    },
  };

  P.mangoldt = {
    title: 'マンゴルトの祠',
    intro: 'n = 2,…,12 に対して Λ(n) の値を決めよ。条件はただ 1 つ: すべての n で <b>Σ<sub>d|n</sub> Λ(d) = log n</b>。<br>(例: n = 6 なら Λ(2) + Λ(3) + Λ(6) = log 6)',
    hint: 'n が素数なら約数は 1 と n だけなので Λ(n) = log n。n = 4 では Λ(2) + Λ(4) = log 4 = 2 log 2。n = 6 では log 2 + log 3 ですでに log 6 になっている。',
    build(body) {
      const opts = [1, 2, 3, 5, 7, 11];
      const labels = ['0', 'log 2', 'log 3', 'log 5', 'log 7', 'log 11'];
      const choice = {}; const btns = {};
      const grid = h('div', { class: 'pz-row pz-wrap' });
      for (let n = 2; n <= 12; n++) {
        choice[n] = 1;
        btns[n] = cycler(opts, labels, 1, (v) => { choice[n] = v; }, 'pz-wide');
        grid.appendChild(h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, 'Λ(' + n + ')'), btns[n]));
      }
      body.appendChild(grid);
      return {
        check() {
          const bad = L.checkMangoldt(choice);
          if (!bad.length) return OK;
          return fail(`n = ${bad[0]} で Σ_{d|n} Λ(d) が log ${bad[0]} にならない。` + (bad.length > 1 ? ` (ほかに ${bad.length - 1} 箇所)` : ''));
        },
        cheat() { for (let n = 2; n <= 12; n++) { choice[n] = L.mangoldtPrime(n); btns[n].set(choice[n]); } },
      };
    },
  };

  P.primesum = {
    title: '素数和の祠',
    intro: 'q = 16, d = 7 とする (q | 2(d+1) かつ q ∤ d+1 ―― 本物の証明と同じ関係)。<br>重み <b>λ(n) = Λ(n)·(1 − χ<sub>K</sub>(n))</b> (ただし n ≡ 1 mod 16 のときだけ、他は 0) が<b>0 でない</b> n をすべて選べ (n ≤ 100)。<br>χ<sub>K</sub>(n) = (n/7) で、7 | n のときは 0。',
    hint: 'まず n ≡ 1 (mod 16) の数: 1, 17, 33, 49, 65, 81, 97。このうち素数べきはどれ? 次に (n/7) = +1 だと 1 − χ = 0 で消える。法 7 の平方剰余は 1, 2, 4。',
    build(body) {
      const sel = new Set(); const cells = {};
      const grid = h('div', { class: 'pz-grid10' });
      for (let n = 1; n <= 100; n++) {
        const c = h('button', { type: 'button', class: 'pz-num' }, String(n));
        c.addEventListener('click', () => { if (sel.has(n)) sel.delete(n); else sel.add(n); c.classList.toggle('on', sel.has(n)); });
        cells[n] = c; grid.appendChild(c);
      }
      body.appendChild(grid);
      const want = L.lambdaSupport(16, 7, 100);
      return {
        check() {
          const extra = [...sel].filter((n) => !want.includes(n)).length;
          const miss = want.filter((n) => !sel.has(n)).length;
          if (!extra && !miss) return OK;
          return fail(`余計に選んだ数が ${extra} 個、選び足りない数が ${miss} 個ある。`);
        },
        cheat() { sel.clear(); for (let n = 1; n <= 100; n++) { if (want.includes(n)) sel.add(n); cells[n].classList.toggle('on', sel.has(n)); } },
      };
    },
  };

  // ---------- 第2章 ----------
  P.params = {
    title: 'パラメータの祠',
    intro: '(1) 素因数の指数を決めて <b>q₀ = 18480</b> を組み立てよ。<br>(2) d ≡ q₀/2 − 1 = 9239 (mod 18480) をみたす候補から、<b>素数</b>であるものを 1 つ選べ。',
    hint: '18480 = 16 × 1155。1155 は 3, 5, 7, 11 で割り切れる。候補が合成数だと、選んだときに因数が表示される。',
    build(body) {
      const primes = [2, 3, 5, 7, 11]; const exps = [0, 0, 0, 0, 0];
      const prodEl = h('b', {}, '1');
      const upd = () => { prodEl.textContent = String(primes.reduce((s, p, i) => s * p ** exps[i], 1)); };
      const steps = primes.map((p, i) => stepper(0, 5, 0, (v) => { exps[i] = v; upd(); }));
      const row = h('div', { class: 'pz-row' }, primes.map((p, i) => h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, p + ' の指数'), steps[i])));
      body.appendChild(row);
      body.appendChild(h('p', {}, 'q₀ = ', prodEl));
      let d = null;
      const info = h('p', { class: 'pz-note' }, 'd の候補を選ぶ:');
      const cands = [0, 1, 2, 3, 4, 5].map((k) => 9239 + 18480 * k);
      const cbtns = cands.map((c) => {
        const b = h('button', { type: 'button', class: 'pz-num pz-cand' }, String(c));
        b.addEventListener('click', () => {
          d = c; cbtns.forEach((x) => x.classList.toggle('on', x === b));
          const f = L.smallestFactor(c);
          info.textContent = f === c ? `d = ${c} を選んだ。割り切る素数は見つかるかな?` : `d = ${c} = ${f} × ${c / f} … 合成数だ。`;
        });
        return b;
      });
      body.appendChild(info);
      body.appendChild(h('div', { class: 'pz-row pz-wrap' }, cbtns));
      return {
        check() {
          const q = primes.reduce((s, p, i) => s * p ** exps[i], 1);
          if (q !== 18480) return fail(`q₀ = ${q}。18480 になっていない。`);
          if (d == null) return fail('d の候補を選ぼう。');
          if (!L.isPrime(d)) return fail(`d = ${d} は素数ではない。`);
          return OK;
        },
        cheat() { [4, 1, 1, 1, 1].forEach((e, i) => { exps[i] = e; steps[i].set(e); }); upd(); cbtns[0].click(); },
      };
    },
  };

  P.cmfield = {
    title: 'CM 体の祠',
    intro: 'K = ℚ(√−7) の整数は x + yω (ω = (1+√−7)/2) の形で、複素平面の格子をなす。ノルムは N(x + yω) = x² + xy + 2y²。<br>レベル N = 11 に対して、<b>π·π̄ = 11</b> となる整数 π を格子から 1 つ選べ。',
    hint: 'ノルムは原点からの距離の 2 乗。y = ±2 の段を探してみよう: x² ± 2x + 8 = 11。',
    build(body) {
      const info = h('p', {}, '格子点をクリックして選ぶ。');
      const lat = latticeCanvas({
        multi: false,
        onChange(a) { const p = a.selected()[0]; if (p) info.textContent = `π = ${p.x} + (${fmt(p.y)})ω,  N(π) = π·π̄ = ${L.norm7(p.x, p.y)}`; },
      });
      body.appendChild(lat.el); body.appendChild(info);
      return {
        check() {
          const p = lat.selected()[0];
          if (!p) return fail('格子点を 1 つ選ぼう。');
          const n = L.norm7(p.x, p.y);
          return n === 11 ? OK : fail(`N(π) = ${n}。11 になる点を探そう。`);
        },
        cheat() { lat.setSelected(['1,2']); },
      };
    },
  };

  P.places = {
    title: '素点の祠',
    intro: 'q₀ = 16, q₁ = 48 とする。E の無限素点は (ℤ/48)ˣ の元と対応する。<br>各元を分類せよ: <b>≡ 1 (mod 16) なら a-素点</b>、<b>≡ −1 (mod 16) なら b-素点</b>、それ以外は「—」のまま。',
    hint: '48 と互いに素な数のうち、16 で割った余りが 1 のものと 15 のものを探す。',
    build(body) {
      const units = L.unitsMod(48); const kind = {}; const btns = {};
      const row = h('div', { class: 'pz-row pz-wrap' });
      for (const u of units) {
        kind[u] = '-';
        btns[u] = cycler(['-', 'a', 'b'], ['—', 'a', 'b'], '-', (v) => { kind[u] = v; }, 'pz-ab');
        row.appendChild(h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, String(u)), btns[u]));
      }
      body.appendChild(row);
      return {
        check() {
          const wrong = units.filter((u) => kind[u] !== L.placeKind(u, 16));
          return wrong.length ? fail(`分類の違う元が ${wrong.length} 個ある。`) : OK;
        },
        cheat() { for (const u of units) { kind[u] = L.placeKind(u, 16); btns[u].set(kind[u]); } },
      };
    },
  };

  P.sparse = {
    title: '疎な集合の祠',
    intro: '1,…,9 から <b>5 個</b>の数を選び、その中に <b>3 項の等差数列</b> (x, x+k, x+2k) が 1 つも含まれないようにせよ。<br>(本物の証明の b-素点は、これの乗法版の条件をみたす疎な集合。)',
    hint: '両端に寄せるのがコツ。1, 2 を入れたら 3 は入れられない。',
    build(body) {
      const sel = new Set(); const cells = {};
      const row = h('div', { class: 'pz-row' });
      for (let n = 1; n <= 9; n++) {
        const c = h('button', { type: 'button', class: 'pz-num pz-big' }, String(n));
        c.addEventListener('click', () => { if (sel.has(n)) sel.delete(n); else sel.add(n); c.classList.toggle('on', sel.has(n)); });
        cells[n] = c; row.appendChild(c);
      }
      body.appendChild(row);
      return {
        check() {
          if (sel.size !== 5) return fail(`いま ${sel.size} 個。ちょうど 5 個選ぼう。`);
          const ap = L.findAP3([...sel]);
          return ap ? fail(`等差数列 ${ap.join(', ')} が含まれている。`) : OK;
        },
        cheat() { sel.clear(); [1, 2, 4, 8, 9].forEach((n) => sel.add(n)); for (let n = 1; n <= 9; n++) cells[n].classList.toggle('on', sel.has(n)); },
      };
    },
  };

  // ---------- 第3章 ----------
  P.height = {
    title: '高さの祠',
    intro: '素数のべきを掛け合わせて有理数 y を作り、p 進絶対値が<br><b>|y|₂ = 1/8,  |y|₃ = 9,  |y|₅ = 1/5,  |y|₇ = 1</b><br>となるようにせよ。(|y|ₚ = p<sup>−vₚ(y)</sup>: p でたくさん割り切れるほど小さい。)',
    hint: '|y|₂ = 1/8 = 2⁻³ なので y は 2 でちょうど 3 回割り切れる。|y|₃ = 9 は、分母に 3² があるということ。',
    build(body) {
      const primes = [2, 3, 5, 7]; const e = [0, 0, 0, 0];
      const yEl = h('b', {}, '1'); const tbl = h('div', { class: 'pz-mono' });
      const upd = () => {
        let num = 1, den = 1;
        primes.forEach((p, i) => { if (e[i] > 0) num *= p ** e[i]; else den *= p ** (-e[i]); });
        yEl.textContent = den === 1 ? String(num) : num + '/' + den;
        const abs = (p, v) => (v === 0 ? '1' : v > 0 ? '1/' + p ** v : String(p ** (-v)));
        tbl.textContent = primes.map((p, i) => `|y|_${p} = ${abs(p, e[i])}`).join('    ') + `    |y|_∞ = ${den === 1 ? num : num + '/' + den}`;
      };
      const steps = primes.map((p, i) => stepper(-4, 4, 0, (v) => { e[i] = v; upd(); }, (v) => p + sup(v)));
      body.appendChild(h('div', { class: 'pz-row' }, steps.map((s, i) => h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, primes[i] + ' のべき'), s))));
      body.appendChild(h('p', {}, 'y = ', yEl));
      body.appendChild(tbl);
      body.appendChild(h('p', { class: 'pz-note' }, '積公式: どんな y ≠ 0 でも |y|_∞ · |y|₂ · |y|₃ · |y|₅ · |y|₇ · … = 1。上の表で確かめてみよう。'));
      upd();
      const want = [3, -2, 1, 0];
      return {
        check() { return e.every((v, i) => v === want[i]) ? OK : fail('絶対値がまだ合っていない。表と見比べよう。'); },
        cheat() { want.forEach((v, i) => { e[i] = v; steps[i].set(v); }); upd(); },
      };
    },
  };

  P.shortbasis = {
    title: '短い基底の祠',
    intro: '格子 ℤ² の基底 b₁ = (8, 5), b₂ = (5, 3) は長い。一方を他方に足し引きする操作で、<b>‖b₁‖²·‖b₂‖² が行列式の 2 乗 (= 1) に等しくなる</b>まで短くせよ。<br>アダマールの不等式: det² ≤ ‖b₁‖²·‖b₂‖²。等号は基底が直交するとき。',
    hint: '長い方から短い方を引く。ユークリッドの互除法と同じ動きになる。',
    build(body) {
      let b1 = [8, 5], b2 = [5, 3];
      const Wd = 420, Ht = 240, S = 26, ox = 150, oy = 190;
      const cv = h('canvas', { width: Wd, height: Ht, class: 'pz-canvas' }); const ctx = cv.getContext('2d');
      const info = h('div', { class: 'pz-mono' });
      const n2 = (v) => v[0] * v[0] + v[1] * v[1];
      function arrow(v, col, label) {
        const x = ox + v[0] * S, y = oy - v[1] * S;
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(x, y); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
        ctx.font = '13px sans-serif'; ctx.fillText(label, x + 7, y - 6);
      }
      function draw() {
        ctx.fillStyle = '#10131f'; ctx.fillRect(0, 0, Wd, Ht);
        ctx.fillStyle = '#3a4468';
        for (let x = -6; x <= 11; x++) for (let y = -2; y <= 7; y++) { ctx.beginPath(); ctx.arc(ox + x * S, oy - y * S, 2, 0, 7); ctx.fill(); }
        arrow(b1, '#ffd45e', 'b₁'); arrow(b2, '#7fe8c0', 'b₂');
        const det = b1[0] * b2[1] - b1[1] * b2[0];
        info.textContent = `b₁ = (${b1.map(fmt)})  b₂ = (${b2.map(fmt)})   ‖b₁‖²·‖b₂‖² = ${n2(b1)}·${n2(b2)} = ${n2(b1) * n2(b2)}   det² = ${det * det}`;
      }
      const op = (f) => () => { f(); draw(); };
      const lim = (v) => Math.abs(v[0]) <= 30 && Math.abs(v[1]) <= 30;
      const add = (u, v, s) => { const w = [u[0] + s * v[0], u[1] + s * v[1]]; return lim(w) ? w : u; };
      body.appendChild(cv);
      body.appendChild(h('div', { class: 'pz-row' },
        h('button', { type: 'button', onclick: op(() => { b1 = add(b1, b2, -1); }) }, 'b₁ ← b₁ − b₂'),
        h('button', { type: 'button', onclick: op(() => { b1 = add(b1, b2, 1); }) }, 'b₁ ← b₁ + b₂'),
        h('button', { type: 'button', onclick: op(() => { b2 = add(b2, b1, -1); }) }, 'b₂ ← b₂ − b₁'),
        h('button', { type: 'button', onclick: op(() => { b2 = add(b2, b1, 1); }) }, 'b₂ ← b₂ + b₁')));
      body.appendChild(info);
      draw();
      return {
        check() { return n2(b1) * n2(b2) === 1 ? OK : fail(`まだ長い: ‖b₁‖²·‖b₂‖² = ${n2(b1) * n2(b2)}。`); },
        cheat() { b1 = [0, 1]; b2 = [1, 0]; draw(); },
      };
    },
  };

  P.index = {
    title: '指数の祠',
    intro: '有理ベクトル <b>v₁ = (1/2, 3/4)</b>, <b>v₂ = (5/3, 1/6)</b> がある。正の整数 c₁, c₂ を掛けて c₁v₁, c₂v₂ を<b>どちらも整数ベクトル</b>にせよ。ただし払うコスト <b>c₁·c₂ を最小</b>に。<br>(対角行列 diag(c₁, c₂) の行列式の付値が「指数」。)',
    hint: '各ベクトルの分母の最小公倍数を考える。',
    build(body) {
      const c = [1, 1];
      const info = h('div', { class: 'pz-mono' });
      const fr = (n, d) => { const g = L.gcd(n, d); return d / g === 1 ? String(n / g) : n / g + '/' + d / g; };
      const upd = () => {
        info.textContent = `c₁v₁ = (${fr(c[0], 2)}, ${fr(3 * c[0], 4)})    c₂v₂ = (${fr(5 * c[1], 3)}, ${fr(c[1], 6)})    コスト c₁·c₂ = ${c[0] * c[1]}`;
      };
      const steps = [0, 1].map((i) => stepper(1, 12, 1, (v) => { c[i] = v; upd(); }));
      body.appendChild(h('div', { class: 'pz-row' },
        h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, 'c₁'), steps[0]),
        h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, 'c₂'), steps[1])));
      body.appendChild(info); upd();
      return {
        check() {
          if (c[0] % 4 !== 0) return fail('c₁v₁ がまだ整数ベクトルでない。');
          if (c[1] % 6 !== 0) return fail('c₂v₂ がまだ整数ベクトルでない。');
          if (c[0] * c[1] !== 24) return fail(`整にはなったが、コスト ${c[0] * c[1]} は最小ではない。`);
          return OK;
        },
        cheat() { c[0] = 4; c[1] = 6; steps[0].set(4); steps[1].set(6); upd(); },
      };
    },
  };

  // ---------- 第4章 ----------
  P.hermitian = {
    title: 'エルミートの祠',
    intro: 'ガウス整数 ℤ[i] 上の 2×2 行列 <b>H</b> を完成させ、<b>正定値エルミート行列</b>にせよ。しかも<b>行列式ができるだけ小さく</b>なるように。<br>エルミート: h₂₁ は h₁₂ の複素共役。正定値: h₁₁ &gt; 0 かつ det H &gt; 0。',
    hint: '1 + i の共役は 1 − i。det H = h₁₁·h₂₂ − |h₁₂|² = 2·h₂₂ − 2。',
    build(body) {
      const cj = ['1+i', '1−i', '−1+i', '−1−i'];
      let h21 = '1+i', h22 = 0;
      const info = h('div', { class: 'pz-mono' });
      const upd = () => { info.textContent = `h₁₁·h₂₂ − |h₁₂|² = 2·${h22} − 2 = ${2 * h22 - 2}`; };
      const cb = cycler(cj, cj, '1+i', (v) => { h21 = v; }, 'pz-wide');
      const st = stepper(0, 5, 0, (v) => { h22 = v; upd(); });
      body.appendChild(h('div', { class: 'pz-matrix' },
        h('div', { class: 'pz-mrow' }, h('span', { class: 'pz-ment' }, '2'), h('span', { class: 'pz-ment' }, '1+i')),
        h('div', { class: 'pz-mrow' }, h('span', { class: 'pz-ment' }, cb), h('span', { class: 'pz-ment' }, st))));
      body.appendChild(info); upd();
      return {
        check() {
          if (h21 !== '1−i') return fail('エルミートでない: h₂₁ は h₁₂ = 1+i の複素共役でなければならない。');
          const det = 2 * h22 - 2;
          if (det <= 0) return fail(`det H = ${det}。正定値でない。`);
          if (h22 !== 2) return fail(`正定値だが、det H = ${det} はもっと小さくできる。`);
          return OK;
        },
        cheat() { h21 = '1−i'; cb.set(h21); h22 = 2; st.set(2); upd(); },
      };
    },
  };

  P.theta = {
    title: 'テータの祠',
    intro: '格子 ℤ[ω] (ω = (1+√−7)/2) のテータ級数 <b>θ(q) = Σ<sub>v</sub> q<sup>N(v)</sup></b> を q⁴ の項まで求めたい。<br><b>ノルムが 4 以下の格子点をすべて</b>選べ (原点も含む)。選んだ点から級数が組み上がる。',
    hint: 'N(x + yω) = x² + xy + 2y²。全部で 13 点ある。y = ±1 の段に 8 点。',
    build(body) {
      const info = h('div', { class: 'pz-mono' }, 'θ(q) = …');
      const lat = latticeCanvas({
        multi: true,
        onChange(a) {
          const cnt = [0, 0, 0, 0, 0]; let over = 0;
          for (const p of a.selected()) { const n = L.norm7(p.x, p.y); if (n <= 4) cnt[n]++; else over++; }
          info.textContent = 'θ(q) = ' + cnt.map((c, n) => (n === 0 ? c : c + 'q' + (n > 1 ? sup(n) : ''))).join(' + ') + ' + …' + (over ? `   (ノルムが 4 を超える点: ${over})` : '');
        },
      });
      body.appendChild(lat.el); body.appendChild(info);
      const want = () => lat.pts.filter((p) => L.norm7(p.x, p.y) <= 4);
      return {
        check() {
          const s = lat.selected(); const w = want();
          const over = s.filter((p) => L.norm7(p.x, p.y) > 4).length;
          if (over) return fail(`ノルムが 4 を超える点を ${over} 個選んでいる。`);
          if (s.length < w.length) return fail(`まだ足りない (いま ${s.length} 点)。`);
          return OK;
        },
        cheat() { lat.setSelected(want().map((p) => p.key)); },
      };
    },
  };

  P.jet = {
    title: 'ジェットの祠',
    intro: 'テイラー係数 (ジェット) には階乗が現れる。<b>10! = 3628800</b> を素因数分解せよ。<br>公式: p の指数 = ⌊10/p⌋ + ⌊10/p²⌋ + ⌊10/p³⌋ + …  これは <b>log n! = Σ<sub>ν≤n</sub> Λ(ν)·⌊n/ν⌋</b> ―― 階乗が素数べきを数えている。',
    hint: '2 の指数: ⌊10/2⌋ + ⌊10/4⌋ + ⌊10/8⌋ = 5 + 2 + 1。',
    build(body) {
      const primes = [2, 3, 5, 7]; const e = [0, 0, 0, 0];
      const prodEl = h('b', {}, '1');
      const upd = () => { prodEl.textContent = String(primes.reduce((s, p, i) => s * p ** e[i], 1)); };
      const steps = primes.map((p, i) => stepper(0, 10, 0, (v) => { e[i] = v; upd(); }, (v) => p + sup(v)));
      body.appendChild(h('div', { class: 'pz-row' }, steps.map((s, i) => h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, primes[i] + ' のべき'), s))));
      body.appendChild(h('p', {}, '積 = ', prodEl, '   (目標: 3628800)'));
      const want = primes.map((p) => L.factorialExp(10, p));
      return {
        check() {
          const bad = primes.filter((p, i) => e[i] !== want[i]);
          return bad.length ? fail(`${bad[0]} の指数が違う。⌊10/${bad[0]}⌋ + ⌊10/${bad[0] ** 2}⌋ + … を数えよう。`) : OK;
        },
        cheat() { want.forEach((v, i) => { e[i] = v; steps[i].set(v); }); upd(); },
      };
    },
  };

  P.seesaw = {
    title: 'シーソーの祠',
    intro: 'リフトを行列 <b>K</b> で表す: f ↦ Kf。ベクトル <b>g = (3, −2)</b> に対し、<b>すべての f で ⟨Kf, g⟩ = ⟨f, h⟩</b> となるベクトル h (転置リフト Kᵗg) を構成せよ。3 つのシーソーがすべて釣り合えば完成。',
    hint: 'f = e₁ のとき ⟨Ke₁, g⟩ は「K の第 1 列と g の内積」。',
    build(body) {
      const K = [[1, 2, 0], [-1, 1, 3]], g = [3, -2];
      const want = L.matVec(L.transpose(K), g);
      const hv = [0, 0, 0];
      const bars = [0, 1, 2].map(() => h('div', { class: 'pz-seesaw-bar' }));
      const upd = () => bars.forEach((b, i) => {
        const diff = want[i] - hv[i];
        b.style.transform = `rotate(${Math.max(-14, Math.min(14, -diff * 3))}deg)`;
        b.classList.toggle('level', diff === 0);
      });
      const steps = [0, 1, 2].map((i) => stepper(-9, 9, 0, (v) => { hv[i] = v; upd(); }));
      body.appendChild(h('div', { class: 'pz-mono' }, 'K = [ 1  2  0 ]\n    [−1  1  3 ]      g = (3, −2)'));
      body.appendChild(h('div', { class: 'pz-row' }, [0, 1, 2].map((i) => h('div', { class: 'pz-cell pz-seesaw' },
        h('div', { class: 'pz-label' }, `⟨Ke${'₁₂₃'[i]}, g⟩  vs  h${'₁₂₃'[i]}`),
        h('div', { class: 'pz-seesaw-wrap' }, bars[i], h('div', { class: 'pz-seesaw-pivot' })),
        steps[i]))));
      body.appendChild(h('p', { class: 'pz-note' }, '左が重いと左に傾く (h が小さすぎる)。'));
      upd();
      return {
        check() { return hv.every((v, i) => v === want[i]) ? OK : fail('まだ釣り合っていないシーソーがある。'); },
        cheat() { want.forEach((v, i) => { hv[i] = v; steps[i].set(v); }); upd(); },
      };
    },
  };

  // ---------- 第5章 ----------
  P.poincare = {
    title: 'ポアンカレの祠',
    intro: '3×3 の盤に 90° 回転の群 C₄ が作用する。種 f (0/1 を置く) から <b>ポアンカレ級数 𝒫f(x) = Σ<sub>g∈C₄</sub> f(g·x)</b> を作る。<br>左の盤に種を置き、右の 𝒫f が<b>目標 (角 = 1, 辺 = 1, 中心 = 4)</b> に一致するようにせよ。',
    hint: '角の 4 マスは回転で互いに移り合う (1 つの軌道)。中心は 4 回とも自分自身に移る。',
    build(body) {
      const seed = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      const target = [1, 1, 1, 1, 4, 1, 1, 1, 1];
      const sc = [], oc = [];
      const upd = () => { const o = L.poincareSum(seed); o.forEach((v, i) => { oc[i].textContent = String(v); oc[i].classList.toggle('good', v === target[i]); }); sc.forEach((c, i) => { c.textContent = seed[i] ? '●' : ''; c.classList.toggle('on', !!seed[i]); }); };
      const g1 = h('div', { class: 'pz-grid3' }), g2 = h('div', { class: 'pz-grid3' }), g3 = h('div', { class: 'pz-grid3' });
      for (let i = 0; i < 9; i++) {
        const c = h('button', { type: 'button', class: 'pz-sq' });
        c.addEventListener('click', () => { seed[i] = 1 - seed[i]; upd(); });
        sc.push(c); g1.appendChild(c);
        const o = h('div', { class: 'pz-sq ro' }); oc.push(o); g2.appendChild(o);
        g3.appendChild(h('div', { class: 'pz-sq ro tgt' }, String(target[i])));
      }
      body.appendChild(h('div', { class: 'pz-row' },
        h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, '種 f'), g1),
        h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, '𝒫f'), g2),
        h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, '目標'), g3)));
      upd();
      return {
        check() { const o = L.poincareSum(seed); return o.every((v, i) => v === target[i]) ? OK : fail('𝒫f が目標と一致していない。'); },
        cheat() { seed.fill(0); seed[0] = seed[1] = seed[4] = 1; upd(); },
      };
    },
  };

  P.spanning = {
    title: '充填の祠',
    intro: '種ベクトル <b>p ∈ {−1, 0, 1}⁴</b> を選び、その 4 つの巡回シフト (平行移動) を並べた行列の行列式 D が <b>0 &lt; |D| ≤ 3</b> となるようにせよ。ただし p の<b>成分は 2 つ以上が非零</b>。<br>D ≠ 0 なら平行移動が全体を張り、|D| が小さいほど「ほとんど全体」を張る。',
    hint: 'D はフーリエ係数の積。どれか 1 つでも 0 だと張れない。非零成分が 2 個では必ず失敗する。3 個で符号を工夫しよう。',
    build(body) {
      const p = [0, 0, 0, 0];
      const info = h('div', { class: 'pz-mono' });
      const upd = () => {
        const c = L.circulant4(p);
        const rows = [0, 1, 2, 3].map((s) => '[ ' + [0, 1, 2, 3].map((j) => fmt(p[(j - s + 4) % 4]).padStart(2)).join(' ') + ' ]').join('\n');
        info.textContent = rows + `\n\nフーリエ係数:  p̂(1) = ${fmt(c.s)}   p̂(−1) = ${fmt(c.alt)}   |p̂(i)|² = ${c.re * c.re + c.im * c.im}\nD = ${fmt(c.det)}`;
      };
      const btns = [0, 1, 2, 3].map((i) => cycler([0, 1, -1], ['0', '1', '−1'], 0, (v) => { p[i] = v; upd(); }));
      body.appendChild(h('div', { class: 'pz-row' }, btns.map((b, i) => h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, 'p' + '₀₁₂₃'[i]), b))));
      body.appendChild(info); upd();
      return {
        check() {
          if (p.filter((v) => v !== 0).length < 2) return fail('非零の成分が 2 つ以上必要。');
          const d = Math.abs(L.circulant4(p).det);
          if (d === 0) return fail('D = 0。平行移動が全体を張っていない (フーリエ係数のどれかが 0)。');
          if (d > 3) return fail(`張れてはいるが |D| = ${d} は大きすぎる。`);
          return OK;
        },
        cheat() { [1, 1, 1, 0].forEach((v, i) => { p[i] = v; btns[i].set(v); }); upd(); },
      };
    },
  };

  // ---------- 第6章 ----------
  P.twist = {
    title: 'ツイストの祠',
    intro: '(ℤ/13)ˣ は 2 で生成される位数 12 の巡回群。指標 ξ を <b>ξ(2) = ζ₁₂<sup>k</sup></b> で定める。<br><b>ξ, ξ², ξ³, ξ⁴ がすべて非自明</b> (= 4 重ツイスト) となる k を選べ。',
    hint: 'ξ^j が自明 ⇔ j·k が 12 の倍数。ξ の位数が 4 以下だとどこかで自明になる。',
    build(body) {
      let k = 0;
      const info = h('div', { class: 'pz-mono' });
      const upd = () => {
        info.textContent = [1, 2, 3, 4].map((j) => { const e = (j * k) % 12; return `ξ${j > 1 ? sup(j) : ' '}(2) = ζ₁₂^${String(e).padEnd(2)}  ${e === 0 ? '← 自明!' : '非自明'}`; }).join('\n');
      };
      const st = stepper(0, 11, 0, (v) => { k = v; upd(); });
      body.appendChild(h('div', { class: 'pz-row' }, h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, 'k'), st)));
      body.appendChild(info); upd();
      return {
        check() { return L.isMFold(k, 12, 4) ? OK : fail('どこかのべきが自明になっている。'); },
        cheat() { k = 1; st.set(1); upd(); },
      };
    },
  };

  P.gram = {
    title: 'グラムの祠',
    intro: 'ℤ³ のベクトル u, v (成分は −1, 0, 1) を選び、グラム行列 <b>(⟨u,u⟩ ⟨u,v⟩ ; ⟨v,u⟩ ⟨v,v⟩) = (2 1 ; 1 2)</b> となるようにせよ。行列式は 3 ―― 2 つのベクトルが張る平行四辺形の面積の 2 乗。',
    hint: '長さの 2 乗が 2 なので、各ベクトルは非零成分がちょうど 2 個。共有する成分で内積 1 を作る。',
    build(body) {
      const u = [0, 0, 0], v = [0, 0, 0];
      const info = h('div', { class: 'pz-mono' });
      const upd = () => { const G = L.gram2(u, v); info.textContent = `グラム行列 = [ ${G[0].map(fmt).join('  ')} ]\n             [ ${G[1].map(fmt).join('  ')} ]     det = ${fmt(G[0][0] * G[1][1] - G[0][1] * G[1][0])}`; };
      const mk = (vec) => [0, 1, 2].map((i) => cycler([0, 1, -1], ['0', '1', '−1'], 0, (x) => { vec[i] = x; upd(); }));
      const ub = mk(u), vb = mk(v);
      body.appendChild(h('div', { class: 'pz-row' }, h('span', { class: 'pz-label' }, 'u = ('), ub, h('span', { class: 'pz-label' }, ')')));
      body.appendChild(h('div', { class: 'pz-row' }, h('span', { class: 'pz-label' }, 'v = ('), vb, h('span', { class: 'pz-label' }, ')')));
      body.appendChild(info); upd();
      return {
        check() { const G = L.gram2(u, v); return G[0][0] === 2 && G[1][1] === 2 && G[0][1] === 1 ? OK : fail('グラム行列が目標と違う。'); },
        cheat() { [1, -1, 0].forEach((x, i) => { u[i] = x; ub[i].set(x); }); [1, 0, -1].forEach((x, i) => { v[i] = x; vb[i].set(x); }); upd(); },
      };
    },
  };

  P.selmer = {
    title: 'セルマーの祠',
    intro: 'H¹ の類 c = (c₁, c₂) ∈ (ℤ/3)² のうち、選んだ<b>局所条件</b>をすべてみたすものが「セルマー群」。<br>補助素点を<b>2 つまで</b>選んで条件を課し、セルマー群を <b>{0} だけ</b>にせよ。',
    hint: '2 つの条件が同じ直線を定めていると、群は小さくならない。v₂ の条件は v₁ の 2 倍になっていないか?',
    build(body) {
      const conds = [
        { name: 'v₁', c: [1, 1], text: 'c₁ + c₂ ≡ 0' },
        { name: 'v₂', c: [2, 2], text: '2c₁ + 2c₂ ≡ 0' },
        { name: 'v₃', c: [1, 2], text: 'c₁ + 2c₂ ≡ 0' },
        { name: 'v₄', c: [0, 1], text: 'c₂ ≡ 0' },
      ];
      const on = [false, false, false, false];
      const pts = {}; const info = h('p', {});
      const grid = h('div', { class: 'pz-grid3' });
      for (let c2 = 2; c2 >= 0; c2--) for (let c1 = 0; c1 < 3; c1++) { const d = h('div', { class: 'pz-sq ro' }, `(${c1},${c2})`); pts[c1 + ',' + c2] = d; grid.appendChild(d); }
      const active = () => conds.filter((_, i) => on[i]).map((x) => x.c);
      const upd = () => {
        const sol = L.selmerSolutions(active()); const keys = new Set(sol.map((s) => s.join(',')));
        for (const k in pts) pts[k].classList.toggle('good', keys.has(k));
        info.textContent = `セルマー群の位数: ${sol.length}`;
        btns.forEach((b, i) => b.classList.toggle('on', on[i]));
      };
      const btns = conds.map((cd, i) => h('button', { type: 'button', class: 'pz-num pz-cand', onclick: () => { on[i] = !on[i]; upd(); } }, `${cd.name}:  ${cd.text}`));
      body.appendChild(h('div', { class: 'pz-row' }, h('div', { class: 'pz-cell' }, btns), h('div', { class: 'pz-cell' }, grid)));
      body.appendChild(info); upd();
      return {
        check() {
          const n = on.filter(Boolean).length;
          if (n > 2) return fail('補助素点は 2 つまで。');
          const sol = L.selmerSolutions(active());
          return sol.length === 1 ? OK : fail(`セルマー群の位数が ${sol.length}。まだ大きい。`);
        },
        cheat() { on.fill(false); on[0] = on[2] = true; upd(); },
      };
    },
  };

  // ---------- 追加: L 関数・p 進数・保型形式 ----------
  P.lfunc = {
    title: 'L 関数の祠',
    intro: 'オイラー積 <b>L(s, χ) = Π<sub>p</sub> (1 − χ(p)·p<sup>−s</sup>)<sup>−1</sup></b> を展開して、級数 <b>Σ a(n)·n<sup>−s</sup></b> の係数を組み立てよ。<br>各因子は 1 + χ(p)p<sup>−s</sup> + χ(p)²p<sup>−2s</sup> + … なので、n = p₁<sup>e₁</sup>p₂<sup>e₂</sup>… の係数は χ(p₁)<sup>e₁</sup>·χ(p₂)<sup>e₂</sup>…。<br>素数での値は <b>χ(2) = +1, χ(3) = −1, χ(5) = −1, χ(7) = 0, χ(11) = +1</b> (法 7 の二次指標)。',
    hint: '例: 12 = 2²·3 なので a(12) = χ(2)²·χ(3)。7 で割り切れる n の係数は 0。a(1) は空の積。',
    build(body) {
      const chi = { 2: 1, 3: -1, 5: -1, 7: 0, 11: 1 };
      const ns = [1, 4, 6, 8, 9, 10, 12, 14, 15];
      const a = {}; const btns = {};
      const want = (n) => L.factorize(n).reduce((v, [p, e]) => v * chi[p] ** e, 1);
      const row = h('div', { class: 'pz-row pz-wrap' });
      for (const n of ns) {
        a[n] = 0;
        btns[n] = cycler([0, 1, -1], ['0', '+1', '−1'], 0, (v) => { a[n] = v; }, 'pz-pm');
        row.appendChild(h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, 'a(' + n + ')'), btns[n]));
      }
      body.appendChild(row);
      body.appendChild(h('p', { class: 'pz-note' }, '和と積が一致するのは、どの n も素数の積にただ 1 通りに分解できるから。対数微分をとると −L′/L = Σ χ(n)Λ(n)·n^{−s} ―― 素数べきだけが残る。'));
      return {
        check() {
          const bad = ns.find((n) => a[n] !== want(n));
          if (bad == null) return OK;
          const f = L.factorize(bad).map(([p, e]) => p + (e > 1 ? sup(e) : '')).join('·') || '(空の積)';
          return fail(`a(${bad}) が違う。${bad} = ${f}。`);
        },
        cheat() { for (const n of ns) { a[n] = want(n); btns[n].set(a[n]); } },
      };
    },
  };

  P.padic = {
    title: 'p 進数の祠',
    intro: '方程式 <b>x² + x + 2 = 0</b> (根は (−1±√−7)/2) を、2 進数の世界で解く。<br>x = b₀ + 2b₁ + 4b₂ + 8b₃ の桁 (0 か 1) を決めて、<b>x² + x + 2 ≡ 0 (mod 16)</b> となるようにせよ。<br>mod 2 → mod 4 → mod 8 → mod 16 と、下の桁から順に決めていける。これを無限に続けた極限が 2 進数 ℤ₂ の元。',
    hint: '下の桁を決めたら変えない。b₀ はどちらでもよい (2 通りの根に対応)。次に mod 4 が ✓ になる b₁ を探す。',
    build(body) {
      const b = [0, 0, 0, 0];
      const info = h('div', { class: 'pz-mono' });
      const x = () => b[0] + 2 * b[1] + 4 * b[2] + 8 * b[3];
      const upd = () => {
        const v = L.fK(x());
        info.textContent = `x = ${x()}    x² + x + 2 = ${v}\n` + [2, 4, 8, 16].map((m) => `mod ${String(m).padStart(2)}: ${String(v % m).padStart(2)}  ${v % m === 0 ? '✓' : '✗'}`).join('\n');
      };
      const btns = [0, 1, 2, 3].map((i) => cycler([0, 1], ['0', '1'], 0, (v) => { b[i] = v; upd(); }));
      body.appendChild(h('div', { class: 'pz-row' }, btns.map((bt, i) => h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, `b${'₀₁₂₃'[i]} (${2 ** i} の位)`), bt))));
      body.appendChild(info); upd();
      body.appendChild(h('p', { class: 'pz-note' }, '√−7 は有理数ではないが、2 進数の中には存在する ―― 2 が K = ℚ(√−7) で分解することの現れ。'));
      return {
        check() { return L.fK(x()) % 16 === 0 ? OK : fail(`x = ${x()} では x² + x + 2 = ${L.fK(x())} ≡ ${L.fK(x()) % 16} (mod 16)。`); },
        cheat() { [1, 0, 1, 0].forEach((v, i) => { b[i] = v; btns[i].set(v); }); upd(); },
      };
    },
  };

  P.autoform = {
    title: '保型形式の祠',
    intro: '類が 2 つ (A, B) だけの世界の「保型形式」は、関数 f = (f(A), f(B))。<br>ヘッケ作用素 T は隣の類の値を足す: A の隣は A が 1 個と B が 2 個、B の隣は A が 3 個。つまり<br><b>(Tf)(A) = f(A) + 2f(B),  (Tf)(B) = 3f(A)</b>。<br><b>Tf = λf</b> となる<b>固有形式</b>を構成せよ。ただし定数関数 (f(A) = f(B)) は除く。',
    hint: '定数関数は固有値 3。もう 1 つの固有値は負の数。Tf と f が比例するように、f(A) と f(B) の符号を逆にして比を調整しよう。',
    build(body) {
      const f = [0, 0];
      const info = h('div', { class: 'pz-mono' });
      const T = (v) => [v[0] + 2 * v[1], 3 * v[0]];
      const upd = () => {
        const t = T(f);
        const par = t[0] * f[1] - t[1] * f[0] === 0 && (f[0] || f[1]);
        const lam = par ? (f[0] ? t[0] / f[0] : t[1] / f[1]) : null;
        info.textContent = `f  = (${fmt(f[0])}, ${fmt(f[1])})\nTf = (${fmt(t[0])}, ${fmt(t[1])})` + (par ? `   = ${fmt(lam)}·f   ← 固有形式 (固有値 λ = ${fmt(lam)})` : '   f の定数倍になっていない');
      };
      const steps = [0, 1].map((i) => stepper(-5, 5, 0, (v) => { f[i] = v; upd(); }));
      body.appendChild(h('div', { class: 'pz-row' },
        h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, 'f(A)'), steps[0]),
        h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, 'f(B)'), steps[1])));
      body.appendChild(info); upd();
      body.appendChild(h('p', { class: 'pz-note' }, '本物の証明では、類は格子の同型類、T は素点ごとのヘッケ作用素。固有値の列が、付随するガロア表現と L 関数を決める。'));
      return {
        check() {
          if (!f[0] && !f[1]) return fail('f = 0 は固有形式に数えない。');
          const t = T(f);
          if (t[0] * f[1] - t[1] * f[0] !== 0) return fail('Tf が f の定数倍になっていない。');
          if (f[0] === f[1]) return fail('これは定数関数 (固有値 3)。定数でない固有形式を探そう。');
          return OK;
        },
        cheat() { f[0] = 2; f[1] = -3; steps[0].set(2); steps[1].set(-3); upd(); },
      };
    },
  };

  // ---------- 追加: ガロアの書庫 ----------
  P.galois = {
    title: 'ガロア群の祠',
    intro: '方程式 <b>x⁴ + x³ + x² + x + 1 = 0</b> の根は ζ, ζ², ζ³, ζ⁴ (ζ は 1 の原始 5 乗根)。<br>ガロア群の元 σ は根の入れ替えで、<b>積を保つ</b>: σ(ζ<sup>k</sup>) = σ(ζ)<sup>k</sup>。<br><b>σ(ζ) = ζ²</b> と決めたとき、残りの根の行き先を決めて σ を完成させよ。',
    hint: 'σ(ζ²) = σ(ζ)² = (ζ²)² = ζ⁴。指数は 5 で割った余りで考える (ζ⁵ = 1)。',
    build(body) {
      const map = { 1: 2, 2: 1, 3: 1, 4: 1 };
      const Wd = 420, Ht = 230, cx = 210, cy = 115, Rr = 85;
      const cv = h('canvas', { width: Wd, height: Ht, class: 'pz-canvas' }); const ctx = cv.getContext('2d');
      const info = h('div', { class: 'pz-mono' });
      const pos = (k) => [cx + Rr * Math.cos(2 * Math.PI * k / 5), cy - Rr * Math.sin(2 * Math.PI * k / 5)];
      const draw = () => {
        ctx.fillStyle = '#10131f'; ctx.fillRect(0, 0, Wd, Ht);
        ctx.strokeStyle = '#2c3350'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, Rr, 0, 7); ctx.stroke();
        for (let k = 1; k <= 4; k++) {
          const [x1, y1] = pos(k), [x2, y2] = pos(map[k]);
          if (map[k] !== k) {
            ctx.strokeStyle = '#ffd45e'; ctx.fillStyle = '#ffd45e'; ctx.lineWidth = 2;
            const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
            const ex = x2 - ux * 12, ey = y2 - uy * 12;
            ctx.beginPath(); ctx.moveTo(x1 + ux * 10, y1 + uy * 10); ctx.lineTo(ex, ey); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - ux * 9 - uy * 5, ey - uy * 9 + ux * 5); ctx.lineTo(ex - ux * 9 + uy * 5, ey - uy * 9 - ux * 5); ctx.fill();
          }
        }
        for (let k = 0; k <= 4; k++) {
          const [x, y] = pos(k);
          ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fillStyle = k ? '#7fa6e8' : '#5d6890'; ctx.fill();
          ctx.fillStyle = '#c9d2f0'; ctx.font = '13px sans-serif';
          ctx.fillText(k ? 'ζ' + (k > 1 ? sup(k) : '') : '1', x + (x > cx ? 11 : -26), y + (y > cy ? 18 : -9));
        }
        const img = new Set([1, 2, 3, 4].map((k) => map[k]));
        info.textContent = img.size === 4 ? '根の入れ替え (置換) になっている。' : '同じ行き先が重なっている ―― まだ入れ替えになっていない。';
      };
      const btns = {};
      const cells = [h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, 'σ(ζ)'), h('b', {}, 'ζ²'))];
      for (const k of [2, 3, 4]) {
        btns[k] = cycler([1, 2, 3, 4], ['ζ', 'ζ²', 'ζ³', 'ζ⁴'], 1, (v) => { map[k] = v; draw(); });
        cells.push(h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, 'σ(ζ' + sup(k) + ')'), btns[k]));
      }
      body.appendChild(cv); body.appendChild(h('div', { class: 'pz-row' }, cells)); body.appendChild(info); draw();
      body.appendChild(h('p', { class: 'pz-note' }, 'この σ を 4 回繰り返すと元に戻る。ガロア群は (ℤ/5)ˣ と同じ形の、位数 4 の巡回群。'));
      return {
        check() {
          const bad = [2, 3, 4].find((k) => map[k] !== (2 * k) % 5);
          return bad == null ? OK : fail(`σ(ζ${sup(bad)}) が違う。σ(ζ${sup(bad)}) = σ(ζ)${sup(bad)} = (ζ²)${sup(bad)} のはず。`);
        },
        cheat() { for (const k of [2, 3, 4]) { map[k] = (2 * k) % 5; btns[k].set(map[k]); } draw(); },
      };
    },
  };

  P.frobenius = {
    title: 'フロベニウスの祠',
    intro: 'K = ℚ(√−7) を定める方程式 <b>f(x) = x² + x + 2</b> を、素数 p を法として解く。各 p について、<b>f(x) ≡ 0 (mod p) の解 x を 1 つ</b>選べ。解が無ければ「なし」のまま。<br>解がある ⇔ p は K で分解 ⇔ <b>Frob<sub>p</sub> = 1</b>。 解がない ⇔ p は惰性 ⇔ <b>Frob<sub>p</sub> = c</b> (複素共役)。',
    hint: 'x = 0, 1, …, p−1 を順に試す。p = 11 には解がある。第 1 章の χ_K(p) = (p/7) と見比べてみよう: 平方剰余 1, 2, 4 に入る p だけが分解する。',
    build(body) {
      const ps = [2, 3, 5, 11, 13];
      const x = {}; const steps = {}; const lines = {};
      const upd = (p) => {
        const v = x[p];
        lines[p].textContent = v < 0 ? 'Frob = c  (惰性・解なし)   オイラー因子 (1 + p⁻ˢ)⁻¹' : `f(${v}) = ${L.fK(v)} ≡ ${L.fK(v) % p} (mod ${p})` + (L.fK(v) % p === 0 ? '  ✓  Frob = 1 (分解)   オイラー因子 (1 − p⁻ˢ)⁻¹' : '  ✗');
      };
      for (const p of ps) {
        x[p] = -1;
        steps[p] = stepper(-1, p - 1, -1, (v) => { x[p] = v; upd(p); }, (v) => (v < 0 ? 'なし' : String(v)));
        lines[p] = h('span', { class: 'pz-label' });
        body.appendChild(h('div', { class: 'pz-row' }, h('b', { style: 'min-width:56px' }, 'p = ' + p), steps[p], lines[p]));
        upd(p);
      }
      body.appendChild(h('p', { class: 'pz-note' }, 'L(s, χ_K) のオイラー因子は Frob_p だけで決まる: χ_K(p) = +1 (Frob = 1) か −1 (Frob = c)。'));
      return {
        check() {
          for (const p of ps) {
            const roots = L.rootsMod(p);
            if (roots.length && x[p] < 0) return fail(`p = ${p} には解がある。探してみよう。`);
            if (x[p] >= 0 && !roots.includes(x[p])) return fail(`p = ${p}: x = ${x[p]} は解ではない。`);
          }
          return OK;
        },
        cheat() { for (const p of ps) { const r = L.rootsMod(p); x[p] = r.length ? r[0] : -1; steps[p].set(x[p]); upd(p); } },
      };
    },
  };

  P.galrep = {
    title: 'ガロア表現の祠',
    intro: 'ガロア群 G = Gal(ℚ(ζ₅)/ℚ) は σ (ζ ↦ ζ²) で生成される位数 4 の巡回群。<br>行列 <b>M = ρ(σ)</b> を決めて 2 次元表現 ρ: G → GL₂(ℤ) を構成せよ。条件: <b>M⁴ = I</b> (群の関係を保つ) かつ <b>M² ≠ I</b> (σ² を見分けられる)。成分は −1, 0, 1。',
    hint: '「90° 回転」の行列を思い出そう。',
    build(body) {
      const M = [0, 0, 0, 0];
      const info = h('div', { class: 'pz-mono' });
      const show = (A) => `[${fmt(A[0])} ${fmt(A[1])}; ${fmt(A[2])} ${fmt(A[3])}]`;
      const upd = () => {
        const M2 = L.pow2(M, 2), M4 = L.pow2(M, 4);
        const tr = (k) => { const A = L.pow2(M, k); return fmt(A[0] + A[3]); };
        info.textContent = `M² = ${show(M2)}   M⁴ = ${show(M4)}\n\n` +
          'p            :   2    3    7   11   19\n' +
          'Frob_p       :   σ   σ³    σ    1   σ²     (p ≡ 2^k mod 5 なら Frob_p = σ^k)\n' +
          `tr ρ(Frob_p) : ${[1, 3, 1, 0, 2].map((k) => tr(k).padStart(3)).join('  ')}`;
      };
      const btns = [0, 1, 2, 3].map((i) => cycler([0, 1, -1], ['0', '1', '−1'], 0, (v) => { M[i] = v; upd(); }));
      body.appendChild(h('div', { class: 'pz-matrix' },
        h('div', { class: 'pz-mrow' }, btns[0], btns[1]),
        h('div', { class: 'pz-mrow' }, btns[2], btns[3])));
      body.appendChild(info); upd();
      body.appendChild(h('p', { class: 'pz-note' }, 'フロベニウス元の行列のトレースを素数ごとに並べた列が、表現の「指紋」。保型形式の側ではこれがヘッケ固有値にあたる。'));
      return {
        check() {
          if (!L.isId2(L.pow2(M, 4))) return fail('M⁴ ≠ I。σ⁴ = 1 という群の関係が保たれていない。');
          if (L.isId2(L.pow2(M, 2))) return fail('M² = I になってしまった。σ² と 1 を見分けられない。');
          return OK;
        },
        cheat() { [0, -1, 1, 0].forEach((v, i) => { M[i] = v; btns[i].set(v); }); upd(); },
      };
    },
  };

  P.cohomology = {
    title: 'コホモロジーの祠',
    intro: '群 G = {1, σ} が M = ℤ/12 に <b>σ·m = 5m</b> で作用する。写像 c: G → M は c(σ) = m で決まる。<br>・<b>コサイクル</b>の条件: c(σ²) = c(σ) + σ·c(σ) が 0、つまり <b>m + 5m ≡ 0 (mod 12)</b><br>・<b>コバウンダリ</b> (自明なコサイクル): ある n で <b>m = σ·n − n = 4n</b><br>各 m を分類せよ: <b>✗</b> コサイクルでない / <b>0</b> コバウンダリ / <b>★</b> 自明でない類。H¹ = コサイクル ÷ コバウンダリ。',
    hint: '6m が 12 の倍数になるのは m が偶数のとき。4n の形で書けるのは 0, 4, 8。',
    build(body) {
      const kind = {}; const btns = {};
      const info = h('p', {});
      const upd = () => {
        const c = Object.values(kind);
        const z = c.filter((k) => k !== 'x').length, bd = c.filter((k) => k === '0').length;
        info.textContent = `コサイクル ${z} 個、コバウンダリ ${bd} 個` + (bd && z % bd === 0 ? ` → H¹ の位数は ${z / bd}` : '');
      };
      const row = h('div', { class: 'pz-row pz-wrap' });
      for (let m = 0; m < 12; m++) {
        kind[m] = 'x';
        btns[m] = cycler(['x', '0', '*'], ['✗', '0', '★'], 'x', (v) => { kind[m] = v; upd(); }, 'pz-coh');
        row.appendChild(h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, 'm = ' + m), btns[m]));
      }
      body.appendChild(row); body.appendChild(info); upd();
      body.appendChild(h('p', { class: 'pz-note' }, 'ガロアコホモロジーでは G がガロア群、M がガロア表現 (を ℓ のべきで割ったもの)。H¹ の類が表現の拡大 ―― 保型形式の合同 ―― を分類する。'));
      return {
        check() {
          const wrong = Object.keys(kind).filter((m) => kind[m] !== L.cocycleKind(+m, 12, 5));
          return wrong.length ? fail(`分類の違う m が ${wrong.length} 個ある。`) : OK;
        },
        cheat() { for (let m = 0; m < 12; m++) { kind[m] = L.cocycleKind(m, 12, 5); btns[m].set(kind[m]); } upd(); },
      };
    },
  };

  P.filtration = {
    title: 'フィルトレーションの祠',
    intro: 'ℤ/16 には入れ子の列 <b>Fil⁰ ⊃ Fil¹ ⊃ Fil² ⊃ Fil³ ⊃ Fil⁴ = {0}</b> がある (Fil<sup>i</sup> = 2<sup>i</sup> の倍数全体)。<br>各元について、それが属する<b>いちばん深い段 i</b> を答えよ。すると元は「層」gr<sup>i</sup> = Fil<sup>i</sup> ∖ Fil<sup>i+1</sup> に仕分けられる。',
    hint: '2 で何回割り切れるかを数える。0 はすべての段に入っているので、いちばん深い Fil⁴。',
    build(body) {
      const els = [1, 2, 4, 6, 8, 10, 12, 0];
      const lv = {}; const steps = {};
      const info = h('div', { class: 'pz-mono' });
      const upd = () => {
        info.textContent = [0, 1, 2, 3, 4].map((i) => `${'  '.repeat(i)}Fil${sup(i)} の層: { ${els.filter((e) => lv[e] === i).join(', ')} }`).join('\n');
      };
      const row = h('div', { class: 'pz-row pz-wrap' });
      for (const e of els) {
        lv[e] = 0;
        steps[e] = stepper(0, 4, 0, (v) => { lv[e] = v; upd(); }, (v) => 'Fil' + sup(v));
        row.appendChild(h('div', { class: 'pz-cell' }, h('div', { class: 'pz-label' }, '元 ' + e), steps[e]));
      }
      body.appendChild(row); body.appendChild(info); upd();
      body.appendChild(h('p', { class: 'pz-note' }, 'p 進ホッジ理論では、ガロア表現に付随する空間のホッジ・フィルトレーションを考える。層が 0 でない段の番号 (飛び) がホッジ・テイト重みで、保型形式の「重み」に対応する。'));
      return {
        check() {
          const bad = els.find((e) => lv[e] !== L.val2(e, 4));
          return bad == null ? OK : fail(`元 ${bad} の段が違う。`);
        },
        cheat() { for (const e of els) { lv[e] = L.val2(e, 4); steps[e].set(lv[e]); } upd(); },
      };
    },
  };

  // ---------- 終章 ----------
  P.final = {
    title: '主不等式の祭壇',
    intro: '手に入れた定理を、<b>論理の順</b>に上から並べよ。▲▼ でカードを動かす。いちばん上が出発点、いちばん下が結論。',
    hint: 'まず同じ量を上下から挟む。主量が消えて剰余の評価が残り、m ≈ √x で割ると指数 −1/2 が出る。判定法を使うのはその後。',
    build(body) {
      const cards = root.GAME_DATA.FINAL_CARDS;
      let order = [3, 5, 0, 4, 2, 1];
      const list = h('div', { class: 'pz-cards' });
      const move = (i, d) => { const j = i + d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; render(); };
      function render() {
        list.innerHTML = '';
        order.forEach((ci, i) => {
          const c = cards[ci];
          list.appendChild(h('div', { class: 'pz-card' },
            h('div', { class: 'pz-card-btns' },
              h('button', { type: 'button', onclick: () => move(i, -1) }, '▲'),
              h('button', { type: 'button', onclick: () => move(i, 1) }, '▼')),
            h('div', {}, h('b', {}, c.title), h('div', { class: 'pz-card-text' }, c.text))));
        });
      }
      body.appendChild(list); render();
      return {
        check() {
          const k = order.findIndex((ci, i) => ci !== i);
          return k < 0 ? OK : fail(`上から ${k + 1} 番目のカードが違う。`);
        },
        cheat() { order = [0, 1, 2, 3, 4, 5]; render(); },
      };
    },
  };

  const API = { PuzzleLogic: L, PUZZLES: P };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.PuzzleLogic = L;
  root.PUZZLES = P;
})(typeof window !== 'undefined' ? window : globalThis);
