/* Verde — worker communication & trade language system.
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
  { id: "landscaping", label: "Landscaping" },
  { id: "construction", label: "Construction" },
  { id: "irrigation", label: "Irrigation" },
  { id: "hardscaping", label: "Hardscaping" },
  { id: "tree", label: "Tree work" },
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
  construction: {
    safety: [
      { en: "Hard hat area — no exceptions", es: "Área de casco obligatorio — sin excepciones", pt: "Área de capacete obrigatório — sem exceções" },
      { en: "Steel toe boots required", es: "Botas con punta de acero obligatorias", pt: "Botas com biqueira de aço obrigatórias" },
      { en: "Dust mask needed", es: "Se necesita mascarilla contra el polvo", pt: "Máscara contra poeira necessária" },
      { en: "Scaffold inspection complete", es: "Inspección de andamios completada", pt: "Inspeção de andaimes concluída" },
    ],
    materials: [
      { en: "Concrete cured properly", es: "Hormigón curado correctamente", pt: "Concreto curado corretamente" },
      { en: "Rebar in place", es: "Armadura de acero colocada", pt: "Armadura de aço colocada" },
      { en: "Formwork removed", es: "Encofrado retirado", pt: "Forma removida" },
      { en: "Curing time needed", es: "Tiempo de curado necesario", pt: "Tempo de cura necessário" },
    ],
    tools: [
      { en: "Cement mixer ready", es: "Mezcladora de cemento lista", pt: "Betoneira pronta" },
      { en: "Level checked", es: "Nivel verificado", pt: "Nível verificado" },
      { en: "Square verified", es: "Escuadra verificada", pt: "Esquadro verificado" },
      { en: "Plumb line set", es: "Línea de plomada colocada", pt: "Linha de prumo colocada" },
    ],
    scheduling: [
      { en: "Concrete pour at dawn", es: "Vertido de hormigón al amanecer", pt: "Concretagem ao amanhecer" },
      { en: "Weather dependent", es: "Depende del clima", pt: "Depende do clima" },
      { en: "Cure before load", es: "Curar antes de cargar", pt: "Curar antes de carregar" },
    ],
  },
  irrigation: {
    safety: [
      { en: "Water pressure high — caution", es: "Presión de agua alta — precaución", pt: "Pressão da água alta — cuidado" },
      { en: "Electrical near water", es: "Electricidad cerca del agua", pt: "Eletricidade perto da água" },
      { en: "Backflow preventer installed", es: "Preventor de reflujo instalado", pt: "Preventor de refluxo instalado" },
    ],
    materials: [
      { en: "Emitter clogged", es: "Emisor obstruido", pt: "Emissor entupido" },
      { en: "Pipe pressure tested", es: "Tubería probada a presión", pt: "Tubulação testada sob pressão" },
      { en: "Filter cleaned", es: "Filtro limpiado", pt: "Filtro limpo" },
      { en: "Valve replaced", es: "Válvula reemplazada", pt: "Válvula substituída" },
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
  hardscaping: {
    safety: [
      { en: "Stone cutting — eye protection required", es: "Corte de piedra — protección ocular obligatoria", pt: "Corte de pedra — proteção ocular obrigatória" },
      { en: "Heavy paver lifting — team lift", es: "Levantamiento de adoquines pesados — levanten en equipo", pt: "Levantamento de pavers pesados — levantem em equipe" },
      { en: "Silica dust warning", es: "Advertencia de polvo de sílice", pt: "Aviso de poeira de sílica" },
    ],
    materials: [
      { en: "Base compacted and ready", es: "Base compactada y lista", pt: "Base compactada e pronta" },
      { en: "Sand screeded level", es: "Arena nivelada", pt: "Areia nivelada" },
      { en: "Edge restraint set", es: "Restricción de borde colocada", pt: "Restrição de borda colocada" },
      { en: "Joint sand applied", es: "Arena de juntas aplicada", pt: "Areia de juntas aplicada" },
    ],
    tools: [
      { en: "Plate compactor rented", es: "Compactador de placa alquilado", pt: "Compactador de placa alugado" },
      { en: "Wet saw available", es: "Sierra húmeda disponible", pt: "Serra molhada disponível" },
      { en: "Rubber mallet on site", es: "Mazo de goma en el sitio", pt: "Martelo de borracha no local" },
    ],
    scheduling: [
      { en: "Base must cure before laying", es: "La base debe curar antes de colocar", pt: "A base deve curar antes de assentar" },
      { en: "Avoid laying in rain", es: "Evite colocar bajo la lluvia", pt: "Evite assentar na chuva" },
      { en: "Temperature sensitive adhesive", es: "Adhesivo sensible a la temperatura", pt: "Adesivo sensível à temperatura" },
    ],
  },
  tree: {
    safety: [
      { en: "Climbing gear inspected", es: "Equipo de escalada inspeccionado", pt: "Equipamento de escalada inspecionado" },
      { en: "Drop zone clear", es: "Zona de caída despejada", pt: "Zona de queda livre" },
      { en: "Power line nearby — extreme caution", es: "Línea eléctrica cerca — precaución extrema", pt: "Linha elétrica perto — cuidado extremo" },
    ],
    materials: [
      { en: "Wood chips delivered", es: "Astillas de madera entregadas", pt: "Cascas de madeira entregues" },
      { en: "Stump grinder ready", es: "Trituradora de tocones lista", pt: "Triturador de tocos pronto" },
    ],
    tools: [
      { en: "Chainsaw sharpened", es: "Motosierra afilada", pt: "Motosserra afiada" },
      { en: "Rope and harness checked", es: "Cuerda y arnés revisados", pt: "Corda e arnês verificados" },
    ],
    scheduling: [
      { en: "Best done in dormant season", es: "Mejor en temporada de reposo", pt: "Melhor na estação de dormência" },
      { en: "Avoid nesting season", es: "Evite la temporada de anidación", pt: "Evite a época de nidificação" },
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
  "concrete": { es: "hormigón", pt: "concreto", fr: "béton", de: "beton" },
  "rebar": { es: "armadura de acero", pt: "armadura de aço", fr: "armature", de: "bewehrung" },
  "formwork": { es: "encofrado", pt: "forma", fr: "coffrage", de: "schalung" },
  "scaffold": { es: "andamio", pt: "andaime", fr: "échafaudage", de: "gerüst" },
  "backflow preventer": { es: "preventor de reflujo", pt: "preventor de refluxo", fr: "clapet anti-retour", de: "rückflussverhinderer" },
  "emitter": { es: "emisor", pt: "emissor", fr: "émetteur", de: "strahler" },
  "drip line": { es: "línea de goteo", pt: "linha de gotejamento", fr: "ligne goutte-à-goutte", de: "tropfleitung" },
  "mulch": { es: "mantillo", pt: "cobertura morta", fr: "paillis", de: "mulch" },
  "hedge trimmer": { es: "podadora de setos", pt: "aparador de cerca", fr: "taille-haie", de: "heckenschere" },
  "plate compactor": { es: "compactador de placa", pt: "compactador de placa", fr: "plaque vibrante", de: "rüttelplatte" },
  "wet saw": { es: "sierra húmeda", pt: "serra molhada", fr: "scie humide", de: "nasssäge" },
  "plumb line": { es: "línea de plomada", pt: "linha de prumo", fr: "fil à plomb", de: "lotschnur" },
  "base compacted": { es: "base compactada", pt: "base compactada", fr: "base compactée", de: "untergrund verdichtet" },
  "edge restraint": { es: "restricción de borde", pt: "restrição de borda", fr: "bordure de retenue", de: "randbegrenzung" },
  "joint sand": { es: "arena de juntas", pt: "areia de juntas", fr: "sable de joint", de: "fugensand" },
  "chainsaw": { es: "motosierra", pt: "motosserra", fr: "tronçonneuse", de: "kettensäge" },
  "stump grinder": { es: "trituradora de tocones", pt: "triturador de tocos", fr: "broyeur de souches", de: "stumpffräse" },
  "climbing gear": { es: "equipo de escalada", pt: "equipamento de escalada", fr: "équipement d'escalade", de: "kletterausrüstung" },
  "drop zone": { es: "zona de caída", pt: "zona de queda", fr: "zone de chute", de: "abwurfzone" },
  "pressure gauge": { es: "manómetro", pt: "manômetro", fr: "manomètre", de: "manometer" },
  "pipe cutter": { es: "cortatubos", pt: "cortador de tubos", fr: "coupe-tube", de: "rohrschneider" },
  "chemical spray": { es: "pulverización química", pt: "pulverização química", fr: "pulvérisation chimique", de: "chemisches sprühen" },
  "soil pH": { es: "pH del suelo", pt: "pH do solo", fr: "pH du sol", de: "boden-pH" },
  "seed germinating": { es: "semillas germinando", pt: "sementes germinando", fr: "graines en germination", de: "keimende samen" },
  "power line": { es: "línea eléctrica", pt: "linha elétrica", fr: "ligne électrique", de: "stromleitung" },
  "dormant season": { es: "temporada de reposo", pt: "estação de dormência", fr: "saison de dormance", de: "ruhezeit" },
  "nesting season": { es: "temporada de anidación", pt: "época de nidificação", fr: "saison de nidification", de: "brutsaison" },
  "curing time": { es: "tiempo de curado", pt: "tempo de cura", fr: "temps de durcissement", de: "aushärtezeit" },
  "concrete pour": { es: "vertido de hormigón", pt: "concretagem", fr: "coulage de béton", de: "betoneinbau" },
  "weather dependent": { es: "depende del clima", pt: "depende do clima", fr: "dépend de la météo", de: "wetterabhängig" },
};

/* --------------------------------------------------------- worker mode */
const WORKER_MODE_KEY = "verde.workerMode";
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
