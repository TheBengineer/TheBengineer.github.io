/* TheBengineer — spinning 3D pillar plot.
   Dependency-free canvas engine: cube + axes + per-project points.
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
  var AXIS = ["sw", "el", "mec"];      // X, Y, Z labels/colors
  var ORIGIN = [-1, -1, -1];           // where the axes meet

  var INSET = 0.88;                    // keep points just inside the faces
  var APPROACH = {
    pitch: 0.42,                       // resting tilt (rad) — camera above the equator
    spin: 0.11,                        // rad / second — slow drift (full turn ≈ 57 s)
    drag: 0.0068                       // rad per pixel of drag
  };
  var PITCH_MIN = -0.55, PITCH_MAX = 1.15;

  var W = 0, H = 0, dpr = 1;
  var yaw = 0.65, pitch = APPROACH.pitch;
  var spin = true;
  var prefReduced = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefReduced) spin = false;

  var dragging = false, moved = 0, lastX = 0, lastY = 0;
  var mouse = { x: -1, y: -1 };
  var hover = -1;              // index under the pointer (canvas-side)
  var linkHover = -1;          // index flagged from the project cards
  var lastHover = -1;          // last hover index applied to the cards
  var cardEls = [];

  /* ---------- data ---------- */

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
  function jitter(name) {
    var a = (hash(name) % 3600) / Math.PI * 0.5;      // angle
    var r = 0.025 + ((hash(name) >>> 8) % 100) / 100 * 0.03;
    return [Math.cos(a) * r, Math.sin(a) * r, ((hash(name) >>> 4) % 100) / 100 * 0.05 - 0.025];
  }
  function mixCol(s) {
    var total = Math.max(s[0] + s[1] + s[2], 0.0001);
    var out = [0, 0, 0];
    out[0] = Math.round((COL.sw[0] * s[0] + COL.el[0] * s[1] + COL.mec[0] * s[2]) / total);
    out[1] = Math.round((COL.sw[1] * s[0] + COL.el[1] * s[1] + COL.mec[1] * s[2]) / total);
    out[2] = Math.round((COL.sw[2] * s[0] + COL.el[2] * s[1] + COL.mec[2] * s[2]) / total);
    return out;
  }

  var pts = P.map(function (d) {
    var s = [clamp01(d.p[0]), clamp01(d.p[1]), clamp01(d.p[2])];
    var pos = [
      (s[0] * 2 - 1) * INSET,
      (s[1] * 2 - 1) * INSET,
      (s[2] * 2 - 1) * INSET
    ];
    var j = jitter(d.n);
    return {
      name: d.n,
      url: d.u,
      pos: [pos[0] + j[0], pos[1] + j[1], pos[2] + j[2]],
      col: mixCol(s),
      maxAxis: Math.max(s[0], s[1], s[2])
    };
  });

  /* cube edges — index pairs of the 8 corner vertices */
  var CORNERS = [];
  for (var i = 0; i < 8; i++) {
    CORNERS.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1]);
  }
  var EDGES = [];
  for (var a = 0; a < 8; a++) {
    for (var b = a + 1; b < 8; b++) {
      var d3 = 0;
      for (var k = 0; k < 3; k++) {
        if (CORNERS[a][k] !== CORNERS[b][k]) d3++;
      }
      if (d3 === 1) EDGES.push([a, b]);
    }
  }
  function cornerIndex(x, y, z) {
    for (var m = 0; m < 8; m++) {
      if (CORNERS[m][0] === x && CORNERS[m][1] === y && CORNERS[m][2] === z) return m;
    }
    return 0;
  }
  var AXIS_END = [
    cornerIndex(1, -1, -1),
    cornerIndex(-1, 1, -1),
    cornerIndex(-1, -1, 1)
  ];
  var ORIGIN_I = cornerIndex(-1, -1, -1);

  /* back planes (facing away at resting orientation) */
  var PLANES = [
    [cornerIndex(-1, -1, -1), cornerIndex(-1, -1, 1), cornerIndex(-1, 1, 1), cornerIndex(-1, 1, -1)], // x = -1
    [cornerIndex(-1, -1, -1), cornerIndex(1, -1, -1), cornerIndex(1, -1, 1), cornerIndex(-1, -1, 1)], // y = -1
    [cornerIndex(-1, -1, -1), cornerIndex(1, -1, -1), cornerIndex(1, 1, -1), cornerIndex(-1, 1, -1)]  // z = -1
  ];

  /* ---------- sizing / projection ---------- */

  function fit() {
    var cssW = canvas.parentElement.clientWidth;
    var side = Math.max(280, Math.min(560, Math.round(cssW)));
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(side * dpr);
    canvas.height = Math.round(side * dpr);
    W = side; H = side;
  }
  fit();
  window.addEventListener("resize", fit);

  function rotate(p) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var x1 = p[0] * cy + p[2] * sy;
    var z1 = -p[0] * sy + p[2] * cy;
    var y2 = p[1] * cp - z1 * sp;
    var z2 = p[1] * sp + z1 * cp;
    return [x1, y2, z2];
  }

  var FOV = 3.4, SCALE_K = 0.315;
  function project(rt) {                 // rt = rotated point
    var persp = FOV / Math.max(0.4, FOV - rt[2]);
    var scale = SCALE_K * Math.max(W, H);
    return {
      x: W / 2 + rt[0] * persp * scale,
      y: H / 2 - rt[1] * persp * scale,
      d: persp                          // 0.7 (far) .. 1.35 (near)
    };
  }
  var rgba = function (c, a) {
    return "rgba(" + c[0] + ", " + c[1] + ", " + c[2] + ", " + a.toFixed(3) + ")";
  };

  /* ---------- drawing ---------- */

  function paint(dt) {
    if (spin && !dragging) yaw += APPROACH.spin * dt;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    var proj = {
      corners: CORNERS.map(function (c) { return project(rotate(c)); }),
      n: null
    };
    var origin = proj.corners[ORIGIN_I];

    /* back planes */
    PLANES.forEach(function (plane) {
      ctx.beginPath();
      plane.forEach(function (idx, i) {
        var q = proj.corners[idx];
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(255, 255, 255, 0.025)";
      ctx.fill();
      ctx.strokeStyle = "rgba(48, 54, 61, 0.55)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    /* cube edges (back → front feel) */
    EDGES.forEach(function (e) {
      var a = proj.corners[e[0]], b = proj.corners[e[1]];
      var depth = Math.min(a.d, b.d);
      ctx.strokeStyle = "rgba(139, 148, 158, " + (0.16 + 0.42 * (depth - 0.66)) .toFixed(3) + ")";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });

    /* axes from origin to each axis end, with labels */
    for (var i = 0; i < 3; i++) {
      var c = COL[AXIS[i]];
      var end = proj.corners[AXIS_END[i]];
      var grad = ctx.createLinearGradient(origin.x, origin.y, end.x, end.y);
      grad.addColorStop(0, rgba(c, 0.22));
      grad.addColorStop(1, rgba(c, 0.95));
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      var lbl = AXIS[i].toUpperCase();
      ctx.font = "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = rgba(c, Math.min(1, 0.35 + 0.55 * end.d));
      var lx = W / 2 + (end.x - W / 2) * 1.16;
      var ly = H / 2 + (end.y - H / 2) * 1.16;
      ctx.fillText(lbl, lx, ly);
    }

    /* project points */
    var views = pts.map(function (p) {
      var v = project(rotate(p.pos));
      v.ref = p;
      return v;
    });
    views.sort(function (a, b) { return b.d - a.d; }); /* far first */

    for (var j = 0; j < views.length; j++) {
      var v = views[j], p = v.ref;
      var near = (v.d - 0.7) / 0.65;              // 0 far .. 1 near
      var alpha = 0.30 + 0.60 * near;
      var r = 2.6 + 1.8 * p.maxAxis + near * 1.6;

      ctx.save();
      ctx.shadowColor = rgba(p.col, alpha * 0.85);
      ctx.shadowBlur = 14 * v.d;
      ctx.fillStyle = rgba(p.col, alpha);
      ctx.beginPath();
      ctx.arc(v.x, v.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "rgba(" + FG + ", " + Math.min(0.95, 0.35 + 0.5 * near) + ")";
      ctx.beginPath();
      ctx.arc(v.x, v.y, Math.max(1, r * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }

    /* hover */
    hover = -1;
    var best = 14;
    for (var h = 0; h < views.length; h++) {
      var dx = mouse.x - views[h].x, dy = mouse.y - views[h].y;
      var dist = dx * dx + dy * dy;
      if (mouse.x >= 0 && dist < best * best) {
        best = Math.sqrt(dist);
        hover = h;
      }
    }
    /* labels — right of each dot, flipped to the left near the edge */
    for (var l = 0; l < views.length; l++) {
      var lv = views[l], lp = lv.ref;
      var nearL = (lv.d - 0.7) / 0.65;
      var alphaL = 0.22 + 0.66 * nearL;
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      var labelX = lv.x + 8;
      ctx.textAlign = "left";
      if (labelX + ctx.measureText(lp.name).width > W - 6) {
        ctx.textAlign = "right";
        labelX = lv.x - 8;
      }
      ctx.fillStyle = "rgba(" + FG + ", " + alphaL.toFixed(3) + ")";
      ctx.fillText(lp.name, labelX, lv.y + 3.5);
    }

    /* highlight ring — card hover (linkHover) wins over pointer hover */
    var active = linkHover > -1 ? linkHover : hover;
    if (active > -1) {
      var activeView = null;
      for (var av = 0; av < views.length; av++) {
        if (views[av].ref === pts[active]) { activeView = views[av]; break; }
      }
      if (activeView) {
        var ac = activeView.ref.col;
        ctx.fillStyle = rgba(ac, 0.10);
        ctx.beginPath();
        ctx.arc(activeView.x, activeView.y, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(ac, 0.95);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(activeView.x, activeView.y, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
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
  }

  /* ---------- interaction ---------- */

  canvas.addEventListener("pointerdown", function (e) {
    dragging = true; moved = 0;
    lastX = e.clientX; lastY = e.clientY;
    canvas.focus();
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", function (e) {
    var rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    if (dragging) {
      var dX = e.clientX - lastX, dY = e.clientY - lastY;
      yaw += dX * APPROACH.drag;
      pitch += dY * APPROACH.drag * 0.8;
      pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch));
      moved += Math.abs(dX) + Math.abs(dY);
      lastX = e.clientX; lastY = e.clientY;
    }
  });
  canvas.addEventListener("pointerup", function () {
    if (!dragging) return;
    dragging = false;
    if (moved < 8 && hover > -1 && pts[hover].url) {
      window.open(pts[hover].url, "_blank", "noopener");
    }
  });
  canvas.addEventListener("pointercancel", function () { dragging = false; });
  canvas.addEventListener("pointerleave", function () {
    if (!dragging) { mouse.x = -1; mouse.y = -1; }
  });
  canvas.addEventListener("dblclick", function (e) { e.preventDefault(); });

  var toggle = document.getElementById("plot-toggle");
  if (toggle) {
    var setLbl = function () { toggle.textContent = spin ? "pause" : "spin"; };
    setLbl();
    toggle.addEventListener("click", function () {
      spin = !spin;
      setLbl();
    });
  }

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

  var lastTs = null;
  function loop(ts) {
    var dt = lastTs === null ? 16.7 : Math.min(64, ts - lastTs);
    lastTs = ts;
    paint(dt / 1000);
    canvas.style.cursor = hover > -1 ? "pointer" : (dragging ? "grabbing" : "grab");
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
