/* Verde — data layer: accounts, properties, tasks, photos. localStorage-backed. */
"use strict";

const DB_KEY = "verde.db.v1";
const SESSION_KEY = "verde.session.v1";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function hash(text) {
  // SHA-256 via SubtleCrypto; falls back to a simple digest if unavailable (file://)
  try {
    const buf = new TextEncoder().encode(text);
    const d = await crypto.subtle.digest("SHA-256", buf);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
    return "f" + Math.abs(h).toString(16);
  }
}

const empty = () => ({ users: [], properties: [], tasks: [], photos: [], seq: 1 });

export const Store = {
  db: empty(),

  load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      this.db = raw ? JSON.parse(raw) : empty();
    } catch {
      this.db = empty();
    }
    for (const k of ["users", "properties", "tasks", "photos"]) {
      if (!Array.isArray(this.db[k])) this.db[k] = [];
    }
    return this.db;
  },

  save() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(this.db));
      return true;
    } catch (e) {
      console.error("save failed (storage full?)", e);
      return false;
    }
  },

  reset() {
    this.db = empty();
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SESSION_KEY);
  },

  /* ------------------------------------------------------------- accounts */
  async signup({ name, email, password, role, language }) {
    email = (email || "").trim().toLowerCase();
    if (!name || !email || !password) throw new Error("missing_fields");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("bad_email");
    if (password.length < 6) throw new Error("weak_password");
    if (this.db.users.some((u) => u.email === email)) throw new Error("email_taken");
    const user = {
      id: uid(), name: name.trim(), email,
      pw: await hash(password + "::verde"), role,
      language: language || "en",
      createdAt: new Date().toISOString(),
    };
    this.db.users.push(user);
    this.save();
    return this.publicUser(user);
  },

  async login(email, password) {
    email = (email || "").trim().toLowerCase();
    const u = this.db.users.find((x) => x.email === email);
    if (!u) throw new Error("no_account");
    if (u.pw !== (await hash(password + "::verde"))) throw new Error("bad_password");
    return this.publicUser(u);
  },

  publicUser(u) {
    const { pw, ...rest } = u;
    return rest;
  },

  user(id) {
    const u = this.db.users.find((x) => x.id === id);
    return u ? this.publicUser(u) : null;
  },

  workers() { return this.db.users.filter((u) => u.role === "worker").map((u) => this.publicUser(u)); },
  owners() { return this.db.users.filter((u) => u.role === "owner").map((u) => this.publicUser(u)); },

  setLanguage(userId, lang) {
    const u = this.db.users.find((x) => x.id === userId);
    if (u) { u.language = lang; this.save(); }
  },

  setSession(userId) {
    if (userId) localStorage.setItem(SESSION_KEY, userId);
    else localStorage.removeItem(SESSION_KEY);
  },
  session() { return localStorage.getItem(SESSION_KEY); },

  /* ----------------------------------------------------------- properties */
  addProperty({ ownerId, name, address, lat, lng, notes }) {
    const p = {
      id: uid(), ownerId, name: name || "Property", address: address || "",
      lat: lat ?? null, lng: lng ?? null, notes: notes || "",
      workers: [], createdAt: new Date().toISOString(),
    };
    this.db.properties.push(p);
    this.save();
    return p;
  },

  propertiesFor(user) {
    if (!user) return [];
    if (user.role === "owner") return this.db.properties.filter((p) => p.ownerId === user.id);
    return this.db.properties.filter((p) => p.workers.includes(user.id));
  },

  property(id) { return this.db.properties.find((p) => p.id === id) || null; },

  assignWorker(propId, workerId) {
    const p = this.property(propId);
    if (!p) return null;
    if (!p.workers.includes(workerId)) p.workers.push(workerId);
    this.save();
    return p;
  },

  unassignWorker(propId, workerId) {
    const p = this.property(propId);
    if (!p) return null;
    p.workers = p.workers.filter((w) => w !== workerId);
    this.save();
    return p;
  },

  updateProperty(id, patch) {
    const p = this.property(id);
    if (!p) return null;
    Object.assign(p, patch);
    this.save();
    return p;
  },

  deleteProperty(id) {
    this.db.properties = this.db.properties.filter((p) => p.id !== id);
    this.db.tasks = this.db.tasks.filter((t) => t.propertyId !== id);
    this.db.photos = this.db.photos.filter((ph) => ph.propertyId !== id);
    this.save();
  },

  /* ---------------------------------------------------------------- tasks */
  addTask({ propertyId, createdBy, title, description, lat, lng, priority, photoId }) {
    const t = {
      id: uid(), propertyId, createdBy,
      title: title || "Task", description: description || "",
      lat: lat ?? null, lng: lng ?? null,
      priority: priority || "normal",
      status: "open",           // open | doing | done
      photoId: photoId || null,
      completionPhotoId: null,
      createdAt: new Date().toISOString(),
      completedAt: null, completedBy: null,
      comments: [],
    };
    this.db.tasks.push(t);
    this.save();
    return t;
  },

  task(id) { return this.db.tasks.find((t) => t.id === id) || null; },

  tasksFor(propertyId) { return this.db.tasks.filter((t) => t.propertyId === propertyId); },

  tasksForUser(user) {
    const props = this.propertiesFor(user);
    const ids = new Set(props.map((p) => p.id));
    return this.db.tasks.filter((t) => ids.has(t.propertyId));
  },

  updateTask(id, patch) {
    const t = this.task(id);
    if (!t) return null;
    Object.assign(t, patch);
    if (patch.status === "done" && !t.completedAt) {
      t.completedAt = new Date().toISOString();
    }
    if (patch.status && patch.status !== "done") { t.completedAt = null; }
    this.save();
    return t;
  },

  addComment(taskId, userId, text) {
    const t = this.task(taskId);
    if (!t) return null;
    t.comments.push({ id: uid(), userId, text, at: new Date().toISOString() });
    this.save();
    return t;
  },

  deleteTask(id) {
    this.db.tasks = this.db.tasks.filter((t) => t.id !== id);
    this.save();
  },

  /* --------------------------------------------------------------- photos */
  addPhoto({ propertyId, taskId, uploaderId, dataUrl, caption, lat, lng, kind }) {
    const ph = {
      id: uid(), propertyId, taskId: taskId || null, uploaderId,
      dataUrl, caption: caption || "", lat: lat ?? null, lng: lng ?? null,
      kind: kind || "issue",   // issue | completion
      at: new Date().toISOString(),
    };
    this.db.photos.push(ph);
    this.save();
    return ph;
  },

  photo(id) { return this.db.photos.find((p) => p.id === id) || null; },
  photosFor(propertyId) { return this.db.photos.filter((p) => p.propertyId === propertyId); },
  photosForTask(taskId) { return this.db.photos.filter((p) => p.taskId === taskId); },

  deletePhoto(id) {
    this.db.photos = this.db.photos.filter((p) => p.id !== id);
    this.save();
  },

  /* ---------------------------------------------------------------- stats */
  statsFor(user) {
    const tasks = this.tasksForUser(user);
    return {
      properties: this.propertiesFor(user).length,
      open: tasks.filter((t) => t.status === "open").length,
      doing: tasks.filter((t) => t.status === "doing").length,
      done: tasks.filter((t) => t.status === "done").length,
      photos: this.db.photos.filter((p) =>
        this.propertiesFor(user).some((pr) => pr.id === p.propertyId)).length,
    };
  },

  /* ----------------------------------------------------------- demo seeds */
  async seedDemo() {
    // Idempotent: create the demo accounts once, even if other users exist.
    const hasOwner = this.db.users.some((u) => u.email === "owner@demo.com");
    if (hasOwner) {
      const existing = this.db.users.find((u) => u.email === "owner@demo.com");
      return this.publicUser(existing);
    }
    const owner = await this.signup({
      name: "Maria Alvarez", email: "owner@demo.com", password: "demo123",
      role: "owner", language: "en",
    });
    const worker = await this.signup({
      name: "Diego Ramirez", email: "worker@demo.com", password: "demo123",
      role: "worker", language: "es",
    });
    const p1 = this.addProperty({
      ownerId: owner.id, name: "Casa Alvarez", address: "Solvang, CA",
      lat: 34.5958, lng: -120.1376, notes: "Front and back garden, drip irrigation.",
    });
    const p2 = this.addProperty({
      ownerId: owner.id, name: "Vineyard Cottage", address: "Ballard, CA",
      lat: 34.6181, lng: -120.1214, notes: "Olive trees need trimming.",
    });
    this.assignWorker(p1.id, worker.id);
    this.assignWorker(p2.id, worker.id);
    this.addTask({
      propertyId: p1.id, createdBy: owner.id, title: "Replace the front fence",
      description: "The left gate post is rotting. I want a darker wood this time, not the same colour.",
      priority: "high", lat: 34.5958, lng: -120.1376,
    });
    this.addTask({
      propertyId: p1.id, createdBy: owner.id, title: "Trim the hedge lower",
      description: "Cut it about 30cm lower than last time so it doesn't block the window.",
      priority: "normal", lat: 34.5959, lng: -120.1377,
    });
    this.addTask({
      propertyId: p2.id, createdBy: owner.id, title: "Fix the drip line by the olive trees",
      description: "The far line is blocked — water pools near the trunk.",
      priority: "high", lat: 34.6181, lng: -120.1214,
    });
    this.addTask({
      propertyId: p2.id, createdBy: owner.id, title: "Re-seed the back lawn",
      description: "Patchy near the path.", priority: "low",
      lat: 34.6180, lng: -120.1215,
    });
    this.updateTask(this.db.tasks[3].id, { status: "done", completedBy: worker.id });
    this.save();
    return this.publicUser(owner);
  },
};
