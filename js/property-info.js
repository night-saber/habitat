/* Habitat — Property Information Hub.
 *
 * A comprehensive sub-view for tracking property details: utility locations,
 * system specs, documents, maintenance history, and notes.
 * Rendered inside the property detail area, accessible from property cards.
 */
"use strict";
import { Store, ROOM_TYPES, APPLIANCE_TYPES, MATERIAL_TYPES } from "./store.js";
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
  container.appendChild(renderRoomsSection(p));
  container.appendChild(renderAppliancesSection(p));
  container.appendChild(renderMaterialsSection(p));
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

/* ------------------------------------------------------ rooms section */
function renderRoomsSection(p) {
  const sec = el("section", "card");
  sec.appendChild(sectionHeader("rooms", t("add"), () => openRoomModal(p)));

  const rooms = p.rooms || [];
  if (!rooms.length) {
    sec.appendChild(el("p", "muted sm", t("no_rooms")));
    return sec;
  }

  const list = el("div", "room-list");
  rooms.forEach((r) => {
    const item = el("div", "room-item");
    const head = el("div", "row-between");
    head.appendChild(el("b", null, r.name || roomTypeLabel(r.type)));
    head.appendChild(el("span", "pill", roomTypeLabel(r.type)));
    item.appendChild(head);

    const details = el("div", "room-details");
    if (r.floorLevel) details.appendChild(el("span", "muted sm", `${t("floor_level")}: ${r.floorLevel}`));
    if (r.dimensions) details.appendChild(el("span", "muted sm", `${t("dimensions")}: ${r.dimensions}`));
    if (r.flooring) details.appendChild(el("span", "muted sm", `${t("flooring")}: ${r.flooring}`));
    if (r.wallColor) details.appendChild(el("span", "muted sm", `${t("wall_color")}: ${r.wallColor}`));
    if (r.ceilingColor) details.appendChild(el("span", "muted sm", `${t("ceiling_color")}: ${r.ceilingColor}`));
    if (r.windowType) details.appendChild(el("span", "muted sm", `${t("window_type")}: ${r.windowType}`));
    if (details.children.length) item.appendChild(details);

    if (r.notes) item.appendChild(el("p", "muted sm", r.notes));

    if (r.photoId) {
      const photo = Store.photo(r.photoId);
      if (photo) {
        const thumb = el("div", "thumb room-thumb");
        const img = el("img");
        img.src = photo.dataUrl;
        img.alt = r.name;
        img.loading = "lazy";
        thumb.appendChild(img);
        item.appendChild(thumb);
      }
    }

    const acts = el("div", "card-actions");
    acts.appendChild(btn(t("edit"), "btn ghost sm", () => openRoomModal(p, r)));
    if (_me() && _me().role === "owner") {
      acts.appendChild(btn(t("delete"), "btn ghost sm danger", () => {
        if (!confirm(t("delete_confirm"))) return;
        Store.deleteRoom(p.id, r.id);
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

/* -------------------------------------------------- appliances section */
function renderAppliancesSection(p) {
  const sec = el("section", "card");
  sec.appendChild(sectionHeader("appliances", t("add"), () => openApplianceModal(p)));

  const appliances = p.appliances || [];
  if (!appliances.length) {
    sec.appendChild(el("p", "muted sm", t("no_appliances")));
    return sec;
  }

  const list = el("div", "appliance-list");
  appliances.forEach((a) => {
    const item = el("div", "appliance-item");
    const head = el("div", "row-between");
    head.appendChild(el("b", null, a.name || applianceTypeLabel(a.type)));
    head.appendChild(el("span", "pill", applianceTypeLabel(a.type)));
    item.appendChild(head);

    const details = el("div", "appliance-details");
    if (a.brand) details.appendChild(el("span", "muted sm", `${t("brand")}: ${a.brand}`));
    if (a.model) details.appendChild(el("span", "muted sm", `${t("model")}: ${a.model}`));
    if (a.serialNumber) details.appendChild(el("span", "muted sm", `${t("serial_number")}: ${a.serialNumber}`));
    if (a.yearInstalled) details.appendChild(el("span", "muted sm", `${t("year_installed")}: ${a.yearInstalled}`));
    if (a.warrantyExpiry) details.appendChild(el("span", "muted sm", `${t("warranty_expiry")}: ${a.warrantyExpiry}`));
    if (a.room) details.appendChild(el("span", "muted sm", `${t("room")}: ${a.room}`));
    if (details.children.length) item.appendChild(details);

    if (a.notes) item.appendChild(el("p", "muted sm", a.notes));

    if (a.photoId) {
      const photo = Store.photo(a.photoId);
      if (photo) {
        const thumb = el("div", "thumb appliance-thumb");
        const img = el("img");
        img.src = photo.dataUrl;
        img.alt = a.name;
        img.loading = "lazy";
        thumb.appendChild(img);
        item.appendChild(thumb);
      }
    }

    const acts = el("div", "card-actions");
    acts.appendChild(btn(t("edit"), "btn ghost sm", () => openApplianceModal(p, a)));
    if (_me() && _me().role === "owner") {
      acts.appendChild(btn(t("delete"), "btn ghost sm danger", () => {
        if (!confirm(t("delete_confirm"))) return;
        Store.deleteAppliance(p.id, a.id);
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

/* --------------------------------------------------- materials section */
function renderMaterialsSection(p) {
  const sec = el("section", "card");
  sec.appendChild(sectionHeader("materials", t("add"), () => openMaterialModal(p)));

  const materials = p.materials || [];
  if (!materials.length) {
    sec.appendChild(el("p", "muted sm", t("no_materials")));
    return sec;
  }

  const list = el("div", "material-list");
  materials.forEach((m) => {
    const item = el("div", "material-item");
    const head = el("div", "row-between");
    head.appendChild(el("b", null, m.name || materialTypeLabel(m.type)));
    head.appendChild(el("span", "pill", materialTypeLabel(m.type)));
    item.appendChild(head);

    const details = el("div", "material-details");
    if (m.color) details.appendChild(el("span", "muted sm", `${t("color")}: ${m.color}`));
    if (m.finish) details.appendChild(el("span", "muted sm", `${t("finish")}: ${m.finish}`));
    if (m.brand) details.appendChild(el("span", "muted sm", `${t("brand")}: ${m.brand}`));
    if (m.productCode) details.appendChild(el("span", "muted sm", `${t("product_code")}: ${m.productCode}`));
    if (m.room) details.appendChild(el("span", "muted sm", `${t("room")}: ${m.room}`));
    if (m.dateInstalled) details.appendChild(el("span", "muted sm", `${t("date_installed")}: ${m.dateInstalled}`));
    if (details.children.length) item.appendChild(details);

    if (m.notes) item.appendChild(el("p", "muted sm", m.notes));

    if (m.photoId) {
      const photo = Store.photo(m.photoId);
      if (photo) {
        const thumb = el("div", "thumb material-thumb");
        const img = el("img");
        img.src = photo.dataUrl;
        img.alt = m.name;
        img.loading = "lazy";
        thumb.appendChild(img);
        item.appendChild(thumb);
      }
    }

    const acts = el("div", "card-actions");
    acts.appendChild(btn(t("edit"), "btn ghost sm", () => openMaterialModal(p, m)));
    if (_me() && _me().role === "owner") {
      acts.appendChild(btn(t("delete"), "btn ghost sm danger", () => {
        if (!confirm(t("delete_confirm"))) return;
        Store.deleteMaterial(p.id, m.id);
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

function openRoomModal(p, existing = null) {
  const editing = !!existing;
  const body = el("div", "stack");

  const nameInp = input("name", { value: existing ? existing.name : "", placeholder: "e.g. Master Bedroom" });
  body.appendChild(field("room_name", nameInp));

  const typeSel = select("type", ROOM_TYPES.map((rt) => ({
    value: rt.value, label: rt.label,
    selected: existing ? existing.type === rt.value : false,
  })));
  body.appendChild(field("room_type", typeSel));

  const floorInp = input("floorLevel", { value: existing ? existing.floorLevel : "", placeholder: "e.g. 1st floor" });
  body.appendChild(field("floor_level", floorInp));

  const dimInp = input("dimensions", { value: existing ? existing.dimensions : "", placeholder: "e.g. 12x14 ft" });
  body.appendChild(field("dimensions", dimInp));

  const floorTypeInp = input("flooring", { value: existing ? existing.flooring : "", placeholder: "e.g. Hardwood, Tile, Carpet" });
  body.appendChild(field("flooring", floorTypeInp));

  const floorColorInp = input("flooringColor", { value: existing ? existing.flooringColor : "", placeholder: "e.g. Oak, Dark Walnut" });
  body.appendChild(field("flooring_color", floorColorInp));

  const wallColorInp = input("wallColor", { value: existing ? existing.wallColor : "", placeholder: "e.g. Sherwin-Williams SW 7005" });
  body.appendChild(field("wall_color", wallColorInp));

  const ceilingColorInp = input("ceilingColor", { value: existing ? existing.ceilingColor : "", placeholder: "e.g. Flat White" });
  body.appendChild(field("ceiling_color", ceilingColorInp));

  const trimColorInp = input("trimColor", { value: existing ? existing.trimColor : "", placeholder: "e.g. Semi-gloss White" });
  body.appendChild(field("trim_color", trimColorInp));

  const windowTypeInp = input("windowType", { value: existing ? existing.windowType : "", placeholder: "e.g. Double-hung, Casement" });
  body.appendChild(field("window_type", windowTypeInp));

  const windowCountInp = input("windowCount", { value: existing ? existing.windowCount : "", placeholder: "e.g. 2" });
  body.appendChild(field("window_count", windowCountInp));

  const notesTa = textarea("notes", { rows: 3 });
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
        caption: nameInp.value || "Room photo", kind: "other",
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

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
  actions.appendChild(btn(t("save"), "btn", () => {
    const data = {
      name: nameInp.value.trim(),
      type: typeSel.value,
      floorLevel: floorInp.value.trim(),
      dimensions: dimInp.value.trim(),
      flooring: floorTypeInp.value.trim(),
      flooringColor: floorColorInp.value.trim(),
      wallColor: wallColorInp.value.trim(),
      ceilingColor: ceilingColorInp.value.trim(),
      trimColor: trimColorInp.value.trim(),
      windowType: windowTypeInp.value.trim(),
      windowCount: windowCountInp.value.trim(),
      notes: notesTa.value.trim(),
      photoId,
    };
    if (editing) Store.updateRoom(p.id, existing.id, data);
    else Store.addRoom(p.id, data);
    closeModal(m);
    toast(t("saved"), "good");
    _render();
  }));
  body.appendChild(actions);

  const m = modal(editing ? "edit" : "add_room", body);
  document.body.appendChild(m);
  openModal(m);
}

function openApplianceModal(p, existing = null) {
  const editing = !!existing;
  const body = el("div", "stack");

  const nameInp = input("name", { value: existing ? existing.name : "", placeholder: "e.g. Central AC Unit" });
  body.appendChild(field("appliance_name", nameInp));

  const typeSel = select("type", APPLIANCE_TYPES.map((at) => ({
    value: at.value, label: at.label,
    selected: existing ? existing.type === at.value : false,
  })));
  body.appendChild(field("appliance_type", typeSel));

  const brandInp = input("brand", { value: existing ? existing.brand : "", placeholder: "e.g. Carrier, Trane" });
  body.appendChild(field("brand", brandInp));

  const modelInp = input("model", { value: existing ? existing.model : "", placeholder: "e.g. ABC123" });
  body.appendChild(field("model", modelInp));

  const serialInp = input("serialNumber", { value: existing ? existing.serialNumber : "", placeholder: "e.g. SN123456789" });
  body.appendChild(field("serial_number", serialInp));

  const yearInp = input("yearInstalled", { value: existing ? existing.yearInstalled : "", placeholder: "e.g. 2020" });
  body.appendChild(field("year_installed", yearInp));

  const warrantyInp = input("warrantyExpiry", { value: existing ? existing.warrantyExpiry : "", placeholder: "e.g. 2030-01-01" });
  body.appendChild(field("warranty_expiry", warrantyInp));

  const roomInp = input("room", { value: existing ? existing.room : "", placeholder: "e.g. Basement" });
  body.appendChild(field("room", roomInp));

  const notesTa = textarea("notes", { rows: 3 });
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
        caption: nameInp.value || "Appliance photo", kind: "other",
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

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
  actions.appendChild(btn(t("save"), "btn", () => {
    const data = {
      name: nameInp.value.trim(),
      type: typeSel.value,
      brand: brandInp.value.trim(),
      model: modelInp.value.trim(),
      serialNumber: serialInp.value.trim(),
      yearInstalled: yearInp.value.trim(),
      warrantyExpiry: warrantyInp.value.trim(),
      room: roomInp.value.trim(),
      notes: notesTa.value.trim(),
      photoId,
    };
    if (editing) Store.updateAppliance(p.id, existing.id, data);
    else Store.addAppliance(p.id, data);
    closeModal(m);
    toast(t("saved"), "good");
    _render();
  }));
  body.appendChild(actions);

  const m = modal(editing ? "edit" : "add_appliance", body);
  document.body.appendChild(m);
  openModal(m);
}

function openMaterialModal(p, existing = null) {
  const editing = !!existing;
  const body = el("div", "stack");

  const nameInp = input("name", { value: existing ? existing.name : "", placeholder: "e.g. Kitchen Countertop" });
  body.appendChild(field("material_name", nameInp));

  const typeSel = select("type", MATERIAL_TYPES.map((mt) => ({
    value: mt.value, label: mt.label,
    selected: existing ? existing.type === mt.value : false,
  })));
  body.appendChild(field("material_type", typeSel));

  const colorInp = input("color", { value: existing ? existing.color : "", placeholder: "e.g. Navajo White" });
  body.appendChild(field("color", colorInp));

  const finishInp = input("finish", { value: existing ? existing.finish : "", placeholder: "e.g. Matte, Gloss" });
  body.appendChild(field("finish", finishInp));

  const brandInp = input("brand", { value: existing ? existing.brand : "", placeholder: "e.g. Benjamin Moore" });
  body.appendChild(field("brand", brandInp));

  const productCodeInp = input("productCode", { value: existing ? existing.productCode : "", placeholder: "e.g. BM-OC-15" });
  body.appendChild(field("product_code", productCodeInp));

  const roomInp = input("room", { value: existing ? existing.room : "", placeholder: "e.g. Kitchen" });
  body.appendChild(field("room", roomInp));

  const dateInp = input("dateInstalled", { type: "date", value: existing ? (existing.dateInstalled || "") : "" });
  body.appendChild(field("date_installed", dateInp));

  const notesTa = textarea("notes", { rows: 3 });
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
        caption: nameInp.value || "Material photo", kind: "other",
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

  const actions = el("div", "modal-actions");
  actions.appendChild(btn(t("cancel"), "btn ghost", () => closeModal(m)));
  actions.appendChild(btn(t("save"), "btn", () => {
    const data = {
      name: nameInp.value.trim(),
      type: typeSel.value,
      color: colorInp.value.trim(),
      finish: finishInp.value.trim(),
      brand: brandInp.value.trim(),
      productCode: productCodeInp.value.trim(),
      room: roomInp.value.trim(),
      dateInstalled: dateInp.value || null,
      notes: notesTa.value.trim(),
      photoId,
    };
    if (editing) Store.updateMaterial(p.id, existing.id, data);
    else Store.addMaterial(p.id, data);
    closeModal(m);
    toast(t("saved"), "good");
    _render();
  }));
  body.appendChild(actions);

  const m = modal(editing ? "edit" : "add_material", body);
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
function roomTypeLabel(type) {
  const found = ROOM_TYPES.find((r) => r.value === type);
  return found ? found.label : type;
}

function applianceTypeLabel(type) {
  const found = APPLIANCE_TYPES.find((a) => a.value === type);
  return found ? found.label : type;
}

function materialTypeLabel(type) {
  const found = MATERIAL_TYPES.find((m) => m.value === type);
  return found ? found.label : type;
}

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
