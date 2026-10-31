/* ===== Élan app: accounts, timeline, direct messages ===== */
(function () {
  "use strict";

  var U = window.ElanUI, D = window.ElanData;
  var $ = U.$, $$ = U.$$, esc = U.esc, el = U.el, toast = U.toast;
  var state = { peer: null, selected: null };
  function db() { return D.db; }

  /* ============ 1. wipe the demo content ============ */
  function stripDemo() {
    var feed = $("#feed");
    if (feed) feed.innerHTML = "";

    var msgList = $("#msgList");
    if (msgList) msgList.innerHTML = "";
    var seg = $("#msgSeg");
    if (seg) seg.style.display = "none";

    /* demo friends (view + right rail) → mark the containers for member lists */
    var hosts = [];
    $$(".friend").forEach(function (f) {
      var p = f.parentElement;
      if (p && hosts.indexOf(p) === -1) hosts.push(p);
      f.remove();
    });
    hosts.forEach(function (p) { p.setAttribute("data-members", "1"); p.innerHTML = ""; });

    /* demo notices */
    var noticeHosts = [];
    $$(".notice").forEach(function (n) {
      var p = n.parentElement;
      if (p && noticeHosts.indexOf(p) === -1) noticeHosts.push(p);
      n.remove();
    });
    noticeHosts.forEach(function (p) { p.setAttribute("data-notices", "1"); p.innerHTML = ""; });
    var mini = $(".notice-mini");
    if (mini && mini.parentElement) {
      mini.parentElement.setAttribute("data-notice-mini", "1");
      mini.parentElement.innerHTML = "";
    }

    /* right rail demo friends */
    var railHosts = [];
    $$(".f-row").forEach(function (r) {
      var p = r.parentElement;
      if (p && railHosts.indexOf(p) === -1) railHosts.push(p);
      r.remove();
    });
    railHosts.forEach(function (p) { p.setAttribute("data-rail-members", "1"); });
    var foot = $(".rail-foot");
    if (foot) foot.innerHTML = "Élan · 本机账号系统<br>账号、动态与私信保存在这台设备的浏览器里";

    /* demo profile projects / saved / about */
    ["works", "saved"].forEach(function (k) {
      var panel = $('[data-ppanel="' + k + '"]');
      if (!panel) return;
      var grid = $(".work-grid", panel);
      if (grid) grid.innerHTML = "";
    });
  }

  /* ============ 2. identity ============ */
  function applyPrefs() {
    var p = D.prefs();
    var r = document.documentElement;
    r.dataset.motion = p.motion === "off" ? "off" : "on";
    r.dataset.density = p.density === "compact" ? "compact" : "normal";
    r.dataset.font = p.font || "md";
    r.dataset.hideRight = p.right === "off" ? "on" : "off";
  }

  function applyIdentity() {
    var u = D.me();
    if (!u) return;
    var chip = $(".me-chip");
    if (chip) {
      var span = chip.querySelector("span:last-child");
      if (span) span.textContent = u.name;
      var av = chip.querySelector(".av span");
      if (av) av.textContent = U.initial(u.name);
      if (chip.querySelector(".av")) chip.querySelector(".av").style.setProperty("--h", U.hue(u.handle));
    }
    var cAv = $(".composer .av");
    if (cAv) {
      cAv.style.setProperty("--h", U.hue(u.handle));
      var cSpan = cAv.querySelector("span");
      if (cSpan) cSpan.textContent = U.initial(u.name);
    }
    var ta = $("#composerText");
    if (ta) ta.placeholder = u.name + "，分享点什么…";
    var meName = $(".me-name");
    if (meName) meName.textContent = u.name;
    var meSub = $(".me-sub");
    if (meSub) meSub.textContent = "@" + u.handle + (u.title ? " · " + u.title : " · " + (u.role === "admin" ? "管理员" : "成员"));
    var meCardAv = $(".me-card .av");
    if (meCardAv) {
      meCardAv.style.setProperty("--h", U.hue(u.handle));
      var s2 = meCardAv.querySelector("span");
      if (s2) s2.textContent = U.initial(u.name);
    }
    var adminBtn = $("[data-admin-entry]");
    if (adminBtn) adminBtn.style.display = D.isAdmin() ? "" : "none";
    applyPrefs();
  }

  /* ============ 3. feed ============ */
  function linkify(text) {
    return esc(text).replace(/(https?:\/\/[^\s<]+)/g, function (m) {
      return '<a href="' + m + '" target="_blank" rel="noopener">' + m + "</a>";
    }).replace(/\n/g, "<br>");
  }
  function postNode(p) {
    var a = D.userById(p.author) || { name: "已注销账号", handle: "deleted", id: p.author };
    var mine = D.me() && D.me().id === p.author;
    var liked = D.liked(p.id), saved = D.saved(p.id);
    var nLike = D.likeCount(p.id), nCmt = D.commentsOf(p.id).length;
    var node = el("article", "post");
    node.setAttribute("data-kb", "");
    node.setAttribute("data-id", p.id);
    node.setAttribute("data-tags", "all" + (mine ? " mine" : "") + (nLike >= 2 ? " hot" : ""));
    node.id = p.id;
    node.innerHTML =
      '<div class="post-head">' + U.avatar(a, "md") +
        '<div class="post-id"><div class="post-name">' + esc(a.name) +
          (a.role === "admin" ? '<svg class="ico ico-14" style="color:var(--amber)"><use href="#i-check"/></svg>' : "") +
        '</div><div class="post-meta">@' + esc(a.handle) + "<i></i>" + U.timeAgo(p.time) + "</div></div>" +
        '<button class="icon-btn" aria-label="更多操作"><svg class="ico"><use href="#i-more"/></svg></button></div>' +
      '<p class="post-body">' + linkify(p.text) + "</p>" +
      (p.images && p.images.length
        ? '<div class="post-media">' + p.images.map(function (src) {
            return '<img alt="" src="' + src + '">';
          }).join("") + "</div>"
        : "") +
      '<div class="post-actions">' +
        '<button class="act like' + (liked ? " is-on" : "") + '" data-n="' + nLike + '"><svg class="ico ico-14"><use href="#i-heart"/></svg><span>' + nLike + "</span></button>" +
        '<button class="act cmt-toggle" data-n="' + nCmt + '"><svg class="ico ico-14"><use href="#i-comment"/></svg><span>' + nCmt + "</span></button>" +
        '<button class="act save' + (saved ? " is-on" : "") + '"><svg class="ico ico-14"><use href="#i-bookmark"/></svg><span>收藏</span></button>' +
        '<button class="act more" aria-label="分享"><svg class="ico ico-14"><use href="#i-share"/></svg></button>' +
      "</div>";
    return node;
  }

  function renderFeed() {
    var host = $("#feed");
    if (!host) return;
    host.innerHTML = "";
    var list = D.feedPosts();
    if (!list.length) {
      host.innerHTML = '<div class="empty-state"><div class="empty-t">时间线还是空的</div>' +
        "<p>在这个账号下发出第一条动态，其他账号登录后同样能看到。</p></div>";
      return;
    }
    var frag = document.createDocumentFragment();
    list.forEach(function (p) { frag.appendChild(postNode(p)); });
    host.appendChild(frag);
    syncChips();
  }

  function syncChips() {
    var chips = $("#feedChips");
    if (!chips || chips.dataset.built === "1") return;
    chips.dataset.built = "1";
    chips.innerHTML = '<button class="chip is-active" data-filter="all">全部</button>' +
      '<button class="chip" data-filter="mine">我的</button>' +
      '<button class="chip" data-filter="hot">热门</button>';
  }

  function commentsBlock(postId) {
    var row = el("div", "cmt-wrap is-on");
    row.innerHTML = '<div class="cmt-list"></div><div class="cmt-form">' +
      '<input type="text" placeholder="写一条评论，回车发送…" aria-label="评论">' +
      '<button class="btn btn-primary" data-send>发送</button></div>';
    row.querySelector("[data-send]").addEventListener("click", function () { sendComment(postId, row); });
    row.querySelector("input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); sendComment(postId, row); }
    });
    renderComments(postId, row);
    return row;
  }
  function renderComments(postId, wrap) {
    var list = wrap.querySelector(".cmt-list");
    var items = D.commentsOf(postId);
    list.innerHTML = items.length
      ? items.map(function (c) {
          var a = D.userById(c.author) || { name: "已注销", handle: "x" };
          return '<div class="cmt">' + U.avatar(a, "sm") + '<div class="cmt-b">' +
            '<span class="cmt-n">' + esc(a.name) + "</span>" + esc(c.text) +
            '<span class="cmt-t">' + U.timeAgo(c.time) + "</span></div></div>";
        }).join("")
      : '<div class="empty-inline">还没有评论，来说第一句。</div>';
  }
  function sendComment(postId, wrap) {
    var input = wrap.querySelector("input");
    var r = D.addComment(postId, input.value);
    if (r.err) { toast(r.err); input.focus(); return; }
    input.value = "";
    renderComments(postId, wrap);
    bumpCount(postId);
    toast("评论已发布");
  }
  function bumpCount(postId) {
    var node = document.getElementById(postId);
    if (!node) return;
    var btn = node.querySelector(".cmt-toggle");
    if (btn) {
      var n = D.commentsOf(postId).length;
      btn.dataset.n = String(n);
      btn.querySelector("span").textContent = String(n);
    }
  }

  /* ============ 4. composer ============ */
  var attachments = [];
  function attachHost() {
    var host = $("#composerAttach");
    if (host) return host;
    var box = $(".composer");
    if (!box) return null;
    host = el("div", "att-list");
    host.id = "composerAttach";
    box.insertBefore(host, $(".composer-foot", box));
    return host;
  }
  function renderAttachments() {
    var host = attachHost();
    if (!host) return;
    host.innerHTML = "";
    attachments.forEach(function (a, i) {
      var d = el("div", "att", '<img alt="" src="' + a + '"><button aria-label="移除图片">×</button>');
      d.querySelector("button").addEventListener("click", function () {
        attachments.splice(i, 1);
        renderAttachments();
      });
      host.appendChild(d);
    });
  }
  function pickImages() {
    var input = el("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", function () {
      Array.prototype.slice.call(input.files || []).forEach(function (f) {
        if (attachments.length >= 4) { toast("最多 4 张图片"); return; }
        U.readImage(f, function (url) {
          attachments.push(url);
          renderAttachments();
        });
      });
    });
    input.click();
  }
  function publish() {
    var ta = $("#composerText");
    var r = D.addPost({ text: ta ? ta.value : "", images: attachments });
    if (r.err) { toast(r.err); if (ta) ta.focus(); return; }
    attachments = [];
    renderAttachments();
    if (ta) { ta.value = ""; ta.style.height = "auto"; }
    var c = $("#composerCount");
    if (c) c.textContent = "0 / 500";
    renderFeed();
    renderProfile();
    syncNav();
    toast("已发布");
    var stream = $("#stream");
    if (stream) stream.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ============ 5. direct messages ============ */
  function imHost() {
    var view = $('[data-view="latest"]');
    if (!view) return null;
    var box = $("#elanIm");
    if (box) return box;
    box = el("div", "im");
    box.id = "elanIm";
    box.innerHTML =
      '<div class="im-list"><div class="im-search"><input type="search" placeholder="搜索账号…" aria-label="搜索账号"></div>' +
      '<div class="im-rows"></div></div>' +
      '<div class="im-thread"></div>';
    var list = $("#msgList");
    if (list) list.replaceWith(box); else view.appendChild(box);
    box.querySelector(".im-search input").addEventListener("input", renderIMRows);
    return box;
  }
  function renderIM() {
    var box = imHost();
    if (!box) return;
    renderIMRows();
    renderThread();
  }
  function renderIMRows() {
    var box = imHost();
    if (!box) return;
    var q = ((box.querySelector(".im-search input") || {}).value || "").trim().toLowerCase();
    var rows = box.querySelector(".im-rows");
    var md = D.me();
    if (!md) return;
    var convs = D.conversations().filter(function (c) {
      var peer = D.userById(c.peerId);
      if (!peer) return false;
      return !q || (peer.name + " " + peer.handle).toLowerCase().indexOf(q) !== -1;
    });
    var people = D.peers().filter(function (u) {
      return !q || (u.name + " " + u.handle).toLowerCase().indexOf(q) !== -1;
    });
    var has = {};
    convs.forEach(function (c) { has[c.peerId] = true; });
    var html = "";
    convs.forEach(function (c) {
      var peer = D.userById(c.peerId);
      html += '<button class="im-row' + (state.peer === c.peerId ? " is-on" : "") + '" data-peer="' + c.peerId + '">' +
        U.avatar(peer, "md") +
        '<div class="im-main"><div class="im-t"><span>' + esc(peer.name) + "</span><time>" + U.timeAgo(c.last.time) + "</time></div>" +
        '<div class="im-d">' + (c.last.from === md.id ? "我：" : "") + esc(c.last.text) + "</div></div>" +
        (c.unread ? '<span class="im-dot">' + c.unread + "</span>" : "") +
        "</button>";
    });
    var rest = people.filter(function (u) { return !has[u.id]; });
    if (rest.length) {
      html += '<div class="im-sep">发起新对话</div>';
      rest.forEach(function (u) {
        html += '<button class="im-row" data-peer="' + u.id + '">' + U.avatar(u, "md") +
          '<div class="im-main"><div class="im-t"><span>' + esc(u.name) + "</span><time>@" + esc(u.handle) + "</time></div>" +
          '<div class="im-d">' + esc(u.bio || (u.role === "admin" ? "管理员" : "还没有聊过")) + "</div></div></button>";
      });
    }
    rows.innerHTML = html || '<div class="empty-inline" style="padding:14px">没有匹配的账号</div>';
  }
  function renderThread() {
    var box = imHost();
    if (!box) return;
    var host = box.querySelector(".im-thread");
    var md = D.me();
    var peer = state.peer ? D.userById(state.peer) : null;
    if (!md || !peer) {
      host.innerHTML = '<div class="im-empty"><div class="im-empty-t">选择一个会话</div>' +
        "<p>私信只属于对话双方：换个账号登录，就看不到这里的消息。</p></div>";
      box.classList.remove("is-thread");
      return;
    }
    var msgs = D.thread(md.id, peer.id);
    var log = msgs.length
      ? msgs.map(function (m, i) {
          var prev = msgs[i - 1];
          var sep = !prev || m.time - prev.time > 6e5
            ? '<div class="im-day">' + U.dayKey(m.time) + " " + U.hhmm(m.time) + "</div>" : "";
          return sep + '<div class="im-line ' + (m.from === md.id ? "me" : "them") + '">' +
            '<div class="im-bub">' + esc(m.text) + "</div></div>";
        }).join("")
      : '<div class="empty-inline" style="padding:18px">和 ' + esc(peer.name) + " 还没有聊过，说第一句。</div>";
    host.innerHTML =
      '<div class="im-head">' + U.avatar(peer, "md") +
        '<div class="im-main"><div class="im-t"><span>' + esc(peer.name) + "</span></div>" +
        '<div class="im-d">@' + esc(peer.handle) + "</div></div>" +
        '<button class="icon-btn im-back" data-im-close aria-label="返回会话"><svg class="ico"><use href="#i-x"/></svg></button></div>' +
      '<div class="im-log">' + log + "</div>" +
      '<div class="im-foot"><input type="text" placeholder="输入消息，回车发送…" aria-label="消息内容">' +
      '<button class="btn btn-primary" data-im-send>发送</button></div>';
    var lg = host.querySelector(".im-log");
    lg.scrollTop = lg.scrollHeight;
    host.querySelector("[data-im-send]").addEventListener("click", function () { sendIM(host); });
    host.querySelector(".im-foot input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); sendIM(host); }
    });
    setTimeout(function () {
      var i = host.querySelector(".im-foot input");
      if (i && window.innerWidth > 900) i.focus();
    }, 40);
  }
  function sendIM(host) {
    var input = host.querySelector(".im-foot input");
    var r = D.sendMsg(state.peer, input.value);
    if (r.err) { toast(r.err); return; }
    input.value = "";
    renderThread();
    renderIMRows();
    syncNav();
  }
  function openThread(peerId) {
    state.peer = peerId;
    D.markRead(peerId);
    var box = imHost();
    if (box) box.classList.add("is-thread");
    renderIMRows();
    renderThread();
    syncNav();
  }

  /* ============ 6. members + rail ============ */
  function memberCard(u) {
    return '<div class="mem" data-member="' + u.id + '">' + U.avatar(u, "lg") +
      '<div class="mem-main"><div class="mem-n">' + esc(u.name) +
        (u.role === "admin" ? '<span class="mem-role">管理员</span>' : "") + "</div>" +
      '<div class="mem-h">@' + esc(u.handle) + "</div>" +
      '<div class="mem-b">' + esc(u.bio || "还没有写简介") + "</div></div>" +
      '<div class="mem-acts"><button class="btn btn-ghost" data-mem-dm="' + u.id + '">发私信</button>' +
      (D.isAdmin() ? '<button class="btn btn-ghost" data-mem-edit="' + u.id + '">编辑</button>' : "") +
      "</div></div>";
  }
  function renderMembers() {
    var md = D.me();
    var list = D.peers();
    var html = list.length
      ? list.map(memberCard).join("")
      : '<div class="empty-state"><div class="empty-t">还没有其他账号</div><p>管理员可以在「账号管理」里创建成员。</p></div>';
    $$("[data-members]").forEach(function (h) { h.innerHTML = html; });
  }

  function renderRailMembers() {
    var hosts = $$("[data-rail-members]");
    var list = D.peers().slice(0, 6);
    hosts.forEach(function (h) {
      h.innerHTML = list.length
        ? list.map(function (u) {
            return '<div class="f-row">' + U.avatar(u, "sm") +
              '<div style="min-width:0"><div class="f-name">' + esc(u.name) + "</div>" +
              '<div class="f-sub">@' + esc(u.handle) + "</div></div>" +
              '<button class="f-btn" data-mem-dm="' + u.id + '">私信</button></div>';
          }).join("")
        : '<div class="empty-inline">暂无其他成员</div>';
    });
  }

  /* ============ 7. notices ============ */
  function renderNotices() {
    var html = db().notices.length
      ? db().notices.map(function (n) {
          var by = D.userById(n.by) || { name: "管理员" };
          return '<div class="notice is-open" data-notice="' + n.id + '">' +
            '<button class="notice-head" aria-expanded="true">' +
            '<span class="notice-ico"><svg class="ico"><use href="#i-megaphone"/></svg></span>' +
            '<div class="notice-main"><div class="notice-t">' + esc(n.title) + "</div>" +
            '<div class="notice-d">' + U.stamp(n.time) + " · " + esc(by.name) + "</div></div></button>" +
            '<div class="notice-body">' + esc(n.body || "") + "</div></div>";
        }).join("")
      : '<div class="empty-state"><div class="empty-t">还没有公告</div><p>管理员可在「账号管理」里发布公告。</p></div>';
    $$("[data-notices]").forEach(function (h) { h.innerHTML = html; });
    var mini = $("[data-notice-mini]");
    if (mini) {
      mini.innerHTML = db().notices.slice(0, 3).map(function (n) {
        return '<button class="notice-mini" data-nav="notice">' + esc(n.title) + "</button>";
      }).join("") || '<div class="empty-inline">暂无公告</div>';
    }
  }

  /* ============ 8. profile ============ */
  function renderProfile() {
    var u = D.me();
    if (!u) return;
    var av = $(".profile-av");
    if (av) {
      av.style.setProperty("--h", U.hue(u.handle));
      var s = av.querySelector("span");
      if (s) s.textContent = U.initial(u.name);
    }
    var nm = $(".profile-name");
    if (nm) {
      var svg = nm.querySelector("svg");
      nm.textContent = u.name;
      if (svg) nm.appendChild(svg);
    }
    var hd = $(".profile-handle");
    if (hd) hd.textContent = "@" + u.handle + " · " + (u.title || (u.role === "admin" ? "管理员" : "成员"));
    var bio = $(".profile-bio");
    if (bio) bio.textContent = u.bio || "还没有写简介，点「编辑资料」补一句。";
    var st = D.stats(u.id);
    var stats = $$(".stats .stat");
    var vals = [st.posts, st.friends, st.likes];
    stats.forEach(function (node, i) {
      var v = node.querySelector(".stat-v");
      if (v && vals[i] != null) { v.textContent = String(vals[i]); v.removeAttribute("data-count"); }
    });
    var kLabels = ["动态", "好友", "获赞"];
    stats.forEach(function (node, i) {
      var k = node.querySelector(".stat-k");
      if (k) k.textContent = kLabels[i] || "";
    });
    var tabs = $$(".p-tab");
    if (tabs[0]) tabs[0].textContent = "动态 " + st.posts;
    if (tabs[1]) tabs[1].textContent = "收藏 " + Object.keys(db().saves[u.id] || {}).length;

    var meStats = $$(".me-card .me-stats > div");
    if (meStats.length === 3) {
      var railVals = [st.posts, Object.keys(db().saves[u.id] || {}).length, st.friends];
      var railKeys = ["动态", "收藏", "好友"];
      meStats.forEach(function (d, i) { d.innerHTML = "<b>" + (railVals[i] || 0) + "</b>" + railKeys[i]; });
    }

    var works = $('[data-ppanel="works"] .work-grid');
    if (works) {
      var mine = db().posts.filter(function (p) { return p.author === u.id; }).sort(function (a, b) { return b.time - a.time; });
      works.innerHTML = mine.length
        ? mine.map(function (p) {
            return '<article class="work"><div class="work-body"><div class="work-t">' + esc(p.text.slice(0, 42) || "图片动态") +
              '</div><div class="work-d"><span>' + U.timeAgo(p.time) + "</span><span>" + D.likeCount(p.id) + " 赞</span></div></div></article>";
          }).join("")
        : '<div class="empty-inline">还没有发布过动态</div>';
    }
    var savedGrid = $('[data-ppanel="saved"] .work-grid');
    if (savedGrid) {
      var savedIds = Object.keys(db().saves[u.id] || {});
      var savedPosts = savedIds.map(function (id) {
        return db().posts.filter(function (p) { return p.id === id; })[0];
      }).filter(Boolean);
      savedGrid.innerHTML = savedPosts.length
        ? savedPosts.map(function (p) {
            var a = D.userById(p.author) || { name: "已注销" };
            return '<article class="work"><div class="work-body"><div class="work-t">' + esc(p.text.slice(0, 42) || "图片动态") +
              '</div><div class="work-d"><span>' + esc(a.name) + "</span><span>" + U.timeAgo(p.time) + "</span></div></div></article>";
          }).join("")
        : '<div class="empty-inline">还没有收藏</div>';
    }
    var about = $('[data-ppanel="about"] .card p');
    if (about) {
      var joined = new Date(u.joined);
      about.textContent = (u.bio || "还没有写简介。") + " · " + (u.role === "admin" ? "管理员" : "成员") +
        " · " + joined.getFullYear() + " 年 " + (joined.getMonth() + 1) + " 月加入。";
    }
    var meta = $(".profile-meta");
    if (meta) meta.innerHTML = '<span><svg class="ico ico-14"><use href="#i-user"/></svg>@' + esc(u.handle) + "</span>" +
      '<span><svg class="ico ico-14"><use href="#i-clock"/></svg>' + new Date(u.joined).getFullYear() + " 年加入</span>";
    var cover = $(".cover .ver-label");
    if (cover) cover.textContent = u.role === "admin" ? "管理员" : "成员";
  }

  /* ============ 9. nav counters ============ */
  function syncNav() {
    var unread = D.unreadTotal();
    $$('[data-nav="latest"] .nav-count, [data-nav="msg"] .nav-count').forEach(function (n) {
      n.textContent = String(unread);
      n.style.display = unread ? "" : "none";
    });
    var badge = $('.icon-btn.has-badge[data-nav="latest"]');
    if (badge) badge.classList.toggle("has-unread", unread > 0);
    var fcount = $$('[data-nav="friends"] .nav-count');
    fcount.forEach(function (n) { n.textContent = String(D.peers().length); });
    var ncount = db().notices.length;
    $$('[data-nav="notice"] .nav-count').forEach(function (n) {
      n.textContent = String(ncount);
      n.style.display = ncount ? "" : "none";
    });
  }

  /* ============ 10. settings / admin ============ */
  function openSettings() {
    var u = D.me();
    if (!u) return;
    var p = D.prefs();
    var body = el("div");
    body.innerHTML = '<div class="field"><label>正文字号</label><select>' +
      '<option value="sm"' + (p.font === "sm" ? " selected" : "") + ">小 12.5px</option>" +
      '<option value="md"' + (p.font === "md" ? " selected" : "") + ">标准 13.5px</option>" +
      '<option value="lg"' + (p.font === "lg" ? " selected" : "") + ">大 14.5px</option></select></div>";
    body.querySelector("select").addEventListener("change", function (e) {
      D.setPref("font", e.target.value);
      applyPrefs();
    });
    body.appendChild(U.switchRow("紧凑排版", "减少卡片内边距，同屏显示更多动态", p.density === "compact", function (on) {
      D.setPref("density", on ? "compact" : "normal"); applyPrefs();
    }));
    body.appendChild(U.switchRow("减少动效", "关闭入场动画与过渡", p.motion === "off", function (on) {
      D.setPref("motion", on ? "off" : "on"); applyPrefs();
    }));
    body.appendChild(U.switchRow("显示右侧栏", "成员、公告与快捷键提示", p.right !== "off", function (on) {
      D.setPref("right", on ? "on" : "off"); applyPrefs();
    }));

    var actions = el("div", "set-actions");
    actions.innerHTML = '<div class="set-me">' + U.avatar(u, "md") +
      '<div><div class="set-me-n">' + esc(u.name) + '</div><div class="set-me-h">@' + esc(u.handle) + " · " +
      (u.role === "admin" ? "管理员" : "成员") + "</div></div></div>";
    var adminBtn = el("button", "btn btn-primary", "账号管理");
    adminBtn.addEventListener("click", function () { openAdmin(); });
    if (D.isAdmin()) actions.appendChild(adminBtn);
    var out = el("button", "btn btn-ghost", "退出登录");
    out.addEventListener("click", function () { logout(); });
    actions.appendChild(out);
    if (D.isAdmin()) {
      var wipe = el("button", "btn btn-ghost", "清空本机数据（重置）");
      wipe.addEventListener("click", function () {
        U.openModal({
          title: "清空全部数据",
          body: "<p style='margin:0;font-size:13px;line-height:1.7;color:var(--t2)'>所有账号、动态、私信与设置都会被删除，回到首次使用的状态。这一步无法撤销。</p>",
          buttons: [
            { label: "取消" },
            { label: "清空", kind: "btn-danger", onClick: function () { D.resetAll(); location.reload(); } }
          ]
        });
      });
      actions.appendChild(wipe);
    }
    body.appendChild(actions);
    U.openModal({ title: "设置", body: body, buttons: [{ label: "完成", kind: "btn-primary" }] });
  }

  function openAdmin() {
    if (!D.isAdmin()) { toast("只有管理员可以管理账号"); return; }
    var body = el("div");
    body.innerHTML =
      '<div class="acc-bar"><div class="acc-hint">共 ' + db().users.length + " 个账号</div>" +
      '<button class="btn btn-primary" data-new-acc>新建账号</button></div>' +
      '<div class="acc-list"></div>' +
      '<div class="acc-notice"><div class="acc-sec">发布公告</div>' +
      '<div class="field"><input type="text" data-nt-title maxlength="80" placeholder="公告标题"></div>' +
      '<div class="field"><textarea data-nt-body rows="2" maxlength="600" placeholder="公告内容"></textarea></div>' +
      '<button class="btn btn-ghost" data-nt-post>发布</button></div>';
    var m = U.openModal({ title: "账号管理", body: body, wide: true, buttons: [{ label: "完成", kind: "btn-primary" }] });

    function paint() {
      var list = body.querySelector(".acc-list");
      list.innerHTML = db().users.map(function (u) {
        var st = D.stats(u.id);
        return '<div class="acc-row"><div class="acc-id">' + U.avatar(u, "md") +
          '<div><div class="acc-n">' + esc(u.name) +
          (u.role === "admin" ? ' <span class="acc-role">管理员</span>' : "") +
          (D.me() && D.me().id === u.id ? ' <span class="acc-self">当前</span>' : "") + "</div>" +
          '<div class="acc-h2">@' + esc(u.handle) + " · " + st.posts + " 条动态</div></div></div>" +
          '<div class="acc-acts"><button class="btn btn-ghost" data-acc-edit="' + u.id + '">编辑</button>' +
          '<button class="btn btn-ghost" data-acc-pass="' + u.id + '">改密码</button>' +
          '<button class="btn btn-ghost" data-acc-del="' + u.id + '">删除</button></div></div>';
      }).join("");
      body.querySelector(".acc-hint").textContent = "共 " + db().users.length + " 个账号";
    }
    paint();

    function accountForm(user) {
      var isNew = !user;
      var f = el("div");
      f.innerHTML =
        '<div class="field"><label>昵称</label><input type="text" data-f="name" maxlength="20" placeholder="显示名字"></div>' +
        '<div class="field"><label>账号（唯一）</label><input type="text" data-f="handle" maxlength="20" placeholder="字母数字，如 linyan"></div>' +
        (isNew ? '<div class="field"><label>密码</label><input type="password" data-f="pass" placeholder="至少 6 位"></div>' : "") +
        '<div class="field"><label>身份</label><select data-f="role"><option value="user">普通成员</option><option value="admin">管理员</option></select></div>' +
        '<div class="field"><label>职位标签</label><input type="text" data-f="title" maxlength="24" placeholder="如 产品设计师"></div>' +
        '<div class="field"><label>简介</label><textarea data-f="bio" maxlength="140" rows="2"></textarea></div>';
      if (user) {
        f.querySelector('[data-f="name"]').value = user.name;
        f.querySelector('[data-f="handle"]').value = user.handle;
        f.querySelector('[data-f="role"]').value = user.role;
        f.querySelector('[data-f="title"]').value = user.title || "";
        f.querySelector('[data-f="bio"]').value = user.bio || "";
      }
      return f;
    }
    function submitForm(user) {
      var wrap = accountForm(user);
      U.openModal({
        title: user ? "编辑账号" : "新建账号",
        body: wrap,
        buttons: [
          { label: "取消" },
          { label: user ? "保存" : "创建", kind: "btn-primary", onClick: function (w) {
              var v = {};
              U.$$("[data-f]", w).forEach(function (i) { v[i.dataset.f] = i.value; });
              var r = user ? D.updateUser(user.id, v) : D.createUser(v);
              if (r.err) { toast(r.err); return false; }
              toast(user ? "账号已更新" : "账号已创建");
              paint();
              refreshEverywhere();
              return true;
          } }
        ]
      });
    }
    function changePass(user) {
      var w = el("div");
      w.innerHTML = '<div class="field"><label>为 ' + esc(user.name) + " 设置新密码</label>" +
        '<input type="password" data-f="p1" placeholder="至少 6 位"></div>' +
        '<div class="field"><label>再输一次</label><input type="password" data-f="p2"></div>';
      U.openModal({
        title: "重置密码", body: w,
        buttons: [
          { label: "取消" },
          { label: "保存", kind: "btn-primary", onClick: function (box) {
              var a = box.querySelector('[data-f="p1"]').value;
              var b = box.querySelector('[data-f="p2"]').value;
              if (a !== b) { toast("两次输入不一致"); return false; }
              var r = D.updateUser(user.id, { pass: a });
              if (r.err) { toast(r.err); return false; }
              toast("密码已重置");
              return true;
          } }
        ]
      });
    }

    body.addEventListener("click", function (e) {
      var t = e.target.closest("button");
      if (!t) return;
      if (t.hasAttribute("data-new-acc")) { submitForm(null); return; }
      var id;
      if ((id = t.getAttribute("data-acc-edit"))) { submitForm(D.userById(id)); return; }
      if ((id = t.getAttribute("data-acc-pass"))) { changePass(D.userById(id)); return; }
      if ((id = t.getAttribute("data-acc-del"))) {
        var u = D.userById(id);
        U.openModal({
          title: "删除账号",
          body: "<p style='margin:0;font-size:13px;line-height:1.7;color:var(--t2)'>删除「" + esc(u.name) +
            "」会同时移除 TA 的动态、评论与私信，无法撤销。</p>",
          buttons: [
            { label: "取消" },
            { label: "删除", kind: "btn-danger", onClick: function () {
                var r = D.deleteUser(id);
                if (r.err) { toast(r.err); return false; }
                toast("账号已删除"); paint(); refreshEverywhere(); return true;
            } }
          ]
        });
        return;
      }
      if (t.hasAttribute("data-nt-post")) {
        var title = body.querySelector("[data-nt-title]").value;
        var text = body.querySelector("[data-nt-body]").value;
        var r2 = D.addNotice(title, text);
        if (r2.err) { toast(r2.err); return; }
        body.querySelector("[data-nt-title]").value = "";
        body.querySelector("[data-nt-body]").value = "";
        renderNotices();
        toast("公告已发布");
      }
    });
  }

  /* ============ 11. profile editor ============ */
  function openProfileEditor() {
    var u = D.me();
    if (!u) return;
    var w = el("div");
    w.innerHTML =
      '<div class="field"><label>昵称</label><input type="text" data-f="name" maxlength="20"></div>' +
      '<div class="field"><label>账号</label><input type="text" data-f="handle" maxlength="20"></div>' +
      '<div class="field"><label>职位标签</label><input type="text" data-f="title" maxlength="24" placeholder="如 产品设计师"></div>' +
      '<div class="field"><label>简介</label><textarea data-f="bio" maxlength="140" rows="3"></textarea></div>' +
      (D.isAdmin() ? '<div class="field"><label>新密码（留空不改）</label><input type="password" data-f="pass" placeholder="至少 6 位"></div>' : "");
    w.querySelector('[data-f="name"]').value = u.name;
    w.querySelector('[data-f="handle"]').value = u.handle;
    w.querySelector('[data-f="title"]').value = u.title || "";
    w.querySelector('[data-f="bio"]').value = u.bio || "";
    U.openModal({
      title: "编辑资料", body: w,
      buttons: [
        { label: "取消" },
        { label: "保存", kind: "btn-primary", onClick: function (box) {
            var v = {};
            U.$$("[data-f]", box).forEach(function (i) { v[i.dataset.f] = i.value.trim(); });
            if (!v.pass) delete v.pass;
            var r = D.updateUser(u.id, v);
            if (r.err) { toast(r.err); return false; }
            applyIdentity(); renderProfile(); renderFeed(); toast("资料已更新");
            return true;
        } }
      ]
    });
  }

  /* ============ 12. gate (setup / login) ============ */
  function removeGate() {
    var g = $("#elanGate");
    if (g) g.remove();
  }
  function showGate() {
    removeGate();
    var first = db().users.length === 0;
    var gate = el("div", "gate");
    gate.id = "elanGate";
    var accounts = first ? [] : db().users.slice().sort(function (a, b) {
      return (b.lastLogin || b.joined) - (a.lastLogin || a.joined);
    });
    var grid = accounts.map(function (u) {
      return '<button class="acc-item" data-acc="' + u.id + '">' + U.avatar(u, "lg") +
        '<span class="acc-name">' + esc(u.name) + "</span>" +
        '<span class="acc-h">@' + esc(u.handle) + "</span></button>";
    }).join("");
    gate.innerHTML =
      '<div class="gate-card">' +
        '<div class="gate-brand"><span class="gate-mark">É</span><span>Élan</span></div>' +
        '<h2 class="gate-title">' + (first ? "创建管理员账号" : "选择账号登录") + "</h2>" +
        '<p class="gate-sub">' + (first
          ? "这是这台设备上的第一个账号，它会成为管理员，可以创建和管理其他账号。"
          : "所有账号、动态与私信都保存在本机浏览器里，换设备不会同步。") + "</p>" +
        (first ? "" : '<div class="acc-grid">' + grid + "</div>") +
        (first
          ? '<div class="field"><label>昵称</label><input type="text" data-g="name" maxlength="20" value="管理员"></div>' +
            '<div class="field"><label>账号</label><input type="text" data-g="handle" maxlength="20" value="admin"></div>'
          : '<input type="hidden" data-g="handle">') +
        '<div class="field"><label>密码</label><input type="password" data-g="pass" placeholder="' +
          (first ? "至少 6 位" : "输入密码") + '" autocomplete="current-password"></div>' +
        '<div class="gate-err" role="alert"></div>' +
        '<button class="btn btn-primary gate-go">' + (first ? "创建并进入" : "进入") + "</button>" +
      "</div>";
    document.body.appendChild(gate);
    requestAnimationFrame(function () { gate.classList.add("is-on"); });

    var pass = gate.querySelector('[data-g="pass"]');
    var err = gate.querySelector(".gate-err");

    if (accounts.length) state.selected = accounts[0].id;
    gate.querySelectorAll(".acc-item").forEach(function (b) {
      b.addEventListener("click", function () {
        state.selected = b.dataset.acc;
        gate.querySelectorAll(".acc-item").forEach(function (x) { x.classList.toggle("is-on", x === b); });
        pass.focus();
      });
    });
    var sel = gate.querySelector('.acc-item[data-acc="' + state.selected + '"]');
    if (sel) sel.classList.add("is-on");

    function submit() {
      err.textContent = "";
      if (first) {
        var r = D.createUser({
          name: gate.querySelector('[data-g="name"]').value,
          handle: gate.querySelector('[data-g="handle"]').value,
          pass: pass.value, role: "admin"
        });
        if (r.err) { err.textContent = r.err; return; }
        D.login(r.user.handle, pass.value);
        enter();
        return;
      }
      var u = D.userById(state.selected);
      if (!u) { err.textContent = "请选择一个账号"; return; }
      var lr = D.login(u.handle, pass.value);
      if (lr.err) { err.textContent = lr.err; pass.select(); return; }
      enter();
    }
    gate.querySelector(".gate-go").addEventListener("click", submit);
    pass.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    gate.querySelectorAll("input").forEach(function (i) {
      i.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
    });
  }

  function enter() {
    removeGate();
    start();
    toast("欢迎，" + D.me().name);
  }
  function logout() {
    D.logout();
    state.peer = null;
    U.closePop();
    $$(".ms").forEach(function (m) { m.remove(); });
    showGate();
  }

  /* ============ 13. wiring ============ */
  function refreshEverywhere() {
    applyIdentity();
    renderFeed();
    renderIM();
    renderMembers();
    renderRailMembers();
    renderNotices();
    renderProfile();
    syncNav();
  }

  function start() {
    applyIdentity();
    refreshEverywhere();
  }

  /* nav: let the page switch views, then refresh our data */
  document.addEventListener("click", function (e) {
    var nav = e.target.closest("[data-nav]");
    if (!nav) return;
    setTimeout(function () {
      renderIM(); renderMembers(); renderRailMembers(); renderNotices(); renderProfile(); syncNav();
    }, 0);
  }, true);

  document.addEventListener("click", function (e) {
    if (!D.me()) return;

    if (e.target.closest("#publishBtn")) { e.preventDefault(); e.stopPropagation(); publish(); return; }

    var tool = e.target.closest('.composer-tools [data-act="attach"]');
    if (tool) {
      e.preventDefault(); e.stopPropagation();
      var icon = tool.querySelector("use");
      var href = icon ? icon.getAttribute("href") : "";
      if (href === "#i-image") { pickImages(); return; }
      if (href === "#i-globe") {
        U.openModal({
          title: "插入链接",
          body: '<div class="field"><label>链接地址</label><input type="text" placeholder="https://" value="https://"></div>',
          buttons: [{ label: "取消" }, { label: "插入", kind: "btn-primary", onClick: function (w) {
            var v = w.querySelector("input").value.trim();
            if (!v || v === "https://") { toast("请输入链接"); return false; }
            var ta = $("#composerText");
            ta.value += (ta.value ? "\n" : "") + v;
            ta.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
          } }]
        });
        return;
      }
      var ta2 = $("#composerText");
      if (ta2) {
        ta2.value += (ta2.value ? "\n" : "") + "［数据图表］";
        ta2.dispatchEvent(new Event("input", { bubbles: true }));
      }
      toast("已插入图表占位");
      return;
    }

    /* feed actions */
    var like = e.target.closest("#feed .act.like");
    if (like) {
      e.preventDefault(); e.stopPropagation();
      var post = like.closest(".post");
      var on = D.toggleLike(post.dataset.id);
      like.classList.toggle("is-on", on);
      var n = D.likeCount(post.dataset.id);
      like.dataset.n = String(n);
      like.querySelector("span").textContent = String(n);
      renderProfile();
      return;
    }
    var save = e.target.closest("#feed .act.save");
    if (save) {
      e.preventDefault(); e.stopPropagation();
      var p2 = save.closest(".post");
      var son = D.toggleSave(p2.dataset.id);
      save.classList.toggle("is-on", son);
      toast(son ? "已收藏" : "已取消收藏");
      renderProfile();
      return;
    }
    var cmt = e.target.closest("#feed .act.cmt-toggle");
    if (cmt) {
      e.preventDefault(); e.stopPropagation();
      var post3 = cmt.closest(".post");
      var wrap = post3.querySelector(".cmt-wrap");
      if (wrap) {
        if (wrap.classList.contains("is-on")) { wrap.classList.remove("is-on"); setTimeout(function () { wrap.remove(); }, 200); }
        else wrap.classList.add("is-on");
      } else {
        post3.appendChild(commentsBlock(post3.dataset.id));
        post3.querySelector(".cmt-wrap input").focus();
      }
      return;
    }
    var menuBtn = e.target.closest("#feed .act.more, #feed .post-head .icon-btn");
    if (menuBtn) {
      e.preventDefault(); e.stopPropagation();
      var node = menuBtn.closest(".post");
      var id = node.dataset.id;
      var author = db().posts.filter(function (x) { return x.id === id; })[0];
      var mine = author && D.me() && author.author === D.me().id;
      U.popover(menuBtn, [
        { label: "复制链接", icon: "i-globe", onClick: function () {
            U.copy(location.href.split("#")[0] + "#" + id, "动态链接已复制");
        } },
        { label: "收藏这条", icon: "i-bookmark", onClick: function () {
            D.toggleSave(id); renderProfile(); toast("收藏状态已更新");
        } },
        { label: "隐藏这条", icon: "i-x", onClick: function () {
            D.hidePost(id); node.style.opacity = "0";
            setTimeout(function () { renderFeed(); }, 220); toast("已隐藏");
        } },
        { label: mine || D.isAdmin() ? "删除动态" : "举报这条", icon: "i-trash", danger: true, onClick: function () {
            if (!(mine || D.isAdmin())) { toast("已记录举报"); return; }
            var r = D.removePost(id);
            if (r.err) { toast(r.err); return; }
            node.style.opacity = "0";
            setTimeout(function () { renderFeed(); renderProfile(); }, 220);
            toast("动态已删除");
        } }
      ]);
      return;
    }

    /* im */
    var row = e.target.closest(".im-row");
    if (row) { e.preventDefault(); openThread(row.dataset.peer); return; }
    if (e.target.closest("[data-im-close]")) {
      state.peer = null;
      var box = imHost();
      if (box) box.classList.remove("is-thread");
      renderThread(); renderIMRows();
      return;
    }
    var dmBtn = e.target.closest("[data-mem-dm]");
    if (dmBtn) {
      e.preventDefault(); e.stopPropagation();
      openThread(dmBtn.getAttribute("data-mem-dm"));
      var rail = $('.rail-btn[data-nav="latest"]');
      var navBtn = $('.nav-item[data-nav="latest"]') || $('[data-nav="latest"]');
      if (navBtn) navBtn.click();
      return;
    }
    var editMem = e.target.closest("[data-mem-edit]");
    if (editMem) { e.preventDefault(); e.stopPropagation(); openAdmin(); return; }

    /* [data-act] owned by us */
    var act = e.target.closest("[data-act]");
    if (act) {
      var kind = act.dataset.act;
      if (kind === "settings") { e.preventDefault(); e.stopPropagation(); openSettings(); return; }
      if (kind === "edit") { e.preventDefault(); e.stopPropagation(); openProfileEditor(); return; }
      if (kind === "share") { e.preventDefault(); e.stopPropagation(); U.copy(location.href, "主页链接已复制"); return; }
      if (kind === "compose") {
        e.preventDefault(); e.stopPropagation();
        var n2 = $('.nav-item[data-nav="home"], [data-nav="home"]');
        if (n2) n2.click();
        setTimeout(function () { var t = $("#composerText"); if (t) t.focus(); }, 60);
        return;
      }
    }

    var logoutBtn = e.target.closest("[data-logout]");
    if (logoutBtn) { logoutBtn.click(); }
  }, true);

  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && document.activeElement === $("#composerText")) {
      e.preventDefault(); e.stopPropagation(); publish();
    }
  }, true);

  /* ---------- search: own index, own panel ---------- */
  function wireSearch() {
    var input = $("#searchInput");
    if (!input) return;
    var fresh = input.cloneNode(true);
    fresh.value = "";
    input.replaceWith(fresh);
    var panel = $("#searchPanel");
    var cursor = -1, rows = [];

    function render() {
      var q = fresh.value.trim().toLowerCase();
      if (!q) { panel.classList.remove("is-open"); panel.innerHTML = ""; rows = []; cursor = -1; return; }
      var users = db().users.filter(function (u) {
        return !D.me() || u.id !== D.me().id;
      }).filter(function (u) {
        return (u.name + " " + u.handle + " " + (u.bio || "")).toLowerCase().indexOf(q) !== -1;
      }).slice(0, 4);
      var posts = db().posts.filter(function (p) {
        var a = D.userById(p.author);
        return (p.text + " " + (a ? a.name : "")).toLowerCase().indexOf(q) !== -1;
      }).sort(function (a, b) { return b.time - a.time; }).slice(0, 5);

      rows = [];
      var html = "";
      if (!users.length && !posts.length) {
        html = '<div class="s-empty">没有找到与「' + esc(fresh.value) + '」相关的内容</div>';
      } else {
        if (users.length) {
          html += '<div class="s-group">账号</div>';
          users.forEach(function (u) {
            rows.push({ kind: "user", id: u.id });
            html += '<button class="s-row" data-i="' + (rows.length - 1) + '">' + U.avatar(u, "sm") +
              '<span class="s-row-t">' + esc(u.name) + " <i>@" + esc(u.handle) + "</i></span></button>";
          });
        }
        if (posts.length) {
          html += '<div class="s-group">动态</div>';
          posts.forEach(function (p) {
            rows.push({ kind: "post", id: p.id });
            var label = p.text.length > 34 ? p.text.slice(0, 34) + "…" : (p.text || "图片动态");
            html += '<button class="s-row" data-i="' + (rows.length - 1) + '"><span class="s-row-t">' +
              esc(label) + "</span></button>";
          });
        }
        html += '<div class="s-group">↑ ↓ 选择 · Enter 打开</div>';
      }
      panel.innerHTML = html;
      panel.classList.add("is-open");
    }
    fresh.addEventListener("input", render);
    fresh.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { fresh.blur(); panel.classList.remove("is-open"); return; }
      if (!rows.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        cursor = (cursor + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
        $$(".s-row", panel).forEach(function (r, i) { r.classList.toggle("is-on", i === cursor); });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault(); e.stopPropagation();
        var pick = rows[cursor < 0 ? 0 : cursor];
        if (!pick) return;
        if (pick.kind === "user") openThread(pick.id);
        else {
          var navHome = $('[data-nav="home"]');
          if (navHome) navHome.click();
          setTimeout(function () {
            var node = document.getElementById(pick.id);
            if (node) {
              node.scrollIntoView({ behavior: "smooth", block: "center" });
              node.classList.add("is-flash");
              setTimeout(function () { node.classList.remove("is-flash"); }, 1200);
            }
          }, 80);
        }
        panel.classList.remove("is-open");
        fresh.blur();
      }
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "")) {
      e.preventDefault();
      var i = $("#searchInput");
      if (i) i.focus();
    }
  }, true);

  /* ---------- boot ---------- */
  function boot() {
    stripDemo();
    syncChips();
    wireSearch();
    var u = D.me();
    if (db().users.length === 0 || !u) { showGate(); return; }
    start();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.ElanApp = { boot: boot, refresh: refreshEverywhere, openAdmin: openAdmin, logout: logout };
})();
