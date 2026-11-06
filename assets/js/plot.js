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
  var layout = null;           // force-layout state, one node per label
  var settled = false;         // true once layout froze at steady state

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
    layout = null;               // dots move → rebuild the force layout
    settled = false;
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

  /* corner labels: Software top, Electrical bottom-right, Mechanical bottom-left */
  var CORNER_LABEL = [
    { name: "Software",   pos: A, dx: 0,  dy: -10, align: "center" },
    { name: "Electrical", pos: B, dx: -4, dy: 20,  align: "right" },
    { name: "Mechanical", pos: C, dx: 4,  dy: 20,  align: "left" }
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

      ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = CORNER_LABEL[i].align;
      ctx.fillStyle = rgba(cc, 0.95);
      ctx.fillText(CORNER_LABEL[i].name, pos[0] + CORNER_LABEL[i].dx, pos[1] + CORNER_LABEL[i].dy);
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

    /* labels — force-directed callouts. Each label is a node tethered to
       its dot by a leader line; nodes ease toward an anchor beside their
       dot, labels repel each other, so they settle overlap-free. */
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    var LH = 12, LP = 4;
    /* Overdamped velocity dynamics — deliberately NOT a positional-kick
       solver. Positional kicks put the system at its natural frequency
       (every pass teleports, then the spring teleports back), which rings.
       Here forces are accelerations, each mass carries velocity with
       friction, and the system runs well below resonance with damping
       ratio > 1 (overdamped), so oscillations cannot be sustained.
       Natural freq wn = sqrt(k); friction c = 1 - VEL_KEEP; zeta = c/(2*wn).
       With TETHER=0.030, VEL_KEEP=0.58: wn~0.17, zeta~1.2 → overdamped. */
    var TETHER = 0.030;   /* tether spring stiffness (low → low wn) */
    var REPEL  = 0.055;   /* label↔label overlap stiffness */
    var DOTK   = 0.055;   /* label↔dot avoidance stiffness */
    var NOGOK  = 0.055;   /* label↔corner-label stiffness */
    var VEL_KEEP = 0.58;  /* velocity retained per substep (42% friction) */
    var VMAX = 2.2;       /* max px/substep — prevents pop-throughs */
    var SUBSTEPS = 8;     /* physics substeps per rendered frame */
    var SETTLE_EPS = 0.02;

    /* corner labels are static no-go zones (measure in their own font) */
    ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    var nogo = [];
    for (var cl = 0; cl < 3; cl++) {
      var clab = CORNER_LABEL[cl];
      var clw = ctx.measureText(clab.name).width;
      var clx = clab.align === "right" ? clab.pos[0] + clab.dx - clw
              : clab.align === "left"  ? clab.pos[0] + clab.dx
              : clab.pos[0] + clab.dx - clw / 2;
      nogo.push({
        x0: clx - 8, x1: clx + clw + 8,
        y0: clab.pos[1] + clab.dy - 13, y1: clab.pos[1] + clab.dy + 5
      });
    }
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

    /* persistent node state — reinitialized on resize.
       vx/vy carry momentum; k is detuned per node (±15%) so no single
       natural frequency can lock the whole cluster into one mode. */
    if (!layout || layout.length !== views.length) {
      layout = views.map(function (v) {
        var w = ctx.measureText(v.ref.name).width;
        var side = (v.x + 10 + w <= W - 6) ? 1 : -1;
        var detune = 0.85 + 0.30 * ((hash(v.ref.name) % 100) / 100);
        return {
          w: w, side: side,
          ax: side > 0 ? 10 : -10 - w,   /* anchor offset from dot x */
          x: v.x + (side > 0 ? 10 : -10 - w),
          y: v.y - 5,
          vx: 0, vy: 0, fx: 0, fy: 0,
          k: TETHER * detune
        };
      });
      settled = false;
    }

    /* Overdamped integration: spring + repulsion + avoidance are forces
       (accelerations). Integrate: v = v*VEL_KEEP + f; pos += v.
       Friction bleeds energy every substep, so the system decays
       monotonically to steady state instead of oscillating at wn.
       Substep rate runs well below the frame rate (wn << 1/dt). */
    if (!settled) {
    var maxSpeed = 0;
    for (var it = 0; it < SUBSTEPS; it++) {
      maxSpeed = 0;
      /* tether springs → forces (Jacobi: from start-of-substep state) */
      for (var s1 = 0; s1 < layout.length; s1++) {
        var st = layout[s1], sv = views[s1];
        st.fx = (sv.x + st.ax - st.x) * st.k;
        st.fy = (sv.y - 5 - st.y) * st.k;
      }
      /* label↔label repulsion → forces along the thinnest overlap axis */
      for (var pp = 0; pp < layout.length; pp++) {
        for (var qq = pp + 1; qq < layout.length; qq++) {
          var la = layout[pp], lb = layout[qq];
          var ox = Math.min(la.x + la.w + LP, lb.x + lb.w + LP) - Math.max(la.x - LP, lb.x - LP);
          var oy = Math.min(la.y + LH + LP, lb.y + LH + LP) - Math.max(la.y - LP, lb.y - LP);
          if (ox > 0 && oy > 0) {
            if (ox < oy) {
              var dir = (la.x + la.w / 2) < (lb.x + lb.w / 2) ? -1 : 1;
              var frx = REPEL * ox;
              la.fx += dir * frx;
              lb.fx -= dir * frx;
            } else {
              var dirY = la.y < lb.y ? -1 : 1;
              var fry = REPEL * oy;
              la.fy += dirY * fry;
              lb.fy -= dirY * fry;
            }
          }
        }
      }
      /* corner-label + dot avoidance → forces */
      for (var s2 = 0; s2 < layout.length; s2++) {
        var st2 = layout[s2];
        for (var ng = 0; ng < nogo.length; ng++) {
          var nb = nogo[ng];
          var nox = Math.min(st2.x + st2.w + LP, nb.x1) - Math.max(st2.x - LP, nb.x0);
          var noy = Math.min(st2.y + LH + LP, nb.y1) - Math.max(st2.y - LP, nb.y0);
          if (nox > 0 && noy > 0) {
            if (nox < noy) {
              st2.fx += (st2.x + st2.w / 2) < (nb.x0 + nb.x1) / 2 ? -nox * NOGOK : nox * NOGOK;
            } else {
              st2.fy += st2.y < nb.y0 ? -noy * NOGOK : noy * NOGOK;
            }
          }
        }
        for (var dn = 0; dn < views.length; dn++) {
          var dv = views[dn];
          var dr = 4 + 3.2 * dv.ref.maxAxis + 4;     // dot radius + margin
          var nx = Math.max(st2.x, Math.min(dv.x, st2.x + st2.w));
          var ny = Math.max(st2.y, Math.min(dv.y, st2.y + LH));
          var ddx = dv.x - nx, ddy = dv.y - ny;
          var dd = Math.sqrt(ddx * ddx + ddy * ddy);
          if (dd < dr) {
            if (dd > 0.01) {
              /* dot under an edge/corner — push off along the normal */
              st2.fx -= ddx / dd * (dr - dd) * DOTK;
              st2.fy -= ddy / dd * (dr - dd) * DOTK;
            } else {
              /* dot center inside the label — force toward nearest edge */
              var mX = Math.min(dv.x - st2.x, st2.x + st2.w - dv.x);
              var mY = Math.min(dv.y - st2.y, st2.y + LH - dv.y);
              if (mX < mY) {
                var tx = dv.x < st2.x + st2.w / 2 ? dv.x - st2.w - dr : dv.x + dr;
                st2.fx += (tx - st2.x) * DOTK;
              } else {
                var ty = dv.y < st2.y + LH / 2 ? dv.y - LH - dr : dv.y + dr;
                st2.fy += (ty - st2.y) * DOTK;
              }
            }
          }
        }
      }
      /* integrate with friction; walls stop the normal velocity so
         the boundary cannot bounce the mass back into resonance */
      for (var s3 = 0; s3 < layout.length; s3++) {
        var nd = layout[s3];
        nd.vx = nd.vx * VEL_KEEP + nd.fx;
        nd.vy = nd.vy * VEL_KEEP + nd.fy;
        if (nd.vx > VMAX) nd.vx = VMAX;
        if (nd.vx < -VMAX) nd.vx = -VMAX;
        if (nd.vy > VMAX) nd.vy = VMAX;
        if (nd.vy < -VMAX) nd.vy = -VMAX;
        nd.x += nd.vx;
        nd.y += nd.vy;
        if (nd.x < 4) { nd.x = 4; nd.vx = 0; }
        if (nd.x > W - nd.w - 4) { nd.x = W - nd.w - 4; nd.vx = 0; }
        if (nd.y < 2) { nd.y = 2; nd.vy = 0; }
        if (nd.y > H - LH - 2) { nd.y = H - LH - 2; nd.vy = 0; }
        var sp = Math.max(Math.abs(nd.vx), Math.abs(nd.vy));
        if (sp > maxSpeed) maxSpeed = sp;
      }
    }
    /* steady state: velocities decayed to negligible → freeze layout */
    settled = maxSpeed < SETTLE_EPS;
    } /* !settled */

    /* leaders (tethers) first, labels on top */
    for (var s3 = 0; s3 < layout.length; s3++) {
      var st3 = layout[s3], lv = views[s3], isActive = s3 === active;
      var baseline = st3.y + 9, midY = baseline - 3.5;
      var ax = st3.side > 0 ? st3.x - 3 : st3.x + st3.w + 3;
      var sdx = ax - lv.x, sdy = midY - lv.y;
      var len = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
      var r = 4 + 3.2 * lv.ref.maxAxis;
      ctx.strokeStyle = rgba(lv.ref.col, isActive ? 0.85 : 0.40);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lv.x + sdx / len * (r + 1.5), lv.y + sdy / len * (r + 1.5));
      ctx.lineTo(ax, midY);
      ctx.stroke();
      var aL = (0.45 + 0.40 * lv.ref.maxAxis) * (active > -1 && !isActive ? 0.35 : 1);
      if (isActive) aL = Math.min(1, aL + 0.25);
      ctx.fillStyle = "rgba(" + FG + ", " + Math.min(1, aL).toFixed(3) + ")";
      ctx.textAlign = "left";
      ctx.fillText(lv.ref.name, st3.x, baseline);
    }

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
