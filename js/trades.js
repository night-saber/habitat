/* Verde — trade categories, terminology dictionaries, and task translation.
 *
 * Each trade has an icon, color, and display name. The terminology maps
 * translate common homeowner phrases into the specific language a trade
 * worker needs to hear. translateTaskForTrade() rewrites a task's title
 * and description using the trade's dictionary.
 */
"use strict";

/* ------------------------------------------------------- trade categories */
export const TRADES = [
  {
    id: "plumbing",
    icon: "🔧",
    color: "#6ee7ff",
    name: "Plumbing",
  },
  {
    id: "electrical",
    icon: "⚡",
    color: "#f5c451",
    name: "Electrical",
  },
  {
    id: "landscaping",
    icon: "🌿",
    color: "#34d399",
    name: "Landscaping",
  },
  {
    id: "hvac",
    icon: "❄️",
    color: "#a78bfa",
    name: "HVAC",
  },
  {
    id: "roofing",
    icon: "🏠",
    color: "#fb923c",
    name: "Roofing",
  },
  {
    id: "general",
    icon: "🔨",
    color: "#94b4a4",
    name: "General",
  },
];

export function tradeById(id) {
  return TRADES.find((t) => t.id === id) || null;
}

export function tradeColor(id) {
  const t = tradeById(id);
  return t ? t.color : "#94b4a4";
}

export function tradeName(id) {
  const t = tradeById(id);
  return t ? t.name : "General";
}

export function tradeIcon(id) {
  const t = tradeById(id);
  return t ? t.icon : "🔨";
}

/* ------------------------------------------------- terminology dictionaries */
/*
 * Each entry maps a homeowner phrase (lowercase) to the trade-specific
 * language a worker needs to hear. The translate function does a
 * case-insensitive substring match and replaces the matched portion.
 */
const TERMINOLOGY = {
  plumbing: [
    { home: "water won't stop running", trade: "replace valve stem / cartridge" },
    { home: "water wont stop running", trade: "replace valve stem / cartridge" },
    { home: "toilet keeps running", trade: "replace flapper / fill valve" },
    { home: "toilet wont flush", trade: "check flush valve / wax ring" },
    { home: "no hot water", trade: "check heating element / thermostat" },
    { home: "sink is clogged", trade: "clear drain blockage / check P-trap" },
    { home: "sink wont drain", trade: "clear drain blockage / check P-trap" },
    { home: "low water pressure", trade: "check pressure regulator / aerator" },
    { home: "leaking pipe", trade: "locate and repair pipe joint / fitting" },
    { home: "leak under sink", trade: "inspect supply lines / drain connections" },
    { home: "water heater", trade: "inspect water heater / anode rod" },
    { home: "drip", trade: "replace washer / O-ring" },
    { home: "faucet", trade: "replace cartridge / valve seat" },
    { home: "shower", trade: "check shower valve / head" },
    { home: "drain", trade: "clear blockage / inspect vent stack" },
    { home: "pipe", trade: "inspect pipe run / fittings" },
    { home: "water", trade: "check water line / pressure" },
  ],
  electrical: [
    { home: "outlet not working", trade: "test receptacle / check circuit breaker" },
    { home: "outlet wont work", trade: "test receptacle / check circuit breaker" },
    { home: "no power", trade: "check breaker panel / GFCI" },
    { home: "light flickering", trade: "check wiring / ballast / dimmer" },
    { home: "light wont turn on", trade: "test switch / fixture / wiring" },
    { home: "breaker keeps tripping", trade: "inspect circuit load / short" },
    { home: "sparking", trade: "de-energize circuit / inspect connections" },
    { home: "dead outlet", trade: "test GFCI / check wiring" },
    { home: "ceiling fan", trade: "inspect fan motor / capacitor" },
    { home: "switch", trade: "test switch / wiring" },
    { home: "wire", trade: "inspect wiring / connections" },
    { home: "power", trade: "check electrical supply / panel" },
    { home: "light", trade: "inspect fixture / bulb / wiring" },
    { home: "outlet", trade: "test receptacle / connections" },
  ],
  landscaping: [
    { home: "grass is dying", trade: "check irrigation / soil compaction / pests" },
    { home: "lawn is brown", trade: "adjust irrigation / check for grubs" },
    { home: "weeds everywhere", trade: "apply herbicide / improve mulch coverage" },
    { home: "tree is dead", trade: "assess tree health / remove if hazardous" },
    { home: "tree branch hanging", trade: "prune branch / check for decay" },
    { home: "hedge too big", trade: "trim hedge / shape to spec" },
    { home: "flowers wilting", trade: "check watering / soil drainage / sun exposure" },
    { home: "soil is hard", trade: "aerate / amend soil / improve drainage" },
    { home: "moss on lawn", trade: "improve drainage / reduce shade / apply moss killer" },
    { home: "leaves everywhere", trade: "rake and remove leaf litter" },
    { home: "grass", trade: "mow / edge / fertilize lawn" },
    { home: "lawn", trade: "mow / edge / fertilize lawn" },
    { home: "tree", trade: "prune / inspect tree health" },
    { home: "bush", trade: "prune / shape shrub" },
    { home: "plant", trade: "plant / water / mulch" },
    { home: "garden", trade: "weed / mulch / maintain beds" },
    { home: "soil", trade: "amend / aerate soil" },
    { home: "mulch", trade: "apply mulch layer" },
    { home: "irrigation", trade: "inspect irrigation system / emitters" },
    { home: "sprinkler", trade: "adjust / repair sprinkler heads" },
    { home: "drip line", trade: "inspect drip emitters / tubing" },
  ],
  hvac: [
    { home: "no ac", trade: "check compressor / refrigerant / thermostat" },
    { home: "ac not cold", trade: "check refrigerant / condenser / filter" },
    { home: "ac wont turn on", trade: "test thermostat / capacitor / wiring" },
    { home: "no heat", trade: "check ignitor / gas valve / thermostat" },
    { home: "furnace", trade: "inspect heat exchanger / blower / filter" },
    { home: "air conditioning", trade: "service AC unit / check refrigerant" },
    { home: "heater", trade: "inspect heating system / thermostat" },
    { home: "thermostat", trade: "test / replace thermostat" },
    { home: "vent", trade: "inspect ductwork / vent flow" },
    { home: "duct", trade: "inspect ductwork / seals" },
    { home: "filter", trade: "replace air filter" },
    { home: "ac", trade: "service AC unit / check refrigerant" },
    { home: "air", trade: "check airflow / ductwork" },
  ],
  roofing: [
    { home: "roof leaking", trade: "locate leak source / repair flashing" },
    { home: "leak in attic", trade: "inspect roof penetration / flashing" },
    { home: "shingle missing", trade: "replace missing shingle / underlayment" },
    { home: "roof is old", trade: "inspect roof deck / shingle condition" },
    { home: "gutter clogged", trade: "clear gutter / check downspout" },
    { home: "gutter falling", trade: "re-secure gutter / replace hangers" },
    { home: "roof", trade: "inspect roof surface / flashing" },
    { home: "shingle", trade: "replace / repair shingle" },
    { home: "gutter", trade: "clean / repair gutter system" },
    { home: "attic", trade: "inspect attic ventilation / insulation" },
    { home: "chimney", trade: "inspect chimney cap / flashing" },
    { home: "skylight", trade: "inspect skylight seal / flashing" },
  ],
  general: [
    { home: "door wont close", trade: "adjust door / hinges / latch" },
    { home: "window broken", trade: "replace glass / sash / seal" },
    { home: "paint peeling", trade: "scrape / prime / repaint surface" },
    { home: "wall crack", trade: "assess crack / patch / repair" },
    { home: "floor creaking", trade: "secure subfloor / joists" },
    { home: "cabinet loose", trade: "re-secure cabinet / hardware" },
    { home: "lock broken", trade: "replace lock cylinder / mechanism" },
    { home: "screen torn", trade: "replace screen mesh / frame" },
    { home: "carpet stain", trade: "clean / replace carpet section" },
    { home: "tile cracked", trade: "replace tile / grout" },
    { home: "door", trade: "adjust / repair door / hardware" },
    { home: "window", trade: "repair / replace window / seal" },
    { home: "wall", trade: "patch / repair wall surface" },
    { home: "floor", trade: "repair / refinish flooring" },
    { home: "paint", trade: "prepare / paint surface" },
    { home: "lock", trade: "repair / replace lock" },
    { home: "screen", trade: "replace screen" },
  ],
};

/* --------------------------------------------------------- translation */
/**
 * Translate a task's title and description into trade-specific language.
 * Returns a new object with translated title and description.
 * The original task is not mutated.
 */
export function translateTaskForTrade(task, tradeId) {
  if (!task || !tradeId) return { title: task?.title || "", description: task?.description || "" };

  const dict = TERMINOLOGY[tradeId];
  if (!dict || !dict.length) {
    return { title: task.title || "", description: task.description || "" };
  }

  function translateText(text) {
    if (!text) return "";
    // Sort by length descending so longer phrases match first
    const sorted = [...dict].sort((a, b) => b.home.length - a.home.length);
    // Build a single alternation regex for single-pass replacement
    const pattern = sorted.map((e) => escapeRegex(e.home)).join("|");
    const regex = new RegExp(pattern, "gi");
    return text.replace(regex, (match) => {
      const lower = match.toLowerCase();
      const entry = sorted.find((e) => e.home.toLowerCase() === lower);
      if (!entry) return match;
      const tradeLower = entry.trade.toLowerCase();
      if (match === match.toUpperCase()) return tradeLower.toUpperCase();
      if (match[0] === match[0].toUpperCase()) {
        return tradeLower.charAt(0).toUpperCase() + tradeLower.slice(1);
      }
      return tradeLower;
    });
  }

  return {
    title: translateText(task.title),
    description: translateText(task.description),
  };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* --------------------------------------------------------- trade badge */
/** Returns an HTML string for a trade badge pill. */
export function tradeBadgeHTML(tradeId) {
  const t = tradeById(tradeId);
  if (!t) return "";
  return `<span class="trade-badge" style="background:${t.color}22;color:${t.color};border-color:${t.color}55">${t.icon} ${t.name}</span>`;
}
