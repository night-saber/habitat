/* Habitat — UI primitives: DOM helpers, toasts, modals, pagination, lazy render. */
"use strict";
import { t } from "./i18n.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------------------------------------------------- elements */
export function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function btn(label, cls, onClick, opts = {}) {
  const b = el("button", cls || "btn");
  b.type = opts.type || "button";
  b.textContent = label;
  if (onClick) b.onclick = onClick;
  if (opts.i18n) b.setAttribute("data-i18n", opts.i18n);
  if (opts.title) b.title = opts.title;
  return b;
}

export function field(labelKey, input, opts = {}) {
  const w = el("label", "field");
  const span = el("span", null, t(labelKey));
  span.setAttribute("data-i18n", labelKey);
  w.appendChild(span);
  w.appendChild(input);
  if (opts.hint) {
    const h = el("small", "hint", opts.hint);
    w.appendChild(h);
  }
  return w;
}

export function input(name, opts = {}) {
  const i = el("input");
  i.name = name;
  i.type = opts.type || "text";
  if (opts.required) i.required = true;
  if (opts.placeholder) i.placeholder = opts.placeholder;
  if (opts.value != null) i.value = opts.value;
  if (opts.autocomplete) i.autocomplete = opts.autocomplete;
  if (opts.minlength) i.minlength = opts.minlength;
  if (opts.id) i.id = opts.id;
  if (opts.inputmode) i.inputMode = opts.inputmode;
  return i;
}

export function select(name, options, opts = {}) {
  const s = el("select");
  s.name = name;
  if (opts.id) s.id = opts.id;
  options.forEach((o) => {
    const opt = el("option");
    opt.value = o.value;
    opt.textContent = o.label;
    if (o.i18n) opt.setAttribute("data-i18n", o.i18n);
    if (o.selected) opt.selected = true;
    s.appendChild(opt);
  });
  return s;
}

export function textarea(name, opts = {}) {
  const ta = el("textarea");
  ta.name = name;
  ta.rows = opts.rows || 3;
  if (opts.placeholder) ta.placeholder = opts.placeholder;
  return ta;
}

export function empty(text, actionLabel, onClick, icon) {
  const d = el("div", "empty");
  if (icon) d.appendChild(el("div", "empty-icon", icon));
  d.appendChild(el("p", null, text));
  if (actionLabel && onClick) d.appendChild(btn(actionLabel, "btn", onClick));
  return d;
}

export function sectionHeader(titleKey, actionLabel, onClick) {
  const hd = el("div", "row-between");
  const h = el("h3", null, t(titleKey));
  h.setAttribute("data-i18n", titleKey);
  hd.appendChild(h);
  if (actionLabel && onClick) hd.appendChild(btn(actionLabel, "btn sm", onClick));
  return hd;
}

/* --------------------------------------------------------------- modals */
let openStack = [];

export function openModal(node) {
  node.hidden = false;
  document.body.classList.add("modal-open");
  if (!openStack.includes(node)) openStack.push(node);
  const focusable = node.querySelector("input, select, textarea, button");
  if (focusable) setTimeout(() => focusable.focus(), 40);
}

export function closeModal(node) {
  if (!node) return;
  node.hidden = true;
  openStack = openStack.filter((n) => n !== node);
  if (!openStack.length) document.body.classList.remove("modal-open");
}

export function closeTopModal() {
  const top = openStack[openStack.length - 1];
  if (top) closeModal(top);
  return !!top;
}

/** Build a modal shell with a title and a body, wired to close on backdrop/Esc. */
export function modal(titleKey, bodyNode, opts = {}) {
  const m = el("div", "modal");
  m.hidden = true;
  m.setAttribute("role", "dialog");
  m.setAttribute("aria-modal", "true");
  const back = el("div", "modal-backdrop");
  back.onclick = () => closeModal(m);
  m.appendChild(back);

  const card = el("div", "modal-card");
  if (opts.wide) card.classList.add("wide");
  const x = el("button", "x", "×");
  x.setAttribute("aria-label", "Close");
  x.onclick = () => closeModal(m);
  card.appendChild(x);

  if (titleKey) {
    const h = el("h3", null, t(titleKey));
    h.setAttribute("data-i18n", titleKey);
    card.appendChild(h);
  }
  card.appendChild(bodyNode);
  m.appendChild(card);
  return m;
}

/* --------------------------------------------------------------- toasts */
let toastHost = null;

function host() {
  if (!toastHost || !document.body.contains(toastHost)) {
    toastHost = el("div", "toast-host");
    document.body.appendChild(toastHost);
  }
  return toastHost;
}

export function toast(message, kind = "info", ms = 2400, actionLabel, onAction) {
  const n = el("div", "toast " + kind);
  n.setAttribute("role", "status");
  n.appendChild(el("span", null, message));
  if (actionLabel && onAction) {
    const b = el("button", "toast-action", actionLabel);
    b.onclick = () => { onAction(); n.remove(); };
    n.appendChild(b);
  }
  host().appendChild(n);
  requestAnimationFrame(() => n.classList.add("in"));
  setTimeout(() => {
    n.classList.remove("in");
    setTimeout(() => n.remove(), 200);
  }, ms);
  return n;
}

/* --------------------------------------------------------------- paging */
/**
 * Renders `items` through `renderItem`, showing `perPage` at a time with a
 * "show more" control. Keeps the DOM small so long lists stay responsive.
 */
export function paginate(container, items, renderItem, perPage = 12) {
  container.innerHTML = "";
  if (!items.length) return;
  let shown = 0;

  function drawMore() {
    const slice = items.slice(shown, shown + perPage);
    slice.forEach((it, i) => {
      const node = renderItem(it, shown + i);
      node.style.animationDelay = (i * 18) + "ms";
      node.classList.add("stagger");
      container.appendChild(node);
    });
    shown += slice.length;
    if (moreBtn) moreBtn.remove();
    if (shown < items.length) {
      moreBtn = btn(
        `${t("show_more")} (${items.length - shown})`,
        "btn ghost more-btn",
        drawMore
      );
      container.appendChild(moreBtn);
    }
  }

  let moreBtn = null;
  drawMore();
}

/* ------------------------------------------------------------- misc util */
export function debounce(fn, ms = 220) {
  let h = null;
  return (...args) => {
    clearTimeout(h);
    h = setTimeout(() => fn(...args), ms);
  };
}

export function relTime(iso) {
  if (!iso) return "";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m";
  if (d < 86400) return Math.floor(d / 3600) + "h";
  if (d < 604800) return Math.floor(d / 86400) + "d";
  return new Date(iso).toLocaleDateString();
}

export function dateLabel(iso) {
  if (!iso) return "";
  return new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString();
}

export function daysUntil(iso) {
  if (!iso) return null;
  const a = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  const b = new Date();
  return Math.ceil((a - b) / 86400000);
}

export function dueLabel(iso) {
  const d = daysUntil(iso);
  if (d == null) return null;
  if (d < 0) return { text: t("overdue"), kind: "bad" };
  if (d === 0) return { text: t("due_today"), kind: "warn" };
  if (d === 1) return { text: "1 " + t("days_left"), kind: "warn" };
  return { text: `${d} ${t("days_left")}`, kind: d <= 3 ? "warn" : "ok" };
}

export function initial(name) {
  return (String(name || "?").trim().charAt(0) || "?").toUpperCase();
}

export function avatarColour(id) {
  let h = 0;
  const s = String(id || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 45%)`;
}

/** Downscale + JPEG-compress an image file so photos fit in storage. */
export function compressImage(file, maxDim = 1280, quality = 0.7) {
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
      img.onerror = () => reject(new Error("bad_image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  // fallback for non-secure contexts
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return Promise.resolve(ok);
  } catch {
    return Promise.resolve(false);
  }
}
