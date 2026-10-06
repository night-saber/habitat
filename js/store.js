/* Habitat — data layer.
 *
 * Runs on localStorage by default and can be pointed at a real API by setting
 * `window.HABITAT_API` before this module loads. Every read/write goes through
 * `Store`, so the UI never knows which backend it is talking to.
 *
 * Records are held in arrays for serialisation but indexed into Maps after
 * every load/mutation, so lookups are O(1) rather than array scans.
 */
"use strict";

const DB_KEY = "habitat.db";
const SESSION_KEY = "habitat.session";
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

/** Human-transcribable recovery code: HABITAT-XXXX-XXXX-XXXX */
function makeRecoveryCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  const part = () => Array.from({ length: 4 }, () =>
    A[Math.floor(Math.random() * A.length)]).join("");
  return `HABITAT-${part()}-${part()}-${part()}`;
}

const GROUP_COLORS = ["#34d399", "#6ee7ff", "#f5c451", "#ff6b8a", "#a78bfa", "#fb923c", "#4ade80", "#38bdf8"];

const blank = () => ({
  schema: SCHEMA,
  users: [], groups: [], properties: [], tasks: [], photos: [], activity: [], scans: [],
});

const blankProperty = () => ({
  systemInfo: {},
  utilities: [],
  documents: [],
  rooms: [],
  appliances: [],
  materials: [],
});

/* Room types for the room-by-room detail view */
export const ROOM_TYPES = [
  { value: "kitchen", label: "Kitchen" },
  { value: "living_room", label: "Living Room" },
  { value: "bedroom", label: "Bedroom" },
  { value: "bathroom", label: "Bathroom" },
  { value: "dining_room", label: "Dining Room" },
  { value: "office", label: "Office" },
  { value: "garage", label: "Garage" },
  { value: "basement", label: "Basement" },
  { value: "attic", label: "Attic" },
  { value: "laundry", label: "Laundry" },
  { value: "hallway", label: "Hallway" },
  { value: "exterior", label: "Exterior" },
  { value: "other", label: "Other" },
];

/* Appliance categories */
export const APPLIANCE_TYPES = [
  { value: "hvac", label: "HVAC" },
  { value: "water_heater", label: "Water Heater" },
  { value: "refrigerator", label: "Refrigerator" },
  { value: "oven", label: "Oven/Stove" },
  { value: "dishwasher", label: "Dishwasher" },
  { value: "washer", label: "Washer" },
  { value: "dryer", label: "Dryer" },
  { value: "garbage_disposal", label: "Garbage Disposal" },
  { value: "microwave", label: "Microwave" },
  { value: "range_hood", label: "Range Hood" },
  { value: "water_softener", label: "Water Softener" },
  { value: "sump_pump", label: "Sump Pump" },
  { value: "other", label: "Other" },
];

/* Material categories for tracking finishes */
export const MATERIAL_TYPES = [
  { value: "flooring", label: "Flooring" },
  { value: "paint", label: "Paint" },
  { value: "countertop", label: "Countertop" },
  { value: "backsplash", label: "Backsplash" },
  { value: "cabinets", label: "Cabinets" },
  { value: "wall_finish", label: "Wall Finish" },
  { value: "ceiling", label: "Ceiling" },
  { value: "trim", label: "Trim/Moulding" },
  { value: "roofing", label: "Roofing" },
  { value: "siding", label: "Siding" },
  { value: "windows", label: "Windows" },
  { value: "doors", label: "Doors" },
  { value: "fixtures", label: "Fixtures" },
  { value: "insulation", label: "Insulation" },
  { value: "other", label: "Other" },
];

/* --------------------------------------------------------- API client */
const API = {
  baseUrl: null,
  ws: null,
  wsToken: null,
  wsConnected: false,
  _wsListeners: [],
  _reconnectTimer: null,

  get enabled() {
    return typeof window !== "undefined" && !!window.HABITAT_API;
  },

  init() {
    if (!this.enabled) return;
    this.baseUrl = window.HABITAT_API.replace(/\/$/, "");
  },

  /* ---- REST helpers ---- */
  async request(method, path, body) {
    if (!this.enabled) throw new Error("api_disabled");
    const url = `${this.baseUrl}/api${path}`;
    const opts = { method, headers: {} };
    const token = this._getToken();
    if (token) opts.headers["Authorization"] = `Bearer ${token}`;
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `http_${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  get(path) { return this.request("GET", path); },
  post(path, body) { return this.request("POST", path, body); },
  patch(path, body) { return this.request("PATCH", path, body); },
  put(path, body) { return this.request("PUT", path, body); },
  del(path) { return this.request("DELETE", path); },

  _getToken() {
    try {
      const raw = localStorage.getItem("habitat.tokens");
      if (raw) { const t = JSON.parse(raw); return t.access || null; }
    } catch { /* ignore */ }
    return null;
  },

  _setTokens(access, refresh) {
    try {
      if (access) localStorage.setItem("habitat.tokens", JSON.stringify({ access, refresh }));
      else localStorage.removeItem("habitat.tokens");
    } catch { /* ignore */ }
    // Reconnect WebSocket with new token
    if (this.wsConnected) {
      this.disconnectWS();
      this.connectWS(access);
    }
  },

  /* ---- WebSocket ---- */
  connectWS(token) {
    if (!this.enabled) return;
    const wsUrl = this.baseUrl.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(token)}`;
    try {
      this.ws = new WebSocket(wsUrl);
      this.wsToken = token;

      this.ws.onopen = () => {
        this.wsConnected = true;
        this._emit("ws_open", {});
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleWSMessage(msg);
        } catch { /* ignore malformed */ }
      };

      this.ws.onclose = () => {
        this.wsConnected = false;
        this._emit("ws_close", {});
        // Auto-reconnect after 5s
        if (this.enabled && !this._reconnectTimer) {
          this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            const t = this._getToken();
            if (t) this.connectWS(t);
          }, 5000);
        }
      };

      this.ws.onerror = () => {
        // onclose will follow
      };
    } catch {
      // WebSocket not available
    }
  },

  disconnectWS() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.wsConnected = false;
  },

  _handleWSMessage(msg) {
    switch (msg.type) {
      case "connected":
        this._emit("ws_connected", msg);
        break;
      case "task_created":
      case "task_updated":
      case "task_comment_added":
        this._emit("task_changed", msg);
        break;
      case "task_deleted":
        this._emit("task_deleted", msg);
        break;
      case "notification":
        this._emit("notification", msg.notification);
        break;
      case "pong":
        break;
    }
  },

  /* ---- Event subscription ---- */
  on(event, handler) {
    this._wsListeners.push({ event, handler });
  },

  off(event, handler) {
    this._wsListeners = this._wsListeners.filter(
      (l) => !(l.event === event && l.handler === handler)
    );
  },

  _emit(event, data) {
    for (const l of this._wsListeners) {
      if (l.event === event) {
        try { l.handler(data); } catch { /* ignore */ }
      }
    }
  },
};

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
      try { old = localStorage.getItem("habitat.db.v1"); } catch { old = null; }
      if (old) {
        try { this.db = this._migrate(JSON.parse(old)); } catch { this.db = blank(); }
      } else {
        this.db = blank();
      }
    }
    for (const k of ["users", "groups", "properties", "tasks", "photos", "activity", "scans"]) {
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
      scans: byId(this.db.scans),
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
      console.error("habitat: save failed", e);
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
      localStorage.removeItem("habitat.translations");
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
  async signup({ name, email, password, role, language, trade }) {
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
      trade: trade || null,
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

  /** Simple email + new password reset (no recovery code needed). */
  async resetPassword(email, next) {
    email = (email || "").trim().toLowerCase();
    const u = this.idx.usersByEmail.get(email);
    if (!u) throw new Error("no_account");
    if (!next || next.length < 8) throw new Error("weak_password");
    u.salt = salt();
    u.pw = await sha256(u.salt + next);
    this.log(u.id, "account.password_reset");
    this.save();
    return { user: this.publicUser(u) };
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
    for (const k of ["name", "language", "trade"]) {
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
      systemInfo: {}, utilities: [], documents: [],
      rooms: [], appliances: [], materials: [],
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

  /* --------------------------------------------- property info: system */
  updateSystemInfo(propId, data) {
    const p = this.property(propId);
    if (!p) return null;
    p.systemInfo = Object.assign({}, p.systemInfo, data);
    this.log(p.ownerId, "property.system_updated", { property: p.name });
    this.save();
    return p;
  },

  /* --------------------------------------------- property info: utilities */
  addUtility(propId, data) {
    const p = this.property(propId);
    if (!p) return null;
    p.utilities = p.utilities || [];
    const u = {
      id: uid("u"),
      type: data.type || "other",
      label: data.label || "",
      notes: data.notes || "",
      photoId: data.photoId || null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    };
    p.utilities.push(u);
    this.log(p.ownerId, "property.utility_added", { property: p.name, type: u.type });
    this.save();
    return u;
  },

  updateUtility(propId, utilityId, data) {
    const p = this.property(propId);
    if (!p) return null;
    const u = (p.utilities || []).find((x) => x.id === utilityId);
    if (!u) return null;
    Object.assign(u, data);
    this.log(p.ownerId, "property.utility_updated", { property: p.name });
    this.save();
    return u;
  },

  deleteUtility(propId, utilityId) {
    const p = this.property(propId);
    if (!p) return;
    p.utilities = (p.utilities || []).filter((x) => x.id !== utilityId);
    this.log(p.ownerId, "property.utility_deleted", { property: p.name });
    this.save();
  },

  /* --------------------------------------------- property info: documents */
  addDocument(propId, data) {
    const p = this.property(propId);
    if (!p) return null;
    p.documents = p.documents || [];
    const d = {
      id: uid("d"),
      title: data.title || "",
      description: data.description || "",
      category: data.category || "other",
      date: data.date || null,
      notes: data.notes || "",
    };
    p.documents.push(d);
    this.log(p.ownerId, "property.document_added", { property: p.name, title: d.title });
    this.save();
    return d;
  },

  updateDocument(propId, docId, data) {
    const p = this.property(propId);
    if (!p) return null;
    const d = (p.documents || []).find((x) => x.id === docId);
    if (!d) return null;
    Object.assign(d, data);
    this.log(p.ownerId, "property.document_updated", { property: p.name });
    this.save();
    return d;
  },

  deleteDocument(propId, docId) {
    const p = this.property(propId);
    if (!p) return;
    p.documents = (p.documents || []).filter((x) => x.id !== docId);
    this.log(p.ownerId, "property.document_deleted", { property: p.name });
    this.save();
  },

  /* --------------------------------------------- property info: rooms */
  addRoom(propId, data) {
    const p = this.property(propId);
    if (!p) return null;
    p.rooms = p.rooms || [];
    const r = {
      id: uid("r"),
      name: data.name || "",
      type: data.type || "other",
      floorLevel: data.floorLevel || "",
      dimensions: data.dimensions || "",
      flooring: data.flooring || "",
      flooringColor: data.flooringColor || "",
      wallColor: data.wallColor || "",
      ceilingColor: data.ceilingColor || "",
      trimColor: data.trimColor || "",
      windowType: data.windowType || "",
      windowCount: data.windowCount || "",
      notes: data.notes || "",
      photoId: data.photoId || null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
    };
    p.rooms.push(r);
    this.log(p.ownerId, "property.room_added", { property: p.name, room: r.name });
    this.save();
    return r;
  },

  updateRoom(propId, roomId, data) {
    const p = this.property(propId);
    if (!p) return null;
    const r = (p.rooms || []).find((x) => x.id === roomId);
    if (!r) return null;
    Object.assign(r, data);
    this.log(p.ownerId, "property.room_updated", { property: p.name });
    this.save();
    return r;
  },

  deleteRoom(propId, roomId) {
    const p = this.property(propId);
    if (!p) return;
    p.rooms = (p.rooms || []).filter((x) => x.id !== roomId);
    this.log(p.ownerId, "property.room_deleted", { property: p.name });
    this.save();
  },

  /* ----------------------------------------- property info: appliances */
  addAppliance(propId, data) {
    const p = this.property(propId);
    if (!p) return null;
    p.appliances = p.appliances || [];
    const a = {
      id: uid("ap"),
      name: data.name || "",
      type: data.type || "other",
      brand: data.brand || "",
      model: data.model || "",
      serialNumber: data.serialNumber || "",
      yearInstalled: data.yearInstalled || "",
      warrantyExpiry: data.warrantyExpiry || "",
      room: data.room || "",
      notes: data.notes || "",
      photoId: data.photoId || null,
    };
    p.appliances.push(a);
    this.log(p.ownerId, "property.appliance_added", { property: p.name, appliance: a.name });
    this.save();
    return a;
  },

  updateAppliance(propId, applianceId, data) {
    const p = this.property(propId);
    if (!p) return null;
    const a = (p.appliances || []).find((x) => x.id === applianceId);
    if (!a) return null;
    Object.assign(a, data);
    this.log(p.ownerId, "property.appliance_updated", { property: p.name });
    this.save();
    return a;
  },

  deleteAppliance(propId, applianceId) {
    const p = this.property(propId);
    if (!p) return;
    p.appliances = (p.appliances || []).filter((x) => x.id !== applianceId);
    this.log(p.ownerId, "property.appliance_deleted", { property: p.name });
    this.save();
  },

  /* ------------------------------------------ property info: materials */
  addMaterial(propId, data) {
    const p = this.property(propId);
    if (!p) return null;
    p.materials = p.materials || [];
    const m = {
      id: uid("m"),
      name: data.name || "",
      type: data.type || "other",
      color: data.color || "",
      finish: data.finish || "",
      brand: data.brand || "",
      productCode: data.productCode || "",
      room: data.room || "",
      dateInstalled: data.dateInstalled || "",
      notes: data.notes || "",
      photoId: data.photoId || null,
    };
    p.materials.push(m);
    this.log(p.ownerId, "property.material_added", { property: p.name, material: m.name });
    this.save();
    return m;
  },

  updateMaterial(propId, materialId, data) {
    const p = this.property(propId);
    if (!p) return null;
    const m = (p.materials || []).find((x) => x.id === materialId);
    if (!m) return null;
    Object.assign(m, data);
    this.log(p.ownerId, "property.material_updated", { property: p.name });
    this.save();
    return m;
  },

  deleteMaterial(propId, materialId) {
    const p = this.property(propId);
    if (!p) return;
    p.materials = (p.materials || []).filter((x) => x.id !== materialId);
    this.log(p.ownerId, "property.material_deleted", { property: p.name });
    this.save();
  },

  /* ------------------------------------- worker location & service area */
  setWorkerLocation(userId, lat, lng) {
    const u = this.idx.users.get(userId);
    if (!u) return null;
    u.serviceLat = lat;
    u.serviceLng = lng;
    this.log(userId, "worker.location_set");
    this.save();
    return this.publicUser(u);
  },

  setWorkerServiceArea(userId, radiusKm) {
    const u = this.idx.users.get(userId);
    if (!u) return null;
    u.serviceRadiusKm = radiusKm;
    this.log(userId, "worker.service_area_set", { radiusKm });
    this.save();
    return this.publicUser(u);
  },

  /**
   * Find workers near a given location. Only returns workers who have set
   * their location. Distance is calculated with the Haversine formula.
   * Returns array of { user, distanceKm } sorted by distance.
   */
  findWorkersNear(lat, lng, maxKm = 50) {
    const R = 6371; // Earth radius in km
    const toRad = (d) => (d * Math.PI) / 180;
    const workers = this.db.users.filter((u) =>
      u.role === "worker" && u.active && u.serviceLat != null && u.serviceLng != null
    );
    const results = [];
    for (const w of workers) {
      const dLat = toRad(w.serviceLat - lat);
      const dLng = toRad(w.serviceLng - lng);
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat)) * Math.cos(toRad(w.serviceLat)) *
        Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const dist = R * c;
      if (dist <= maxKm) {
        results.push({ user: this.publicUser(w), distanceKm: Math.round(dist * 10) / 10 });
      }
    }
    results.sort((a, b) => a.distanceKm - b.distanceKm);
    return results;
  },

  /* ------------------------------------------------------ privacy */
  /**
   * Privacy: workers can only see their own data. They cannot see other
   * workers' profiles, other owners' data, or properties they're not
   * assigned to. This method returns a sanitized view of a user record
   * that is safe for the given viewer.
   */
  publicUserForUser(targetUserId, viewerId) {
    const target = this.idx.users.get(targetUserId);
    const viewer = this.idx.users.get(viewerId);
    if (!target || !viewer) return null;
    // Users can always see themselves
    if (target.id === viewer.id) return this.publicUser(target);
    // Workers cannot see other workers
    if (viewer.role === "worker" && target.role === "worker") return null;
    // Workers cannot see owners (except through assignment)
    if (viewer.role === "worker" && target.role === "owner") return null;
    // Owners cannot see other owners
    if (viewer.role === "owner" && target.role === "owner") return null;
    // Owners can see workers who are assigned to their properties
    if (viewer.role === "owner" && target.role === "worker") {
      const myProps = this.idx.propsByOwner.get(viewer.id) || [];
      const myPropIds = new Set(myProps.map((p) => p.id));
      const assigned = this.db.properties.some((p) =>
        myPropIds.has(p.id) && (p.workers || []).includes(target.id)
      );
      if (!assigned) return null;
    }
    return this.publicUser(target);
  },

  /**
   * Privacy: get a list of workers visible to the given owner. Only returns
   * workers who are assigned to at least one of the owner's properties or
   * are in one of the owner's crews.
   */
  visibleWorkersFor(ownerId) {
    const owner = this.idx.users.get(ownerId);
    if (!owner || owner.role !== "owner") return [];
    const myProps = this.idx.propsByOwner.get(ownerId) || [];
    const myPropIds = new Set(myProps.map((p) => p.id));
    const myCrewIds = new Set((this.idx.groupsByOwner.get(ownerId) || []).map((g) => g.id));
    const visible = new Set();
    for (const p of this.db.properties) {
      if (!myPropIds.has(p.id)) continue;
      for (const wid of (p.workers || [])) visible.add(wid);
      for (const gid of (p.groups || [])) {
        if (myCrewIds.has(gid)) {
          const g = this.idx.groups.get(gid);
          if (g) for (const mid of g.memberIds) visible.add(mid);
        }
      }
    }
    return [...visible].map((id) => this.publicUser(this.idx.users.get(id))).filter(Boolean);
  },

  /**
   * Privacy: check if a user can see a property's full details.
   * Owners see their own properties. Workers see only assigned properties.
   */
  canViewProperty(user, propertyId) {
    if (!user) return false;
    const p = this.idx.properties.get(propertyId);
    if (!p) return false;
    if (user.role === "owner") return p.ownerId === user.id;
    if (p.workers.includes(user.id)) return true;
    const myGroups = new Set(this.idx.groupsByMember.get(user.id) || []);
    return (p.groups || []).some((g) => myGroups.has(g));
  },

  /**
   * Privacy: check if a user can edit a property's details.
   * Only the owner can edit. Workers can only view.
   */
  canEditProperty(user, propertyId) {
    if (!user || user.role !== "owner") return false;
    const p = this.idx.properties.get(propertyId);
    return p && p.ownerId === user.id;
  },

  /* --------------------------------------------------------------- tasks */
  addTask({ propertyId, createdBy, title, description, lat, lng, priority, photoId, assigneeId, dueDate, trade }) {
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
      trade: trade || "general",
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

  /* --------------------------------------------------------------- scans */
  addScan({ userId, propertyId, name, points }) {
    const s = {
      id: uid("s"), userId, propertyId,
      name: (name || "Scan").trim(),
      points: points || [],
      createdAt: new Date().toISOString(),
    };
    this.db.scans.push(s);
    this.log(userId, "scan.created", { name: s.name, points: s.points.length });
    this.reindex();
    this.save();
    return s;
  },

  scan(id) { return this.idx.scans.get(id) || null; },

  scansFor(propertyId) {
    return this.db.scans.filter((s) => s.propertyId === propertyId);
  },

  deleteScan(id, userId) {
    const s = this.scan(id);
    if (!s) return;
    this.db.scans = this.db.scans.filter((x) => x.id !== id);
    this.log(userId || s.userId, "scan.deleted", { name: s.name });
    this.reindex();
    this.save();
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



  /* -------------------------------------------- WebSocket event handling */
  _handleTaskChanged(msg) {
    // Update local cache with the task from the WebSocket message
    if (msg.task) {
      const existing = this.idx.tasks.get(msg.task.id);
      if (existing) {
        Object.assign(existing, this._apiTaskToLocal(msg.task));
      } else {
        this.db.tasks.push(this._apiTaskToLocal(msg.task));
      }
      this.reindex();
      this.save();
    }
  },

  _handleTaskDeleted(msg) {
    if (msg.taskId) {
      this.db.tasks = this.db.tasks.filter((t) => t.id !== msg.taskId);
      this.reindex();
      this.save();
    }
  },

  _handleNotification(notif) {
    // Show a toast or in-app notification
    // The UI can subscribe to this via API.on("notification", handler)
    console.log("habitat: notification", notif);
  },

  initWebSocket() {
    if (!API.enabled) return;
    API.on("task_changed", (msg) => this._handleTaskChanged(msg));
    API.on("task_deleted", (msg) => this._handleTaskDeleted(msg));
    API.on("notification", (n) => this._handleNotification(n));
  },

  _apiTaskToLocal(t) {
    return {
      id: t.id, propertyId: t.propertyId, createdBy: t.createdBy,
      assigneeId: t.assigneeId, title: t.title, description: t.description,
      priority: t.priority, status: t.status, trade: t.trade,
      lat: t.lat, lng: t.lng, dueDate: t.dueDate,
      photoId: t.photoId, completionPhotoId: t.completionPhotoId,
      createdAt: t.createdAt, completedAt: t.completedAt, completedBy: t.completedBy,
      comments: t.comments || [],
    };
  },
};

export { GROUP_COLORS, API };
