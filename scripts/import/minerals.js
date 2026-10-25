/**
 * Mineral dictionary for imported mines: generic names (no grades), the
 * MINERAL.mineral_type family, and how OSM tags / names / Wikidata products map onto them.
 * Scope: major minerals and coal. Minor minerals (building stone, sand, gravel,
 * ordinary clay, granite, marble, laterite...) are out of scope.
 */
export const MINERALS = {
  coal: { name: 'Coal', type: 'Fuel / Coal' },
  lignite: { name: 'Lignite', type: 'Fuel / Lignite' },
  iron: { name: 'Iron ore', type: 'Metallic / Ferrous' },
  manganese: { name: 'Manganese ore', type: 'Metallic / Ferro-Alloy' },
  chromite: { name: 'Chromite', type: 'Metallic / Strategic Alloy' },
  tungsten: { name: 'Tungsten ore', type: 'Metallic / Strategic Alloy' },
  bauxite: { name: 'Bauxite', type: 'Metallic / Alumina Feedstock' },
  copper: { name: 'Copper ore', type: 'Metallic / Base Metal' },
  zinc: { name: 'Zinc ore', type: 'Metallic / Base Metal' },
  lead: { name: 'Lead ore', type: 'Metallic / Base Metal' },
  gold: { name: 'Gold ore', type: 'Metallic / Precious' },
  silver: { name: 'Silver ore', type: 'Metallic / Precious' },
  platinum: { name: 'Platinum-group ore', type: 'Metallic / Precious' },
  diamond: { name: 'Diamond', type: 'Gemstone' },
  uranium: { name: 'Uranium ore', type: 'Atomic' },
  limestone: { name: 'Limestone', type: 'Non-metallic / Industrial' },
  dolomite: { name: 'Dolomite', type: 'Non-metallic / Industrial' },
  mica: { name: 'Mica', type: 'Non-metallic / Industrial' },
  talc: { name: 'Talc', type: 'Non-metallic / Industrial' },
  magnesite: { name: 'Magnesite', type: 'Non-metallic / Industrial' },
  asbestos: { name: 'Asbestos', type: 'Non-metallic / Industrial' },
  lithium: { name: 'Lithium ore', type: 'Metallic / Strategic Alloy' },
  cobalt: { name: 'Cobalt ore', type: 'Metallic / Strategic Alloy' },
  rare_earths: { name: 'Rare earths (monazite)', type: 'Atomic' },
};

/** OSM resource=* / product=* values (lower-case) */
export const OSM_RESOURCE = {
  coal: 'coal',
  lignite: 'lignite',
  iron_ore: 'iron',
  iron: 'iron',
  manganese: 'manganese',
  chromite: 'chromite',
  chromium: 'chromite',
  tungsten: 'tungsten',
  wolframite: 'tungsten',
  bauxite: 'bauxite',
  aluminium: 'bauxite',
  copper: 'copper',
  zinc: 'zinc',
  lead: 'lead',
  gold: 'gold',
  silver: 'silver',
  diamond: 'diamond',
  uranium: 'uranium',
  limestone: 'limestone',
  dolomite: 'dolomite',
  mica: 'mica',
  talc: 'talc',
  magnesite: 'magnesite',
  asbestos: 'asbestos',
  lithium: 'lithium',
  cobalt: 'cobalt',
  monazite: 'rare_earths',
  rare_earth_elements: 'rare_earths',
};

/** Values that mark a minor mineral: the feature is skipped */
export const MINOR_RESOURCES = new Set([
  'clay', 'aggregate', 'stone', 'dimension_stone', 'sand', 'laterite', 'granite', 'gravel', 'sandstone',
  'marble', 'cement', 'rock', 'rock_sand', 'building_stone', 'granite_stone', 'laterite_stone', 'pierre', 'salt',
]);

/** Name / Wikidata label keywords, checked in this order */
export const KEYWORDS = [
  [/\blignite\b/, 'lignite'],
  [/\b(coal|colliery|collieries|coalfield|o\.?c\.?p\.?|opencast project)\b/, 'coal'],
  [/\b(iron|hematite|haematite|magnetite)\b/, 'iron'],
  [/\bmanganese\b/, 'manganese'],
  [/\bchrom(ite|ium|e)\b/, 'chromite'],
  [/\b(tungsten|wolfram)/, 'tungsten'],
  [/\bbauxite\b/, 'bauxite'],
  [/\bcopper\b/, 'copper'],
  [/\bzinc\b/, 'zinc'],
  [/\blead\b/, 'lead'],
  [/\bgold\b/, 'gold'],
  [/\bsilver\b/, 'silver'],
  [/\b(platinum|palladium)\b/, 'platinum'],
  [/\bdiamond\b/, 'diamond'],
  [/\buranium\b/, 'uranium'],
  [/\blime ?stone\b/, 'limestone'],
  [/\bdol[oa]mite\b/, 'dolomite'],
  [/\bmica\b/, 'mica'],
  [/\btalc\b/, 'talc'],
  [/\bmagnesite\b/, 'magnesite'],
  [/\basbestos\b/, 'asbestos'],
  [/\blithium\b/, 'lithium'],
  [/\bcobalt\b/, 'cobalt'],
  [/\b(monazite|rare earths?)\b/, 'rare_earths'],
];

/** Operators that mine one mineral: used when a feature has no resource tag or keyword */
export const OPERATOR_MINERAL = [
  [/coal india|coalfields|bharat coking|\b(bccl|ccl|ecl|mcl|ncl|secl|wcl|necl|nec|sccl)\b|singareni/i, 'coal'],
  [/\bmoil\b|manganese ore \(india\)/i, 'manganese'],
  [/hindustan copper|\bhcl\b/i, 'copper'],
  [/\bnmdc\b|kudremukh|kiocl/i, 'iron'],
  [/neyveli|nlc india/i, 'lignite'],
  [/uranium corporation|\bucil\b/i, 'uranium'],
  [/hindustan zinc/i, 'zinc'],
];

export function mineralFromOperator(operator) {
  return OPERATOR_MINERAL.find(([re]) => re.test(String(operator || '')))?.[1] || null;
}

export function mineralFromText(text) {
  const t = String(text || '').toLowerCase();
  for (const [re, key] of KEYWORDS) if (re.test(t)) return key;
  return null;
}

/** Every mineral mentioned, in the order the texts are given (first = primary) */
export function mineralsFromList(texts) {
  const out = [];
  for (const text of texts) {
    const key = mineralFromText(text);
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Words that name a mineral, ignored when comparing mine names across sources */
export const MINERAL_WORDS = new Set([
  'coal', 'lignite', 'iron', 'ore', 'ores', 'manganese', 'chromite', 'bauxite', 'copper', 'zinc', 'lead', 'gold',
  'silver', 'diamond', 'uranium', 'limestone', 'dolomite', 'mica', 'talc', 'magnesite', 'asbestos', 'tungsten',
]);
