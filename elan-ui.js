/* ===== Élan UI primitives ===== */
(function () {
  "use strict";

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  var toastEl = $("#toast"), toastText = $("#toastText"), toastTimer = null;
  function toast(msg) {
    if (!toastEl || !toastText) { return; }
    toastText.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2400);
  }

  function hhmm(ts) {
    var d = ts ? new Date(ts) : new Date();
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }
  function dayKey(ts) {
    var d = new Date(ts), n = new Date();
    if (d.toDateString() === n.toDateString()) return "今天";
    var y = new Date(n.getTime() - 864e5);
    if (d.toDateString() === y.toDateString()) return "昨天";
    return (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }
  function timeAgo(ts) {
    var s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return "刚刚";
    if (s < 3600) return Math.floor(s / 60) + " 分钟前";
    if (s < 86400) return Math.floor(s / 3600) + " 小时前";
    if (s < 86400 * 7) return Math.floor(s / 86400) + " 天前";
    return dayKey(ts);
  }
  function stamp(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + hhmm(ts);
  }

  function initial(name) { return String(name || "?").trim().charAt(0) || "?"; }
  function hue(seed) {
    var s = String(seed || ""), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }
  /* avatar markup: page styles use .av + --h */
  function avatar(user, size) {
    var h = hue(user && (user.handle || user.name));
    return '<span class="av av-' + (size || "md") + '" style="--h:' + h + '"><span>' +
      esc(initial(user && user.name)) + "</span></span>";
  }

  /* ---------- modal ---------- */
  function openModal(opts) {
    var wrap = el("div", "ms");
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", opts.title || "对话框");
    wrap.innerHTML =
      '<div class="ms-panel' + (opts.wide ? " is-wide" : "") + '"><div class="ms-head"><h3></h3>' +
      '<button class="icon-btn" data-close aria-label="关闭"><svg class="ico"><use href="#i-x"/></svg></button></div>' +
      '<div class="ms-body"></div><div class="ms-foot"></div></div>';
    $(".ms-head h3", wrap).textContent = opts.title || "";
    var body = $(".ms-body", wrap), foot = $(".ms-foot", wrap);
    if (typeof opts.body === "string") body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    (opts.buttons || []).forEach(function (b) {
      var btn = el("button", "btn " + (b.kind || "btn-ghost"));
      btn.textContent = b.label;
      btn.addEventListener("click", function () {
        if (!b.onClick || b.onClick(wrap) !== false) close();
      });
      foot.appendChild(btn);
    });
    if (opts.onOpen) opts.onOpen(wrap);
    function close() {
      wrap.classList.remove("is-on");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(function () { wrap.remove(); }, 240);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap || e.target.closest("[data-close]")) close();
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add("is-on"); });
    setTimeout(function () {
      var f = wrap.querySelector("input,textarea,select");
      if (f) f.focus();
    }, 130);
    return { close: close, el: wrap, body: body };
  }

  /* ---------- popover ---------- */
  var openPop = null;
  function closePop() {
    if (!openPop) return;
    document.removeEventListener("click", openPop._doc, true);
    openPop.remove();
    openPop = null;
  }
  function popover(anchor, items) {
    closePop();
    var pop = el("div", "pop");
    items.forEach(function (it) {
      var b = el("button", it.danger ? "danger" : "");
      b.innerHTML = (it.icon ? '<svg class="ico ico-14"><use href="#' + it.icon + '"/></svg>' : "") +
        "<span>" + esc(it.label) + "</span>";
      b.addEventListener("click", function (e) { e.stopPropagation(); closePop(); it.onClick(); });
      pop.appendChild(b);
    });
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.min(window.innerWidth - pw - 10, r.right - pw);
    var top = r.bottom + 6;
    if (top + ph > window.innerHeight - 10) top = r.top - ph - 6;
    pop.style.left = Math.max(10, left) + "px";
    pop.style.top = Math.max(10, top) + "px";
    openPop = pop;
    setTimeout(function () { document.addEventListener("click", onDoc, true); }, 0);
    function onDoc(e) { if (!pop.contains(e.target)) closePop(); }
    pop._doc = onDoc;
  }

  function copy(text, okMsg) {
    function done() { toast(okMsg || "已复制"); }
    function fallback() {
      var ta = el("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("复制失败，请手动复制"); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  /* switch row used by settings */
  function switchRow(label, desc, on, onChange) {
    var row = el("div", "swt");
    row.innerHTML = '<div><div class="swt-t">' + esc(label) + '</div><div class="swt-d">' + esc(desc) + "</div></div>" +
      '<button class="tgl" role="switch" aria-checked="' + (on ? "true" : "false") + '" aria-label="' + esc(label) + '"></button>';
    var tgl = $(".tgl", row);
    tgl.addEventListener("click", function () {
      var next = tgl.getAttribute("aria-checked") !== "true";
      tgl.setAttribute("aria-checked", next ? "true" : "false");
      onChange(next);
    });
    return row;
  }

  /* image shrink: keeps localStorage from exploding */
  function readImage(file, cb) {
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1000;
        var w = img.width, h = img.height;
        if (w > max || h > max) {
          var k = Math.min(max / w, max / h);
          w = Math.round(w * k);
          h = Math.round(h * k);
        }
        var cv = el("canvas");
        cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        var out = cv.toDataURL("image/jpeg", 0.82);
        cb(out.length > fr.result.length ? fr.result : out);
      };
      img.onerror = function () { cb(fr.result); };
      img.src = fr.result;
    };
    fr.onerror = function () { toast("图片读取失败"); };
    fr.readAsDataURL(file);
  }

  window.ElanUI = {
    $: $, $$: $$, esc: esc, el: el, toast: toast,
    hhmm: hhmm, timeAgo: timeAgo, dayKey: dayKey, stamp: stamp,
    initial: initial, hue: hue, avatar: avatar,
    openModal: openModal, popover: popover, closePop: closePop,
    copy: copy, switchRow: switchRow, readImage: readImage
  };
})();
