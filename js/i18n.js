/* Verde — i18n: UI strings + automatic content translation via MyMemory (free, no key). */
"use strict";

export const LANGS = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Español", flag: "🇲🇽" },
  { code: "pt", name: "Português", flag: "🇧🇷" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "nl", name: "Nederlands", flag: "🇳🇱" },
  { code: "pl", name: "Polski", flag: "🇵🇱" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
  { code: "tr", name: "Türkçe", flag: "🇹🇷" },
  { code: "ar", name: "العربية", flag: "🇸🇦", rtl: true },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳" },
  { code: "zh", name: "中文", flag: "🇨🇳" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "한국어", flag: "🇰🇷" },
  { code: "tl", name: "Filipino", flag: "🇵🇭" },
  { code: "vi", name: "Tiếng Việt", flag: "🇻🇳" },
];

/* UI dictionary. Anything missing falls back to English. */
const STRINGS = {
  en: {
    app_name: "Verde", tagline: "Landscaping, organised.",
    login: "Log in", signup: "Create account", logout: "Log out",
    email: "Email", password: "Password", name: "Full name",
    role: "I am a", owner: "Land owner", worker: "Gardener / worker",
    language: "Primary language", continue: "Continue",
    dashboard: "Dashboard", properties: "Properties", tasks: "Tasks", map: "Map",
    photos: "Photos", settings: "Settings", profile: "Profile",
    add_property: "Add property", add_task: "Add task", add_photo: "Add photo",
    property_name: "Property name", address: "Address", notes: "Notes",
    task_title: "What needs doing?", task_desc: "Describe the change you want",
    priority: "Priority", high: "High", normal: "Normal", low: "Low",
    status: "Status", open: "Open", doing: "In progress", done: "Done",
    save: "Save", cancel: "Cancel", delete: "Delete", edit: "Edit",
    take_photo: "Take / choose a photo", caption: "Caption",
    mark_done: "Mark done", reopen: "Reopen", assign_worker: "Assign worker",
    unassigned: "Unassigned", assigned_to: "Assigned to", my_properties: "My properties",
    open_tasks: "Open", in_progress: "In progress", completed: "Completed",
    no_properties: "No properties yet.", no_tasks: "Nothing here yet.",
    drop_pin: "Tap the map to drop a pin", use_my_location: "Use my location",
    demo_login: "Try the demo", welcome: "Welcome back",
    stats_props: "Properties", stats_open: "Open tasks", stats_done: "Completed",
    stats_photos: "Photos", location: "Location", captured: "Captured",
    request_change: "Request a change", change_requests: "Change requests",
    worker_view: "Worker view", owner_view: "Owner view",
    search: "Search", filter: "Filter", all: "All",
    delete_confirm: "Delete this permanently?", required: "Please fill in all fields.",
    email_taken: "That email is already registered.", bad_password: "Wrong password.",
    no_account: "No account with that email.", weak_password: "Password must be 6+ characters.",
    bad_email: "That email doesn't look right.", missing_fields: "Please fill in all fields.",
    saved: "Saved", translated: "Auto-translated",
  },
  es: {
    app_name: "Verde", tagline: "Jardinería, organizada.",
    login: "Iniciar sesión", signup: "Crear cuenta", logout: "Salir",
    email: "Correo", password: "Contraseña", name: "Nombre completo",
    role: "Soy", owner: "Dueño del terreno", worker: "Jardinero / trabajador",
    language: "Idioma principal", continue: "Continuar",
    dashboard: "Panel", properties: "Propiedades", tasks: "Tareas", map: "Mapa",
    photos: "Fotos", settings: "Ajustes", profile: "Perfil",
    add_property: "Agregar propiedad", add_task: "Agregar tarea", add_photo: "Agregar foto",
    property_name: "Nombre de la propiedad", address: "Dirección", notes: "Notas",
    task_title: "¿Qué hay que hacer?", task_desc: "Describe el cambio que quieres",
    priority: "Prioridad", high: "Alta", normal: "Normal", low: "Baja",
    status: "Estado", open: "Pendiente", doing: "En progreso", done: "Hecho",
    save: "Guardar", cancel: "Cancelar", delete: "Eliminar", edit: "Editar",
    take_photo: "Tomar / elegir una foto", caption: "Descripción",
    mark_done: "Marcar hecho", reopen: "Reabrir", assign_worker: "Asignar trabajador",
    unassigned: "Sin asignar", assigned_to: "Asignado a", my_properties: "Mis propiedades",
    open_tasks: "Pendientes", in_progress: "En progreso", completed: "Completadas",
    no_properties: "Aún no hay propiedades.", no_tasks: "Nada aquí todavía.",
    drop_pin: "Toca el mapa para poner un marcador", use_my_location: "Usar mi ubicación",
    demo_login: "Probar la demo", welcome: "Bienvenido de nuevo",
    stats_props: "Propiedades", stats_open: "Tareas pendientes", stats_done: "Completadas",
    stats_photos: "Fotos", location: "Ubicación", captured: "Capturado",
    request_change: "Solicitar un cambio", change_requests: "Solicitudes de cambio",
    worker_view: "Vista de trabajador", owner_view: "Vista de dueño",
    search: "Buscar", filter: "Filtrar", all: "Todas",
    delete_confirm: "¿Eliminar permanentemente?", required: "Completa todos los campos.",
    email_taken: "Ese correo ya está registrado.", bad_password: "Contraseña incorrecta.",
    no_account: "No hay cuenta con ese correo.", weak_password: "La contraseña necesita 6+ caracteres.",
    bad_email: "Ese correo no parece válido.", missing_fields: "Completa todos los campos.",
    saved: "Guardado", translated: "Traducido automáticamente",
  },
};

/* Extra UI keys for other languages — fall back to English when absent. */
for (const l of LANGS) {
  if (!STRINGS[l.code]) STRINGS[l.code] = {};
}

let current = "en";
export function setLang(code) {
  current = STRINGS[code] ? code : "en";
  const meta = LANGS.find((l) => l.code === current);
  document.documentElement.lang = current;
  document.documentElement.dir = meta && meta.rtl ? "rtl" : "ltr";
  return current;
}
export function getLang() { return current; }

export function t(key) {
  return (STRINGS[current] && STRINGS[current][key]) || STRINGS.en[key] || key;
}

/* ---------------------------------------------------- content translation */
const cache = new Map();   // "lang::text" -> translated
const inflight = new Map();

async function translateOne(text, target) {
  const key = target + "::" + text;
  if (cache.has(key)) return cache.get(key);
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const url = "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(text.slice(0, 480)) + "&langpair=en|" + target;
      const res = await fetch(url);
      const j = await res.json();
      const out = (j && j.responseData && j.responseData.translatedText) || text;
      // MyMemory sometimes returns an error string; guard against it
      if (/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(out)) return text;
      cache.set(key, out);
      return out;
    } catch {
      return text;   // offline / blocked -> show original
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/**
 * Translates a list of texts into the active language, in parallel.
 * Returns the originals untouched when the language is English.
 */
export async function translateAll(texts, target = current) {
  if (target === "en") return texts;
  const clean = texts.map((x) => (x == null ? "" : String(x)));
  return Promise.all(clean.map((x) => (x.trim() ? translateOne(x, target) : x)));
}

export function translateText(text, target = current) {
  return translateOne(String(text || ""), target);
}

/** Fill every [data-i18n] element in the DOM. */
export function applyStaticI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-ph"));
  });
}
