/* ===== Élan enhancement layer ===== */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var KEY = "elan.state.v1";
  var toastEl = $("#toast"), toastText = $("#toastText"), toastTimer = null;
  var feed = $("#feed"), composer = $("#composerText"), countEl = $("#composerCount");
  var attachments = [];

  function toast(msg) {
    if (!toastEl) return;
    toastText.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2200);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function hhmm() {
    var d = new Date();
    return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }

  function defaults() {
    return { likes: {}, saves: {}, comments: {}, myPosts: [], hidden: [], deleted: [],
      settings: { motion: "on", density: "normal", font: "md", right: "on" },
      profile: {}, dms: {} };
  }
  var store;
  try { store = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch (e) { store = defaults(); }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }

  function applySettings() {
    var s = store.settings;
    document.documentElement.dataset.motion = s.motion === "off" ? "off" : "on";
    document.documentElement.dataset.density = s.density === "compact" ? "compact" : "normal";
    document.documentElement.dataset.font = s.font || "md";
    document.documentElement.dataset.hideRight = s.right === "off" ? "on" : "off";
  }
  applySettings();

  /* ---------- modal ---------- */
  function openModal(opts) {
    var wrap = document.createElement("div");
    wrap.className = "ms";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", opts.title || "对话框");
    wrap.innerHTML =
      '<div class="ms-panel"><div class="ms-head"><h3></h3>' +
      '<button class="icon-btn" data-close aria-label="关闭"><svg class="ico"><use href="#i-x"/></svg></button></div>' +
      '<div class="ms-body"></div><div class="ms-foot"></div></div>';
    $(".ms-head h3", wrap).textContent = opts.title || "";
    var body = $(".ms-body", wrap), foot = $(".ms-foot", wrap);
    if (typeof opts.body === "string") body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    (opts.buttons || []).forEach(function (b) {
      var btn = document.createElement("button");
      btn.className = "btn " + (b.kind || "btn-ghost");
      btn.textContent = b.label;
      btn.addEventListener("click", function () {
        if (!b.onClick || b.onClick(wrap) !== false) close();
      });
      foot.appendChild(btn);
    });
    function close() {
      wrap.classList.remove("is-on");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(function () { wrap.remove(); }, 240);
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
    }, 120);
    return { close: close, el: wrap };
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
    var pop = document.createElement("div");
    pop.className = "pop";
    items.forEach(function (it) {
      var b = document.createElement("button");
      if (it.danger) b.className = "danger";
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

  /* ---------- post helpers ---------- */
  function postKey(post) { return post.dataset.s || post.id || "post-" + Date.now(); }
  function commentBtn(post) {
    return $$(".act", post).filter(function (b) { return b.querySelector('use[href="#i-comment"]'); })[0];
  }
  function syncCommentCount(post) {
    var btn = commentBtn(post);
    if (!btn) return;
    var key = postKey(post);
    if (btn.dataset.baseN === undefined) btn.dataset.baseN = btn.dataset.n || "0";
    var n = (Number(btn.dataset.baseN) || 0) + (store.comments[key] || []).length;
    btn.dataset.n = String(n);
    var span = btn.querySelector("span");
    if (span) span.textContent = String(n);
  }
  function ensureComments(post) {
    var wrap = post.querySelector(".cmt-wrap");
    if (wrap) return wrap;
    wrap = document.createElement("div");
    wrap.className = "cmt-wrap";
    wrap.innerHTML = '<div class="cmt-list"></div><div class="cmt-form">' +
      '<input type="text" placeholder="写一条评论，回车发送…" aria-label="评论">' +
      '<button class="btn btn-primary" data-send>发送</button></div>';
    var actions = post.querySelector(".post-actions");
    if (actions) post.insertBefore(wrap, actions.nextSibling); else post.appendChild(wrap);
    $("[data-send]", wrap).addEventListener("click", function () { sendComment(post); });
    $("input", wrap).addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); sendComment(post); }
    });
    return wrap;
  }
  function renderComments(post) {
    var wrap = ensureComments(post), list = $(".cmt-list", wrap);
    var items = store.comments[postKey(post)] || [];
    list.innerHTML = items.length
      ? items.map(function (c) {
          return '<div class="cmt"><span class="cmt-av">沈</span><div class="cmt-b">' +
            '<span class="cmt-n">沈砚舟</span>' + esc(c.text) +
            '<span class="cmt-t">' + esc(c.time) + "</span></div></div>";
        }).join("")
      : '<div style="font-size:12px;color:var(--t3);padding:4px 0 6px">还没有评论，来说第一句。</div>';
    syncCommentCount(post);
  }
  function sendComment(post) {
    var wrap = ensureComments(post), input = $("input", wrap);
    var text = (input.value || "").trim();
    if (!text) { input.focus(); return; }
    var key = postKey(post);
    store.comments[key] = store.comments[key] || [];
    store.comments[key].push({ text: text, time: hhmm() });
    persist();
    input.value = "";
    renderComments(post);
    toast("评论已发布");
  }

  /* ---------- persistence of native likes / saves ---------- */
  document.addEventListener("click", function (e) {
    var like = e.target.closest("#feed .post .act.like");
    var save = e.target.closest("#feed .post .act.save");
    var post = (like || save) && (like || save).closest(".post");
    if (!post) return;
    var key = postKey(post);
    setTimeout(function () {
      if (like) store.likes[key] = like.classList.contains("is-on");
      if (save) store.saves[key] = save.classList.contains("is-on");
      persist();
    }, 0);
  });

  /* ---------- comments open ---------- */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("#feed .act");
    if (!btn || !btn.querySelector('use[href="#i-comment"]')) return;
    e.preventDefault();
    e.stopPropagation();
    var post = btn.closest(".post");
    var wrap = ensureComments(post);
    var open = wrap.classList.toggle("is-on");
    if (open) { renderComments(post); $("input", wrap).focus(); }
  }, true);

  /* ---------- attachments ---------- */
  function renderAttachments() {
    var host = $("#composerAttach");
    if (!host) {
      var composerEl = $(".composer");
      if (!composerEl) return;
      host = document.createElement("div");
      host.id = "composerAttach";
      host.className = "att-list";
      composerEl.insertBefore(host, $(".composer-foot", composerEl));
    }
    host.innerHTML = "";
    attachments.forEach(function (a, i) {
      var d = document.createElement("div");
      d.className = "att";
      d.innerHTML = '<img alt="" src="' + a.dataUrl + '"><button aria-label="移除图片">×</button>';
      $("button", d).addEventListener("click", function () {
        attachments.splice(i, 1);
        renderAttachments();
      });
      host.appendChild(d);
    });
  }
  function openPicker() {
    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", function () {
      Array.prototype.slice.call(input.files || []).slice(0, 4).forEach(function (file) {
        if (attachments.length >= 4) { toast("最多 4 张图片"); return; }
        var fr = new FileReader();
        fr.onload = function () { attachments.push({ dataUrl: fr.result }); renderAttachments(); };
        fr.readAsDataURL(file);
      });
    });
    input.click();
  }

  /* ---------- publish ---------- */
  function postMarkup(p) {
    var media = (p.images && p.images.length)
      ? '<div class="post-media">' + p.images.map(function (src) { return '<img alt="" src="' + src + '">'; }).join("") + "</div>"
      : "";
    return '<div class="post-head"><span class="av av-md" style="--h:38"><span>沈</span></span>' +
      '<div class="post-id"><div class="post-name">沈砚舟<svg class="ico ico-14"><use href="#i-check"/></svg></div>' +
      '<div class="post-meta">' + esc(p.meta || "刚刚发布") + "</div></div>" +
      '<button class="icon-btn" aria-label="更多操作"><svg class="ico"><use href="#i-more"/></svg></button></div>' +
      '<p class="post-body">' + esc(p.text) + "</p>" + media +
      '<div class="post-actions">' +
      '<button class="act like" data-n="0"><svg class="ico ico-14"><use href="#i-heart"/></svg><span>0</span></button>' +
      '<button class="act" data-n="0"><svg class="ico ico-14"><use href="#i-comment"/></svg><span>0</span></button>' +
      '<button class="act save" data-n="0"><svg class="ico ico-14"><use href="#i-bookmark"/></svg><span>0</span></button>' +
      '<button class="act more" aria-label="分享"><svg class="ico ico-14"><use href="#i-share"/></svg></button></div>';
  }
  function insertPost(p, animate) {
    if (!feed) feed = $("#feed");
    if (!feed) return null;
    var node = document.createElement("article");
    node.className = "post";
    node.setAttribute("data-kb", "");
    node.setAttribute("data-tags", "following");
    node.setAttribute("data-s", "沈砚舟 " + p.text);
    if (p.id) node.id = p.id;
    node.innerHTML = postMarkup(p);
    if (animate) { node.style.opacity = "0"; node.style.transform = "translateY(-10px)"; }
    feed.insertBefore(node, feed.firstChild);
    if (animate) {
      requestAnimationFrame(function () {
        node.style.transition = "opacity .42s cubic-bezier(.2,0,0,1),transform .42s cubic-bezier(.2,0,0,1)";
        node.style.opacity = "1";
        node.style.transform = "none";
      });
    }
    syncCommentCount(node);
    return node;
  }
  function publish(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (!composer) return;
    var text = (composer.value || "").trim();
    if (!text && !attachments.length) { toast("请先输入内容或添加图片"); composer.focus(); return; }
    var p = { id: "me-" + Date.now(), text: text || "分享图片",
      images: attachments.map(function (a) { return a.dataUrl; }),
      meta: "刚刚发布", time: new Date().toISOString() };
    insertPost(p, true);
    store.myPosts.push(p);
    persist();
    attachments = [];
    renderAttachments();
    composer.value = "";
    composer.style.height = "auto";
    if (countEl) { countEl.textContent = "0 / 500"; countEl.style.color = ""; }
    toast("已发布到你的时间线");
    var stream = $("#stream");
    if (stream) stream.scrollTo({ top: 0, behavior: "smooth" });
  }
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#publishBtn")) return;
    publish(e);
  }, true);
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && document.activeElement === composer) {
      e.preventDefault();
      e.stopPropagation();
      publish(e);
    }
  }, true);

  /* ---------- composer tools ---------- */
  document.addEventListener("click", function (e) {
    var tool = e.target.closest('.composer-tools [data-act="attach"]');
    if (!tool) return;
    e.preventDefault();
    e.stopPropagation();
    var use = tool.querySelector("use");
    var icon = use ? use.getAttribute("href") : "";
    if (icon === "#i-image") { openPicker(); return; }
    if (icon === "#i-globe") {
      openModal({
        title: "插入链接",
        body: '<div class="field"><label>链接地址</label><input type="text" placeholder="https://" value="https://"></div>',
        buttons: [
          { label: "取消" },
          { label: "插入", kind: "btn-primary", onClick: function (w) {
              var v = $("input", w).value.trim();
              if (!v || v === "https://") { toast("请输入链接"); return false; }
              if (composer) {
                composer.value += (composer.value ? "\n" : "") + v;
                composer.dispatchEvent(new Event("input", { bubbles: true }));
              }
              toast("链接已插入");
          } }
        ]
      });
      return;
    }
    if (composer) {
      composer.value += (composer.value ? "\n" : "") + "［数据图表］";
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    }
    toast("已插入图表占位");
  }, true);

  /* ---------- share / menus ---------- */
  function copyText(text, okMsg) {
    function done() { toast(okMsg || "已复制到剪贴板"); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (err) { toast("复制失败，请手动复制"); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }
  function postUrl(post) {
    return location.href.split("#")[0] + "#" + (post.id || encodeURIComponent(postKey(post)));
  }
  function removePost(post) {
    store.deleted.push(postKey(post));
    persist();
    post.style.transition = "opacity .25s var(--ease)";
    post.style.opacity = "0";
    setTimeout(function () { post.remove(); }, 260);
    toast("动态已删除");
  }
  function hidePost(post) {
    store.hidden.push(postKey(post));
    persist();
    post.style.transition = "opacity .25s var(--ease)";
    post.style.opacity = "0";
    setTimeout(function () { post.style.display = "none"; }, 260);
    toast("已隐藏这条动态");
  }
  function postMenu(post, anchor) {
    popover(anchor, [
      { label: "复制链接", icon: "i-globe", onClick: function () { copyText(postUrl(post), "动态链接已复制"); } },
      { label: "收藏这条", icon: "i-bookmark", onClick: function () {
          var save = post.querySelector(".act.save");
          if (save && !save.classList.contains("is-on")) save.click();
      } },
      { label: "隐藏这条", icon: "i-x", onClick: function () { hidePost(post); } },
      { label: "删除动态", icon: "i-trash", danger: true, onClick: function () { removePost(post); } }
    ]);
  }
  document.addEventListener("click", function (e) {
    var more = e.target.closest("#feed .act.more");
    if (more) { e.preventDefault(); e.stopPropagation(); postMenu(more.closest(".post"), more); return; }
    var head = e.target.closest("#feed .post-head .icon-btn");
    if (head) { e.preventDefault(); e.stopPropagation(); postMenu(head.closest(".post"), head); }
  }, true);

  /* ---------- settings / edit / share ---------- */
  function swtRow(label, desc, on, onToggle) {
    var row = document.createElement("div");
    row.className = "swt";
    row.innerHTML = '<div><div class="swt-t">' + esc(label) + '</div><div class="swt-d">' + esc(desc) + "</div></div>" +
      '<button class="tgl" role="switch" aria-checked="' + (on ? "true" : "false") + '" aria-label="' + esc(label) + '"></button>';
    var tgl = $(".tgl", row);
    tgl.addEventListener("click", function () {
      var next = tgl.getAttribute("aria-checked") !== "true";
      tgl.setAttribute("aria-checked", next ? "true" : "false");
      onToggle(next);
    });
    return row;
  }
  function openSettings() {
    var s = store.settings;
    var body = document.createElement("div");
    body.innerHTML = '<div class="field"><label>正文字号</label><select>' +
      '<option value="sm"' + (s.font === "sm" ? " selected" : "") + ">小 12.5px</option>" +
      '<option value="md"' + (s.font === "md" ? " selected" : "") + ">标准 13.5px</option>" +
      '<option value="lg"' + (s.font === "lg" ? " selected" : "") + ">大 14.5px</option></select></div>";
    body.appendChild(swtRow("紧凑排版", "减少卡片内边距，同屏显示更多动态", s.density === "compact", function (on) {
      s.density = on ? "compact" : "normal";
      applySettings();
      persist();
    }));
    body.appendChild(swtRow("减少动效", "关闭入场动画与过渡，适合长时间阅读", s.motion === "off", function (on) {
      s.motion = on ? "off" : "on";
      applySettings();
      persist();
    }));
    body.appendChild(swtRow("显示右侧栏", "公告、在线好友与账号概览", s.right !== "off", function (on) {
      s.right = on ? "on" : "off";
      applySettings();
      persist();
    }));
    $("select", body).addEventListener("change", function (e) {
      s.font = e.target.value;
      applySettings();
      persist();
    });
    var reset = document.createElement("button");
    reset.className = "btn btn-ghost";
    reset.textContent = "清空本地数据并重置";
    reset.addEventListener("click", function () {
      try { localStorage.removeItem(KEY); } catch (err) {}
      location.reload();
    });
    body.appendChild(reset);
    openModal({ title: "设置", body: body, buttons: [{ label: "完成", kind: "btn-primary" }] });
  }

  function openProfileEditor() {
    var p = store.profile || {};
    var cur = $(".profile-name");
    var curName = p.name || (cur ? cur.textContent : "沈砚舟");
    var curHandle = p.handle || (($(".profile-handle") || {}).textContent || "@yenzhou").split(" · ")[0];
    var curBio = p.bio || (($(".profile-bio") || {}).textContent || "");
    var m = openModal({
      title: "编辑资料",
      body: '<div class="field"><label>昵称</label><input type="text" data-f="name" maxlength="20"></div>' +
        '<div class="field"><label>账号</label><input type="text" data-f="handle" maxlength="24"></div>' +
        '<div class="field"><label>简介</label><textarea data-f="bio" maxlength="140"></textarea></div>',
      buttons: [
        { label: "取消" },
        { label: "保存", kind: "btn-primary", onClick: function (w) {
            var v = {};
            $$("[data-f]", w).forEach(function (i) { v[i.dataset.f] = i.value.trim(); });
            if (!v.name) { toast("昵称不能为空"); return false; }
            store.profile = v;
            persist();
            renderProfile();
            toast("资料已更新");
        } }
      ]
    });
    $('[data-f="name"]', m.el).value = curName.trim();
    $('[data-f="handle"]', m.el).value = curHandle.trim();
    $('[data-f="bio"]', m.el).value = curBio.trim();
  }

  function renderProfile() {
    var p = store.profile || {};
    if (p.name) {
      var nm = $(".profile-name");
      if (nm) {
        var svg = nm.querySelector("svg");
        nm.textContent = p.name;
        if (svg) nm.appendChild(svg);
      }
      var av = $(".profile-av span");
      if (av) av.textContent = p.name.charAt(0);
      var me = $(".me-name");
      if (me) me.textContent = p.name;
      var c = $(".composer .av span");
      if (c) c.textContent = p.name.charAt(0);
    }
    if (p.handle) {
      var h = $(".profile-handle");
      if (h) h.textContent = p.handle + " · 独立设计师";
      var ms = $(".me-sub");
      if (ms) ms.textContent = p.handle + " · 独立设计师";
    }
    if (p.bio) {
      var b = $(".profile-bio");
      if (b) b.textContent = p.bio;
    }
  }

  document.addEventListener("click", function (e) {
    var act = e.target.closest("[data-act]");
    if (!act) return;
    var kind = act.dataset.act;
    if (kind === "settings") { e.preventDefault(); e.stopPropagation(); openSettings(); }
    else if (kind === "edit") { e.preventDefault(); e.stopPropagation(); openProfileEditor(); }
    else if (kind === "share") { e.preventDefault(); e.stopPropagation(); copyText(location.href, "主页链接已复制"); }
  }, true);

  /* ---------- direct messages ---------- */
  var chatEl = null, chatFriend = null;
  function ensureChat() {
    if (chatEl) return chatEl;
    chatEl = document.createElement("aside");
    chatEl.className = "chat";
    chatEl.setAttribute("aria-hidden", "true");
    chatEl.innerHTML =
      '<div class="chat-head"><div style="flex:1;min-width:0"><h3 data-chat-name>对话</h3>' +
      '<div class="sub" data-chat-sub>私信</div></div>' +
      '<button class="icon-btn" data-chat-close aria-label="关闭"><svg class="ico"><use href="#i-x"/></svg></button></div>' +
      '<div class="chat-log" data-chat-log></div>' +
      '<div class="chat-foot"><input type="text" placeholder="输入消息，回车发送…" aria-label="消息内容">' +
      '<button class="btn btn-primary" data-chat-send>发送</button></div>';
    document.body.appendChild(chatEl);
    $("[data-chat-close]", chatEl).addEventListener("click", closeChat);
    $("[data-chat-send]", chatEl).addEventListener("click", sendChat);
    $("input", chatEl).addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); sendChat(); }
    });
    return chatEl;
  }
  function renderChat() {
    if (!chatEl || !chatFriend) return;
    var log = $("[data-chat-log]", chatEl);
    var list = store.dms[chatFriend] || [];
    log.innerHTML = list.length
      ? list.map(function (m) {
          return '<div class="bub ' + (m.from === "me" ? "me" : "them") + '">' + esc(m.text) + "</div>" +
            '<div class="bub-t" style="align-self:' + (m.from === "me" ? "flex-end" : "flex-start") + '">' + esc(m.time) + "</div>";
        }).join("")
      : '<div style="font-size:12px;color:var(--t3)">开始和 TA 的第一次对话。</div>';
    log.scrollTop = log.scrollHeight;
  }
  function openChat(name, seedText) {
    ensureChat();
    chatFriend = name;
    store.dms[name] = store.dms[name] || [];
    if (!store.dms[name].length && seedText) {
      store.dms[name].push({ from: "them", text: seedText, time: "刚刚" });
      persist();
    }
    $("[data-chat-name]", chatEl).textContent = name;
    $("[data-chat-sub]", chatEl).textContent = "私信 · 在线";
    chatEl.classList.add("is-on");
    chatEl.setAttribute("aria-hidden", "false");
    renderChat();
    setTimeout(function () { $(".chat-foot input", chatEl).focus(); }, 220);
  }
  function closeChat() {
    if (!chatEl) return;
    chatEl.classList.remove("is-on");
    chatEl.setAttribute("aria-hidden", "true");
  }
  function sendChat() {
    if (!chatEl || !chatFriend) return;
    var input = $(".chat-foot input", chatEl);
    var text = (input.value || "").trim();
    if (!text) return;
    store.dms[chatFriend].push({ from: "me", text: text, time: hhmm() });
    persist();
    input.value = "";
    renderChat();
    var friend = chatFriend;
    setTimeout(function () {
      if (chatFriend !== friend) return;
      store.dms[friend].push({ from: "them", text: "收到，我晚点回你。", time: hhmm() });
      persist();
      renderChat();
    }, 1100);
  }
  document.addEventListener("click", function (e) {
    var dm = e.target.closest("[data-dm]");
    if (!dm) return;
    e.preventDefault();
    e.stopPropagation();
    var nameEl = $("#dName"), msgEl = $("#dMsg"), closeBtn = $("#drawerClose");
    var name = nameEl ? nameEl.textContent : "好友";
    var seed = msgEl ? msgEl.textContent : "";
    if (closeBtn) closeBtn.click();
    openChat(name, seed);
  }, true);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && chatEl && chatEl.classList.contains("is-on")) closeChat();
  });

  /* ---------- restore persisted state ---------- */
  function restore() {
    if (!feed) feed = $("#feed");
    (store.myPosts || []).slice().reverse().forEach(function (p) { insertPost(p, false); });
    $$("#feed .post").forEach(function (post) {
      var key = postKey(post);
      if (store.deleted.indexOf(key) !== -1) { post.remove(); return; }
      if (store.hidden.indexOf(key) !== -1) { post.style.display = "none"; return; }
      if (store.likes[key]) {
        var like = post.querySelector(".act.like");
        if (like && !like.classList.contains("is-on")) {
          like.classList.add("is-on");
          like.dataset.n = String((Number(like.dataset.n) || 0) + 1);
          var s1 = like.querySelector("span");
          if (s1) s1.textContent = like.dataset.n;
        }
      }
      if (store.saves[key]) {
        var save = post.querySelector(".act.save");
        if (save) save.classList.add("is-on");
      }
      syncCommentCount(post);
    });
    renderProfile();
  }
  restore();

  if ("MutationObserver" in window && feed) {
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        Array.prototype.slice.call(r.addedNodes).forEach(function (n) {
          if (n.nodeType === 1 && n.classList && n.classList.contains("post")) syncCommentCount(n);
        });
      });
    }).observe(feed, { childList: true });
  }
})();
