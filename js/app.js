/* Habitat — application shell, routing, auth and views. */
"use strict";
import { Store, GROUP_COLORS } from "./store.js";
import {
  LANGS, t, setLang, getLang, applyStaticI18n, translateAll,
} from "./i18n.js";
import {
  $, $$, el, esc, btn, field, input, select, textarea, empty, sectionHeader,
  openModal, closeModal, closeTopModal, modal, toast, paginate, debounce,
  relTime, dateLabel, dueLabel, initial, avatarColour, compressImage, copyText,
} from "./ui.js";
import { renderPropertyInfo, buildPropertyDetail, initPropertyInfo } from "./property-info.js";
import { createScanner } from "./scanner.js";
import {
  initWorkerMode, addWorkerModeToggle, addQuickPhrasesButton,
  addReadAloudButton, translateWithTrade, postProcessTradeTranslation,
  PHRASE_TRADES,
} from "./worker-comms.js";
import { TRADES, tradeById, tradeColor, tradeName, tradeIcon, translateTaskForTrade } from "./trades.js";
import { initMobile, vibrate } from "./mobile.js";

/* ---------------------------------------------------------------- state */
let ME = null;
let view = "dashboard";
let subtab = null;
let activeProperty = null;
let query = "";
let taskFilter = "all";
let taskTradeFilter = "all";
let taskSort = "priority";
let map = null, markers = [], pinLayer = null;
let pendingPin = null;
let pendingPhoto = null;
let page = { tasks: 1 };
let editingTaskId = null;
let scanner = null;

const PAGE_SIZE = 12;

/* ---------------------------------------------------------------- boot */
function boot() {
  Store.load();
  initWorkerMode();
  initPropertyInfo(render, () => ME);
  const sid = Store.session();
  if (sid) {
    const u = Store.user(sid);
    if (u && u.active) {
      ME = u;
      setLang(ME.language);
      return showApp();
    }
    Store.setSession(null);
  }
  showAuth();
}

function showAuth() {
  $("#app").hidden = true;
  $("#auth").hidden = false;
  $("#authPanel").hidden = false;
  $("#loginForm").hidden = false;
  $("#signupForm").hidden = true;
  $("#resetForm").hidden = true;
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
  $("#whoRole").textContent = t(ME.role === "owner" ? "role_owner" : "role_worker");
  const av = $("#avatar");
  av.textContent = initial(ME.name);
  av.style.background = avatarColour(ME.id);
  // Add worker mode toggle to header
  const topRight = $(".top-right");
  if (topRight && !topRight.querySelector(".worker-mode-toggle")) {
    addWorkerModeToggle(topRight);
  }
  buildNav();
  go("dashboard");
}

/* ------------------------------------------------------------- nav tabs */
const MAIN_TABS = ["dashboard", "tasks", "map", "people", "settings"];
const SUBTABS = {
  dashboard: ["properties", "activity"],
  people: ["crews"],
  map: ["photos", "scan"],
};

function buildNav() {
  const nav = $("#tabs");
  nav.innerHTML = "";
  MAIN_TABS.forEach((v) => {
    const b = btn(t(v), "navbtn", () => go(v));
    b.dataset.view = v;
    b.setAttribute("data-i18n", v);
    nav.appendChild(b);
    const subs = SUBTABS[v];
    if (subs) {
      const wrap = el("div", "subtab-group");
      wrap.dataset.parent = v;
      subs.forEach((sv) => {
        const sb = btn(t(sv), "subtab", () => { subtab = sv; go(v); });
        sb.dataset.subtab = sv;
        wrap.appendChild(sb);
      });
      nav.appendChild(wrap);
    }
  });
}

function go(v) {
  view = v;
  if (!SUBTABS[v]) subtab = null;
  $$(".navbtn").forEach((b) => {
    const on = b.dataset.view === v;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  $$(".subtab").forEach((b) => {
    const on = b.dataset.subtab === subtab;
    b.classList.toggle("active", on);
  });
  $$(".view").forEach((s) => { s.hidden = s.dataset.view !== v; });
  render();
}

/* -------------------------------------------------------------- render */
function render() {
  if (!ME) return;
  renderStats();
  if (view === "dashboard") {
    $("#dashMain").hidden = !!subtab;
    $("#propsBody").hidden = subtab !== "properties";
    $("#activityBody").hidden = subtab !== "activity";
    if (subtab === "properties") renderProperties();
    else if (subtab === "activity") renderActivity();
    else renderDashboard();
  }
  else if (view === "tasks") renderTasks();
  else if (view === "map") {
    $("#mapMain").hidden = !!subtab;
    $("#photosBody").hidden = subtab !== "photos";
    $("#scanBody").hidden = subtab !== "scan";
    if (subtab === "photos") renderPhotos();
    else if (subtab === "scan") renderScanner();
    else renderMapView();
  }
  else if (view === "people") {
    $("#peopleBody").hidden = !!subtab;
    $("#crewsBody").hidden = subtab !== "crews";
    if (subtab === "crews") renderCrews();
    else renderPeople();
  }
  else if (view === "settings") renderSettings();
  applyStaticI18n($("#app"));
  autoTranslateContent();
}

function renderStats() {
  const s = Store.statsFor(ME);
  const set = (id, val) => { const n = $(id); if (n) n.textContent = val; };
  set("#stProps", s.properties);
  set("#stOpen", s.open);
  set("#stDone", s.done);
  set("#stPhotos", s.photos);
  const od = $("#stOverdue");
  if (od) {
    od.textContent = s.overdue;
    od.closest(".stat").classList.toggle("alert", s.overdue > 0);
  }
  const bar = $("#progressBar");
  if (bar) bar.style.width = s.completion + "%";
  const pl = $("#progressLabel");
  if (pl) pl.textContent = s.completion + "%";
}

/* --------------------------------------------------------- task helpers */
function taskCard(task, opts = {}) {
  const prop = Store.property(task.propertyId);
  const card = el("article", `card task-card pri-${task.priority} st-${task.status}`);
  card.dataset.taskId = task.id;

  const head = el("div", "task-head");
  const left = el("div", "task-head-left");
  const title = el("h4", null, task.title);
  left.appendChild(title);
  const sub = el("span", "muted sm");
  const bits = [prop ? prop.name : ""];
  if (task.assigneeId) {
    const a = Store.user(task.assigneeId);
    if (a) bits.push("→ " + a.name);
  }
  bits.push(relTime(task.createdAt));
  sub.textContent = bits.filter(Boolean).join(" · ");
  left.appendChild(sub);
  head.appendChild(left);
  head.appendChild(el("span", `pill ${task.status}`, t(task.status)));
  card.appendChild(head);

  const meta = el("div", "task-meta");
  if (task.dueDate) {
    const d = dueLabel(task.dueDate);
    if (d) {
      const chip = el("span", "due-chip " + d.kind, d.text);
      meta.appendChild(chip);
    }
  }
  if (task.trade) {
    const tb = el("span", "trade-badge");
    const tr = tradeById(task.trade);
    if (tr) {
      tb.style.background = tr.color + "22";
      tb.style.color = tr.color;
      tb.style.borderColor = tr.color + "55";
      tb.textContent = `${tr.icon} ${tr.name}`;
    } else {
      tb.textContent = task.trade;
    }
    meta.appendChild(tb);
  }
  if (task.comments && task.comments.length) {
    meta.appendChild(el("span", "muted sm", `💬 ${task.comments.length}`));
  }
  if (meta.children.length) card.appendChild(meta);

  if (opts.expanded && task.description) {
    const p = el("p", "desc");
    p.textContent = task.description;
    p.dataset.autoTranslate = "1";
    card.appendChild(p);
    addReadAloudButton(p, task.description);
  }

  const imgs = el("div", "task-imgs");
  const photo = task.photoId ? Store.photo(task.photoId) : null;
  const comp = task.completionPhotoId ? Store.photo(task.completionPhotoId) : null;
  if (photo) imgs.appendChild(thumb(photo, "issue"));
  if (comp) imgs.appendChild(thumb(comp, "completion"));
  if (imgs.children.length) card.appendChild(imgs);

  const acts = el("div", "card-actions");
  if (task.status === "open") {
    acts.appendChild(btn(t("start"), "btn sm ghost", () => {
      vibrate(10);
      Store.setTaskStatus(task.id, "doing", ME.id);
      render();
    }));
  }
  if (task.status !== "done") {
    acts.appendChild(btn(t("mark_done"), "btn sm", () => completeTask(task)));
  } else {
    acts.appendChild(btn(t("reopen"), "btn sm ghost", () => {
      vibrate(10);
      Store.setTaskStatus(task.id, "open", ME.id);
      render();
    }));
  }
  acts.appendChild(btn(t("map"), "btn ghost sm", () => {
    activeProperty = task.propertyId;
    go("map");
    focusTask(task);
  }));
  if (ME.role === "owner") {
    acts.appendChild(btn(t("edit"), "btn ghost sm", () => openTaskModal(task)));
    acts.appendChild(btn(t("delete"), "btn ghost sm danger", () => removeTask(task)));
  }
  card.appendChild(acts);

  if (opts.expanded) card.appendChild(commentBlock(task));
  return card;
}

function commentBlock(task) {
  const wrap = el("div", "comments");
  const h = el("h5", null, t("comments"));
  h.setAttribute("data-i18n", "comments");
  wrap.appendChild(h);

  if (!task.comments || !task.comments.length) {
    const n = el("p", "muted sm", t("no_comments"));
    n.setAttribute("data-i18n", "no_comments");
    wrap.appendChild(n);
  } else {
    task.comments.forEach((c) => {
      const u = Store.user(c.userId);
      const row = el("div", "comment");
      const av = el("span", "avatar xs", initial(u ? u.name : "?"));
      if (u) av.style.background = avatarColour(u.id);
      row.appendChild(av);
      const body = el("div", "comment-body");
      body.appendChild(el("b", null, u ? u.name : "—"));
      const txt = el("span", null, c.text);
      txt.dataset.autoTranslate = "1";
      body.appendChild(txt);
      body.appendChild(el("span", "muted xs", relTime(c.at)));
      row.appendChild(body);
      wrap.appendChild(row);
    });
  }

  const form = el("form", "comment-form");
  const inp = input("comment", { placeholder: t("add_comment") });
  inp.setAttribute("data-i18n-ph", "add_comment");
  form.appendChild(inp);
  form.appendChild(btn(t("post"), "btn sm", null, { type: "submit" }));
  addQuickPhrasesButton(form, inp);
  form.onsubmit = (e) => {
    e.preventDefault();
    if (!inp.value.trim()) return;
    Store.addComment(task.id, ME.id, inp.value);
    render();
  };
  wrap.appendChild(form);
  return wrap;
}

function thumb(photo, kind) {
  const w = el("div", "thumb " + kind);
  const img = el("img");
  img.src = photo.dataUrl;
  img.alt = photo.caption || kind;
  img.loading = "lazy";
  img.decoding = "async";
  w.appendChild(img);
  w.onclick = () => openPhoto(photo);
  return w;
}

function removeTask(task) {
  if (!confirm(t("delete_confirm"))) return;
  const removed = Store.deleteTask(task.id);
  toast(t("delete"), "info", 5000, t("undo"), () => {
    Store.restoreTask(removed);
    render();
  });
  render();
}

/* -------------------------------------------------------- complete task */
function completeTask(task) {
  vibrate(15);
  pendingPhoto = null;
  const body = el("div", "stack");
  const preview = el("div", "preview");
  preview.hidden = true;

  const file = input("photo", { type: "file" });
  file.id = "completePhoto";
  file.accept = "image/*";
  file.setAttribute("capture", "environment");
  file.onchange = () => {
    const f = file.files && file.files[0];
    if (!f) return;
    compressImage(f, 1280, 0.7).then((d) => {
      pendingPhoto = d;
      preview.innerHTML = "";
      const img = el("img");
      img.src = d;
      preview.appendChild(img);
      preview.hidden = false;
    }).catch(() => toast("Could not read that image", "bad"));
  };

  body.appendChild(field("take_photo", file));
  body.appendChild(preview);

  const cap = input("caption");
  cap.id = "completeCaption";
  body.appendChild(field("caption", cap));

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
  actions.appendChild(btn(t("mark_done"), "btn", () => {
    let photoId = null;
    if (pendingPhoto) {
      const ph = Store.addPhoto({
        propertyId: task.propertyId, taskId: task.id, uploaderId: ME.id,
        dataUrl: pendingPhoto, caption: cap.value, kind: "completion",
        lat: task.lat, lng: task.lng,
      });
      photoId = ph.id;
    }
    Store.updateTask(task.id, { completionPhotoId: photoId });
    Store.setTaskStatus(task.id, "done", ME.id);
    closeModal(m);
    toast(t("saved"), "good");
    render();
  }));
  body.appendChild(actions);

  const m = modal("mark_done", body);
  document.body.appendChild(m);
  openModal(m);
}

/* --------------------------------------------------------- dashboard */
function renderDashboard() {
  const wrap = $("#dashMain");
  wrap.innerHTML = "";
  const props = Store.propertiesFor(ME);
  const tasks = Store.tasksForUser(ME);

  const h = el("div", "row-between");
  const hh = el("h2", null, `${t("welcome")}, ${ME.name.split(" ")[0]}`);
  h.appendChild(hh);
  if (ME.role === "owner" && props.length) {
    h.appendChild(btn("+ " + t("add_task"), "btn sm", () => openTaskModal()));
  }
  wrap.appendChild(h);

  if (!props.length) {
    wrap.appendChild(empty(
      t(ME.role === "owner" ? "no_properties" : "no_properties"),
      ME.role === "owner" ? t("add_property") : null,
      ME.role === "owner" ? () => openPropertyModal() : null
    ));
    return;
  }

  const overdue = tasks.filter((x) => x.status !== "done" && x.dueDate &&
    new Date(x.dueDate) < new Date(new Date().toDateString()));
  if (overdue.length) {
    const sec = el("section", "block");
    const hd = el("div", "row-between");
    const ttl = el("h3", "danger-text", t("overdue"));
    hd.appendChild(ttl);
    sec.appendChild(hd);
    overdue.slice(0, 4).forEach((x) => sec.appendChild(taskCard(x, { expanded: true })));
    wrap.appendChild(sec);
  }

  const doing = tasks.filter((x) => x.status === "doing");
  if (doing.length) {
    const sec = el("section", "block");
    sec.appendChild(sectionHeader("in_progress"));
    doing.slice(0, 4).forEach((x) => sec.appendChild(taskCard(x, { expanded: true })));
    wrap.appendChild(sec);
  }

  const open = tasks.filter((x) => x.status === "open");
  if (open.length) {
    const sec = el("section", "block");
    const hd = el("div", "row-between");
    const ttl = el("h3", null, t("open_tasks"));
    ttl.setAttribute("data-i18n", "open_tasks");
    hd.appendChild(ttl);
    hd.appendChild(btn(t("tasks") + " →", "btn ghost sm", () => go("tasks")));
    sec.appendChild(hd);
    open.slice(0, 6).forEach((x) => sec.appendChild(taskCard(x)));
    wrap.appendChild(sec);
  }

  if (!tasks.length) wrap.appendChild(empty(t("no_tasks")));
}

/* -------------------------------------------------------- properties */
function renderProperties() {
  const wrap = $("#propsBody");
  wrap.innerHTML = "";
  const props = Store.propertiesFor(ME);

  const hd = el("div", "row-between");
  hd.appendChild(el("h2", null, t("properties")));
  if (ME.role === "owner") {
    hd.appendChild(btn("+ " + t("add_property"), "btn", () => openPropertyModal()));
  }
  wrap.appendChild(hd);

  if (!props.length) { wrap.appendChild(empty(t("no_properties"))); return; }

  const grid = el("div", "grid");
  props.forEach((p) => {
    const tasks = Store.tasksFor(p.id);
    const done = tasks.filter((x) => x.status === "done").length;
    const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    const card = el("article", "card prop-card");

    const top = el("div", "row-between");
    top.appendChild(el("h3", null, p.name));
    card.appendChild(top);
    card.appendChild(el("p", "muted sm", p.address || "—"));

    if (p.notes) card.appendChild(el("p", "muted sm notes", p.notes));

    const bar = el("div", "progress");
    const fill = el("div", "progress-fill");
    fill.style.width = pct + "%";
    bar.appendChild(fill);
    card.appendChild(bar);
    card.appendChild(el("span", "muted xs", `${pct}% ${t("completion")}`));

    // crews + direct workers
    const crewWrap = el("div", "chips");
    (p.groups || []).forEach((gid) => {
      const g = Store.group(gid);
      if (!g) return;
      const c = el("span", "chip-static crew-chip", g.name);
      c.style.borderColor = g.color;
      c.style.color = g.color;
      crewWrap.appendChild(c);
    });
    if (p.workers && p.workers.length) {
      p.workers.forEach((wid) => {
        const u = Store.user(wid);
        if (u) crewWrap.appendChild(el("span", "chip-static", u.name));
      });
    }
    if (crewWrap.children.length) card.appendChild(crewWrap);

    const stats = el("div", "mini-stats");
    stats.innerHTML = `<span><b>${tasks.length}</b> ${esc(t("tasks"))}</span>
      <span><b>${done}</b> ${esc(t("done"))}</span>`;
    card.appendChild(stats);

    const acts = el("div", "card-actions");
    acts.appendChild(btn(t("tasks"), "btn ghost sm", () => {
      activeProperty = p.id; go("tasks");
    }));
    acts.appendChild(btn(t("property_info"), "btn ghost sm", () => {
      const detail = buildPropertyDetail(p.id);
      const wrap = el("div", "property-info-view");
      wrap.appendChild(detail);
      $("#propsBody").innerHTML = "";
      $("#propsBody").appendChild(wrap);
    }));
    if (ME.role === "owner") {
      acts.appendChild(btn(t("assign_crew"), "btn ghost sm", () => openAssignModal(p.id)));
      acts.appendChild(btn(t("edit"), "btn ghost sm", () => openPropertyModal(p)));
      acts.appendChild(btn(t("delete"), "btn ghost sm danger", () => {
        if (!confirm(t("delete_confirm"))) return;
        Store.deleteProperty(p.id);
        toast(t("delete"), "info");
        render();
      }));
    }
    card.appendChild(acts);
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
}

/* -------------------------------------------------------------- tasks */
function renderTasks() {
  const wrap = $("#tasksBody");
  wrap.innerHTML = "";
  const props = Store.propertiesFor(ME);

  const hd = el("div", "row-between");
  hd.appendChild(el("h2", null, t("tasks")));
  if (ME.role === "owner" && props.length) {
    hd.appendChild(btn("+ " + t("add_task"), "btn", () => openTaskModal()));
  }
  wrap.appendChild(hd);

  if (!props.length) { wrap.appendChild(empty(t("no_properties"))); return; }

  // search + property filter + sort
  const bar = el("div", "toolbar");
  const search = input("q", { placeholder: t("search_ph") });
  search.setAttribute("data-i18n-ph", "search_ph");
  search.className = "search";
  search.value = query;
  search.oninput = debounce(() => { query = search.value; drawTaskList(wrap); }, 200);
  bar.appendChild(search);

  const propSel = select("prop", [
    { value: "", label: t("all_properties"), selected: !activeProperty },
    ...props.map((p) => ({ value: p.id, label: p.name, selected: activeProperty === p.id })),
  ]);
  propSel.onchange = () => { activeProperty = propSel.value || null; drawTaskList(wrap); };
  bar.appendChild(propSel);

  const sortSel = select("sort", [
    { value: "priority", label: t("sort_priority"), selected: taskSort === "priority" },
    { value: "newest", label: t("sort_newest"), selected: taskSort === "newest" },
    { value: "due", label: t("sort_due"), selected: taskSort === "due" },
    { value: "title", label: t("sort_title"), selected: taskSort === "title" },
  ]);
  sortSel.onchange = () => { taskSort = sortSel.value; drawTaskList(wrap); };
  bar.appendChild(sortSel);
  wrap.appendChild(bar);

  const filter = el("div", "filters");
  [["all", "all"], ["open", "open"], ["doing", "doing"], ["done", "done"]].forEach(([k, key]) => {
    const b = btn(t(key), "chip" + (taskFilter === k ? " on" : ""), () => {
      taskFilter = k;
      $$(".chip", filter).forEach((c) => c.classList.remove("on"));
      b.classList.add("on");
      drawTaskList(wrap);
    });
    filter.appendChild(b);
  });
  wrap.appendChild(filter);

  // trade filter chips
  const tradeFilter = el("div", "filters");
  const tradeChips = [{ value: "all", label: t("all"), icon: null }, ...TRADES.map((tr) => ({ value: tr.id, label: tr.name, icon: tr.icon }))];
  tradeChips.forEach((tc) => {
    const b = btn(tc.icon ? `${tc.icon} ${tc.label}` : tc.label, "chip" + (taskTradeFilter === tc.value ? " on" : ""), () => {
      taskTradeFilter = tc.value;
      $$(".chip", tradeFilter).forEach((c) => c.classList.remove("on"));
      b.classList.add("on");
      drawTaskList(wrap);
    });
    tradeFilter.appendChild(b);
  });
  wrap.appendChild(tradeFilter);

  const list = el("div", "task-list");
  list.id = "taskList";
  wrap.appendChild(list);
  drawTaskList(wrap);
}

function drawTaskList(root) {
  const list = $("#taskList", root);
  if (!list) return;

  let tasks = Store.tasksForUser(ME);
  if (activeProperty) tasks = tasks.filter((x) => x.propertyId === activeProperty);
  if (taskFilter !== "all") tasks = tasks.filter((x) => x.status === taskFilter);
  if (taskTradeFilter !== "all") tasks = tasks.filter((x) => x.trade === taskTradeFilter);

  if (query.trim()) {
    const q = query.trim().toLowerCase();
    tasks = tasks.filter((x) => {
      const p = Store.property(x.propertyId);
      const hay = [x.title, x.description, p ? p.name : ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  const pr = { high: 0, normal: 1, low: 2 };
  tasks.sort((a, b) => {
    if (taskSort === "priority") {
      return (pr[a.priority] - pr[b.priority]) ||
        ((a.status === "done") - (b.status === "done")) ||
        (b.createdAt || "").localeCompare(a.createdAt || "");
    }
    if (taskSort === "due") {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (taskSort === "title") return a.title.localeCompare(b.title);
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });

  const count = el("p", "muted sm result-count",
    `${tasks.length} ${tasks.length === 1 ? t("tasks").slice(0, -1) : t("tasks")}`);
  list.innerHTML = "";
  list.appendChild(count);

  if (!tasks.length) { list.appendChild(empty(t("no_tasks"))); return; }
  paginate(list, tasks, (task) => taskCard(task, { expanded: true }), PAGE_SIZE);
}

/* -------------------------------------------------------------- crews */
function renderCrews() {
  const wrap = $("#crewsBody");
  wrap.innerHTML = "";
  const crews = Store.groupsFor(ME.id);

  const hd = el("div", "row-between");
  hd.appendChild(el("h2", null, t("crews")));
  hd.appendChild(btn("+ " + t("new_crew"), "btn", () => openCrewModal()));
  wrap.appendChild(hd);

  if (!crews.length) { wrap.appendChild(empty(t("no_crews"))); return; }

  const grid = el("div", "grid");
  crews.forEach((g) => {
    const card = el("article", "card crew-card");
    card.style.borderLeftColor = g.color;
    const top = el("div", "row-between");
    const nm = el("h3", null, g.name);
    nm.style.color = g.color;
    top.appendChild(nm);
    top.appendChild(el("span", "pill", `${g.memberIds.length}`));
    card.appendChild(top);
    if (g.description) card.appendChild(el("p", "muted sm", g.description));

    const props = Store.propertiesFor(ME).filter((p) => (p.groups || []).includes(g.id));
    card.appendChild(el("span", "muted xs",
      `${t("crews_assigned")}: ${props.length}`));

    const mem = el("div", "chips");
    if (!g.memberIds.length) {
      mem.appendChild(el("span", "muted sm", t("add_members")));
    } else {
      g.memberIds.forEach((wid) => {
        const u = Store.user(wid);
        if (!u) return;
        const c = el("span", "chip-static person");
        const av = el("span", "avatar xs", initial(u.name));
        av.style.background = avatarColour(u.id);
        c.appendChild(av);
        c.appendChild(el("span", null, u.name));
        mem.appendChild(c);
      });
    }
    card.appendChild(mem);

    const acts = el("div", "card-actions");
    acts.appendChild(btn(t("members"), "btn ghost sm", () => openCrewMembersModal(g.id)));
    acts.appendChild(btn(t("edit"), "btn ghost sm", () => openCrewModal(g)));
    acts.appendChild(btn(t("delete"), "btn ghost sm danger", () => {
      if (!confirm(t("delete_confirm"))) return;
      Store.deleteGroup(g.id);
      toast(t("delete"), "info");
      render();
    }));
    card.appendChild(acts);
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
}

/* -------------------------------------------------------------- people */
function renderPeople() {
  const wrap = $("#peopleBody");
  wrap.innerHTML = "";

  const hd = el("div", "row-between");
  hd.appendChild(el("h2", null, t("people")));
  wrap.appendChild(hd);

  // Worker: show my location settings
  if (ME.role === "worker") {
    wrap.appendChild(renderWorkerLocationPanel());
    return;
  }

  // Owner: show nearby worker search + assigned workers
  wrap.appendChild(renderNearbyWorkerSearch());

  const workers = Store.visibleWorkersFor(ME.id);
  if (!workers.length) { wrap.appendChild(empty(t("no_crews"))); return; }

  const list = el("div", "people-list");
  workers.forEach((w) => {
    const crews = Store.groupsOf(w.id);
    const row = el("div", "person-row");
    const av = el("span", "avatar", initial(w.name));
    av.style.background = avatarColour(w.id);
    row.appendChild(av);

    const info = el("div", "person-info");
    const nm = el("b", null, w.name);
    info.appendChild(nm);
    info.appendChild(el("span", "muted sm", w.email));
    const meta = el("span", "muted xs");
    const bits = [];
    bits.push(`${t("language")}: ${(LANGS.find((l) => l.code === w.language) || {}).name || w.language}`);
    if (w.lastSeen) bits.push(`${t("last_seen")}: ${relTime(w.lastSeen)}`);
    if (w.trade) bits.push(`${t("trade")}: ${t("trade_" + w.trade)}`);
    info.appendChild(el("span", "muted xs", bits.join(" · ")));
    row.appendChild(info);

    const crewWrap = el("div", "chips");
    if (!crews.length) {
      crewWrap.appendChild(el("span", "muted xs", t("no_crews_yet")));
    } else {
      crews.forEach((g) => {
        const c = el("span", "chip-static crew-chip", g.name);
        c.style.borderColor = g.color;
        c.style.color = g.color;
        crewWrap.appendChild(c);
      });
    }
    row.appendChild(crewWrap);

    const acts = el("div", "card-actions");
    const assigned = Store.propertiesFor(w).length;
    acts.appendChild(el("span", "muted xs", `${assigned} ${t("properties")}`));
    if (!w.active) acts.appendChild(el("span", "pill", t("disabled")));
    row.appendChild(acts);
    list.appendChild(row);
  });
  wrap.appendChild(list);
}

/* Worker location settings panel */
function renderWorkerLocationPanel() {
  const card = el("div", "card");
  card.appendChild(el("h3", null, t("my_service_area")));

  const u = Store.user(ME.id);
  const locText = u.serviceLat != null
    ? `${u.serviceLat.toFixed(5)}, ${u.serviceLng.toFixed(5)}`
    : t("not_set");

  const locRow = el("div", "inline-row");
  locRow.appendChild(el("span", "coord", locText));
  const locBtn = btn(t("use_my_location"), "btn ghost sm", () => {
    if (!navigator.geolocation) return toast("Geolocation unavailable", "bad");
    navigator.geolocation.getCurrentPosition((pos) => {
      Store.setWorkerLocation(ME.id, pos.coords.latitude, pos.coords.longitude);
      toast(t("saved"), "good");
      render();
    }, () => toast("Location denied", "bad"));
  });
  locRow.appendChild(locBtn);
  card.appendChild(field("my_location", locRow));

  const radiusInp = input("radius", { type: "number", value: u.serviceRadiusKm || 25, min: 1, max: 200 });
  card.appendChild(field("service_radius_km", radiusInp));

  const saveBtn = btn(t("save"), "btn sm", () => {
    const r = parseInt(radiusInp.value, 10);
    if (r > 0) {
      Store.setWorkerServiceArea(ME.id, r);
      toast(t("saved"), "good");
    }
  });
  card.appendChild(saveBtn);

  card.appendChild(el("p", "muted sm", t("service_area_explain")));
  return card;
}

/* Nearby worker search for owners */
function renderNearbyWorkerSearch() {
  const card = el("div", "card");
  card.appendChild(el("h3", null, t("find_workers_near")));

  const coord = el("span", "coord", "—");
  const locBtn = btn(t("use_my_location"), "btn ghost sm", () => {
    if (!navigator.geolocation) return toast("Geolocation unavailable", "bad");
    navigator.geolocation.getCurrentPosition((pos) => {
      coord.dataset.lat = pos.coords.latitude;
      coord.dataset.lng = pos.coords.longitude;
      coord.textContent = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
    }, () => toast("Location denied", "bad"));
  });
  const locRow = el("div", "inline-row");
  locRow.appendChild(coord);
  locRow.appendChild(locBtn);
  card.appendChild(field("search_location", locRow));

  const radiusInp = input("radius", { type: "number", value: 25, min: 1, max: 200 });
  card.appendChild(field("search_radius_km", radiusInp));

  const results = el("div", "nearby-results");
  results.id = "nearbyResults";
  card.appendChild(results);

  const searchBtn = btn(t("search"), "btn sm", () => {
    const lat = parseFloat(coord.dataset.lat);
    const lng = parseFloat(coord.dataset.lng);
    if (isNaN(lat) || isNaN(lng)) {
      toast(t("set_location_first"), "bad");
      return;
    }
    const maxKm = parseInt(radiusInp.value, 10) || 25;
    const found = Store.findWorkersNear(lat, lng, maxKm);
    results.innerHTML = "";
    if (!found.length) {
      results.appendChild(el("p", "muted sm", t("no_workers_found")));
      return;
    }
    const list = el("div", "people-list");
    found.forEach(({ user, distanceKm }) => {
      const row = el("div", "person-row");
      const av = el("span", "avatar", initial(user.name));
      av.style.background = avatarColour(user.id);
      row.appendChild(av);
      const info = el("div", "person-info");
      info.appendChild(el("b", null, user.name));
      info.appendChild(el("span", "muted sm", user.email));
      const meta = el("span", "muted xs");
      const bits = [`${distanceKm} km`];
      if (user.trade) bits.push(t("trade_" + user.trade));
      meta.textContent = bits.join(" · ");
      info.appendChild(meta);
      row.appendChild(info);
      list.appendChild(row);
    });
    results.appendChild(list);
  });
  card.appendChild(searchBtn);

  return card;
}

/* -------------------------------------------------------------- photos */
function renderPhotos() {
  const wrap = $("#photosBody");
  wrap.innerHTML = "";
  const hd = el("div", "row-between");
  hd.appendChild(el("h2", null, t("photos")));
  wrap.appendChild(hd);

  const all = Store.photosForUser(ME);
  if (!all.length) { wrap.appendChild(empty(t("no_photos"))); return; }
  all.sort((a, b) => (b.at || "").localeCompare(a.at || ""));

  const grid = el("div", "photo-grid");
  paginate(grid, all, (ph) => {
    const cell = el("div", "photo-cell");
    const img = el("img");
    img.src = ph.dataUrl;
    img.alt = ph.caption || "";
    img.loading = "lazy";
    img.decoding = "async";
    cell.appendChild(img);
    if (ph.caption) cell.appendChild(el("span", "photo-cap", ph.caption));
    cell.onclick = () => openPhoto(ph);
    return cell;
  }, 24);
  wrap.appendChild(grid);
}

function openPhoto(ph) {
  const body = el("div", "lightbox-body");
  const img = el("img");
  img.src = ph.dataUrl;
  body.appendChild(img);
  if (ph.caption) body.appendChild(el("p", null, ph.caption));
  const prop = Store.property(ph.propertyId);
  const who = Store.user(ph.uploaderId);
  const meta = [prop ? prop.name : "", who ? who.name : "", relTime(ph.at)]
    .filter(Boolean).join(" · ");
  body.appendChild(el("p", "muted sm", meta));
  const m = modal(null, body, { wide: true });
  document.body.appendChild(m);
  openModal(m);
}

/* ------------------------------------------------------------ activity */
function renderActivity() {
  const wrap = $("#activityBody");
  wrap.innerHTML = "";
  const hd = el("div", "row-between");
  hd.appendChild(el("h2", null, t("activity")));
  wrap.appendChild(hd);

  const acts = Store.db.activity.slice(0, 60);
  if (!acts.length) { wrap.appendChild(empty(t("no_activity"))); return; }

  const list = el("div", "activity-list");
  acts.forEach((a) => {
    const u = Store.user(a.userId);
    const row = el("div", "activity-row");
    const av = el("span", "avatar xs", initial(u ? u.name : "?"));
    if (u) av.style.background = avatarColour(u.id);
    row.appendChild(av);
    const body = el("div", "activity-body");
    body.appendChild(el("b", null, u ? u.name : "—"));
    body.appendChild(el("span", null, " " + a.action.replace(/\./g, " ")));
    if (a.meta && a.meta.title) body.appendChild(el("span", "muted", ` — ${a.meta.title}`));
    if (a.meta && a.meta.name) body.appendChild(el("span", "muted", ` — ${a.meta.name}`));
    row.appendChild(body);
    row.appendChild(el("span", "muted xs", relTime(a.at)));
    list.appendChild(row);
  });
  wrap.appendChild(list);
}

/* ---------------------------------------------------------------- map */
function initMap() {
  const node = $("#mapCanvas");
  if (!node) return;

  map = L.map(node, { zoomControl: true, preferCanvas: true })
    .setView([34.5958, -120.1376], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  map.on("click", (e) => {
    pendingPin = { lat: e.latlng.lat, lng: e.latlng.lng };
    if (pinLayer) map.removeLayer(pinLayer);
    pinLayer = L.circleMarker([pendingPin.lat, pendingPin.lng],
      { radius: 9, color: "#34d399", fillColor: "#34d399", fillOpacity: .85 }).addTo(map);
    const hint = $("#pinHint");
    if (hint) {
      hint.textContent = `${pendingPin.lat.toFixed(5)}, ${pendingPin.lng.toFixed(5)}`;
      hint.hidden = false;
    }
  });

  // Try to center on the user's actual location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 14);
      },
      () => {
        // Geolocation denied — fall back to user's properties
        centerOnUserProperties();
      },
      { timeout: 5000 }
    );
  } else {
    centerOnUserProperties();
  }
}

function centerOnUserProperties() {
  const props = Store.propertiesFor(ME).filter((p) => p.lat != null && p.lng != null);
  if (props.length) {
    const bounds = props.map((p) => [p.lat, p.lng]);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }
}

function renderMapView() {
  const node = $("#mapCanvas");
  if (!node) return;

  if (!map) {
    initMap();
  }
  setTimeout(() => map.invalidateSize(), 60);
  drawMarkers();

  const props = Store.propertiesFor(ME);
  const sel = $("#mapProp");
  if (sel) {
    sel.innerHTML = "";
    const all = el("option", null, t("all_properties"));
    all.value = "";
    sel.appendChild(all);
    props.forEach((p) => {
      const o = el("option", null, p.name);
      o.value = p.id;
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
      const m = L.marker([p.lat, p.lng], { icon: propertyIcon() }).addTo(map)
        .bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.address || "")}`);
      markers.push(m);
      bounds.push([p.lat, p.lng]);
    }
    Store.tasksFor(p.id).forEach((tk) => {
      if (tk.lat == null || tk.lng == null) return;
      const col = tk.status === "done" ? "#6b7280"
        : tk.priority === "high" ? "#ff6b8a"
          : tk.priority === "low" ? "#34d399" : "#f5c451";
      const m = L.circleMarker([tk.lat, tk.lng], {
        radius: 9, color: "#05100b", weight: 2.5, fillColor: col, fillOpacity: 1,
      }).addTo(map)
        .bindPopup(`<b>${esc(tk.title)}</b><br>${esc(t(tk.status))} — ${esc(t(tk.priority))}`);
      markers.push(m);
      bounds.push([tk.lat, tk.lng]);
    });
    Store.photosFor(p.id).forEach((ph) => {
      if (ph.lat == null || ph.lng == null) return;
      const m = L.circleMarker([ph.lat, ph.lng], {
        radius: 6, color: "#05100b", weight: 2, fillColor: "#6ee7ff", fillOpacity: 1,
      }).addTo(map)
        .bindPopup(`<img src="${ph.dataUrl}" style="width:180px;border-radius:6px">`);
      markers.push(m);
      bounds.push([ph.lat, ph.lng]);
    });
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
}

/** A house-shaped pin so properties read differently from round task markers. */
function propertyIcon() {
  return L.divIcon({
    className: "prop-pin",
    html: `<svg width="26" height="34" viewBox="0 0 26 34" aria-hidden="true">
      <path d="M13 33C13 33 24 20.5 24 12A11 11 0 0 0 2 12c0 8.5 11 21 11 21z"
            fill="#6ee7ff" stroke="#05100b" stroke-width="2.5"/>
      <path d="M8.5 12.5l4.5-3.6 4.5 3.6v5h-9z" fill="#05100b"/>
    </svg>`,
    iconSize: [26, 34],
    iconAnchor: [13, 33],
    popupAnchor: [0, -30],
  });
}

function focusTask(task) {
  if (!map || task.lat == null) return;
  setTimeout(() => map.setView([task.lat, task.lng], 17), 120);
}

/* ------------------------------------------------------------- scanner */
function renderScanner() {
  const wrap = $("#scanBody");
  if (!wrap) return;
  if (!scanner) {
    scanner = createScanner(wrap, { userId: ME.id });
  }
}

/* ----------------------------------------------------------- settings */
function renderSettings() {
  const wrap = $("#settingsBody");
  wrap.innerHTML = "";
  wrap.appendChild(el("h2", null, t("settings")));

  /* profile + language */
  const prof = el("div", "card");
  prof.appendChild(el("h3", null, t("profile")));
  const nm = input("name", { value: ME.name });
  prof.appendChild(field("name", nm));
  prof.appendChild(el("p", "muted sm", ME.email));
  const langSel = select("lang", LANGS.map((l) => ({
    value: l.code, label: l.code === "en" ? l.name : `${l.name} (${l.code})`,
    selected: l.code === ME.language,
  })));
  prof.appendChild(field("language", langSel));
  const tradeSel = select("trade", TRADES.map((tr) => ({
    value: tr.id, label: t("trade_" + tr.id),
    selected: (ME.trade || "general") === tr.id,
  })));
  prof.appendChild(field("trade", tradeSel));
  const pactions = el("div", "card-actions");
  pactions.appendChild(btn(t("save"), "btn sm", () => {
    Store.updateProfile(ME.id, { name: nm.value, language: langSel.value, trade: tradeSel.value });
    ME = Store.user(ME.id);
    setLang(ME.language);
    buildNav();
    toast(t("saved"), "good");
    render();
  }));
  prof.appendChild(pactions);
  wrap.appendChild(prof);

  /* password */
  const pw = el("div", "card");
  pw.appendChild(el("h3", null, t("change_password")));
  const cur = input("current", { type: "password", autocomplete: "current-password" });
  const n1 = input("next", { type: "password", autocomplete: "new-password" });
  const n2 = input("confirm", { type: "password", autocomplete: "new-password" });
  pw.appendChild(field("current_password", cur));
  pw.appendChild(field("new_password", n1));
  pw.appendChild(field("confirm_password", n2));
  const wactions = el("div", "card-actions");
  wactions.appendChild(btn(t("change_password"), "btn sm", async () => {
    if (n1.value !== n2.value) return toast(t("passwords_dont_match"), "bad");
    try {
      await Store.changePassword(ME.id, cur.value, n1.value);
      cur.value = n1.value = n2.value = "";
      toast(t("saved"), "good");
    } catch (e) {
      toast(t(e.message), "bad");
    }
  }));
  pw.appendChild(wactions);
  wrap.appendChild(pw);

  /* recovery code */
  const rec = el("div", "card");
  rec.appendChild(el("h3", null, t("my_recovery")));
  rec.appendChild(el("p", "muted sm", t("recovery_explain")));
  const rc = input("rc", { type: "password", placeholder: "••••" });
  rec.appendChild(field("password", rc));
  const ractions = el("div", "card-actions");
  ractions.appendChild(btn(t("regenerate_code"), "btn ghost sm", async () => {
    try {
      const code = await Store.regenerateRecovery(ME.id, rc.value);
      rc.value = "";
      showRecoveryCode(code, false);
    } catch (e) {
      toast(t(e.message), "bad");
    }
  }));
  rec.appendChild(ractions);
  wrap.appendChild(rec);

  /* storage */
  const st = Store.storageEstimate();
  const stor = el("div", "card");
  stor.appendChild(el("h3", null, t("storage")));
  const bar = el("div", "progress");
  const fill = el("div", "progress-fill");
  fill.style.width = Math.min(100, (st.mb / st.limitMb) * 100) + "%";
  bar.appendChild(fill);
  stor.appendChild(bar);
  stor.appendChild(el("p", "muted sm", `${st.mb.toFixed(2)} MB ${t("storage_used")}`));
  if (st.mb / st.limitMb > 0.8) {
    stor.appendChild(el("p", "warn-text", t("storage_warning")));
  }
  wrap.appendChild(stor);

  /* data */
  const data = el("div", "card");
  data.appendChild(el("h3", null, t("export_data")));
  const dactions = el("div", "card-actions");
  dactions.appendChild(btn(t("export_data"), "btn ghost sm", () => {
    const blob = new Blob([Store.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "habitat-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }));
  const fileIn = input("import", { type: "file" });
  fileIn.accept = "application/json";
  fileIn.onchange = () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        Store.importJSON(r.result);
        ME = Store.user(ME.id);
        if (!ME) return logout();
        toast(t("saved"), "good");
        render();
      } catch {
        toast("bad file", "bad");
      }
    };
    r.readAsText(f);
  };
  dactions.appendChild(fileIn);
  dactions.appendChild(btn(t("reset_all"), "btn ghost sm danger", () => {
    if (!confirm(t("delete_confirm"))) return;
    Store.reset();
    logout();
    boot();
  }));
  data.appendChild(dactions);
  wrap.appendChild(data);
}

/* ------------------------------------------------------ recovery modal */
function showRecoveryCode(code, isNew = true) {
  const body = el("div", "stack");
  body.appendChild(el("p", "muted sm", t("recovery_explain")));
  const box = el("div", "code-box");
  box.textContent = code;
  body.appendChild(box);

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("copy_code"), "btn ghost", async () => {
    const ok = await copyText(code);
    toast(ok ? t("copied") : code, ok ? "good" : "info");
  }));
  actions.appendChild(btn(t("i_saved_it"), "btn", () => closeModal(m)));
  body.appendChild(actions);

  const m = modal("save_recovery_code", body);
  document.body.appendChild(m);
  openModal(m);
}

/* ------------------------------------------------------------- modals */
function openPropertyModal(existing = null) {
  const editing = !!existing;
  const body = el("div", "stack");
  const name = input("name", { required: true, value: existing ? existing.name : "" });
  const addr = input("address", { value: existing ? existing.address : "" });
  const notes = textarea("notes", { rows: 2 });
  if (existing) notes.value = existing.notes || "";

  body.appendChild(field("property_name", name));
  body.appendChild(field("address", addr));
  body.appendChild(field("notes", notes));

  const coord = el("span", "coord", existing && existing.lat != null
    ? `${existing.lat.toFixed(5)}, ${existing.lng.toFixed(5)}` : "—");
  const locBtn = btn(t("use_my_location"), "btn ghost sm", () => {
    if (!navigator.geolocation) return toast("Geolocation unavailable", "bad");
    navigator.geolocation.getCurrentPosition((pos) => {
      coord.dataset.lat = pos.coords.latitude;
      coord.dataset.lng = pos.coords.longitude;
      coord.textContent = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
    }, () => toast("Location denied", "bad"));
  });
  if (existing && existing.lat != null) {
    coord.dataset.lat = existing.lat;
    coord.dataset.lng = existing.lng;
  }
  const locRow = el("div", "inline-row");
  locRow.appendChild(coord);
  locRow.appendChild(locBtn);
  body.appendChild(field("location", locRow));

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
  actions.appendChild(btn(t("save"), "btn", () => {
    if (!name.value.trim()) return toast(t("required"), "bad");
    const lat = parseFloat(coord.dataset.lat);
    const lng = parseFloat(coord.dataset.lng);
    const data = {
      ownerId: ME.id, name: name.value, address: addr.value, notes: notes.value,
      lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng,
    };
    if (editing) Store.updateProperty(existing.id, data);
    else Store.addProperty(data);
    closeModal(m);
    toast(t("saved"), "good");
    render();
  }));
  body.appendChild(actions);

  const m = modal(editing ? "edit" : "add_property", body);
  document.body.appendChild(m);
  openModal(m);
}

function openTaskModal(existing = null) {
  const props = Store.propertiesFor(ME);
  if (!props.length) return;
  const editing = !!existing;
  const body = el("div", "stack");

  const propSel = select("propertyId", props.map((p) => ({
    value: p.id, label: p.name,
    selected: existing ? existing.propertyId === p.id : activeProperty === p.id,
  })));
  body.appendChild(field("properties", propSel));

  const title = input("title", { required: true, value: existing ? existing.title : "" });
  const desc = textarea("description", { rows: 3 });
  if (existing) desc.value = existing.description || "";
  body.appendChild(field("task_title", title));
  body.appendChild(field("task_desc", desc));

  const prio = select("priority", [
    { value: "high", label: t("high"), i18n: "high", selected: existing && existing.priority === "high" },
    { value: "normal", label: t("normal"), i18n: "normal", selected: !existing || existing.priority === "normal" },
    { value: "low", label: t("low"), i18n: "low", selected: existing && existing.priority === "low" },
  ]);
  body.appendChild(field("priority", prio));

  const tradeSel = select("trade", TRADES.map((tr) => ({
    value: tr.id,
    label: `${tr.icon} ${tr.name}`,
    selected: existing ? existing.trade === tr.id : tr.id === "general",
  })));
  body.appendChild(field("trade", tradeSel));

  // assignee: crew members of the chosen property, or anyone
  const asgSel = select("assignee", [{ value: "", label: t("anyone") }]);
  function fillAssignees() {
    const p = Store.property(propSel.value);
    asgSel.innerHTML = "";
    const any = el("option", null, t("anyone"));
    any.value = "";
    asgSel.appendChild(any);
    if (!p) return;
    const ids = new Set(p.workers || []);
    (p.groups || []).forEach((gid) => {
      const g = Store.group(gid);
      if (g) g.memberIds.forEach((m) => ids.add(m));
    });
    ids.forEach((wid) => {
      const u = Store.user(wid);
      if (!u) return;
      const o = el("option", null, u.name);
      o.value = u.id;
      if (existing && existing.assigneeId === u.id) o.selected = true;
      asgSel.appendChild(o);
    });
  }
  fillAssignees();
  propSel.onchange = fillAssignees;
  body.appendChild(field("assignee", asgSel));

  const due = input("dueDate", { type: "date", value: existing ? (existing.dueDate || "") : "" });
  body.appendChild(field("due_date", due));

  let photoData = null;
  if (!editing) {
    const preview = el("div", "preview");
    preview.hidden = true;
    const file = input("photo", { type: "file" });
    file.accept = "image/*";
    file.setAttribute("capture", "environment");
    file.onchange = () => {
      const f = file.files && file.files[0];
      if (!f) return;
      compressImage(f, 1280, 0.7).then((d) => {
        photoData = d;
        preview.innerHTML = "";
        const img = el("img");
        img.src = d;
        preview.appendChild(img);
        preview.hidden = false;
      }).catch(() => toast("Could not read that image", "bad"));
    };
    body.appendChild(field("take_photo", file));
    body.appendChild(preview);
  }

  const coord = el("span", "coord", "—");
  const locBtn = btn(t("use_my_location"), "btn ghost sm", () => {
    if (!navigator.geolocation) return toast("Geolocation unavailable", "bad");
    navigator.geolocation.getCurrentPosition((pos) => {
      pendingPin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      coord.textContent = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
    }, () => toast("Location denied", "bad"));
  });
  const locRow = el("div", "inline-row");
  locRow.appendChild(coord);
  locRow.appendChild(locBtn);
  body.appendChild(field("location", locRow));

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
  actions.appendChild(btn(t("save"), "btn", () => {
    if (!title.value.trim()) return toast(t("required"), "bad");
    let photoId = existing ? existing.photoId : null;
    if (photoData) {
      const ph = Store.addPhoto({
        propertyId: propSel.value, uploaderId: ME.id, dataUrl: photoData,
        caption: title.value, kind: "issue",
        lat: pendingPin ? pendingPin.lat : null,
        lng: pendingPin ? pendingPin.lng : null,
      });
      photoId = ph.id;
    }
    const data = {
      propertyId: propSel.value,
      title: title.value,
      description: desc.value,
      priority: prio.value,
      assigneeId: asgSel.value || null,
      dueDate: due.value || null,
      photoId,
      trade: tradeSel.value,
      lat: pendingPin ? pendingPin.lat : (existing ? existing.lat : null),
      lng: pendingPin ? pendingPin.lng : (existing ? existing.lng : null),
    };
    if (editing) Store.updateTask(existing.id, data);
    else Store.addTask(Object.assign({ createdBy: ME.id }, data));
    closeModal(m);
    toast(t("saved"), "good");
    render();
  }));
  body.appendChild(actions);

  const m = modal(editing ? "edit" : "request_change", body);
  document.body.appendChild(m);
  openModal(m);
}

function openCrewModal(existing = null) {
  const editing = !!existing;
  const body = el("div", "stack");
  const name = input("name", { required: true, value: existing ? existing.name : "" });
  const desc = textarea("description", { rows: 2 });
  if (existing) desc.value = existing.description || "";
  body.appendChild(field("crew_name", name));
  body.appendChild(field("crew_desc", desc));

  const colours = el("div", "colour-row");
  let chosen = existing ? existing.color : GROUP_COLORS[Store.groupsFor(ME.id).length % GROUP_COLORS.length];
  GROUP_COLORS.forEach((c) => {
    const sw = el("button", "swatch" + (c === chosen ? " on" : ""));
    sw.type = "button";
    sw.style.background = c;
    sw.onclick = () => {
      chosen = c;
      $$(".swatch", colours).forEach((s) => s.classList.remove("on"));
      sw.classList.add("on");
    };
    colours.appendChild(sw);
  });
  body.appendChild(field("crew_colour", colours));

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
  actions.appendChild(btn(t("save"), "btn", () => {
    if (!name.value.trim()) return toast(t("required"), "bad");
    if (editing) Store.updateGroup(existing.id, { name: name.value, description: desc.value, color: chosen });
    else Store.addGroup({ ownerId: ME.id, name: name.value, description: desc.value, color: chosen });
    closeModal(m);
    toast(t("saved"), "good");
    render();
  }));
  body.appendChild(actions);

  const m = modal(editing ? "edit_crew" : "new_crew", body);
  document.body.appendChild(m);
  openModal(m);
}

function openCrewMembersModal(groupId) {
  const g = Store.group(groupId);
  if (!g) return;
  const body = el("div", "stack");
  const list = el("div", "assign-list");
  const workers = Store.workers();
  if (!workers.length) list.appendChild(el("p", "muted", t("no_crews")));

  const checks = new Map();
  workers.forEach((w) => {
    const row = el("label", "assign-row");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = g.memberIds.includes(w.id);
    checks.set(w.id, cb);
    row.appendChild(cb);
    const av = el("span", "avatar xs", initial(w.name));
    av.style.background = avatarColour(w.id);
    row.appendChild(av);
    row.appendChild(el("span", null, `${w.name} · ${w.email}`));
    list.appendChild(row);
  });
  body.appendChild(list);

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
  actions.appendChild(btn(t("save"), "btn", () => {
    const ids = [];
    checks.forEach((cb, id) => { if (cb.checked) ids.push(id); });
    Store.setGroupMembers(groupId, ids);
    closeModal(m);
    toast(t("saved"), "good");
    render();
  }));
  body.appendChild(actions);

  const m = modal("members", body);
  document.body.appendChild(m);
  openModal(m);
}

function openAssignModal(propId) {
  const p = Store.property(propId);
  if (!p) return;
  const body = el("div", "stack");

  const crewList = el("div", "assign-list");
  const crews = Store.groupsFor(ME.id);
  const crewChecks = new Map();
  const h1 = el("h4", null, t("crews_assigned"));
  h1.setAttribute("data-i18n", "crews_assigned");
  body.appendChild(h1);
  if (!crews.length) {
    crewList.appendChild(el("p", "muted sm", t("no_crews")));
  }
  crews.forEach((g) => {
    const row = el("label", "assign-row");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = (p.groups || []).includes(g.id);
    crewChecks.set(g.id, cb);
    row.appendChild(cb);
    const dot = el("span", "dot");
    dot.style.background = g.color;
    row.appendChild(dot);
    row.appendChild(el("span", null, `${g.name} (${g.memberIds.length})`));
    crewList.appendChild(row);
  });
  body.appendChild(crewList);

  const h2 = el("h4", null, t("assigned_directly"));
  h2.setAttribute("data-i18n", "assigned_directly");
  body.appendChild(h2);
  const wList = el("div", "assign-list");
  const wChecks = new Map();
  Store.workers().forEach((w) => {
    const row = el("label", "assign-row");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = (p.workers || []).includes(w.id);
    wChecks.set(w.id, cb);
    row.appendChild(cb);
    const av = el("span", "avatar xs", initial(w.name));
    av.style.background = avatarColour(w.id);
    row.appendChild(av);
    row.appendChild(el("span", null, w.name));
    wList.appendChild(row);
  });
  body.appendChild(wList);

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
  actions.appendChild(btn(t("save"), "btn", () => {
    const crewIds = [];
    crewChecks.forEach((cb, id) => { if (cb.checked) crewIds.push(id); });
    p.groups = crewIds;
    const workerIds = [];
    wChecks.forEach((cb, id) => { if (cb.checked) workerIds.push(id); });
    p.workers = workerIds;
    Store.updateProperty(propId, { groups: crewIds, workers: workerIds });
    closeModal(m);
    toast(t("saved"), "good");
    render();
  }));
  body.appendChild(actions);

  const m = modal("assign_crew", body);
  document.body.appendChild(m);
  openModal(m);
}

/* ------------------------------------------------------ auth handling */
function authError(msgKey) {
  const n = $("#authError");
  n.textContent = t(msgKey);
  n.hidden = false;
  setTimeout(() => { n.hidden = true; }, 5000);
}

async function doSignup(e) {
  e.preventDefault();
  const f = e.target;
  try {
    const tradeField = $("#signupTradeField");
    const trade = tradeField && !tradeField.hidden ? f.trade.value : null;
    const { user, recoveryCode } = await Store.signup({
      name: f.name.value, email: f.email.value, password: f.password.value,
      role: f.role.value, language: f.language.value, trade,
    });
    Store.setSession(user.id);
    ME = user;
    setLang(user.language);
    showApp();
    showRecoveryCode(recoveryCode, true);
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

async function doReset(e) {
  e.preventDefault();
  const f = e.target;
  if (f.next.value !== f.confirm.value) return authError("passwords_dont_match");
  try {
    await Store.resetPassword(f.email.value, f.next.value);
    $("#resetForm").hidden = true;
    $("#loginForm").hidden = false;
    toast(t("saved"), "good");
  } catch (err) {
    authError(err.message || "no_account");
  }
}

function logout() {
  Store.commit();
  Store.setSession(null);
  ME = null;
  if (map) { map.remove(); map = null; }
  markers = [];
  showAuth();
}

/* --------------------------------------------------------- translation */
async function autoTranslateContent() {
  try {
    if (getLang() === "en") return;
    const nodes = $$("[data-auto-translate]");
    if (!nodes.length) return;
    const texts = nodes.map((n) => n.dataset.orig || n.textContent);
    const out = await translateAll(texts, getLang());
    nodes.forEach((n, i) => {
      if (!n.dataset.orig) n.dataset.orig = texts[i];
      // Apply trade-specific post-processing to handle jargon
      const processed = postProcessTradeTranslation(out[i], getLang());
      if (processed !== texts[i]) {
        n.textContent = processed;
        n.classList.add("translated");
      }
    });
  } catch (e) {
    console.warn("auto-translate failed", e);
  }
}

/* --------------------------------------------------------- lang picker */
function renderLangPicker(sel, selected) {
  if (!sel) return;
  sel.innerHTML = "";
  LANGS.forEach((l) => {
    const o = el("option", null, l.code === "en" ? l.name : `${l.name} (${l.code})`);
    o.value = l.code;
    if (l.code === selected) o.selected = true;
    sel.appendChild(o);
  });
}

/* --------------------------------------------------------------- wire */
function wire() {
  $("#loginForm").onsubmit = doLogin;
  $("#signupForm").onsubmit = doSignup;
  $("#resetForm").onsubmit = doReset;
  $("#logoutBtn").onclick = logout;

  $("#toSignup").onclick = () => {
    $("#loginForm").hidden = true;
    $("#signupForm").hidden = false;
    $("#resetForm").hidden = true;
    applyStaticI18n($("#auth"));
  };
  $("#toLogin").onclick = () => {
    $("#signupForm").hidden = true;
    $("#loginForm").hidden = false;
    $("#resetForm").hidden = true;
    applyStaticI18n($("#auth"));
  };
  $("#toReset").onclick = () => {
    $("#loginForm").hidden = true;
    $("#signupForm").hidden = true;
    $("#resetForm").hidden = false;
    applyStaticI18n($("#auth"));
  };

  $("#authLang").onchange = (e) => {
    setLang(e.target.value);
    applyStaticI18n($("#auth"));
  };

  // Show/hide trade field based on role selection
  const roleSel = $("#signupForm select[name=role]");
  const tradeField = $("#signupTradeField");
  if (roleSel && tradeField) {
    roleSel.onchange = () => {
      tradeField.hidden = roleSel.value !== "worker";
    };
  }

  const ul = $("#userLang");
  if (ul) {
    ul.onchange = () => {
      Store.setLanguage(ME.id, ul.value);
      ME = Store.user(ME.id);
      setLang(ul.value);
      buildNav();
      render();
    };
  }

  $("#useMyLoc").onclick = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      if (map) map.setView([pos.coords.latitude, pos.coords.longitude], 16);
    }, () => {});
  };

  addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTopModal();
  });

  // persist immediately when the page is hidden or unloaded
  addEventListener("visibilitychange", () => { if (document.hidden) Store.commit(); });
  addEventListener("pagehide", () => Store.commit());

  // connectivity indicator
  const setOnline = () => {
    const n = $("#netStatus");
    if (!n) return;
    n.hidden = navigator.onLine;
  };
  addEventListener("online", () => { setOnline(); toast(t("back_online"), "good"); });
  addEventListener("offline", () => { setOnline(); toast(t("offline"), "info"); });
  setOnline();

  // global search shortcut
  addEventListener("keydown", (e) => {
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      e.preventDefault();
      go("tasks");
      const s = $("#tasksBody .search");
      if (s) s.focus();
    }
  });

  // ------------------------------------------------------- camera FAB
  const cameraFab = $("#cameraFab");
  if (cameraFab) {
    // Show only on mobile (coarse pointer / small screen)
    const mq = window.matchMedia("(max-width: 680px)");
    const toggleFab = () => { cameraFab.hidden = !(mq.matches && ME); };
    mq.addEventListener("change", toggleFab);
    toggleFab();

    cameraFab.addEventListener("click", () => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      inp.setAttribute("capture", "environment");
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        compressImage(f, 1280, 0.7).then((d) => {
          // Open a quick "add photo" modal with the captured image
          const body = el("div", "stack");
          const preview = el("div", "preview");
          const img = el("img");
          img.src = d;
          preview.appendChild(img);
          body.appendChild(preview);

          const cap = input("caption");
          cap.id = "fabCaption";
          body.appendChild(field("caption", cap));

          const propSel = select("prop", Store.propertiesFor(ME).map((p) => ({
            value: p.id, label: p.name,
          })));
          if (Store.propertiesFor(ME).length) {
            body.appendChild(field("properties", propSel));
          }

          const actions = el("div", "modal-actions");
          actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
          actions.appendChild(btn(t("save"), "btn", () => {
            const propId = propSel ? propSel.value : (Store.propertiesFor(ME)[0] || {}).id;
            if (!propId) { toast(t("no_properties"), "bad"); return; }
            Store.addPhoto({
              propertyId: propId, uploaderId: ME.id,
              dataUrl: d, caption: cap.value, kind: "issue",
            });
            closeModal(m);
            toast(t("saved"), "good");
            render();
          }));
          body.appendChild(actions);

          const m = modal("take_photo", body);
          document.body.appendChild(m);
          openModal(m);
        }).catch(() => toast("Could not read that image", "bad"));
      };
      inp.click();
    });
  }

  // ------------------------------------------------------- mobile events
  // Quick complete from swipe-left gesture
  document.addEventListener("habitat:quickComplete", (e) => {
    const task = Store.task(e.detail.taskId);
    if (!task || task.status === "done") return;
    Store.setTaskStatus(task.id, "done", ME.id);
    vibrate([30, 50, 30]);
    toast(t("mark_done"), "good");
    render();
  });

  // Cycle status from swipe-right gesture
  document.addEventListener("habitat:cycleStatus", (e) => {
    const task = Store.task(e.detail.taskId);
    if (!task) return;
    const next = task.status === "open" ? "doing" : task.status === "doing" ? "done" : "open";
    Store.setTaskStatus(task.id, next, ME.id);
    vibrate(20);
    toast(t("status") + ": " + t(next), "info");
    render();
  });

  // Pull-to-refresh
  document.addEventListener("habitat:refresh", () => {
    render();
    toast(t("saved"), "good");
  });
}

/* ES modules with static imports execute after DOMContentLoaded may already
   have fired, so a plain listener can be missed entirely. Guard on readyState. */
function start() {
  wire();
  boot();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
