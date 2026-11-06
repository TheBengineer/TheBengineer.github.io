/* TheBengineer — ternary pillar plot (triangle).
   Dependency-free canvas engine: the three pillars are the corners of an
   equilateral triangle and each project is plotted inside by its pillar mix
   (plot: [SW, EL, MEC] normalized to a composition).
   Data is fed as window.PLOT_POINTS from _includes/plot.html. */
(function () {
  "use strict";

  var canvas = document.getElementById("plot-canvas");
  if (!canvas || !Array.isArray(window.PLOT_POINTS)) return;

  var ctx = canvas.getContext("2d");
  var P = window.PLOT_POINTS;

  var COL = {
    sw:  [88, 166, 255],
    el:  [126, 231, 135],
    mec: [255, 166, 87]
  };
  var FG = "230, 237, 243";
  var AXIS = ["sw", "el", "mec"];

  var W = 0, H = 0, dpr = 1;
  var mouse = { x: -1, y: -1 };
  var hover = -1;              // index under the pointer (canvas-side)
  var linkHover = -1;          // index flagged from the project cards
  var lastHover = -1;          // last hover index applied to the cards
  var cardEls = [];

  /* ---------- helpers ---------- */

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  // deterministic per-project jitter so projects with identical pillar
  // mixes don't stack on the same point
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mixCol(s) {
    var total = Math.max(s[0] + s[1] + s[2], 0.0001);
    var out = [0, 0, 0];
    for (var i = 0; i < 3; i++) {
      out[i] = Math.round((COL.sw[i] * s[0] + COL.el[i] * s[1] + COL.mec[i] * s[2]) / total);
    }
    return out;
  }

  var rgba = function (c, a) {
    return "rgba(" + c[0] + ", " + c[1] + ", " + c[2] + ", " + a.toFixed(3) + ")";
  };

  /* ---------- data ---------- */

  var pts = P.map(function (d) {
    var s = [clamp01(d.p[0]), clamp01(d.p[1]), clamp01(d.p[2])];
    return {
      name: d.n,
      url: d.u,
      mix: s,
      col: mixCol(s),
      maxAxis: Math.max(s[0], s[1], s[2])
    };
  });

  /* ---------- sizing & geometry ---------- */

  function fit() {
    var cssW = canvas.parentElement.clientWidth;
    var side = Math.max(300, Math.min(560, Math.round(cssW)));
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(side * dpr);
    canvas.height = Math.round(side * dpr);
    W = side; H = side;
  }
  fit();
  window.addEventListener("resize", fit);

  var M = 0;                    // inset from canvas edge
  var A = [0, 0], B = [0, 0], C = [0, 0];   // SW (top), EL (bottom-right), MEC (bottom-left)

  function geo() {
    M = Math.round(W * 0.16);              // room for corner labels inside the frame
    A = [W / 2, M];
    B = [W - M, H - M];
    C = [M, H - M];
  }
  geo();

  // barycentric position: mix normalized so it sums to 1
  function toScreen(mix) {
    var t = Math.max(mix[0] + mix[1] + mix[2], 0.0001);
    var s = mix[0] / t, e = mix[1] / t, m = mix[2] / t;
    return [
      s * A[0] + e * B[0] + m * C[0],
      s * A[1] + e * B[1] + m * C[1]
    ];
  }

  // small deterministic nudge in barycentric space for near-identical mixes
  function jitter(name) {
    var h = hash(name);
    var a = (h % 3600) / Math.PI * 0.5;
    var r = 0.012 + ((h >>> 8) % 100) / 100 * 0.02;
    return [
      Math.cos(a) * r,
      Math.sin(a) * r,
      ((h >>> 4) % 100) / 100 * 0.02 - 0.01
    ];
  }

  /* corner labels: SW top, EL bottom-right, MEC bottom-left */
  var CORNER_LABEL = [
    { pos: A, dx: 0, dy: -10, align: "center" },
    { pos: B, dx: -4, dy: 20, align: "right" },
    { pos: C, dx: 4, dy: 20, align: "left" }
  ];

  /* ---------- drawing ---------- */

  function paint() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    /* triangle interior */
    ctx.beginPath();
    ctx.moveTo(A[0], A[1]);
    ctx.lineTo(B[0], B[1]);
    ctx.lineTo(C[0], C[1]);
    ctx.closePath();
    ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
    ctx.fill();

    /* hint grid: lines of constant SW / EL / MEC share */
    for (var g = 0; g < 3; g++) {
      var c0 = [0, 0, 0]; c0[g] = 1;                 // corner of this axis
      for (var k = 1; k <= 3; k++) {
        var t = k * 0.25;
        var other0 = (g + 1) % 3, other1 = (g + 2) % 3;
        var m1 = [0, 0, 0], m2 = [0, 0, 0];
        m1[g] = t; m1[other0] = 1 - t;
        m2[g] = t; m2[other1] = 1 - t;
        var p1 = toScreen(m1), p2 = toScreen(m2);
        ctx.strokeStyle = "rgba(139, 148, 158, 0.10)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.stroke();
      }
    }

    /* edges */
    ctx.beginPath();
    ctx.moveTo(A[0], A[1]);
    ctx.lineTo(B[0], B[1]);
    ctx.lineTo(C[0], C[1]);
    ctx.closePath();
    ctx.strokeStyle = "rgba(139, 148, 158, 0.45)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    /* corner glows + labels */
    for (var i = 0; i < 3; i++) {
      var cc = COL[AXIS[i]];
      var pos = CORNER_LABEL[i].pos;

      var grad = ctx.createRadialGradient(pos[0], pos[1], 2, pos[0], pos[1], 46);
      grad.addColorStop(0, rgba(cc, 0.28));
      grad.addColorStop(1, rgba(cc, 0));
      ctx.save();
      ctx.translate(pos[0] * 0.9 + W / 2 * 0.1, pos[1] * 0.9 + H / 2 * 0.1); // pull glow just inside corner
      ctx.fillStyle = grad;
      ctx.fillRect(-46, -46, 92, 92);
      ctx.restore();

      ctx.font = "600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = CORNER_LABEL[i].align;
      ctx.fillStyle = rgba(cc, 0.95);
      ctx.fillText(AXIS[i].toUpperCase(), pos[0] + CORNER_LABEL[i].dx, pos[1] + CORNER_LABEL[i].dy);
    }

    /* project points */
    var views = pts.map(function (p) {
      var j = jitter(p.name);
      var sj = [
        Math.max(0.004, p.mix[0] + j[0]),
        Math.max(0.004, p.mix[1] + j[1]),
        Math.max(0.004, p.mix[2] + j[2])
      ];
      var sc = toScreen(sj);
      return { x: sc[0], y: sc[1], ref: p };
    });

    for (var n = 0; n < views.length; n++) {
      var v = views[n], p = v.ref;
      var r = 4 + 3.2 * p.maxAxis;

      ctx.save();
      ctx.shadowColor = rgba(p.col, 0.85);
      ctx.shadowBlur = 12;
      ctx.fillStyle = rgba(p.col, 0.90);
      ctx.beginPath();
      ctx.arc(v.x, v.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "rgba(" + FG + ", 0.85)";
      ctx.beginPath();
      ctx.arc(v.x, v.y, Math.max(1, r * 0.26), 0, Math.PI * 2);
      ctx.fill();
    }

    /* hover hit test */
    hover = -1;
    var best = 14;
    for (var h = 0; h < views.length; h++) {
      var dx = mouse.x - views[h].x, dy = mouse.y - views[h].y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (mouse.x >= 0 && dist < best) {
        best = dist;
        hover = h;
      }
    }
    var active = linkHover > -1 ? linkHover : hover;

    /* labels — callout style: standoff layout so labels never overlap,
       with a colored leader line back to the dot when one had to move. */
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    var LH = 12, LP = 2;

    /* reserve space around the big corner labels */
    var boxes = [];
    for (var cl = 0; cl < 3; cl++) {
      var clab = CORNER_LABEL[cl];
      var clw = ctx.measureText(AXIS[cl].toUpperCase()).width;
      var clx = clab.align === "right" ? clab.pos[0] + clab.dx - clw
              : clab.align === "left"  ? clab.pos[0] + clab.dx
              : clab.pos[0] + clab.dx - clw / 2;
      boxes.push({
        x0: clx - 6, x1: clx + clw + 6,
        y0: clab.pos[1] + clab.dy - 12, y1: clab.pos[1] + clab.dy + 4
      });
    }

    /* desired spot: beside the dot (right, or left when near the edge) */
    var callouts = views.map(function (v, i) {
      var w = ctx.measureText(v.ref.name).width;
      var side = (v.x + 8 + w <= W - 6) ? 1 : -1;
      return {
        i: i, v: v, name: v.ref.name, w: w, side: side,
        lx: side > 0 ? v.x + 8 : v.x - 8 - w,
        ly: v.y - 5, base: v.y - 5
      };
    });
    callouts.sort(function (a, b) { return a.ly - b.ly; });

    /* standoff pass: walk top → bottom, push down on any overlap */
    callouts.forEach(function (co) {
      for (var it = 0; it < 5; it++) {
        if (co.ly < 2) co.ly = 2;
        if (co.ly > H - LH - 2) co.ly = H - LH - 2;
        var pushed = null;
        for (var b = 0; b < boxes.length; b++) {
          var bx = boxes[b];
          if (co.lx - LP < bx.x1 && co.lx + co.w + LP > bx.x0 &&
              co.ly < bx.y1 && co.ly + LH > bx.y0) {
            co.ly = bx.y1 + LP;
            pushed = bx;
          }
        }
        if (!pushed) break;
      }
      co.displaced = Math.abs(co.ly - co.base) > 1;
      boxes.push({ x0: co.lx - LP, x1: co.lx + co.w + LP, y0: co.ly, y1: co.ly + LH });
    });

    /* leaders first, text on top — only moved labels get a leader */
    callouts.forEach(function (co) {
      var isActive = co.i === active;
      var baseline = co.ly + 9, midY = baseline - 3.5;
      if (co.displaced) {
        var ax = co.side > 0 ? co.lx - 3 : co.lx + co.w + 3;
        var sdx = ax - co.v.x, sdy = midY - co.v.y;
        var len = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
        var r = 4 + 3.2 * co.v.ref.maxAxis;
        ctx.strokeStyle = rgba(co.v.ref.col, isActive ? 0.85 : 0.40);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(co.v.x + sdx / len * (r + 1.5), co.v.y + sdy / len * (r + 1.5));
        ctx.lineTo(ax, midY);
        ctx.stroke();
      }
      var aL = (0.45 + 0.40 * co.v.ref.maxAxis) * (active > -1 && !isActive ? 0.35 : 1);
      if (isActive) aL = Math.min(1, aL + 0.25);
      ctx.fillStyle = "rgba(" + FG + ", " + Math.min(1, aL).toFixed(3) + ")";
      ctx.textAlign = "left";
      ctx.fillText(co.name, co.lx, baseline);
    });

    /* highlight ring — card hover (linkHover) wins over pointer hover */
    if (active > -1) {
      var av = views[active];
      var ac = av.ref.col;
      ctx.fillStyle = rgba(ac, 0.10);
      ctx.beginPath();
      ctx.arc(av.x, av.y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = rgba(ac, 0.95);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(av.x, av.y, 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    /* converse: pointer on the graph highlights the matching card */
    if (hover !== lastHover) {
      if (lastHover > -1 && cardEls[lastHover]) cardEls[lastHover].classList.remove("is-hot");
      if (hover > -1 && cardEls[hover]) cardEls[hover].classList.add("is-hot");
      lastHover = hover;
    }

    /* tooltip */
    if (hover > -1 && mouse.x >= 0) {
      var p2 = views[hover].ref;
      var label = p2.name;
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      var tw = ctx.measureText(label).width + 22;
      var th = 22;
      var tx = mouse.x + 12, ty = mouse.y - 30;
      if (tx + tw > W - 4) tx = mouse.x - tw - 10;
      if (ty < 4) ty = mouse.y + 12;
      ctx.fillStyle = "rgba(13, 17, 23, 0.96)";
      ctx.strokeStyle = "rgba(48, 54, 61, 0.95)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(tx, ty, tw, th, 6);
      else ctx.rect(tx, ty, tw, th);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(" + FG + ", 0.95)";
      ctx.textAlign = "left";
      ctx.fillText(label, tx + 11, ty + 15);
    }

    return views;
  }

  /* ---------- interaction ---------- */

  var downAt = { x: -1, y: -1 };

  canvas.addEventListener("pointerdown", function (e) {
    downAt.x = e.clientX; downAt.y = e.clientY;
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", function (e) {
    var rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  canvas.addEventListener("pointerup", function (e) {
    var movedPx = Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y);
    if (movedPx < 8 && hover > -1 && pts[hover].url) {
      window.open(pts[hover].url, "_blank", "noopener");
    }
  });
  canvas.addEventListener("pointercancel", function () { downAt.x = -1; });
  canvas.addEventListener("pointerleave", function () {
    mouse.x = -1; mouse.y = -1;
  });
  canvas.addEventListener("dblclick", function (e) { e.preventDefault(); });

  /* card ⇄ graph linkage — hover/focus either side, highlight both */
  function bindCards() {
    cardEls = Array.prototype.slice.call(document.querySelectorAll(".project-grid .project"));
    cardEls.forEach(function (el) {
      var i = parseInt(el.getAttribute("data-index"), 10);
      if (isNaN(i) || i < 0 || i >= pts.length) i = cardEls.indexOf(el);
      el.addEventListener("pointerenter", function () { linkHover = i; });
      el.addEventListener("pointerleave", function () { if (linkHover === i) linkHover = -1; });
      el.addEventListener("focusin", function () { linkHover = i; });
      el.addEventListener("focusout", function () { if (linkHover === i) linkHover = -1; });
    });
  }
  bindCards();

  /* ---------- loop ---------- */

  function loop() {
    var views = paint();
    canvas.style.cursor = hover > -1 ? "pointer" : "default";
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
