/* Verde — Property Information Hub.
 *
 * A comprehensive sub-view for tracking property details: utility locations,
 * system specs, documents, maintenance history, and notes.
 * Rendered inside the property detail area, accessible from property cards.
 */
"use strict";
import { Store } from "./store.js";
import {
  $, $$, el, esc, btn, field, input, select, textarea, empty, sectionHeader,
  openModal, closeModal, modal, toast, dateLabel, compressImage,
} from "./ui.js";
import { t } from "./i18n.js";

/* ----------------------------------------------------------- constants */
const UTILITY_TYPES = [
  { value: "water_shutoff", label: "Water Shutoff" },
  { value: "electrical_panel", label: "Electrical Panel" },
  { value: "gas_meter", label: "Gas Meter" },
  { value: "hvac_unit", label: "HVAC Unit" },
  { value: "other", label: "Other" },
];

const DOC_CATEGORIES = [
  { value: "warranty", label: "Warranty" },
  { value: "manual", label: "Manual" },
  { value: "receipt", label: "Receipt" },
  { value: "other", label: "Other" },
];

const SYSTEM_FIELD_DEFS = [
  { key: "roofType", label: "Roof Type", type: "text" },
  { key: "roofAge", label: "Roof Age", type: "text" },
  { key: "hvacType", label: "HVAC Type", type: "text" },
  { key: "hvacAge", label: "HVAC Age", type: "text" },
  { key: "plumbingType", label: "Plumbing Type", type: "text" },
  { key: "insulationType", label: "Insulation Type", type: "text" },
  { key: "foundationType", label: "Foundation Type", type: "text" },
  { key: "squareFootage", label: "Square Footage", type: "text" },
  { key: "yearBuilt", label: "Year Built", type: "text" },
];

/* --------------------------------------------------------- main render */
let _render = null;
let _me = null;

export function initPropertyInfo(renderFn, meFn) {
  _render = renderFn;
  _me = meFn;
}

export function renderPropertyInfo(propId, container) {
  const p = Store.property(propId);
  if (!p) return;

  container.innerHTML = "";

  // Header with back button
  const head = el("div", "row-between");
  const titleWrap = el("div", null);
  titleWrap.appendChild(el("h2", null, p.name));
  if (p.address) titleWrap.appendChild(el("p", "muted sm", p.address));
  head.appendChild(titleWrap);
  head.appendChild(btn("← " + t("properties"), "btn ghost sm", () => {
    container.innerHTML = "";
    container.appendChild(buildPropertyDetail(propId));
  }));
  container.appendChild(head);

  // Sections
  container.appendChild(renderSystemInfoSection(p));
  container.appendChild(renderUtilitiesSection(p));
  container.appendChild(renderDocumentsSection(p));
  container.appendChild(renderMaintenanceHistorySection(p));
  container.appendChild(renderPropertyNotesSection(p));
}

/* ---------------------------------------------------- system info section */
function renderSystemInfoSection(p) {
  const sec = el("section", "card");
  sec.appendChild(sectionHeader("system_details", t("edit"), () => openSystemInfoModal(p)));

  const si = p.systemInfo || {};
  const grid = el("div", "info-grid");
  SYSTEM_FIELD_DEFS.forEach((def) => {
    const val = si[def.key];
    const cell = el("div", "info-cell");
    cell.appendChild(el("span", "info-label", t(def.label.toLowerCase().replace(/\s+/g, "_"))));
    cell.appendChild(el("span", "info-value", val != null && val !== "" ? String(val) : "—"));
    grid.appendChild(cell);
  });
  sec.appendChild(grid);
  return sec;
}

/* --------------------------------------------------- utilities section */
function renderUtilitiesSection(p) {
  const sec = el("section", "card");
  sec.appendChild(sectionHeader("utility_locations", t("add"), () => openUtilityModal(p)));

  const utils = p.utilities || [];
  if (!utils.length) {
    sec.appendChild(el("p", "muted sm", t("no_utilities")));
    return sec;
  }

  const list = el("div", "utility-list");
  utils.forEach((u) => {
    const item = el("div", "utility-item");
    const icon = el("span", "utility-icon", utilityIcon(u.type));
    item.appendChild(icon);

    const body = el("div", "utility-body");
    body.appendChild(el("b", null, u.label || utilityTypeLabel(u.type)));
    if (u.notes) body.appendChild(el("p", "muted sm", u.notes));
    if (u.lat != null && u.lng != null) {
      body.appendChild(el("span", "coord", `${u.lat.toFixed(5)}, ${u.lng.toFixed(5)}`));
    }
    item.appendChild(body);

    if (u.photoId) {
      const photo = Store.photo(u.photoId);
      if (photo) {
        const thumb = el("div", "thumb utility-thumb");
        const img = el("img");
        img.src = photo.dataUrl;
        img.alt = u.label || u.type;
        img.loading = "lazy";
        thumb.appendChild(img);
        item.appendChild(thumb);
      }
    }

    const acts = el("div", "card-actions");
    acts.appendChild(btn(t("edit"), "btn ghost sm", () => openUtilityModal(p, u)));
    if (_me() && _me().role === "owner") {
      acts.appendChild(btn(t("delete"), "btn ghost sm danger", () => {
        if (!confirm(t("delete_confirm"))) return;
        Store.deleteUtility(p.id, u.id);
        toast(t("saved"), "good");
        _render();
      }));
    }
    item.appendChild(acts);
    list.appendChild(item);
  });
  sec.appendChild(list);
  return sec;
}

/* --------------------------------------------------- documents section */
function renderDocumentsSection(p) {
  const sec = el("section", "card");
  sec.appendChild(sectionHeader("documents", t("add"), () => openDocumentModal(p)));

  const docs = p.documents || [];
  if (!docs.length) {
    sec.appendChild(el("p", "muted sm", t("no_documents")));
    return sec;
  }

  const list = el("div", "doc-list");
  docs.forEach((d) => {
    const item = el("div", "doc-item");
    const icon = el("span", "doc-icon", docIcon(d.category));
    item.appendChild(icon);

    const body = el("div", "doc-body");
    body.appendChild(el("b", null, d.title));
    if (d.description) body.appendChild(el("p", "muted sm", d.description));
    const meta = el("div", "doc-meta");
    meta.appendChild(el("span", "pill", docCategoryLabel(d.category)));
    if (d.date) meta.appendChild(el("span", "muted xs", d.date));
    body.appendChild(meta);
    if (d.notes) body.appendChild(el("p", "muted xs", d.notes));
    item.appendChild(body);

    const acts = el("div", "card-actions");
    acts.appendChild(btn(t("edit"), "btn ghost sm", () => openDocumentModal(p, d)));
    if (_me() && _me().role === "owner") {
      acts.appendChild(btn(t("delete"), "btn ghost sm danger", () => {
        if (!confirm(t("delete_confirm"))) return;
        Store.deleteDocument(p.id, d.id);
        toast(t("saved"), "good");
        _render();
      }));
    }
    item.appendChild(acts);
    list.appendChild(item);
  });
  sec.appendChild(list);
  return sec;
}

/* ------------------------------------------- maintenance history section */
function renderMaintenanceHistorySection(p) {
  const sec = el("section", "card");
  sec.appendChild(sectionHeader("maintenance_history"));

  const tasks = Store.tasksFor(p.id).filter((x) => x.status === "done");
  if (!tasks.length) {
    sec.appendChild(el("p", "muted sm", t("no_maintenance")));
    return sec;
  }

  const list = el("div", "maint-list");
  tasks.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  tasks.forEach((task) => {
    const row = el("div", "maint-row");
    row.appendChild(el("span", "maint-date", dateLabel(task.completedAt)));
    const body = el("div", "maint-body");
    body.appendChild(el("b", null, task.title));
    if (task.description) body.appendChild(el("p", "muted sm", task.description));
    row.appendChild(body);
    list.appendChild(row);
  });
  sec.appendChild(list);
  return sec;
}

/* ----------------------------------------------- property notes section */
function renderPropertyNotesSection(p) {
  const sec = el("section", "card");
  sec.appendChild(sectionHeader("property_notes", t("edit"), () => openPropertyNotesModal(p)));

  if (p.notes) {
    sec.appendChild(el("p", "notes", p.notes));
  } else {
    sec.appendChild(el("p", "muted sm", t("no_notes")));
  }
  return sec;
}

/* --------------------------------------------------------- modals */
function openSystemInfoModal(p) {
  const si = p.systemInfo || {};
  const body = el("div", "stack");

  SYSTEM_FIELD_DEFS.forEach((def) => {
    const inp = input(def.key, { value: si[def.key] || "" });
    inp.placeholder = def.label;
    body.appendChild(field(def.label.toLowerCase().replace(/\s+/g, "_"), inp));
  });

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
  actions.appendChild(btn(t("save"), "btn", () => {
    const data = {};
    SYSTEM_FIELD_DEFS.forEach((def) => {
      const val = body.querySelector(`[name="${def.key}"]`).value.trim();
      if (val) data[def.key] = val;
    });
    Store.updateSystemInfo(p.id, data);
    closeModal(m);
    toast(t("saved"), "good");
    _render();
  }));
  body.appendChild(actions);

  const m = modal("system_details", body);
  document.body.appendChild(m);
  openModal(m);
}

function openUtilityModal(p, existing = null) {
  const editing = !!existing;
  const body = el("div", "stack");

  const typeSel = select("type", UTILITY_TYPES.map((u) => ({
    value: u.value, label: u.label,
    selected: existing ? existing.type === u.value : false,
  })));
  body.appendChild(field("utility_type", typeSel));

  const labelInp = input("label", { value: existing ? existing.label : "", placeholder: "e.g. Main water shutoff" });
  body.appendChild(field("label", labelInp));

  const notesTa = textarea("notes", { rows: 2 });
  if (existing) notesTa.value = existing.notes || "";
  body.appendChild(field("notes", notesTa));

  // Photo upload
  let photoId = existing ? existing.photoId : null;
  const preview = el("div", "preview");
  preview.hidden = true;
  const fileInp = input("photo", { type: "file" });
  fileInp.accept = "image/*";
  fileInp.setAttribute("capture", "environment");
  fileInp.onchange = () => {
    const f = fileInp.files && fileInp.files[0];
    if (!f) return;
    compressImage(f, 1280, 0.7).then((d) => {
      const ph = Store.addPhoto({
        propertyId: p.id, uploaderId: _me().id, dataUrl: d,
        caption: labelInp.value || "Utility photo", kind: "other",
      });
      photoId = ph.id;
      preview.innerHTML = "";
      const img = el("img");
      img.src = d;
      preview.appendChild(img);
      preview.hidden = false;
    }).catch(() => toast("Could not read that image", "bad"));
  };
  body.appendChild(field("photo", fileInp));
  body.appendChild(preview);

  // Location
  const coord = el("span", "coord", "—");
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
    coord.textContent = `${existing.lat.toFixed(5)}, ${existing.lng.toFixed(5)}`;
  }
  const locRow = el("div", "inline-row");
  locRow.appendChild(coord);
  locRow.appendChild(locBtn);
  body.appendChild(field("location", locRow));

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
  actions.appendChild(btn(t("save"), "btn", () => {
    const lat = parseFloat(coord.dataset.lat);
    const lng = parseFloat(coord.dataset.lng);
    const data = {
      type: typeSel.value,
      label: labelInp.value.trim(),
      notes: notesTa.value.trim(),
      photoId,
      lat: isNaN(lat) ? null : lat,
      lng: isNaN(lng) ? null : lng,
    };
    if (editing) Store.updateUtility(p.id, existing.id, data);
    else Store.addUtility(p.id, data);
    closeModal(m);
    toast(t("saved"), "good");
    _render();
  }));
  body.appendChild(actions);

  const m = modal(editing ? "edit" : "add_utility", body);
  document.body.appendChild(m);
  openModal(m);
}

function openDocumentModal(p, existing = null) {
  const editing = !!existing;
  const body = el("div", "stack");

  const titleInp = input("title", { value: existing ? existing.title : "", required: true });
  body.appendChild(field("title", titleInp));

  const catSel = select("category", DOC_CATEGORIES.map((c) => ({
    value: c.value, label: c.label,
    selected: existing ? existing.category === c.value : false,
  })));
  body.appendChild(field("category", catSel));

  const dateInp = input("date", { type: "date", value: existing ? (existing.date || "") : "" });
  body.appendChild(field("date", dateInp));

  const descTa = textarea("description", { rows: 3 });
  if (existing) descTa.value = existing.description || "";
  body.appendChild(field("description", descTa));

  const notesTa = textarea("notes", { rows: 2 });
  if (existing) notesTa.value = existing.notes || "";
  body.appendChild(field("notes", notesTa));

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
  actions.appendChild(btn(t("save"), "btn", () => {
    if (!titleInp.value.trim()) return toast(t("required"), "bad");
    const data = {
      title: titleInp.value.trim(),
      category: catSel.value,
      date: dateInp.value || null,
      description: descTa.value.trim(),
      notes: notesTa.value.trim(),
    };
    if (editing) Store.updateDocument(p.id, existing.id, data);
    else Store.addDocument(p.id, data);
    closeModal(m);
    toast(t("saved"), "good");
    _render();
  }));
  body.appendChild(actions);

  const m = modal(editing ? "edit" : "add_document", body);
  document.body.appendChild(m);
  openModal(m);
}

function openPropertyNotesModal(p) {
  const body = el("div", "stack");
  const notesTa = textarea("notes", { rows: 5 });
  notesTa.value = p.notes || "";
  body.appendChild(field("notes", notesTa));

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
  actions.appendChild(btn(t("save"), "btn", () => {
    Store.updateProperty(p.id, { notes: notesTa.value.trim() });
    closeModal(m);
    toast(t("saved"), "good");
    _render();
  }));
  body.appendChild(actions);

  const m = modal("property_notes", body);
  document.body.appendChild(m);
  openModal(m);
}

/* --------------------------------------------------------- helpers */
function utilityIcon(type) {
  const icons = {
    water_shutoff: "💧",
    electrical_panel: "⚡",
    gas_meter: "🔥",
    hvac_unit: "❄️",
    other: "📍",
  };
  return icons[type] || "📍";
}

function utilityTypeLabel(type) {
  const found = UTILITY_TYPES.find((u) => u.value === type);
  return found ? found.label : type;
}

function docIcon(category) {
  const icons = {
    warranty: "🛡️",
    manual: "📖",
    receipt: "🧾",
    other: "📄",
  };
  return icons[category] || "📄";
}

function docCategoryLabel(category) {
  const found = DOC_CATEGORIES.find((c) => c.value === category);
  return found ? found.label : category;
}

/* -------------------------------------------------- property detail view */
export function buildPropertyDetail(propId) {
  const p = Store.property(propId);
  if (!p) return el("p", "muted", t("no_properties"));

  const wrap = el("div", "property-detail");
  wrap.dataset.propertyId = propId;

  // Header
  const head = el("div", "row-between");
  const titleWrap = el("div", null);
  titleWrap.appendChild(el("h2", null, p.name));
  if (p.address) titleWrap.appendChild(el("p", "muted sm", p.address));
  head.appendChild(titleWrap);
  head.appendChild(btn(t("property_info"), "btn sm", () => {
    wrap.innerHTML = "";
    renderPropertyInfo(propId, wrap);
  }));
  wrap.appendChild(head);

  // Quick stats
  const tasks = Store.tasksFor(propId);
  const done = tasks.filter((x) => x.status === "done").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const stats = el("div", "mini-stats");
  stats.innerHTML = `<span><b>${tasks.length}</b> ${esc(t("tasks"))}</span>
    <span><b>${done}</b> ${esc(t("done"))}</span>
    <span><b>${pct}%</b> ${esc(t("completion"))}</span>`;
  wrap.appendChild(stats);

  // Notes preview
  if (p.notes) {
    wrap.appendChild(el("p", "notes", p.notes));
  }

  // Crew chips
  const crewWrap = el("div", "chips");
  (p.groups || []).forEach((gid) => {
    const g = Store.group(gid);
    if (!g) return;
    const c = el("span", "chip-static crew-chip", g.name);
    c.style.borderColor = g.color;
    c.style.color = g.color;
    crewWrap.appendChild(c);
  });
  if (crewWrap.children.length) wrap.appendChild(crewWrap);

  return wrap;
}
