/* Verde — app shell: auth, navigation, views, map, photo capture. */
"use strict";
import { Store } from "./store.js";
import { LANGS, t, setLang, getLang, applyStaticI18n, translateAll, translateText } from "./i18n.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let ME = null;          // current user
let view = "dashboard";
let activeProperty = null;
let map = null, markers = [], pinLayer = null;
let pendingPin = null;
let pendingPhoto = null;

/* ------------------------------------------------------------- boot */
function boot() {
  Store.load();
  const sid = Store.session();
  if (sid) {
    ME = Store.user(sid);
    if (ME) { setLang(ME.language); return showApp(); }
  }
  showAuth();
}

function showAuth() {
  $("#app").hidden = true;
  $("#auth").hidden = false;
  renderLangPicker($("#authLang"), "en");
  renderLangPicker($("#signupLang"), "en");
  applyStaticI18n($("#auth"));
}

function showApp() {
  $("#auth").hidden = true;
  $("#app").hidden = false;
  applyStaticI18n($("#app"));
  renderLangPicker($("#userLang"), ME.language);
  $("#whoName").textContent = ME.name;
  $("#whoRole").textContent = ME.role === "owner" ? t("owner") : t("worker");
  $("#avatar").textContent = ME.name.trim().charAt(0).toUpperCase();
  go("dashboard");
}

/* --------------------------------------------------- language picker */
function renderLangPicker(sel, selected) {
  if (!sel) return;
  sel.innerHTML = "";
  LANGS.forEach((l) => {
    const o = document.createElement("option");
    o.value = l.code;
    o.textContent = l.code === "en" ? l.name : `${l.name} (${l.code})`;
    if (l.code === selected) o.selected = true;
    sel.appendChild(o);
  });
}

/* --------------------------------------------------------------- auth */
function authError(msgKey) {
  const el = $("#authError");
  el.textContent = t(msgKey);
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 4000);
}

async function doSignup(e) {
  e.preventDefault();
  const f = e.target;
  try {
    const u = await Store.signup({
      name: f.name.value, email: f.email.value, password: f.password.value,
      role: f.role.value, language: f.language.value,
    });
    Store.setSession(u.id);
    ME = u;
    setLang(u.language);
    showApp();
  } catch (err) {
    authError(err.message || "missing_fields");
  }
}

async function doLogin(e) {
  e.preventDefault();
  const f = e.target;
  try {
    const u = await Store.login(f.email.value, f.password.value);
    Store.setSession(u.id);
    ME = u;
    setLang(u.language);
    showApp();
  } catch (err) {
    authError(err.message || "no_account");
  }
}

function logout() {
  Store.setSession(null);
  ME = null;
  if (map) { map.remove(); map = null; }
  showAuth();
}

/* -------------------------------------------------------- navigation */
function go(v) {
  view = v;
  $$(".navbtn").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  $$(".view").forEach((s) => { s.hidden = s.dataset.view !== v; });
  render();
}

function render() {
  if (!ME) return;
  renderStats();
  if (view === "dashboard") renderDashboard();
  if (view === "properties") renderProperties();
  if (view === "tasks") renderTasks();
  if (view === "map") renderMapView();
  if (view === "photos") renderPhotos();
  if (view === "settings") renderSettings();
  applyStaticI18n($("#app"));
  autoTranslateContent();   // translate user-generated content into the active language
}

function renderStats() {
  const s = Store.statsFor(ME);
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set("#stProps", s.properties);
  set("#stOpen", s.open);
  set("#stDone", s.done);
  set("#stPhotos", s.photos);
}

/* -------------------------------------------------------- dashboard */
function renderDashboard() {
  const wrap = $("#dashBody");
  wrap.innerHTML = "";
  const props = Store.propertiesFor(ME);
  const tasks = Store.tasksForUser(ME);

  const h = document.createElement("div");
  h.className = "row-between";
  h.innerHTML = `<h2>${escapeHtml(t("welcome"))}, ${escapeHtml(ME.name.split(" ")[0])}</h2>`;
  wrap.appendChild(h);

  if (!props.length) {
    wrap.appendChild(emptyState(t("no_properties"), ME.role === "owner" ? t("add_property") : null,
      ME.role === "owner" ? () => openPropertyModal() : null));
    return;
  }

  const urgent = tasks.filter((x) => x.status !== "done" && x.priority === "high");
  if (urgent.length) {
    const sec = section(t("high"));
    urgent.slice(0, 4).forEach((x) => sec.appendChild(taskCard(x, true)));
    wrap.appendChild(sec);
  }

  const open = tasks.filter((x) => x.status === "open");
  if (open.length) {
    const sec = section(t("open_tasks"));
    open.slice(0, 6).forEach((x) => sec.appendChild(taskCard(x)));
    wrap.appendChild(sec);
  }

  const doing = tasks.filter((x) => x.status === "doing");
  if (doing.length) {
    const sec = section(t("in_progress"));
    doing.slice(0, 6).forEach((x) => sec.appendChild(taskCard(x)));
    wrap.appendChild(sec);
  }

  if (!tasks.length) wrap.appendChild(emptyState(t("no_tasks")));
}

function section(title, action) {
  const s = document.createElement("section");
  s.className = "block";
  const hd = document.createElement("div");
  hd.className = "row-between";
  hd.innerHTML = `<h3>${escapeHtml(title)}</h3>`;
  if (action) hd.appendChild(action);
  s.appendChild(hd);
  return s;
}

function emptyState(text, btnLabel, onClick) {
  const d = document.createElement("div");
  d.className = "empty";
  d.innerHTML = `<p>${escapeHtml(text)}</p>`;
  if (btnLabel && onClick) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = btnLabel;
    b.onclick = onClick;
    d.appendChild(b);
  }
  return d;
}

/* ------------------------------------------------------- properties */
function renderProperties() {
  const wrap = $("#propsBody");
  wrap.innerHTML = "";
  const props = Store.propertiesFor(ME);

  const hd = document.createElement("div");
  hd.className = "row-between";
  hd.innerHTML = `<h2>${t("properties")}</h2>`;
  if (ME.role === "owner") {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = "+ " + t("add_property");
    b.onclick = () => openPropertyModal();
    hd.appendChild(b);
  }
  wrap.appendChild(hd);

  if (!props.length) {
    wrap.appendChild(emptyState(t("no_properties")));
    return;
  }

  const grid = document.createElement("div");
  grid.className = "grid";
  props.forEach((p) => {
    const tasks = Store.tasksFor(p.id);
    const done = tasks.filter((x) => x.status === "done").length;
    const card = document.createElement("article");
    card.className = "card prop-card";
    card.innerHTML = `
      <h3>${escapeHtml(p.name)}</h3>
      <p class="muted">${escapeHtml(p.address || "—")}</p>
      <div class="mini-stats">
        <span><b>${tasks.length}</b> ${t("tasks")}</span>
        <span><b>${done}</b> ${t("done")}</span>
        <span><b>${p.workers.length}</b> ${t("assigned_to")}</span>
      </div>
      <div class="card-actions"></div>`;
    const actions = card.querySelector(".card-actions");
    const open = document.createElement("button");
    open.className = "btn ghost sm";
    open.textContent = t("tasks");
    open.onclick = () => { activeProperty = p.id; go("tasks"); };
    actions.appendChild(open);
    if (ME.role === "owner") {
      const asg = document.createElement("button");
      asg.className = "btn ghost sm";
      asg.textContent = t("assign_worker");
      asg.onclick = () => openAssignModal(p.id);
      actions.appendChild(asg);
    }
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
}

/* -------------------------------------------------------------- tasks */
function renderTasks() {
  const wrap = $("#tasksBody");
  wrap.innerHTML = "";
  const props = Store.propertiesFor(ME);

  const hd = document.createElement("div");
  hd.className = "row-between";
  hd.innerHTML = `<h2>${t("tasks")}</h2>`;
  if (ME.role === "owner" && props.length) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = "+ " + t("add_task");
    b.onclick = () => openTaskModal();
    hd.appendChild(b);
  }
  wrap.appendChild(hd);

  if (!props.length) { wrap.appendChild(emptyState(t("no_properties"))); return; }

  const filter = document.createElement("div");
  filter.className = "filters";
  ["all", "open", "doing", "done"].forEach((k, i) => {
    const b = document.createElement("button");
    b.className = "chip" + (i === 0 ? " on" : "");
    b.textContent = k === "all" ? t("all") : t(k);
    b.onclick = () => {
      $$(".chip", filter).forEach((c) => c.classList.remove("on"));
      b.classList.add("on");
      drawTaskList(wrap, k);
    };
    filter.appendChild(b);
  });
  wrap.appendChild(filter);

  const list = document.createElement("div");
  list.id = "taskList";
  wrap.appendChild(list);
  drawTaskList(wrap, "all");
}

function drawTaskList(root, filter) {
  const list = $("#taskList", root);
  if (!list) return;
  list.innerHTML = "";
  const props = Store.propertiesFor(ME);
  const byId = Object.fromEntries(props.map((p) => [p.id, p]));
  let tasks = Store.tasksForUser(ME);
  if (activeProperty) tasks = tasks.filter((x) => x.propertyId === activeProperty);
  if (filter !== "all") tasks = tasks.filter((x) => x.status === filter);
  tasks.sort((a, b) => {
    const pr = { high: 0, normal: 1, low: 2 };
    return (pr[a.priority] - pr[b.priority]) || (a.status === "done") - (b.status === "done");
  });

  if (!tasks.length) { list.appendChild(emptyState(t("no_tasks"))); return; }
  tasks.forEach((x) => list.appendChild(taskCard(x, false, byId[x.propertyId])));
}

function taskCard(task, compact = false, property = null) {
  const prop = property || Store.property(task.propertyId);
  const card = document.createElement("article");
  card.className = "card task-card pri-" + task.priority + " st-" + task.status;
  const photo = task.photoId ? Store.photo(task.photoId) : null;
  const comp = task.completionPhotoId ? Store.photo(task.completionPhotoId) : null;

  const head = document.createElement("div");
  head.className = "task-head";
  head.innerHTML = `
    <div>
      <h4>${escapeHtml(task.title)}</h4>
      <span class="muted sm">${escapeHtml(prop ? prop.name : "")} · ${escapeHtml(relTime(task.createdAt))}</span>
    </div>
    <span class="pill ${task.status}">${t(task.status)}</span>`;
  card.appendChild(head);

  if (!compact && task.description) {
    const p = document.createElement("p");
    p.className = "desc";
    p.textContent = task.description;
    p.dataset.autoTranslate = "1";
    card.appendChild(p);
  }

  const imgs = document.createElement("div");
  imgs.className = "task-imgs";
  if (photo) imgs.appendChild(photoThumb(photo, "issue"));
  if (comp) imgs.appendChild(photoThumb(comp, "completion"));
  if (imgs.children.length) card.appendChild(imgs);

  const acts = document.createElement("div");
  acts.className = "card-actions";
  if (task.status !== "done") {
    const done = document.createElement("button");
    done.className = "btn sm";
    done.textContent = t("mark_done");
    done.onclick = () => completeTask(task);
    acts.appendChild(done);
  } else {
    const re = document.createElement("button");
    re.className = "btn ghost sm";
    re.textContent = t("reopen");
    re.onclick = () => { Store.updateTask(task.id, { status: "open" }); render(); };
    acts.appendChild(re);
  }
  const mapBtn = document.createElement("button");
  mapBtn.className = "btn ghost sm";
  mapBtn.textContent = t("map");
  mapBtn.onclick = () => { activeProperty = task.propertyId; go("map"); focusTask(task); };
  acts.appendChild(mapBtn);

  if (ME.role === "owner") {
    const del = document.createElement("button");
    del.className = "btn ghost sm danger";
    del.textContent = t("delete");
    del.onclick = () => {
      if (confirm(t("delete_confirm"))) { Store.deleteTask(task.id); render(); }
    };
    acts.appendChild(del);
  }
  card.appendChild(acts);
  return card;
}

function photoThumb(photo, kind) {
  const w = document.createElement("div");
  w.className = "thumb " + kind;
  const img = document.createElement("img");
  img.src = photo.dataUrl;
  img.alt = photo.caption || kind;
  img.loading = "lazy";
  w.appendChild(img);
  w.onclick = () => openPhoto(photo);
  return w;
}

/* complete a task and capture proof */
function completeTask(task) {
  const modal = $("#photoModal");
  pendingPhoto = null;
  openModal(modal);
  $("#photoTitle").textContent = t("mark_done") + " — " + task.title;
  $("#photoFile").value = "";
  $("#photoPreview").hidden = true;
  $("#photoCaption").value = "";
  $("#photoSave").onclick = () => {
    let photoId = null;
    if (pendingPhoto) {
      const ph = Store.addPhoto({
        propertyId: task.propertyId, taskId: task.id, uploaderId: ME.id,
        dataUrl: pendingPhoto, caption: $("#photoCaption").value, kind: "completion",
        lat: task.lat, lng: task.lng,
      });
      photoId = ph.id;
    }
    Store.updateTask(task.id, {
      status: "done", completedBy: ME.id, completionPhotoId: photoId,
    });
    closeModal(modal);
    render();
  };
}

/* ---------------------------------------------------------------- map */
function renderMapView() {
  const el = $("#mapCanvas");
  if (!el) return;
  if (!map) {
    map = L.map(el, { zoomControl: true }).setView([34.5958, -120.1376], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.on("click", (e) => {
      pendingPin = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (pinLayer) map.removeLayer(pinLayer);
      pinLayer = L.circleMarker([pendingPin.lat, pendingPin.lng],
        { radius: 9, color: "#34d399", fillColor: "#34d399", fillOpacity: .8 }).addTo(map);
      const hint = $("#pinHint");
      if (hint) { hint.textContent = `${pendingPin.lat.toFixed(5)}, ${pendingPin.lng.toFixed(5)}`; hint.hidden = false; }
    });
  }
  setTimeout(() => map.invalidateSize(), 60);
  drawMarkers();

  const props = Store.propertiesFor(ME);
  const sel = $("#mapProp");
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = `<option value="">${t("all")}</option>`;
    props.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id; o.textContent = p.name;
      if (p.id === activeProperty) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = () => { activeProperty = sel.value || null; drawMarkers(); };
  }
}

function drawMarkers() {
  if (!map) return;
  markers.forEach((m) => map.removeLayer(m));
  markers = [];
  const props = Store.propertiesFor(ME).filter((p) => !activeProperty || p.id === activeProperty);
  const bounds = [];
  props.forEach((p) => {
    if (p.lat != null && p.lng != null) {
      const m = L.marker([p.lat, p.lng]).addTo(map)
        .bindPopup(`<b>${escapeHtml(p.name)}</b><br>${escapeHtml(p.address || "")}`);
      markers.push(m); bounds.push([p.lat, p.lng]);
    }
    Store.tasksFor(p.id).forEach((tk) => {
      if (tk.lat == null || tk.lng == null) return;
      const col = tk.status === "done" ? "#6b7280" : tk.priority === "high" ? "#ff6b8a" : "#ffd479";
      const m = L.circleMarker([tk.lat, tk.lng],
        { radius: 8, color: col, fillColor: col, fillOpacity: .85 }).addTo(map)
        .bindPopup(`<b>${escapeHtml(tk.title)}</b><br>${t(tk.status)} — ${t(tk.priority)}`);
      markers.push(m); bounds.push([tk.lat, tk.lng]);
    });
    Store.photosFor(p.id).forEach((ph) => {
      if (ph.lat == null || ph.lng == null) return;
      const m = L.circleMarker([ph.lat, ph.lng],
        { radius: 6, color: "#6ee7ff", fillColor: "#6ee7ff", fillOpacity: .9 }).addTo(map)
        .bindPopup(`<img src="${ph.dataUrl}" style="width:180px;border-radius:6px">`);
      markers.push(m); bounds.push([ph.lat, ph.lng]);
    });
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
}

function focusTask(task) {
  if (!map || task.lat == null) return;
  map.setView([task.lat, task.lng], 17);
}

/* ------------------------------------------------------------- photos */
function renderPhotos() {
  const wrap = $("#photosBody");
  wrap.innerHTML = "";
  const hd = document.createElement("div");
  hd.className = "row-between";
  hd.innerHTML = `<h2>${t("photos")}</h2>`;
  wrap.appendChild(hd);

  const props = Store.propertiesFor(ME);
  const all = props.flatMap((p) => Store.photosFor(p.id));
  if (!all.length) { wrap.appendChild(emptyState(t("no_tasks"))); return; }
  const grid = document.createElement("div");
  grid.className = "photo-grid";
  all.sort((a, b) => b.at.localeCompare(a.at)).forEach((ph) => {
    const d = document.createElement("div");
    d.className = "photo-cell";
    d.innerHTML = `<img src="${ph.dataUrl}" alt="" loading="lazy">
      <span class="photo-cap">${escapeHtml(ph.caption || "")}</span>`;
    d.onclick = () => openPhoto(ph);
    grid.appendChild(d);
  });
  wrap.appendChild(grid);
}

function openPhoto(ph) {
  const m = $("#lightbox");
  $("#lightboxImg").src = ph.dataUrl;
  $("#lightboxCap").textContent = ph.caption || "";
  const prop = Store.property(ph.propertyId);
  $("#lightboxMeta").textContent = (prop ? prop.name + " · " : "") + relTime(ph.at);
  openModal(m);
}

/* ----------------------------------------------------------- settings */
function renderSettings() {
  const wrap = $("#settingsBody");
  wrap.innerHTML = "";
  wrap.appendChild(Object.assign(document.createElement("h2"), { textContent: t("settings") }));

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3>${t("profile")}</h3>
    <p class="muted">${escapeHtml(ME.name)} · ${escapeHtml(ME.email)}</p>
    <label class="field"><span>${t("language")}</span>
      <select id="settingsLang"></select></label>
    <div class="card-actions">
      <button class="btn sm" id="saveLang">${t("save")}</button>
      <button class="btn ghost sm danger" id="resetAll">${t("delete")} (all data)</button>
    </div>`;
  wrap.appendChild(card);
  renderLangPicker($("#settingsLang"), ME.language);
  $("#saveLang").onclick = () => {
    const lang = $("#settingsLang").value;
    Store.setLanguage(ME.id, lang);
    ME = Store.user(ME.id);
    setLang(lang);
    render();
  };
  $("#resetAll").onclick = () => {
    if (confirm(t("delete_confirm"))) { Store.reset(); logout(); boot(); }
  };
}

/* -------------------------------------------------------------- modals */
function openModal(m) { m.hidden = false; document.body.classList.add("modal-open"); }
function closeModal(m) { m.hidden = true; document.body.classList.remove("modal-open"); }

function openPropertyModal() {
  const m = $("#propModal");
  $("#propForm").reset();
  $("#propCoords").textContent = "—";
  $("#propCoords").dataset.lat = ""; $("#propCoords").dataset.lng = "";
  $("#propUseLocation").onclick = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      $("#propCoords").dataset.lat = pos.coords.latitude;
      $("#propCoords").dataset.lng = pos.coords.longitude;
      $("#propCoords").textContent =
        `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
    }, () => { $("#propCoords").textContent = "denied"; });
  };
  $("#propForm").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const lat = parseFloat($("#propCoords").dataset.lat);
    const lng = parseFloat($("#propCoords").dataset.lng);
    Store.addProperty({
      ownerId: ME.id, name: f.name.value, address: f.address.value,
      notes: f.notes.value,
      lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng,
    });
    closeModal(m);
    render();
  };
  openModal(m);
}

function openTaskModal() {
  const props = Store.propertiesFor(ME);
  if (!props.length) return;
  const m = $("#taskModal");
  const sel = $("#taskProp");
  sel.innerHTML = "";
  props.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.id; o.textContent = p.name;
    if (p.id === activeProperty) o.selected = true;
    sel.appendChild(o);
  });
  $("#taskForm").reset();
  pendingPhoto = null;
  pendingPin = null;
  $("#taskPhotoPreview").hidden = true;
  $("#taskPinCoords").textContent = "—";
  $("#taskUseLocation").onclick = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      pendingPin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      $("#taskPinCoords").textContent =
        `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
    }, () => { $("#taskPinCoords").textContent = "denied"; });
  };
  $("#taskForm").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    let photoId = null;
    if (pendingPhoto) {
      const ph = Store.addPhoto({
        propertyId: sel.value, uploaderId: ME.id, dataUrl: pendingPhoto,
        caption: f.title.value, kind: "issue",
        lat: pendingPin ? pendingPin.lat : null, lng: pendingPin ? pendingPin.lng : null,
      });
      photoId = ph.id;
    }
    Store.addTask({
      propertyId: sel.value, createdBy: ME.id,
      title: f.title.value, description: f.description.value,
      priority: f.priority.value, photoId,
      lat: pendingPin ? pendingPin.lat : null, lng: pendingPin ? pendingPin.lng : null,
    });
    closeModal(m);
    render();
  };
  openModal(m);
}

function openAssignModal(propId) {
  const m = $("#assignModal");
  const list = $("#assignList");
  list.innerHTML = "";
  const prop = Store.property(propId);
  const workers = Store.workers();
  if (!workers.length) {
    list.innerHTML = `<p class="muted">No worker accounts yet.</p>`;
  }
  workers.forEach((w) => {
    const row = document.createElement("label");
    row.className = "assign-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = prop.workers.includes(w.id);
    cb.onchange = () => {
      if (cb.checked) Store.assignWorker(propId, w.id);
      else Store.unassignWorker(propId, w.id);
      render();
    };
    row.appendChild(cb);
    const sp = document.createElement("span");
    sp.textContent = `${w.name} · ${w.email}`;
    row.appendChild(sp);
    list.appendChild(row);
  });
  openModal(m);
}

/* ---------------------------------------------------------- photo I/O */
function wirePhotoInput(inputSel, previewSel, onReady) {
  const input = $(inputSel);
  const preview = $(previewSel);
  if (!input) return;
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;
    compressImage(file, 1280, 0.72).then((dataUrl) => {
      onReady(dataUrl);
      if (preview) {
        const img = preview.querySelector("img") || document.createElement("img");
        img.src = dataUrl;
        if (!img.parentNode) preview.appendChild(img);
        preview.hidden = false;
      }
    });
  };
}

/** Downscale + JPEG-compress so photos fit comfortably in localStorage. */
function compressImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        w = Math.round(w * scale); h = Math.round(h * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* --------------------------------------------------------- translation */
/* Auto-translate user-generated content (task descriptions, captions). */
async function autoTranslateContent() {
  try {
    if (getLang() === "en") return;
    const nodes = $$("[data-auto-translate]");
    if (!nodes.length) return;
    const texts = nodes.map((n) => n.textContent);
    const out = await translateAll(texts, getLang());
    nodes.forEach((n, i) => {
      if (!n.dataset.orig) n.dataset.orig = texts[i];
      n.textContent = out[i];
      n.classList.add("translated");
    });
  } catch (e) {
    console.warn("auto-translate failed", e);
  }
}

/* ------------------------------------------------------------ helpers */
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
function relTime(iso) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m";
  if (d < 86400) return Math.floor(d / 3600) + "h";
  if (d < 604800) return Math.floor(d / 86400) + "d";
  return new Date(iso).toLocaleDateString();
}

/* --------------------------------------------------------------- wire */
function wire() {
  $("#loginForm").onsubmit = doLogin;
  $("#signupForm").onsubmit = doSignup;
  $("#logoutBtn").onclick = logout;
  $("#toSignup").onclick = () => { $("#loginForm").hidden = true; $("#signupForm").hidden = false; applyStaticI18n($("#auth")); };
  $("#toLogin").onclick = () => { $("#signupForm").hidden = true; $("#loginForm").hidden = false; applyStaticI18n($("#auth")); };
  $("#demoBtn").onclick = async () => {
    const u = await Store.seedDemo();
    Store.setSession(u.id);
    ME = Store.user(u.id);
    setLang(ME.language);
    showApp();
  };
  $("#authLang").onchange = (e) => { setLang(e.target.value); applyStaticI18n($("#auth")); };
  $$(".navbtn").forEach((b) => b.onclick = () => go(b.dataset.view));
  $$("[data-close-modal]").forEach((b) => b.onclick = () => closeModal(b.closest(".modal")));
  // language switch from the header
  const ul = $("#userLang");
  if (ul) ul.onchange = () => {
    const lang = ul.value;
    Store.setLanguage(ME.id, lang);
    ME = Store.user(ME.id);
    setLang(lang);
    render();
  };
  wirePhotoInput("#taskPhoto", "#taskPhotoPreview", (d) => { pendingPhoto = d; });
  wirePhotoInput("#photoFile", "#photoPreview", (d) => { pendingPhoto = d; });
  $("#useMyLoc").onclick = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      if (map) map.setView([pos.coords.latitude, pos.coords.longitude], 16);
    }, () => {});
  };
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") $$(".modal").forEach((m) => { if (!m.hidden) closeModal(m); });
  });
}

/* Auto-translate is invoked from render() directly. */

document.addEventListener("DOMContentLoaded", () => { wire(); boot(); });
