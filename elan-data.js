/* ===== Élan data layer: accounts, posts, direct messages ===== */
(function () {
  "use strict";

  var KEY = "elan.v3";
  var LEGACY = ["elan.state.v1"];

  /* fnv-ish, salted. Obfuscation only — this is a local client store, not a server. */
  function hash(text, salt) {
    var s = String(salt || "") + "|" + String(text || ""), h1 = 0x811c9dc5, h2 = 0x9e3779b1;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 ^= c; h1 = (h1 * 16777619) >>> 0;
      h2 = (((h2 << 5) + h2) ^ c) >>> 0;
    }
    return ("0000000" + h1.toString(16)).slice(-8) + ("0000000" + h2.toString(16)).slice(-8);
  }
  function rid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }
  function blank() {
    return {
      v: 3, users: [], session: null,
      posts: [], likes: {}, saves: {}, comments: {}, hidden: {},
      msgs: [], notices: [], prefs: {}, meta: { createdAt: Date.now() }
    };
  }

  var db;
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || "null");
    db = Object.assign(blank(), raw && typeof raw === "object" ? raw : {});
  } catch (e) { db = blank(); }
  LEGACY.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });

  var onQuota = null;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) {
      if (onQuota) onQuota(e);
      return false;
    }
  }

  /* ---------- users ---------- */
  function userById(id) {
    for (var i = 0; i < db.users.length; i++) if (db.users[i].id === id) return db.users[i];
    return null;
  }
  function me() { return db.session ? userById(db.session) : null; }
  function isAdmin() { var u = me(); return !!(u && u.role === "admin"); }
  function byHandle(h) {
    var key = String(h || "").trim().toLowerCase();
    for (var i = 0; i < db.users.length; i++) if (db.users[i].handle.toLowerCase() === key) return db.users[i];
    return null;
  }
  function normHandle(h) { return String(h || "").trim().replace(/^@+/, "").toLowerCase(); }
  function validHandle(h) { return /^[a-z0-9][a-z0-9_.-]{1,19}$/.test(h); }

  function createUser(o) {
    var name = String(o.name || "").trim();
    var handle = normHandle(o.handle);
    var pass = String(o.pass || "");
    if (!name) return { err: "昵称不能为空" };
    if (name.length > 20) return { err: "昵称最多 20 个字" };
    if (!validHandle(handle)) return { err: "账号需 2–20 位，字母数字开头，可用 _ . -" };
    if (byHandle(handle)) return { err: "账号 @" + handle + " 已被占用" };
    if (pass.length < 6) return { err: "密码至少 6 位" };
    var salt = Math.random().toString(36).slice(2, 10);
    var u = {
      id: rid("u"), name: name, handle: handle, salt: salt, pass: hash(pass, salt),
      role: o.role === "admin" ? "admin" : "user",
      bio: String(o.bio || "").slice(0, 140),
      title: String(o.title || "").slice(0, 24),
      joined: Date.now()
    };
    db.users.push(u);
    save();
    return { user: u };
  }
  function updateUser(id, patch) {
    var u = userById(id);
    if (!u) return { err: "账号不存在" };
    if (patch.name != null) {
      var n = String(patch.name).trim();
      if (!n) return { err: "昵称不能为空" };
      if (n.length > 20) return { err: "昵称最多 20 个字" };
      u.name = n;
    }
    if (patch.handle != null) {
      var h = normHandle(patch.handle);
      if (!validHandle(h)) return { err: "账号需 2–20 位，字母数字开头" };
      var other = byHandle(h);
      if (other && other.id !== id) return { err: "账号 @" + h + " 已被占用" };
      u.handle = h;
    }
    if (patch.bio != null) u.bio = String(patch.bio).slice(0, 140);
    if (patch.title != null) u.title = String(patch.title).slice(0, 24);
    if (patch.role != null) {
      var role = patch.role === "admin" ? "admin" : "user";
      if (u.role === "admin" && role !== "admin" && adminCount() <= 1) return { err: "至少要保留一个管理员" };
      u.role = role;
    }
    if (patch.pass) {
      if (String(patch.pass).length < 6) return { err: "密码至少 6 位" };
      u.salt = Math.random().toString(36).slice(2, 10);
      u.pass = hash(patch.pass, u.salt);
    }
    save();
    return { user: u };
  }
  function adminCount() {
    return db.users.filter(function (u) { return u.role === "admin"; }).length;
  }
  function deleteUser(id) {
    var u = userById(id);
    if (!u) return { err: "账号不存在" };
    var self = me();
    if (self && self.id === id) return { err: "不能删除当前登录的账号" };
    if (u.role === "admin" && adminCount() <= 1) return { err: "至少要保留一个管理员" };
    db.users = db.users.filter(function (x) { return x.id !== id; });
    db.posts = db.posts.filter(function (p) { return p.author !== id; });
    db.msgs = db.msgs.filter(function (m) { return m.from !== id && m.to !== id; });
    Object.keys(db.comments).forEach(function (k) {
      db.comments[k] = (db.comments[k] || []).filter(function (c) { return c.author !== id; });
    });
    Object.keys(db.likes).forEach(function (k) { delete db.likes[k][id]; });
    delete db.saves[id]; delete db.hidden[id]; delete db.prefs[id];
    if (db.session === id) db.session = null;
    save();
    return { ok: true };
  }

  function login(handle, pass) {
    var u = byHandle(handle);
    if (!u) return { err: "账号不存在" };
    if (u.pass !== hash(pass, u.salt)) return { err: "密码不正确" };
    db.session = u.id;
    u.lastLogin = Date.now();
    save();
    return { user: u };
  }
  function logout() { db.session = null; save(); }

  /* mutate in place: window.ElanData.db keeps a live reference */
  function resetAll() {
    var fresh = blank();
    Object.keys(db).forEach(function (k) { delete db[k]; });
    Object.assign(db, fresh);
    save();
  }

  /* ---------- posts ---------- */
  function addPost(o) {
    var u = me();
    if (!u) return { err: "请先登录" };
    var text = String(o.text || "").trim();
    var images = (o.images || []).slice(0, 4);
    if (!text && !images.length) return { err: "请先输入内容或添加图片" };
    var p = { id: rid("p"), author: u.id, text: text, images: images, time: Date.now() };
    db.posts.push(p);
    save();
    return { post: p };
  }
  function removePost(id) {
    var u = me();
    var p = db.posts.filter(function (x) { return x.id === id; })[0];
    if (!p) return { err: "动态不存在" };
    if (!u || (p.author !== u.id && u.role !== "admin")) return { err: "只能删除自己的动态" };
    db.posts = db.posts.filter(function (x) { return x.id !== id; });
    delete db.likes[id]; delete db.comments[id];
    Object.keys(db.saves).forEach(function (k) { delete db.saves[k][id]; });
    Object.keys(db.hidden).forEach(function (k) { delete db.hidden[k][id]; });
    save();
    return { ok: true };
  }
  function feedPosts() {
    var u = me();
    var hidden = (u && db.hidden[u.id]) || {};
    return db.posts.slice()
      .filter(function (p) { return !hidden[p.id]; })
      .sort(function (a, b) { return b.time - a.time; });
  }
  function likeCount(id) { return Object.keys(db.likes[id] || {}).length; }
  function liked(id) { var u = me(); return !!(u && db.likes[id] && db.likes[id][u.id]); }
  function toggleLike(id) {
    var u = me();
    if (!u) return false;
    db.likes[id] = db.likes[id] || {};
    if (db.likes[id][u.id]) delete db.likes[id][u.id]; else db.likes[id][u.id] = true;
    save();
    return !!db.likes[id][u.id];
  }
  function saved(id) { var u = me(); return !!(u && db.saves[u.id] && db.saves[u.id][id]); }
  function toggleSave(id) {
    var u = me();
    if (!u) return false;
    db.saves[u.id] = db.saves[u.id] || {};
    if (db.saves[u.id][id]) delete db.saves[u.id][id]; else db.saves[u.id][id] = true;
    save();
    return !!db.saves[u.id][id];
  }
  function hidePost(id) {
    var u = me();
    if (!u) return;
    db.hidden[u.id] = db.hidden[u.id] || {};
    db.hidden[u.id][id] = true;
    save();
  }
  function commentsOf(id) { return db.comments[id] || []; }
  function addComment(postId, text) {
    var u = me();
    if (!u || !String(text || "").trim()) return { err: "评论不能为空" };
    db.comments[postId] = db.comments[postId] || [];
    var c = { id: rid("c"), author: u.id, text: String(text).trim().slice(0, 240), time: Date.now() };
    db.comments[postId].push(c);
    save();
    return { comment: c };
  }
  function likedBy(postId, userId) { return !!(db.likes[postId] && db.likes[postId][userId]); }

  /* ---------- direct messages ---------- */
  function sendMsg(to, text) {
    var u = me();
    if (!u) return { err: "请先登录" };
    if (to === u.id) return { err: "不能给自己发私信" };
    var body = String(text || "").trim();
    if (!body) return { err: "消息不能为空" };
    var m = { id: rid("m"), from: u.id, to: to, text: body.slice(0, 1000), time: Date.now(), read: false };
    db.msgs.push(m);
    save();
    return { msg: m };
  }
  function thread(a, b) {
    return db.msgs.filter(function (m) {
      return (m.from === a && m.to === b) || (m.from === b && m.to === a);
    }).sort(function (x, y) { return x.time - y.time; });
  }
  function markRead(peer) {
    var u = me();
    if (!u) return 0;
    var n = 0;
    db.msgs.forEach(function (m) {
      if (m.from === peer && m.to === u.id && !m.read) { m.read = true; n++; }
    });
    if (n) save();
    return n;
  }
  function unreadFrom(peer) {
    var u = me();
    if (!u) return 0;
    return db.msgs.filter(function (m) { return m.from === peer && m.to === u.id && !m.read; }).length;
  }
  function unreadTotal() {
    var u = me();
    if (!u) return 0;
    return db.msgs.filter(function (m) { return m.to === u.id && !m.read; }).length;
  }
  /* conversations: one row per peer, newest first */
  function conversations() {
    var u = me();
    if (!u) return [];
    var map = {};
    db.msgs.forEach(function (m) {
      if (m.from !== u.id && m.to !== u.id) return;
      var peer = m.from === u.id ? m.to : m.from;
      if (!userById(peer)) return;
      var row = map[peer] || (map[peer] = { peerId: peer, last: m, unread: 0 });
      if (m.time > row.last.time) row.last = m;
      if (m.to === u.id && !m.read) row.unread++;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.last.time - a.last.time; });
  }
  function peers() {
    var u = me();
    return db.users.filter(function (x) { return !u || x.id !== u.id; });
  }

  /* ---------- notices ---------- */
  function addNotice(title, body) {
    if (!isAdmin()) return { err: "只有管理员可以发布公告" };
    var t = String(title || "").trim();
    if (!t) return { err: "标题不能为空" };
    db.notices.unshift({ id: rid("n"), title: t.slice(0, 80), body: String(body || "").slice(0, 600), time: Date.now(), by: db.session });
    save();
    return { ok: true };
  }
  function removeNotice(id) {
    if (!isAdmin()) return { err: "只有管理员可以删除公告" };
    db.notices = db.notices.filter(function (n) { return n.id !== id; });
    save();
    return { ok: true };
  }

  /* ---------- prefs ---------- */
  var DEFAULT_PREFS = { motion: "on", density: "normal", font: "md", right: "on" };
  function prefs() {
    var u = me();
    var p = (u && db.prefs[u.id]) || {};
    return Object.assign({}, DEFAULT_PREFS, p);
  }
  function setPref(k, v) {
    var u = me();
    if (!u) return;
    db.prefs[u.id] = Object.assign({}, DEFAULT_PREFS, db.prefs[u.id] || {}, { [k]: v });
    save();
  }

  /* ---------- stats ---------- */
  function stats(userId) {
    var posts = db.posts.filter(function (p) { return p.author === userId; });
    var likes = posts.reduce(function (n, p) { return n + likeCount(p.id); }, 0);
    var cmts = db.posts.reduce(function (n, p) {
      return n + (db.comments[p.id] || []).filter(function (c) { return c.author !== userId; }).length * (p.author === userId ? 1 : 0);
    }, 0);
    var given = 0;
    Object.keys(db.likes).forEach(function (pid) { if (db.likes[pid][userId]) given++; });
    return { posts: posts.length, likes: likes, comments: cmts, liked: given,
      friends: peers().length };
  }

  window.ElanData = {
    db: db, save: save, hash: hash, rid: rid, blank: blank,
    onQuota: function (fn) { onQuota = fn; },
    me: me, isAdmin: isAdmin, userById: userById, byHandle: byHandle, normalizeHandle: normHandle,
    createUser: createUser, updateUser: updateUser, deleteUser: deleteUser, adminCount: adminCount,
    login: login, logout: logout, resetAll: resetAll,
    addPost: addPost, removePost: removePost, feedPosts: feedPosts,
    likeCount: likeCount, liked: liked, toggleLike: toggleLike,
    saved: saved, toggleSave: toggleSave, hidePost: hidePost, likedBy: likedBy,
    commentsOf: commentsOf, addComment: addComment,
    sendMsg: sendMsg, thread: thread, markRead: markRead, unreadFrom: unreadFrom,
    unreadTotal: unreadTotal, conversations: conversations, peers: peers,
    addNotice: addNotice, removeNotice: removeNotice,
    prefs: prefs, setPref: setPref, stats: stats,
    /* live re-read of the module-level db (blank() replaces the object on reset) */
    refresh: function () { return window.ElanData.db; }
  };
})();
