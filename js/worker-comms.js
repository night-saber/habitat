/* Habitat — worker communication & trade language system.
 *
 * Provides:
 *  - Worker mode toggle (trade-specific UI terminology)
 *  - Phrasebook modal (categorized trade phrases for quick insertion)
 *  - Trade-specific translation layer (runs after standard translation)
 *  - Read-aloud via Web Speech API (speechSynthesis)
 *  - Trade specialization constants
 */
"use strict";
import { t, getLang, translateAll } from "./i18n.js";
import {
  el, btn, input, select, textarea, modal, openModal, closeModal, toast,
} from "./ui.js";

/* ----------------------------------------------------------- trade list */
export const PHRASE_TRADES = [
  { id: "general", label: "General" },
  { id: "plumbing", label: "Plumbing" },
  { id: "electrical", label: "Electrical" },
  { id: "landscaping", label: "Landscaping" },
  { id: "hvac", label: "HVAC" },
  { id: "roofing", label: "Roofing" },
];

export const TRADE_CATEGORIES = [
  { id: "safety", label: "Safety" },
  { id: "materials", label: "Materials" },
  { id: "tools", label: "Tools" },
  { id: "scheduling", label: "Scheduling" },
];

/* ---------------------------------------------------------- phrasebook */
/* Each phrase: { en, es?, pt?, fr?, de? } — English is the source.
 * Missing translations fall back to English; the auto-translation system
 * handles anything not pre-translated when the phrase is inserted. */
export const PHRASEBOOK = {
  general: {
    safety: [
      { en: "Hard hat required in this area", es: "Casco obligatorio en esta área", pt: "Capacete obrigatório nesta área" },
      { en: "Safety glasses on before starting", es: "Póngase las gafas de seguridad antes de empezar", pt: "Coloque os óculos de segurança antes de começar" },
      { en: "Watch your step — uneven ground", es: "Cuidado al caminar — suelo irregular", pt: "Cuidado ao caminhar — chão irregular" },
      { en: "Heavy lifting — get help", es: "Levantamiento pesado — pida ayuda", pt: "Levantamento pesado — peça ajuda" },
      { en: "Power tool in use, keep clear", es: "Herramienta eléctrica en uso, manténgase alejado", pt: "Ferramenta elétrica em uso, mantenha-se afastado" },
      { en: "Keep clear of the work area", es: "Manténgase alejado del área de trabajo", pt: "Mantenha-se afastado da área de trabalho" },
    ],
    materials: [
      { en: "Need more materials", es: "Necesito más materiales", pt: "Preciso de mais materiais" },
      { en: "Materials delivered", es: "Materiales entregados", pt: "Materiais entregues" },
      { en: "Out of stock", es: "Agotado", pt: "Esgotado" },
      { en: "Wrong material delivered", se: "Material incorrecto entregado", pt: "Material errado entregue" },
      { en: "Quality check passed", es: "Control de calidad aprobado", pt: "Controle de qualidade aprovado" },
    ],
    tools: [
      { en: "Tool broken, need replacement", es: "Herramienta rota, necesito reemplazo", pt: "Ferramenta quebrada, preciso de substituição" },
      { en: "Need a different tool", es: "Necesito una herramienta diferente", pt: "Preciso de uma ferramenta diferente" },
      { en: "Tool returned", es: "Herramienta devuelta", pt: "Ferramenta devolvida" },
      { en: "Bring the ladder", es: "Traiga la escalera", pt: "Traga a escada" },
      { en: "Power tool charged and ready", es: "Herramienta eléctrica cargada y lista", pt: "Ferramenta elétrica carregada e pronta" },
    ],
    scheduling: [
      { en: "Running late, be there soon", es: "Voy tarde, llegaré pronto", pt: "Estou atrasado, chego em breve" },
      { en: "On my way", es: "En camino", pt: "A caminho" },
      { en: "Need more time to finish", es: "Necesito más tiempo para terminar", pt: "Preciso de mais tempo para terminar" },
      { en: "Can we reschedule?", es: "¿Podemos reprogramar?", pt: "Podemos reagendar?" },
      { en: "Available tomorrow morning", es: "Disponible mañana por la mañana", pt: "Disponível amanhã de manhã" },
      { en: "Finished early today", es: "Terminé temprano hoy", pt: "Terminei cedo hoje" },
    ],
  },
  plumbing: {
    safety: [
      { en: "Water pressure high — caution", es: "Presión de agua alta — precaución", pt: "Pressão da água alta — cuidado" },
      { en: "Electrical near water", es: "Electricidad cerca del agua", pt: "Eletricidade perto da água" },
      { en: "Backflow preventer installed", es: "Preventor de reflujo instalado", pt: "Preventor de refluxo instalado" },
    ],
    materials: [
      { en: "Pipe pressure tested", es: "Tubería probada a presión", pt: "Tubulação testada sob pressão" },
      { en: "Filter cleaned", es: "Filtro limpiado", pt: "Filtro limpo" },
      { en: "Valve replaced", es: "Válvula reemplazada", pt: "Válvula substituída" },
      { en: "Cartridge ordered", es: "Cartucho pedido", pt: "Cartucho encomendado" },
    ],
    tools: [
      { en: "Pressure gauge ready", es: "Manómetro listo", pt: "Manômetro pronto" },
      { en: "Pipe cutter sharp", es: "Cortatubos afilado", pt: "Cortador de tubos afiado" },
      { en: "Torch for PVC ready", es: "Soplete para PVC listo", pt: "Maçarico para PVC pronto" },
    ],
    scheduling: [
      { en: "Water at dawn for best results", es: "Riegue al amanecer para mejores resultados", pt: "Regue ao amanhecer para melhores resultados" },
      { en: "Avoid midday heat", es: "Evite el calor del mediodía", pt: "Evite o calor do meio-dia" },
      { en: "Check system after rain", es: "Revise el sistema después de la lluvia", pt: "Verifique o sistema após a chuva" },
    ],
  },
  electrical: {
    safety: [
      { en: "Circuit de-energized", es: "Circuito desenergizado", pt: "Circuito desenergizado" },
      { en: "Lockout tagout in place", es: "Bloqueo y etiquetado en su lugar", pt: "Bloqueio e etiquetagem no lugar" },
      { en: "Test before touching", es: "Pruebe antes de tocar", pt: "Teste antes de tocar" },
    ],
    materials: [
      { en: "Wire gauge correct", es: "Calibre de cable correcto", pt: "Bitola do fio correta" },
      { en: "Breaker size matched", es: "Tamaño de interruptor coincidente", pt: "Tamanho do disjuntor correspondente" },
      { en: "Conduit fitted", es: "Conducto instalado", pt: "Eletroduto instalado" },
    ],
    tools: [
      { en: "Multimeter calibrated", es: "Multímetro calibrado", pt: "Multímetro calibrado" },
      { en: "Fish tape ready", es: "Cinta pasacables lista", pt: "Fita passacabo pronta" },
      { en: "Wire strippers sharp", es: "Pelacables afilado", pt: "Alicate de corte afiado" },
    ],
    scheduling: [
      { en: "Power shutdown at noon", es: "Corte de energía al mediodía", pt: "Corte de energia ao meio-dia" },
      { en: "Panel upgrade takes 4 hours", es: "La actualización del panel toma 4 horas", pt: "A atualização do painel leva 4 horas" },
      { en: "Inspection scheduled", es: "Inspección programada", pt: "Inspeção agendada" },
    ],
  },
  landscaping: {
    safety: [
      { en: "Chemical spray in progress", es: "Pulverización química en curso", pt: "Pulverização química em andamento" },
      { en: "Wet soil — slippery", es: "Suelo mojado — resbaladizo", pt: "Solo molhado — escorregadio" },
      { en: "Thorn protection needed", es: "Protección contra espinas necesaria", pt: "Proteção contra espinhos necessária" },
    ],
    materials: [
      { en: "Soil pH tested", es: "pH del suelo analizado", pt: "pH do solo testado" },
      { en: "Mulch depth correct", es: "Profundidad de mantillo correcta", pt: "Profundidade de cobertura correta" },
      { en: "Fertilizer applied", es: "Fertilizante aplicado", pt: "Fertilizante aplicado" },
      { en: "Seed germinating well", es: "Semillas germinando bien", pt: "Sementes germinando bem" },
    ],
    tools: [
      { en: "Mower blade sharpened", es: "Cuchilla de cortadora afilada", pt: "Lâmina do cortador afiada" },
      { en: "Hedge trimmer serviced", es: "Podadora de setos revisada", pt: "Aparador de cerca revisado" },
      { en: "Sprayer calibrated", es: "Pulverizador calibrado", pt: "Pulverizador calibrado" },
    ],
    scheduling: [
      { en: "Best time: early morning", es: "Mejor hora: temprano por la mañana", pt: "Melhor horário: de manhã cedo" },
      { en: "Avoid watering at noon", es: "Evite regar al mediodía", pt: "Evite regar ao meio-dia" },
      { en: "Seasonal timing matters", es: "El momento estacional es importante", pt: "O momento sazonal é importante" },
    ],
  },
  hvac: {
    safety: [
      { en: "Refrigerant handling — certified only", es: "Manejo de refrigerante — solo certificados", pt: "Manuseio de refrigerante — apenas certificados" },
      { en: "Electrical disconnect off", es: "Desconexión eléctrica apagada", pt: "Desconexão elétrica desligada" },
      { en: "Ductwork hot — do not touch", es: "Conductos calientes — no tocar", pt: "Dutos quentes — não tocar" },
    ],
    materials: [
      { en: "Filter size correct", es: "Tamaño de filtro correcto", pt: "Tamanho do filtro correto" },
      { en: "Refrigerant charged", es: "Refrigerante cargado", pt: "Refrigerante carregado" },
      { en: "Duct sealant applied", es: "Sellador de conductos aplicado", pt: "Selador de dutos aplicado" },
    ],
    tools: [
      { en: "Manifold gauge set ready", es: "Juego de manómetros listo", pt: "Conjunto de manômetros pronto" },
      { en: "Vacuum pump running", es: "Bomba de vacío funcionando", pt: "Bomba de vácuo funcionando" },
      { en: "Leak detector calibrated", es: "Detector de fugas calibrado", pt: "Detector de vazamentos calibrado" },
    ],
    scheduling: [
      { en: "System recharge takes 2 hours", es: "La recarga del sistema toma 2 horas", pt: "A recarga do sistema leva 2 horas" },
      { en: "Best done in mild weather", es: "Mejor en clima templado", pt: "Melhor em clima ameno" },
      { en: "Annual service due", es: "Servicio anual pendiente", pt: "Manutenção anual devida" },
    ],
  },
  roofing: {
    safety: [
      { en: "Fall protection harness on", es: "Arnés de protección contra caídas puesto", pt: "Cinto de proteção contra quedas vestido" },
      { en: "Ladder secured at base", es: "Escalera asegurada en la base", pt: "Escada fixada na base" },
      { en: "Power line nearby — extreme caution", es: "Línea eléctrica cerca — precaución extrema", pt: "Linha elétrica perto — cuidado extremo" },
    ],
    materials: [
      { en: "Shingles matched to existing", es: "Tejas coincidentes con las existentes", pt: "Telhas correspondentes às existentes" },
      { en: "Flashing sealed", es: "Flash sellado", pt: "Rufo selado" },
      { en: "Underlayment in place", es: "Subcapa colocada", pt: "Manta de subcobertura colocada" },
    ],
    tools: [
      { en: "Nail gun charged", es: "Clavadora cargada", pt: "Pistola de pregos carregada" },
      { en: "Roofing shovel ready", es: "Pala de techado lista", pt: "Pá de telhado pronta" },
      { en: "Chalk line set", es: "Liza de tiza colocada", pt: "Linha de giz colocada" },
    ],
    scheduling: [
      { en: "Weather window: clear skies", es: "Ventana de clima: cielo despejado", pt: "Janela de clima: céu limpo" },
      { en: "Tear-off before noon", es: "Desmantelamiento antes del mediodía", pt: "Remoção antes do meio-dia" },
      { en: "Cure time needed for sealant", es: "Tiempo de curado necesario para el sellador", pt: "Tempo de cura necessário para o selador" },
    ],
  },
};

/* ------------------------------------------- trade term translation dict */
/* Maps English trade terms to direct translations. Used by the trade
 * translation layer to bypass the API for known jargon. */
export const TRADE_TERMS = {
  "hard hat": { es: "casco", pt: "capacete", fr: "casque", de: "helm" },
  "steel toe boots": { es: "botas con punta de acero", pt: "botas com biqueira de aço", fr: "bouts de sécurité", de: "stahlkappenschuhe" },
  "safety glasses": { es: "gafas de seguridad", pt: "óculos de segurança", fr: "lunettes de sécurité", de: "schutzbrille" },
  "power tool": { es: "herramienta eléctrica", pt: "ferramenta elétrica", fr: "outil électrique", de: "elektrowerkzeug" },
  "circuit breaker": { es: "interruptor automático", pt: "disjuntor", fr: "disjoncteur", de: "leistungsschalter" },
  "outlet": { es: "tomacorriente", pt: "tomada", fr: "prise", de: "steckdose" },
  "conduit": { es: "conducto", pt: "eletroduto", fr: "conduit", de: "rohrleitung" },
  "wire gauge": { es: "calibre de cable", pt: "bitola do fio", fr: "calibre de fil", de: "leiterquerschnitt" },
  "multimeter": { es: "multímetro", pt: "multímetro", fr: "multimètre", de: "multimeter" },
  "refrigerant": { es: "refrigerante", pt: "refrigerante", fr: "réfrigérant", de: "kältemittel" },
  "compressor": { es: "compresor", pt: "compressor", fr: "compresseur", de: "verdichter" },
  "thermostat": { es: "termostato", pt: "termostato", fr: "thermostat", de: "thermostat" },
  "air filter": { es: "filtro de aire", pt: "filtro de ar", fr: "filtre à air", de: "luftfilter" },
  "ductwork": { es: "conductos de aire", pt: "dutos de ar", fr: "gaine de ventilation", de: "luftleitung" },
  "shingle": { es: "teja", pt: "telha", fr: "bardeau", de: "dachziegel" },
  "flashing": { es: "flash", pt: "rufo", fr: "solin", de: "blechabdichtung" },
  "gutter": { es: "canalón", pt: "calha", fr: "gouttière", de: "dachrinne" },
  "downspout": { es: "bajante", pt: "tubo de descida", fr: "descente de gouttière", de: "fallrohr" },
  "underlayment": { es: "subcapa", pt: "manta de subcobertura", fr: "sous-toiture", de: "unterspannbahn" },
  "faucet": { es: "grifo", pt: "torneira", fr: "robinet", de: "armatur" },
  "valve": { es: "válvula", pt: "válvula", fr: "vanne", de: "ventil" },
  "cartridge": { es: "cartucho", pt: "cartucho", fr: "cartouche", de: "kartusche" },
  "drain": { es: "desagüe", pt: "ralo", fr: "évacuation", de: "ablauf" },
  "pipe": { es: "tubería", pt: "tubulação", fr: "tuyau", de: "rohr" },
  "water heater": { es: "calentador de agua", pt: "aquecedor de água", fr: "chauffe-eau", de: "wasserbereiter" },
  "pressure regulator": { es: "regulador de presión", pt: "regulador de pressão", fr: "régulateur de pression", de: "druckregler" },
  "backflow preventer": { es: "preventor de reflujo", pt: "preventor de refluxo", fr: "clapet anti-retour", de: "rückflussverhinderer" },
  "fall protection": { es: "protección contra caídas", pt: "proteção contra quedas", fr: "protection contre les chutes", de: "sturzsicherung" },
  "harness": { es: "arnés", pt: "cinto", fr: "harnais", de: "klettergurt" },
  "ladder": { es: "escalera", pt: "escada", fr: "échelle", de: "leiter" },
  "nail gun": { es: "clavadora", pt: "pistola de pregos", fr: "cloueuse", de: "nagelpistole" },
  "mulch": { es: "mantillo", pt: "cobertura morta", fr: "paillis", de: "mulch" },
  "hedge trimmer": { es: "podadora de setos", pt: "aparador de cerca", fr: "taille-haie", de: "heckenschere" },
  "chemical spray": { es: "pulverización química", pt: "pulverização química", fr: "pulvérisation chimique", de: "chemisches sprühen" },
  "soil pH": { es: "pH del suelo", pt: "pH do solo", fr: "pH du sol", de: "boden-pH" },
  "power line": { es: "línea eléctrica", pt: "linha elétrica", fr: "ligne électrique", de: "stromleitung" },
  "lockout tagout": { es: "bloqueo y etiquetado", pt: "bloqueio e etiquetagem", fr: "consignation", de: "stilllegung" },
  "manifold gauge": { es: "manómetro", pt: "manômetro", fr: "manomètre", de: "manometer" },
  "vacuum pump": { es: "bomba de vacío", pt: "bomba de vácuo", fr: "pompe à vide", de: "vakuumpumpe" },
  "leak detector": { es: "detector de fugas", pt: "detector de vazamentos", fr: "détecteur de fuite", de: "lecksucher" },
  "weather dependent": { es: "depende del clima", pt: "depende do clima", fr: "dépend de la météo", de: "wetterabhängig" },
};

/* --------------------------------------------------------- worker mode */
const WORKER_MODE_KEY = "habitat.workerMode";
let workerMode = false;

export function isWorkerMode() { return workerMode; }

export function setWorkerMode(on) {
  workerMode = !!on;
  try { localStorage.setItem(WORKER_MODE_KEY, workerMode ? "1" : "0"); } catch { /* ignore */ }
  document.body.classList.toggle("worker-mode", workerMode);
  return workerMode;
}

export function toggleWorkerMode() {
  return setWorkerMode(!workerMode);
}

export function initWorkerMode() {
  try { workerMode = localStorage.getItem(WORKER_MODE_KEY) === "1"; }
  catch { workerMode = false; }
  document.body.classList.toggle("worker-mode", workerMode);
  return workerMode;
}

/* ------------------------------------------------------ phrasebook modal */
/**
 * Open the phrasebook modal. Categories on the left, phrases on the right.
 * `onSelect` is called with the chosen phrase string when the user clicks one.
 */
export function openPhrasebookModal(onSelect) {
  const body = el("div", "phrasebook");

  // Left: trade + category selectors
  const left = el("div", "phrasebook-left");

  const tradeSel = select("trade", PHRASE_TRADES.map((tr) => ({
    value: tr.id,
    label: t("trade_" + tr.id),
    selected: tr.id === "general",
  })));
  left.appendChild(field("trade", tradeSel));

  const catList = el("div", "phrasebook-cats");
  left.appendChild(catList);

  // Right: phrase list
  const right = el("div", "phrasebook-right");
  const phraseList = el("div", "phrasebook-phrases");
  right.appendChild(phraseList);

  // Search
  const search = input("phraseSearch", { placeholder: t("search_ph") });
  search.className = "search";
  search.oninput = () => drawPhrases();
  right.insertBefore(search, phraseList);

  body.appendChild(left);
  body.appendChild(right);

  let currentTrade = "general";
  let currentCat = "safety";

  function drawCats() {
    catList.innerHTML = "";
    const cats = PHRASEBOOK[currentTrade] ? Object.keys(PHRASEBOOK[currentTrade]) : [];
    cats.forEach((catId) => {
      const cat = TRADE_CATEGORIES.find((c) => c.id === catId);
      const label = cat ? t("category_" + cat.id) : catId;
      const b = btn(label, "phrasebook-cat" + (catId === currentCat ? " on" : ""), () => {
        currentCat = catId;
        $$(".phrasebook-cat", catList).forEach((c) => c.classList.remove("on"));
        b.classList.add("on");
        drawPhrases();
      });
      catList.appendChild(b);
    });
  }

  function drawPhrases() {
    phraseList.innerHTML = "";
    const phrases = (PHRASEBOOK[currentTrade] && PHRASEBOOK[currentTrade][currentCat]) || [];
    const q = search.value.trim().toLowerCase();
    const filtered = q ? phrases.filter((p) => p.en.toLowerCase().includes(q)) : phrases;
    if (!filtered.length) {
      phraseList.appendChild(el("p", "muted sm", t("no_tasks")));
      return;
    }
    filtered.forEach((p) => {
      const row = el("button", "phrase-item");
      row.type = "button";
      const lang = getLang();
      const text = p[lang] || p.en;
      row.appendChild(el("span", "phrase-text", text));
      row.appendChild(el("span", "phrase-en", p.en));
      row.onclick = () => {
        if (onSelect) onSelect(p.en);
        closeModal(m);
        toast(t("phrase_inserted"), "good");
      };
      phraseList.appendChild(row);
    });
  }

  tradeSel.onchange = () => {
    currentTrade = tradeSel.value;
    currentCat = Object.keys(PHRASEBOOK[currentTrade] || {})[0] || "safety";
    drawCats();
    drawPhrases();
  };

  drawCats();
  drawPhrases();

  const m = modal("phrasebook", body, { wide: true });
  document.body.appendChild(m);
  openModal(m);
}

/* ------------------------------------------------------------- read aloud */
let currentUtterance = null;

/**
 * Speak text aloud using the Web Speech API.
 * @param {string} text - text to speak
 * @param {string} [lang] - BCP-47 language code (defaults to current app lang)
 * @returns {boolean} true if speech started
 */
export function speak(text, lang) {
  if (!("speechSynthesis" in window)) {
    toast("Speech not supported", "bad");
    return false;
  }
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  const bcp47 = lang || getLang();
  utterance.lang = bcp47 === "en" ? "en-US" : bcp47;
  utterance.rate = 0.95;
  utterance.pitch = 1;
  currentUtterance = utterance;
  speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  currentUtterance = null;
}

export function isSpeaking() {
  return currentUtterance != null;
}

/* ------------------------------------------------- trade translation layer */
/**
 * Translate text with trade-term awareness. Known trade terms are translated
 * directly from the dictionary; everything else falls through to the standard
 * MyMemory translation.
 * @param {string} text - English text to translate
 * @param {string} target - target language code
 * @returns {Promise<string>} translated text
 */
export async function translateWithTrade(text, target) {
  if (!text || !text.trim()) return text;
  if (target === "en") return text;

  // Check for exact trade term matches
  const lower = text.toLowerCase();
  for (const [term, translations] of Object.entries(TRADE_TERMS)) {
    if (lower === term.toLowerCase()) {
      return translations[target] || text;
    }
  }

  // Check if text contains trade terms and translate the whole thing
  // via the standard API (which handles full sentences well)
  const result = await translateAll([text], target);
  return result[0] || text;
}

/**
 * Post-process translated text: replace any English trade terms that
 * survived translation with their known equivalents.
 */
export function postProcessTradeTranslation(text, target) {
  if (!text || target === "en") return text;
  let out = text;
  for (const [term, translations] of Object.entries(TRADE_TERMS)) {
    const translated = translations[target];
    if (!translated) continue;
    // Case-insensitive replace of the English term
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, translated);
  }
  return out;
}

/* --------------------------------------------------------- worker mode UI */
/**
 * Add a worker-mode toggle button to the header.
 * @param {HTMLElement} container - the header element to append to
 */
export function addWorkerModeToggle(container) {
  if (!container) return;
  const b = btn(t("worker_mode"), "btn ghost sm worker-mode-toggle", () => {
    const on = toggleWorkerMode();
    b.classList.toggle("on", on);
    b.textContent = on ? t("worker_mode_on") : t("worker_mode");
    toast(on ? t("worker_mode_on") : t("worker_mode_off"), "info");
  });
  b.setAttribute("data-i18n", "worker_mode");
  if (workerMode) {
    b.classList.add("on");
    b.textContent = t("worker_mode_on");
  }
  container.appendChild(b);
}

/**
 * Add a read-aloud button next to a task description.
 * @param {HTMLElement} descEl - the description element
 * @param {string} text - the text to speak
 * @returns {HTMLElement} the button element
 */
export function addReadAloudButton(descEl, text) {
  const b = btn("🔊 " + t("read_aloud"), "btn ghost sm read-aloud-btn", () => {
    if (isSpeaking()) {
      stopSpeaking();
      b.classList.remove("speaking");
      b.textContent = "🔊 " + t("read_aloud");
    } else {
      const started = speak(text);
      if (started) {
        b.classList.add("speaking");
        b.textContent = "⏹ " + t("stop_reading");
      }
    }
  });
  b.setAttribute("data-i18n", "read_aloud");
  if (descEl && descEl.parentNode) {
    descEl.parentNode.insertBefore(b, descEl.nextSibling);
  }
  return b;
}

/**
 * Add a quick-phrases button to a comment form.
 * @param {HTMLElement} form - the comment form element
 * @param {HTMLInputElement} input - the comment input element
 * @returns {HTMLElement} the button element
 */
export function addQuickPhrasesButton(form, input) {
  const b = btn("💬 " + t("quick_phrases"), "btn ghost sm", () => {
    openPhrasebookModal((phrase) => {
      if (input) {
        const cur = input.value.trim();
        input.value = cur ? cur + " " + phrase : phrase;
        input.focus();
      }
    });
  });
  b.setAttribute("data-i18n", "quick_phrases");
  if (form) form.appendChild(b);
  return b;
}
