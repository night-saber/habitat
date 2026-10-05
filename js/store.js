/* Verde — data layer.
 *
 * Runs on localStorage by default and can be pointed at a real API by setting
 * `window.VERDE_API` before this module loads. Every read/write goes through
 * `Store`, so the UI never knows which backend it is talking to.
 *
 * Records are held in arrays for serialisation but indexed into Maps after
 * every load/mutation, so lookups are O(1) rather than array scans.
 */
"use strict";

const DB_KEY = "verde.db";
const SESSION_KEY = "verde.session";
const SCHEMA = 2;

function uid(prefix = "") {
  const rnd = Math.random().toString(36).slice(2, 10);
  return prefix + Date.now().toString(36) + rnd;
}

/* ------------------------------------------------------------- hashing */
async function sha256(text) {
  try {
    const buf = new TextEncoder().encode(text);
    const d = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // file:// or insecure context — deterministic fallback, clearly weaker
    let h1 = 0x811c9dc5, h2 = 0x1000193;
    for (let i = 0; i < text.length; i++) {
      h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0;
      h2 = Math.imul(h2 + text.charCodeAt(i), 2246822519) >>> 0;
    }
    return "fb" + h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
  }
}

function salt() {
  const a = new Uint8Array(16);
  if (crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Human-transcribable recovery code: VERDE-XXXX-XXXX-XXXX */
function makeRecoveryCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  const part = () => Array.from({ length: 4 }, () =>
    A[Math.floor(Math.random() * A.length)]).join("");
  return `VERDE-${part()}-${part()}-${part()}`;
}

const GROUP_COLORS = ["#34d399", "#6ee7ff", "#f5c451", "#ff6b8a", "#a78bfa", "#fb923c", "#4ade80", "#38bdf8"];

const blank = () => ({
  schema: SCHEMA,
  users: [], groups: [], properties: [], tasks: [], photos: [], activity: [],
});

/* --------------------------------------------------------------- store */
export const Store = {
  db: blank(),
  idx: {},
  _dirty: false,
  _saveTimer: null,

  /* ---------------------------------------------------------- lifecycle */
  load() {
    let raw = null;
    try { raw = localStorage.getItem(DB_KEY); } catch { raw = null; }
    if (raw) {
      try { this.db = JSON.parse(raw); } catch { this.db = blank(); }
    } else {
      // migrate the v1 database if it is present
      let old = null;
      try { old = localStorage.getItem("verde.db.v1"); } catch { old = null; }
      if (old) {
        try { this.db = this._migrate(JSON.parse(old)); } catch { this.db = blank(); }
      } else {
        this.db = blank();
      }
    }
    for (const k of ["users", "groups", "properties", "tasks", "photos", "activity"]) {
      if (!Array.isArray(this.db[k])) this.db[k] = [];
    }
    this.db.schema = SCHEMA;
    this.reindex();
    return this.db;
  },

  _migrate(old) {
    const d = blank();
    d.users = (old.users || []).map((u) => ({
      ...u, active: true, recoveryHash: null, lastSeen: null,
    }));
    d.properties = (old.properties || []).map((p) => ({ ...p, groups: p.groups || [] }));
    d.tasks = (old.tasks || []).map((t) => ({ ...t, assigneeId: null, dueDate: null }));
    d.photos = old.photos || [];
    return d;
  },

  /** Rebuild every lookup index. Called after load and after each mutation. */
  reindex() {
    const byId = (arr) => { const m = new Map(); for (const r of arr) m.set(r.id, r); return m; };
    const groupBy = (arr, key) => {
      const m = new Map();
      for (const r of arr) {
        const k = r[key];
        if (k == null) continue;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(r);
      }
      return m;
    };
    const usersByEmail = new Map();
    for (const u of this.db.users) usersByEmail.set(u.email, u);

    // worker -> group ids
    const groupsByMember = new Map();
    for (const g of this.db.groups) {
      for (const mid of g.memberIds || []) {
        if (!groupsByMember.has(mid)) groupsByMember.set(mid, []);
        groupsByMember.get(mid).push(g.id);
      }
    }

    this.idx = {
      users: byId(this.db.users),
      usersByEmail,
      groups: byId(this.db.groups),
      properties: byId(this.db.properties),
      tasks: byId(this.db.tasks),
      photos: byId(this.db.photos),
      propsByOwner: groupBy(this.db.properties, "ownerId"),
      tasksByProperty: groupBy(this.db.tasks, "propertyId"),
      photosByProperty: groupBy(this.db.photos, "propertyId"),
      photosByTask: groupBy(this.db.photos, "taskId"),
      groupsByOwner: groupBy(this.db.groups, "ownerId"),
      groupsByMember,
    };
  },

  /** Persist. Writes are coalesced so rapid edits do not thrash the disk. */
  save() {
    this._dirty = true;
    if (this._saveTimer) return true;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.flush();
    }, 60);
    return true;
  },

  flush() {
    if (!this._dirty) return true;
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this.db));
      this._dirty = false;
      return true;
    } catch (e) {
      console.error("verde: save failed", e);
      return false;
    }
  },

  /** Commit immediately — used before navigation/unload. */
  commit() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    return this.flush();
  },

  reset() {
    this.db = blank();
    this.reindex();
    try {
      localStorage.removeItem(DB_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem("verde.translations");
    } catch { /* ignore */ }
  },

  exportJSON() { return JSON.stringify(this.db, null, 2); },

  importJSON(text) {
    const d = JSON.parse(text);
    if (!d || !Array.isArray(d.users)) throw new Error("bad_file");
    this.db = Object.assign(blank(), d);
    this.reindex();
    this.commit();
  },

  log(userId, action, meta = {}) {
    this.db.activity.unshift({
      id: uid("a"), at: new Date().toISOString(), userId, action, meta,
    });
    if (this.db.activity.length > 400) this.db.activity.length = 400;
  },

  /* ------------------------------------------------------------ accounts */
  async signup({ name, email, password, role, language }) {
    email = (email || "").trim().toLowerCase();
    name = (name || "").trim();
    if (!name || !email || !password) throw new Error("missing_fields");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("bad_email");
    if (password.length < 8) throw new Error("weak_password");
    if (this.idx.usersByEmail.has(email)) throw new Error("email_taken");

    const s = salt();
    const recovery = makeRecoveryCode();
    const user = {
      id: uid("u"), name, email,
      pw: await sha256(s + password), salt: s,
      recoveryHash: await sha256(s + recovery),
      role: role === "worker" ? "worker" : "owner",
      language: language || "en",
      active: true,
      createdAt: new Date().toISOString(),
      lastSeen: null,
    };
    this.db.users.push(user);
    this.log(user.id, "account.created", { role: user.role });
    this.reindex();
    this.save();
    return { user: this.publicUser(user), recoveryCode: recovery };
  },

  async verify(email, password) {
    email = (email || "").trim().toLowerCase();
    const u = this.idx.usersByEmail.get(email);
    if (!u) throw new Error("no_account");
    if (!u.active) throw new Error("account_disabled");
    if (u.pw !== await sha256(u.salt + password)) throw new Error("bad_password");
    return u;
  },

  async login(email, password) {
    const u = await this.verify(email, password);
    u.lastSeen = new Date().toISOString();
    this.log(u.id, "account.login");
    this.save();
    return this.publicUser(u);
  },

  async changePassword(userId, current, next) {
    const u = this.idx.users.get(userId);
    if (!u) throw new Error("no_account");
    if (u.pw !== await sha256(u.salt + current)) throw new Error("bad_password");
    if (!next || next.length < 8) throw new Error("weak_password");
    u.salt = salt();
    u.pw = await sha256(u.salt + next);
    this.log(userId, "account.password_changed");
    this.save();
    return true;
  },

  /** Recovery-code reset — the only reset path that works with no mail server. */
  async resetWithCode(email, code, next) {
    email = (email || "").trim().toLowerCase();
    const u = this.idx.usersByEmail.get(email);
    if (!u) throw new Error("no_account");
    if (!u.recoveryHash) throw new Error("no_recovery");
    const norm = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
    if (u.recoveryHash !== await sha256(u.salt + norm)) throw new Error("bad_code");
    if (!next || next.length < 8) throw new Error("weak_password");
    u.salt = salt();
    u.pw = await sha256(u.salt + next);
    const fresh = makeRecoveryCode();
    u.recoveryHash = await sha256(u.salt + fresh);
    this.log(u.id, "account.password_reset");
    this.save();
    return { user: this.publicUser(u), recoveryCode: fresh };
  },

  async regenerateRecovery(userId, password) {
    const u = this.idx.users.get(userId);
    if (!u) throw new Error("no_account");
    if (u.pw !== await sha256(u.salt + password)) throw new Error("bad_password");
    const code = makeRecoveryCode();
    u.recoveryHash = await sha256(u.salt + code);
    this.log(userId, "account.recovery_regenerated");
    this.save();
    return code;
  },

  publicUser(u) {
    if (!u) return null;
    const { pw, salt, recoveryHash, ...rest } = u;
    return rest;
  },

  user(id) { return this.publicUser(this.idx.users.get(id)); },
  rawUser(id) { return this.idx.users.get(id) || null; },

  updateProfile(userId, patch) {
    const u = this.idx.users.get(userId);
    if (!u) return null;
    for (const k of ["name", "language"]) {
      if (patch[k] != null) u[k] = patch[k];
    }
    this.log(userId, "account.updated");
    this.save();
    return this.publicUser(u);
  },

  setActive(userId, active) {
    const u = this.idx.users.get(userId);
    if (!u) return null;
    u.active = !!active;
    this.log(userId, active ? "account.enabled" : "account.disabled");
    this.save();
    return this.publicUser(u);
  },

  workers() {
    return this.db.users.filter((u) => u.role === "worker").map((u) => this.publicUser(u));
  },
  allOwners() {
    return this.db.users.filter((u) => u.role === "owner").map((u) => this.publicUser(u));
  },

  setLanguage(userId, lang) {
    const u = this.idx.users.get(userId);
    if (u) { u.language = lang; this.save(); }
  },

  setSession(userId) {
    try {
      if (userId) localStorage.setItem(SESSION_KEY, userId);
      else localStorage.removeItem(SESSION_KEY);
    } catch { /* ignore */ }
  },
  session() { try { return localStorage.getItem(SESSION_KEY); } catch { return null; } },

  /* -------------------------------------------------------------- groups */
  addGroup({ ownerId, name, description, color }) {
    const g = {
      id: uid("g"), ownerId,
      name: (name || "Crew").trim(),
      description: description || "",
      color: color || GROUP_COLORS[this.db.groups.length % GROUP_COLORS.length],
      memberIds: [],
      createdAt: new Date().toISOString(),
    };
    this.db.groups.push(g);
    this.log(ownerId, "group.created", { name: g.name });
    this.reindex();
    this.save();
    return g;
  },

  group(id) { return this.idx.groups.get(id) || null; },

  groupsFor(ownerId) { return this.idx.groupsByOwner.get(ownerId) || []; },

  groupsOf(workerId) {
    return (this.idx.groupsByMember.get(workerId) || [])
      .map((gid) => this.idx.groups.get(gid)).filter(Boolean);
  },

  updateGroup(id, patch) {
    const g = this.group(id);
    if (!g) return null;
    for (const k of ["name", "description", "color"]) {
      if (patch[k] != null) g[k] = patch[k];
    }
    this.log(g.ownerId, "group.updated", { name: g.name });
    this.save();
    return g;
  },

  deleteGroup(id) {
    const g = this.group(id);
    if (!g) return;
    this.db.groups = this.db.groups.filter((x) => x.id !== id);
    for (const p of this.db.properties) {
      if (p.groups) p.groups = p.groups.filter((x) => x !== id);
    }
    this.log(g.ownerId, "group.deleted", { name: g.name });
    this.reindex();
    this.save();
  },

  addToGroup(groupId, workerId) {
    const g = this.group(groupId);
    if (!g) return null;
    if (!g.memberIds.includes(workerId)) g.memberIds.push(workerId);
    this.log(g.ownerId, "group.member_added", { group: g.name });
    this.reindex();
    this.save();
    return g;
  },

  removeFromGroup(groupId, workerId) {
    const g = this.group(groupId);
    if (!g) return null;
    g.memberIds = g.memberIds.filter((x) => x !== workerId);
    this.log(g.ownerId, "group.member_removed", { group: g.name });
    this.reindex();
    this.save();
    return g;
  },

  setGroupMembers(groupId, workerIds) {
    const g = this.group(groupId);
    if (!g) return null;
    g.memberIds = [...new Set(workerIds)];
    this.log(g.ownerId, "group.members_set", { group: g.name, count: g.memberIds.length });
    this.reindex();
    this.save();
    return g;
  },

  /* ---------------------------------------------------------- properties */
  addProperty({ ownerId, name, address, lat, lng, notes }) {
    const p = {
      id: uid("p"), ownerId,
      name: (name || "Property").trim(),
      address: address || "", notes: notes || "",
      lat: lat ?? null, lng: lng ?? null,
      workers: [], groups: [],
      createdAt: new Date().toISOString(),
    };
    this.db.properties.push(p);
    this.log(ownerId, "property.created", { name: p.name });
    this.reindex();
    this.save();
    return p;
  },

  property(id) { return this.idx.properties.get(id) || null; },

  propertiesFor(user) {
    if (!user) return [];
    if (user.role === "owner") return this.idx.propsByOwner.get(user.id) || [];
    const myGroups = new Set(this.idx.groupsByMember.get(user.id) || []);
    return this.db.properties.filter((p) =>
      p.workers.includes(user.id) || (p.groups || []).some((g) => myGroups.has(g)));
  },

  updateProperty(id, patch) {
    const p = this.property(id);
    if (!p) return null;
    Object.assign(p, patch);
    this.log(p.ownerId, "property.updated", { name: p.name });
    this.reindex();
    this.save();
    return p;
  },

  deleteProperty(id) {
    const p = this.property(id);
    if (!p) return;
    const taskCount = (this.idx.tasksByProperty.get(id) || []).length;
    this.db.properties = this.db.properties.filter((x) => x.id !== id);
    this.db.tasks = this.db.tasks.filter((t) => t.propertyId !== id);
    this.db.photos = this.db.photos.filter((ph) => ph.propertyId !== id);
    this.log(p.ownerId, "property.deleted", { name: p.name, tasks: taskCount });
    this.reindex();
    this.save();
  },

  assignWorker(propId, workerId) {
    const p = this.property(propId);
    if (!p) return null;
    if (!p.workers.includes(workerId)) p.workers.push(workerId);
    this.log(p.ownerId, "property.worker_assigned", { property: p.name });
    this.reindex();
    this.save();
    return p;
  },

  unassignWorker(propId, workerId) {
    const p = this.property(propId);
    if (!p) return null;
    p.workers = p.workers.filter((w) => w !== workerId);
    this.log(p.ownerId, "property.worker_unassigned", { property: p.name });
    this.reindex();
    this.save();
    return p;
  },

  assignGroup(propId, groupId) {
    const p = this.property(propId);
    if (!p) return null;
    p.groups = p.groups || [];
    if (!p.groups.includes(groupId)) p.groups.push(groupId);
    this.log(p.ownerId, "property.group_assigned", { property: p.name });
    this.reindex();
    this.save();
    return p;
  },

  unassignGroup(propId, groupId) {
    const p = this.property(propId);
    if (!p) return null;
    p.groups = (p.groups || []).filter((g) => g !== groupId);
    this.log(p.ownerId, "property.group_unassigned", { property: p.name });
    this.reindex();
    this.save();
    return p;
  },

  /* --------------------------------------------------------------- tasks */
  addTask({ propertyId, createdBy, title, description, lat, lng, priority, photoId, assigneeId, dueDate }) {
    const t = {
      id: uid("t"), propertyId, createdBy,
      title: (title || "Task").trim(),
      description: description || "",
      lat: lat ?? null, lng: lng ?? null,
      priority: priority || "normal",
      status: "open",
      assigneeId: assigneeId || null,
      dueDate: dueDate || null,
      photoId: photoId || null,
      completionPhotoId: null,
      createdAt: new Date().toISOString(),
      completedAt: null, completedBy: null,
      comments: [],
    };
    this.db.tasks.push(t);
    this.log(createdBy, "task.created", { title: t.title });
    this.reindex();
    this.save();
    return t;
  },

  task(id) { return this.idx.tasks.get(id) || null; },
  tasksFor(propertyId) { return this.idx.tasksByProperty.get(propertyId) || []; },

  tasksForUser(user) {
    if (!user) return [];
    if (user.role === "owner") {
      const ids = new Set((this.idx.propsByOwner.get(user.id) || []).map((p) => p.id));
      return this.db.tasks.filter((t) => ids.has(t.propertyId));
    }
    const propIds = new Set(this.propertiesFor(user).map((p) => p.id));
    return this.db.tasks.filter((t) => propIds.has(t.propertyId));
  },

  updateTask(id, patch) {
    const t = this.task(id);
    if (!t) return null;
    Object.assign(t, patch);
    if (patch.status === "done" && !t.completedAt) t.completedAt = new Date().toISOString();
    if (patch.status && patch.status !== "done") t.completedAt = null;
    this.log(t.createdBy, "task.updated", { title: t.title, status: t.status });
    this.save();
    return t;
  },

  setTaskStatus(id, status, userId) {
    const t = this.task(id);
    if (!t) return null;
    t.status = status;
    if (status === "done") {
      t.completedAt = new Date().toISOString();
      t.completedBy = userId || null;
      this.log(userId, "task.completed", { title: t.title });
    } else {
      t.completedAt = null;
      this.log(userId, "task.reopened", { title: t.title });
    }
    this.save();
    return t;
  },

  addComment(taskId, userId, text) {
    const t = this.task(taskId);
    if (!t || !text || !text.trim()) return null;
    t.comments.push({ id: uid("c"), userId, text: text.trim(), at: new Date().toISOString() });
    this.save();
    return t;
  },

  deleteTask(id) {
    const t = this.task(id);
    if (!t) return null;
    this.db.tasks = this.db.tasks.filter((x) => x.id !== id);
    this.log(t.createdBy, "task.deleted", { title: t.title });
    this.reindex();
    this.save();
    return t;   // returned so the UI can offer undo
  },

  /** Restore a deleted task (undo). */
  restoreTask(t) {
    if (!t) return null;
    this.db.tasks.push(t);
    this.reindex();
    this.save();
    return t;
  },

  /* -------------------------------------------------------------- photos */
  addPhoto({ propertyId, taskId, uploaderId, dataUrl, caption, lat, lng, kind }) {
    const ph = {
      id: uid("ph"), propertyId, taskId: taskId || null, uploaderId,
      dataUrl, caption: caption || "",
      lat: lat ?? null, lng: lng ?? null,
      kind: kind || "issue",
      at: new Date().toISOString(),
    };
    this.db.photos.push(ph);
    this.reindex();
    this.save();
    return ph;
  },

  photo(id) { return this.idx.photos.get(id) || null; },
  photosFor(propertyId) { return this.idx.photosByProperty.get(propertyId) || []; },
  photosForTask(taskId) { return this.idx.photosByTask.get(taskId) || []; },

  photosForUser(user) {
    const ids = new Set(this.propertiesFor(user).map((p) => p.id));
    return this.db.photos.filter((ph) => ids.has(ph.propertyId));
  },

  deletePhoto(id) {
    this.db.photos = this.db.photos.filter((p) => p.id !== id);
    this.reindex();
    this.save();
  },

  photoBytes() {
    let n = 0;
    for (const p of this.db.photos) n += (p.dataUrl || "").length;
    return n;
  },

  storageEstimate() {
    const bytes = this.photoBytes();
    return { bytes, mb: bytes / 1048576, limitMb: 5 };
  },

  /* --------------------------------------------------------------- stats */
  statsFor(user) {
    const tasks = this.tasksForUser(user);
    const props = this.propertiesFor(user);
    const done = tasks.filter((t) => t.status === "done");
    const today = new Date(new Date().toDateString());
    return {
      properties: props.length,
      open: tasks.filter((t) => t.status === "open").length,
      doing: tasks.filter((t) => t.status === "doing").length,
      done: done.length,
      overdue: tasks.filter((t) => t.status !== "done" && t.dueDate &&
        new Date(t.dueDate) < today).length,
      photos: this.photosForUser(user).length,
      completion: tasks.length ? Math.round((done.length / tasks.length) * 100) : 0,
    };
  },

  /* ---------------------------------------------------------- demo seeds */
  async seedDemo() {
    const existing = this.idx.usersByEmail.get("owner@demo.com");
    if (existing) return this.publicUser(existing);

    const { user: owner } = await this.signup({
      name: "Maria Alvarez", email: "owner@demo.com", password: "demo1234",
      role: "owner", language: "en",
    });
    const { user: diego } = await this.signup({
      name: "Diego Ramirez", email: "worker@demo.com", password: "demo1234",
      role: "worker", language: "es",
    });
    const { user: ana } = await this.signup({
      name: "Ana Silva", email: "ana@demo.com", password: "demo1234",
      role: "worker", language: "pt",
    });
    const { user: kenji } = await this.signup({
      name: "Kenji Sato", email: "kenji@demo.com", password: "demo1234",
      role: "worker", language: "ja",
    });

    const crew = this.addGroup({
      ownerId: owner.id, name: "Garden Crew",
      description: "Hedges, planting and irrigation", color: "#34d399",
    });
    const builders = this.addGroup({
      ownerId: owner.id, name: "Build Crew",
      description: "Fencing, paths and hard landscaping", color: "#f5c451",
    });
    this.setGroupMembers(crew.id, [diego.id, ana.id]);
    this.setGroupMembers(builders.id, [kenji.id]);

    const p1 = this.addProperty({
      ownerId: owner.id, name: "Casa Alvarez", address: "Solvang, CA",
      lat: 34.5958, lng: -120.1376, notes: "Front and back garden, drip irrigation.",
    });
    const p2 = this.addProperty({
      ownerId: owner.id, name: "Vineyard Cottage", address: "Ballard, CA",
      lat: 34.6181, lng: -120.1214, notes: "Olive trees need trimming.",
    });
    const p3 = this.addProperty({
      ownerId: owner.id, name: "Ranch House", address: "Los Olivos, CA",
      lat: 34.6675, lng: -120.1146, notes: "Long driveway, two acres.",
    });
    this.assignGroup(p1.id, crew.id);
    this.assignGroup(p2.id, crew.id);
    this.assignGroup(p3.id, builders.id);

    const today = new Date();
    const iso = (d) => new Date(today.getTime() + d * 86400000).toISOString().slice(0, 10);

    this.addTask({
      propertyId: p1.id, createdBy: owner.id, title: "Replace the front fence",
      description: "The left gate post is rotting. I want a darker wood this time, not the same colour.",
      priority: "high", lat: 34.5975, lng: -120.1352, assigneeId: kenji.id, dueDate: iso(3),
    });
    this.addTask({
      propertyId: p1.id, createdBy: owner.id, title: "Trim the hedge lower",
      description: "Cut it about 30cm lower than last time so it doesn't block the window.",
      priority: "normal", lat: 34.5944, lng: -120.1395, assigneeId: diego.id, dueDate: iso(7),
    });
    this.addTask({
      propertyId: p2.id, createdBy: owner.id, title: "Fix the drip line by the olive trees",
      description: "The far line is blocked — water pools near the trunk.",
      priority: "high", lat: 34.6201, lng: -120.1193, assigneeId: diego.id, dueDate: iso(-1),
    });
    this.addTask({
      propertyId: p2.id, createdBy: owner.id, title: "Re-seed the back lawn",
      description: "Patchy near the path.", priority: "low",
      lat: 34.6162, lng: -120.1238, dueDate: iso(21),
    });
    this.addTask({
      propertyId: p3.id, createdBy: owner.id, title: "Lay gravel on the driveway",
      description: "Use the same grey as the courtyard, not the warm tan.",
      priority: "normal", lat: 34.6691, lng: -120.1163, assigneeId: kenji.id, dueDate: iso(10),
    });
    const doneTask = this.db.tasks[3];
    this.setTaskStatus(doneTask.id, "done", diego.id);
    this.addComment(this.db.tasks[0].id, owner.id, "Please match the colour to the shutters.");
    this.addComment(this.db.tasks[0].id, kenji.id, "Understood — I'll bring samples.");

    this.commit();
    return this.publicUser(owner);
  },
};

export { GROUP_COLORS };
