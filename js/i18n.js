/* Habitat — i18n: UI strings + automatic content translation (MyMemory, free, no key). */
"use strict";

export const LANGS = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "pt", name: "Português" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "it", name: "Italiano" },
  { code: "nl", name: "Nederlands" },
  { code: "pl", name: "Polski" },
  { code: "ru", name: "Русский" },
  { code: "tr", name: "Türkçe" },
  { code: "ar", name: "العربية", rtl: true },
  { code: "hi", name: "हिन्दी" },
  { code: "zh", name: "中文" },
  { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" },
  { code: "tl", name: "Filipino" },
  { code: "vi", name: "Tiếng Việt" },
  { code: "sv", name: "Svenska" },
  { code: "no", name: "Norsk" },
  { code: "da", name: "Dansk" },
  { code: "fi", name: "Suomi" },
  { code: "cs", name: "Čeština" },
  { code: "hu", name: "Magyar" },
  { code: "ro", name: "Română" },
  { code: "el", name: "Ελληνικά" },
  { code: "th", name: "ไทย" },
  { code: "id", name: "Bahasa Indonesia" },
  { code: "uk", name: "Українська" },
  { code: "he", name: "עברית", rtl: true },
  { code: "bn", name: "বাংলা" },
  { code: "ta", name: "தமிழ்" },
  { code: "te", name: "తెలుగు" },
  { code: "mr", name: "मराठी" },
  { code: "gu", name: "ગુજરાતી" },
  { code: "pa", name: "ਪੰਜਾਬੀ" },
  { code: "kn", name: "ಕನ್ನಡ" },
  { code: "ml", name: "മലയാളം" },
  { code: "si", name: "සිංහල" },
  { code: "ne", name: "नेपाली" },
  { code: "km", name: "ខ្មែរ" },
  { code: "lo", name: "ລາວ" },
  { code: "my", name: "မြန်မာ" },
  { code: "mn", name: "Монгол" },
  { code: "kk", name: "Қазақ" },
  { code: "uz", name: "Oʻzbek" },
  { code: "az", name: "Azərbaycan" },
  { code: "hy", name: "Հայերեն" },
  { code: "ka", name: "ქართული" },
  { code: "sq", name: "Shqip" },
  { code: "bs", name: "Bosanski" },
  { code: "sr", name: "Српски" },
  { code: "hr", name: "Hrvatski" },
  { code: "sl", name: "Slovenščina" },
  { code: "mk", name: "Македонски" },
  { code: "be", name: "Беларуская" },
  { code: "lt", name: "Lietuvių" },
  { code: "lv", name: "Latviešu" },
  { code: "et", name: "Eesti" },
  { code: "is", name: "Íslenska" },
  { code: "ga", name: "Gaeilge" },
  { code: "cy", name: "Cymraeg" },
  { code: "ca", name: "Català" },
  { code: "eu", name: "Euskara" },
  { code: "gl", name: "Galego" },
];

const STRINGS = {
  en: {
    app_name: "Habitat", tagline: "Property, organised.",
    login: "Log in", signup: "Create account", logout: "Log out",
    email: "Email", password: "Password", name: "Full name",
    role: "I am a", owner: "Property owner", worker: "Trade worker",
    language: "Primary language", continue: "Continue",
    dashboard: "Dashboard", properties: "Properties", tasks: "Tasks", map: "Map",
    photos: "Photos", crews: "Crews", people: "People", activity: "Activity",
    settings: "Settings", profile: "Profile",
    add_property: "Add property", add_task: "Add task", add_photo: "Add photo",
    new_crew: "New crew", edit_crew: "Edit crew", delete_crew: "Delete crew",
    crew_name: "Crew name", crew_desc: "What this crew handles",
    crew_colour: "Colour", members: "Members", add_members: "Add members",
    no_crews: "No crews yet. Group your workers so you can assign a whole crew to a property at once.",
    crew: "Crew", crews_assigned: "Crews assigned", assigned_directly: "Assigned directly",
    property_name: "Property name", address: "Address", notes: "Notes",
    task_title: "What needs doing?", task_desc: "Describe the change you want",
    priority: "Priority", high: "High", normal: "Normal", low: "Low",
    status: "Status", open: "Open", doing: "In progress", done: "Done",
    overdue: "Overdue", due: "Due", due_date: "Due date", no_due: "No due date",
    assignee: "Assigned to", anyone: "Anyone in the crew",
    save: "Save", cancel: "Cancel", delete: "Delete", edit: "Edit", undo: "Undo",
    take_photo: "Take / choose a photo", caption: "Caption",
    mark_done: "Mark done", start: "Start", reopen: "Reopen",
    assign_worker: "Assign worker", assign_crew: "Assign crew",
    unassigned: "Unassigned", assigned_to: "Assigned to", my_properties: "My properties",
    open_tasks: "Open", in_progress: "In progress", completed: "Completed",
    no_properties: "No properties yet.", no_tasks: "Nothing here yet.",
    no_photos: "No photos yet.", no_activity: "No activity yet.",
    drop_pin: "Tap the map to drop a pin", use_my_location: "Use my location",
    demo_login: "Try the demo", welcome: "Welcome back",
    stats_props: "Properties", stats_open: "Open tasks", stats_done: "Completed",
    stats_photos: "Photos", stats_overdue: "Overdue",
    location: "Location", captured: "Captured",
    request_change: "Request a change", change_requests: "Change requests",
    search: "Search", search_ph: "Search tasks, properties, crews…",
    filter: "Filter", all: "All", sort: "Sort", sort_priority: "Priority",
    sort_newest: "Newest", sort_due: "Due date", sort_title: "Title",
    delete_confirm: "Delete this permanently?", required: "Please fill in all fields.",
    email_taken: "That email is already registered.", bad_password: "Wrong password.",
    no_account: "No account with that email.", weak_password: "Password must be 8+ characters.",
    bad_email: "That email doesn't look right.", missing_fields: "Please fill in all fields.",
    account_disabled: "This account has been disabled.",
    saved: "Saved", translated: "Auto-translated", loading: "Loading…",
    forgot_password: "Forgot your password?", reset_password: "Reset password",
    reset_with_code: "Reset with a recovery code", recovery_code: "Recovery code",
    new_password: "New password", confirm_password: "Confirm new password",
    save_recovery_code: "Save your recovery code",
    recovery_explain: "This is the only way to get back into your account if you forget your password. Write it down and keep it somewhere safe — it will not be shown again.",
    copy_code: "Copy code", copied: "Copied",
    i_saved_it: "I've saved it — continue",
    change_password: "Change password", current_password: "Current password",
    passwords_dont_match: "Those passwords don't match.",
    bad_code: "That recovery code isn't right.", no_recovery: "No recovery code on this account.",
    regenerate_code: "Generate a new recovery code",
    my_recovery: "My recovery code", show_code: "Show code",
    last_seen: "Last seen", joined: "Joined", never: "Never",
    enable: "Enable", disable: "Disable", disabled: "Disabled",
    role_owner: "Property owner", role_worker: "Trade worker",
    in_crews: "In crews", no_crews_yet: "Not in a crew yet",
    storage: "Storage", storage_used: "used by photos",
    storage_warning: "Photo storage is getting full. Delete some old photos.",
    export_data: "Export data", import_data: "Import data",
    reset_all: "Erase all data", offline: "Offline — changes saved locally",
    back_online: "Back online", more: "More", show_more: "Show more",
    created_by: "Created by", comments: "Comments", add_comment: "Add a comment…",
    post: "Post", no_comments: "No comments yet.",
    overview: "Overview", crew_of: "Crew", completion: "Completion",
    days_left: "days left", due_today: "Due today",
    all_properties: "All properties", unassigned_tasks: "Unassigned",
    trade: "Trade",
    worker_mode: "Worker mode", worker_mode_on: "Worker mode ON", worker_mode_off: "Worker mode OFF",
    quick_phrases: "Quick phrases", phrasebook: "Phrasebook", phrase_inserted: "Phrase inserted",
    read_aloud: "Read aloud", stop_reading: "Stop",
    trade_general: "General", trade_plumbing: "Plumbing",
        trade_electrical: "Electrical", trade_landscaping: "Landscaping",
        trade_hvac: "HVAC", trade_roofing: "Roofing",
    category_safety: "Safety", category_materials: "Materials",
    category_tools: "Tools", category_scheduling: "Scheduling",
    property_info: "Property Info", system_details: "System Details",
    utility_locations: "Utility Locations", documents: "Documents",
    maintenance_history: "Maintenance History", property_notes: "Property Notes",
    no_utilities: "No utility locations added yet.",
    no_documents: "No documents added yet.",
    no_maintenance: "No maintenance history yet.",
    no_notes: "No notes yet.",
    utility_type: "Utility Type", label: "Label",
    category: "Category", date: "Date", description: "Description",
    add_utility: "Add Utility", add_document: "Add Document",
    roof_type: "Roof Type", roof_age: "Roof Age",
    hvac_type: "HVAC Type", hvac_age: "HVAC Age",
    plumbing_type: "Plumbing Type", insulation_type: "Insulation Type",
    foundation_type: "Foundation Type", square_footage: "Square Footage",
    year_built: "Year Built",
    scan: "3D Scan", scan_title: "3D Property Scanner",
    select_property: "Select a property", scan_name_ph: "Scan name (optional)",
    start_scanning: "Start scanning", stop_scanning: "Stop scanning",
    scanning: "Scanning", frames: "frames", points: "points",
    camera_off: "Camera is off", camera_error: "Could not access camera",
    camera_unsupported: "Camera not supported on this device",
    webgl_error: "WebGL is not available on this device",
    no_points_yet: "No points yet — start scanning to build a 3D model",
    saved_scans: "Saved scans", no_scans_yet: "No saved scans for this property yet.",
    load: "Load", loaded: "Loaded", clear: "Clear", clear_confirm: "Clear all points?",
    export: "Export", reset_view: "Reset view",
    // Rooms
    rooms: "Rooms", room_name: "Room name", room_type: "Room type",
    floor_level: "Floor level", dimensions: "Dimensions",
    flooring: "Flooring", flooring_color: "Flooring color",
    wall_color: "Wall color", ceiling_color: "Ceiling color",
    trim_color: "Trim color", window_type: "Window type",
    window_count: "Window count", add_room: "Add Room",
    no_rooms: "No rooms added yet.",
    // Appliances
    appliances: "Appliances", appliance_name: "Appliance name",
    appliance_type: "Appliance type", brand: "Brand", model: "Model",
    serial_number: "Serial number", year_installed: "Year installed",
    warranty_expiry: "Warranty expiry", room: "Room",
    add_appliance: "Add Appliance", no_appliances: "No appliances added yet.",
    // Materials
    materials: "Materials", material_name: "Material name",
    material_type: "Material type", color: "Color", finish: "Finish",
    product_code: "Product code", date_installed: "Date installed",
    add_material: "Add Material", no_materials: "No materials added yet.",
    // Worker location & nearby search
    my_service_area: "My Service Area", not_set: "Not set",
    service_radius_km: "Service radius (km)",
    service_area_explain: "Set your location so property owners can find you nearby. Only owners searching for workers will see your location.",
    find_workers_near: "Find Workers Near Me",
    search_location: "Search location", search_radius_km: "Search radius (km)",
    search: "Search", set_location_first: "Please set your location first",
    no_workers_found: "No workers found in this area.",
    // Privacy
    privacy_note: "Your data is private. Workers can only see their own assignments. Owners can only see their own properties and assigned workers.",
  },
  es: {
    app_name: "Habitat", tagline: "Propiedad, organizada.",
    login: "Iniciar sesión", signup: "Crear cuenta", logout: "Salir",
    email: "Correo", password: "Contraseña", name: "Nombre completo",
    role: "Soy", owner: "Propietario", worker: "Trabajador de oficio",
    language: "Idioma principal", continue: "Continuar",
    dashboard: "Panel", properties: "Propiedades", tasks: "Tareas", map: "Mapa",
    photos: "Fotos", crews: "Equipos", people: "Personas", activity: "Actividad",
    settings: "Ajustes", profile: "Perfil",
    add_property: "Agregar propiedad", add_task: "Agregar tarea", add_photo: "Agregar foto",
    new_crew: "Nuevo equipo", edit_crew: "Editar equipo", delete_crew: "Eliminar equipo",
    crew_name: "Nombre del equipo", crew_desc: "De qué se encarga este equipo",
    crew_colour: "Color", members: "Miembros", add_members: "Agregar miembros",
    no_crews: "Aún no hay equipos. Agrupa a tus trabajadores para asignar un equipo entero a una propiedad.",
    crew: "Equipo", crews_assigned: "Equipos asignados", assigned_directly: "Asignados directamente",
    property_name: "Nombre de la propiedad", address: "Dirección", notes: "Notas",
    task_title: "¿Qué hay que hacer?", task_desc: "Describe el cambio que quieres",
    priority: "Prioridad", high: "Alta", normal: "Normal", low: "Baja",
    status: "Estado", open: "Pendiente", doing: "En progreso", done: "Hecho",
    overdue: "Atrasado", due: "Vence", due_date: "Fecha límite", no_due: "Sin fecha límite",
    assignee: "Asignado a", anyone: "Cualquiera del equipo",
    save: "Guardar", cancel: "Cancelar", delete: "Eliminar", edit: "Editar", undo: "Deshacer",
    take_photo: "Tomar / elegir una foto", caption: "Descripción",
    mark_done: "Marcar hecho", start: "Empezar", reopen: "Reabrir",
    assign_worker: "Asignar trabajador", assign_crew: "Asignar equipo",
    unassigned: "Sin asignar", assigned_to: "Asignado a", my_properties: "Mis propiedades",
    open_tasks: "Pendientes", in_progress: "En progreso", completed: "Completadas",
    no_properties: "Aún no hay propiedades.", no_tasks: "Nada aquí todavía.",
    no_photos: "Aún no hay fotos.", no_activity: "Aún no hay actividad.",
    drop_pin: "Toca el mapa para poner un marcador", use_my_location: "Usar mi ubicación",
    demo_login: "Probar la demo", welcome: "Bienvenido de nuevo",
    stats_props: "Propiedades", stats_open: "Tareas pendientes", stats_done: "Completadas",
    stats_photos: "Fotos", stats_overdue: "Atrasadas",
    location: "Ubicación", captured: "Capturado",
    request_change: "Solicitar un cambio", change_requests: "Solicitudes de cambio",
    search: "Buscar", search_ph: "Buscar tareas, propiedades, equipos…",
    filter: "Filtrar", all: "Todas", sort: "Ordenar", sort_priority: "Prioridad",
    sort_newest: "Más recientes", sort_due: "Fecha límite", sort_title: "Título",
    delete_confirm: "¿Eliminar permanentemente?", required: "Completa todos los campos.",
    email_taken: "Ese correo ya está registrado.", bad_password: "Contraseña incorrecta.",
    no_account: "No hay cuenta con ese correo.", weak_password: "La contraseña necesita 8+ caracteres.",
    bad_email: "Ese correo no parece válido.", missing_fields: "Completa todos los campos.",
    account_disabled: "Esta cuenta ha sido desactivada.",
    saved: "Guardado", translated: "Traducido automáticamente", loading: "Cargando…",
    forgot_password: "¿Olvidaste tu contraseña?", reset_password: "Restablecer contraseña",
    reset_with_code: "Restablecer con un código de recuperación", recovery_code: "Código de recuperación",
    new_password: "Nueva contraseña", confirm_password: "Confirmar nueva contraseña",
    save_recovery_code: "Guarda tu código de recuperación",
    recovery_explain: "Esta es la única forma de recuperar tu cuenta si olvidas tu contraseña. Anótalo y guárdalo en un lugar seguro — no se mostrará otra vez.",
    copy_code: "Copiar código", copied: "Copiado",
    i_saved_it: "Lo guardé — continuar",
    change_password: "Cambiar contraseña", current_password: "Contraseña actual",
    passwords_dont_match: "Esas contraseñas no coinciden.",
    bad_code: "Ese código de recuperación no es correcto.", no_recovery: "Esta cuenta no tiene código de recuperación.",
    regenerate_code: "Generar un código nuevo",
    my_recovery: "Mi código de recuperación", show_code: "Mostrar código",
    last_seen: "Última conexión", joined: "Se unió", never: "Nunca",
    enable: "Activar", disable: "Desactivar", disabled: "Desactivada",
    role_owner: "Propietario", role_worker: "Trabajador de oficio",
    in_crews: "En equipos", no_crews_yet: "Todavía no está en un equipo",
    storage: "Almacenamiento", storage_used: "usado por las fotos",
    storage_warning: "El almacenamiento de fotos se está llenando. Elimina algunas fotos antiguas.",
    export_data: "Exportar datos", import_data: "Importar datos",
    reset_all: "Borrar todos los datos", offline: "Sin conexión — cambios guardados localmente",
    back_online: "En línea otra vez", more: "Más", show_more: "Mostrar más",
    created_by: "Creado por", comments: "Comentarios", add_comment: "Añadir un comentario…",
    post: "Publicar", no_comments: "Aún no hay comentarios.",
    overview: "Resumen", crew_of: "Equipo", completion: "Progreso",
    days_left: "días restantes", due_today: "Vence hoy",
    all_properties: "Todas las propiedades", unassigned_tasks: "Sin asignar",
    trade: "Oficio",
    worker_mode: "Modo trabajador", worker_mode_on: "Modo trabajador ON", worker_mode_off: "Modo trabajador OFF",
    quick_phrases: "Frases rápidas", phrasebook: "Libro de frases", phrase_inserted: "Frase insertada",
    read_aloud: "Leer en voz alta", stop_reading: "Detener",
    trade_general: "General", trade_plumbing: "Fontanería",
        trade_electrical: "Electricidad", trade_landscaping: "Jardinería",
        trade_hvac: "Climatización", trade_roofing: "Techado",
    category_safety: "Seguridad", category_materials: "Materiales",
    category_tools: "Herramientas", category_scheduling: "Programación",
  },
};

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
/* Translations persist in localStorage so repeat views cost no requests. */
const MEM = new Map();
let PERSIST = {};
try { PERSIST = JSON.parse(localStorage.getItem("habitat.translations") || "{}"); }
catch { PERSIST = {}; }
let persistTimer = null;

function rememberPersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try { localStorage.setItem("habitat.translations", JSON.stringify(PERSIST)); }
    catch { /* storage full — in-memory cache still works */ }
  }, 800);
}

const inflight = new Map();

async function translateOne(text, target) {
  const key = target + "::" + text;
  if (MEM.has(key)) return MEM.get(key);
  if (PERSIST[key]) { MEM.set(key, PERSIST[key]); return PERSIST[key]; }
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const url = "https://api.mymemory.translated.net/get?q=" +
        encodeURIComponent(text.slice(0, 480)) + "&langpair=en|" + target;
      const res = await fetch(url);
      if (!res.ok) return text;
      const j = await res.json();
      const out = (j && j.responseData && j.responseData.translatedText) || text;
      if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(out)) return text;
      MEM.set(key, out);
      PERSIST[key] = out;
      rememberPersist();
      return out;
    } catch {
      return text;   // offline / blocked -> show the original
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Translate a batch with limited concurrency so a long list cannot flood the API. */
export async function translateAll(texts, target = current) {
  if (target === "en") return texts;
  const clean = texts.map((x) => (x == null ? "" : String(x)));
  const out = new Array(clean.length);
  const LIMIT = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < clean.length) {
      const i = cursor++;
      out[i] = clean[i].trim() ? await translateOne(clean[i], target) : clean[i];
    }
  }
  await Promise.all(Array.from({ length: Math.min(LIMIT, clean.length) || 0 }, worker));
  return out;
}

export function translateText(text, target = current) {
  return translateOne(String(text || ""), target);
}

export function applyStaticI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  root.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    el.placeholder = t(el.getAttribute("data-i18n-ph"));
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.getAttribute("data-i18n-title"));
  });
}
