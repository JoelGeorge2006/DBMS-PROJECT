/**
 * Commodity and state catalogue shared by db/setup.js and scripts/import/load.js.
 * Every mineral or state name used by a data source maps to one canonical name here.
 */

export const COMMODITIES = {
  Metallic: ['Aluminous Laterite', 'Antimony', 'Bauxite', 'Beryllium', 'Cadmium', 'Chromite', 'Cobalt', 'Copper', 'Gallium',
    'Gold', 'Indium', 'Iron Ore', 'Lead', 'Lead & Zinc', 'Lithium', 'Manganese Ore', 'Molybdenum', 'Nickel',
    'Platinum Group Metals', 'Rare Earth Elements', 'Rhenium', 'Selenium', 'Silver', 'Tantalum', 'Tellurium', 'Tin',
    'Titanium', 'Tungsten', 'Vanadium', 'Zinc'],
  'Non-metallic': ['Andalusite', 'Apatite', 'Asbestos', 'Beryl', 'Borax', 'Diatomite', 'Dolomite', 'Epidote', 'Fluorite',
    'Garnet', 'Graphite', 'Ilmenite', 'Kyanite', 'Limeshell', 'Limestone', 'Magnesite', 'Marl', 'Mica', 'Moulding Sand',
    'Perlite', 'Phosphorite', 'Potash', 'Pyrite', 'Rock Salt', 'Selenite', 'Siliceous Earth', 'Sillimanite', 'Sulphur',
    'Talc', 'Vermiculite', 'Wollastonite', 'Zircon'],
  Fuel: ['Coal', 'Lignite'],
  Atomic: ['Monazite', 'Uranium'],
  Gemstone: ['Alexandrite', 'Amethyst', 'Diamond', 'Emerald', 'Gemstones (other)', 'Iolite', 'Ruby', 'Sapphire'],
};
// The Ministry of Mines list of 30 critical minerals (2023), where they appear here
export const CRITICAL = new Set(['Antimony', 'Beryllium', 'Cadmium', 'Cobalt', 'Copper', 'Gallium', 'Graphite', 'Indium', 'Lithium',
  'Molybdenum', 'Nickel', 'Phosphorite', 'Platinum Group Metals', 'Potash', 'Rare Earth Elements', 'Rhenium', 'Selenium',
  'Tantalum', 'Tellurium', 'Tin', 'Titanium', 'Tungsten', 'Vanadium', 'Zircon']);

// Names used by the sources, where they differ from the commodity name
export const ALIASES = {
  // Existing mineral grades (core.json)
  'Bauxite (Gibbsite 52%)': 'Bauxite', 'Chromite (Metallurgical)': 'Chromite', 'Cobalt ore': 'Cobalt',
  'Copper (Chalcopyrite 2.4%)': 'Copper', 'Copper ore': 'Copper', 'Gold ore': 'Gold', 'Iron & Manganese': 'Iron Ore',
  'Iron Ore (Hematite 64.2%)': 'Iron Ore', 'Iron Ore (Magnetite 68%)': 'Iron Ore', 'Iron ore': 'Iron Ore',
  'Lead ore': 'Lead', 'Lead-Zinc Ore': 'Lead & Zinc', 'Lithium ore': 'Lithium', 'Manganese Ore (High Grade)': 'Manganese Ore',
  'Manganese ore': 'Manganese Ore', 'Platinum-group ore': 'Platinum Group Metals', 'Rare earths (monazite)': 'Rare Earth Elements',
  'Silver ore': 'Silver', 'Tungsten ore': 'Tungsten', 'Uranium ore': 'Uranium', 'Zinc ore': 'Zinc',
  // Production products (Economic Survey)
  'Copper Concentrate': 'Copper', 'Copper Ore': 'Copper', 'Gold Ore': 'Gold', 'Gold Primary': 'Gold',
  'Lead & Zinc Ore': 'Lead & Zinc', 'Lead Concentrate': 'Lead', 'Zinc Concentrate': 'Zinc', 'Tin Concentrate': 'Tin',
  // Lease and reserve labels (IBM)
  'Lead and Zinc Ore': 'Lead & Zinc', 'Lead-Zinc': 'Lead & Zinc', Fluorspar: 'Fluorite', 'Gemstone Cats Eye': 'Gemstones (other)',
  'Semi Precious Stone': 'Gemstones (other)', 'Rock Phosphate': 'Phosphorite', Sillamanite: 'Sillimanite',
  'Stibnite/Antimony': 'Antimony', 'Cobalt (Ore)': 'Cobalt', 'Nickel Ore': 'Nickel', 'Platinum group of metals (PGM)': 'Platinum Group Metals',
  'Rare Earth Elements (REE)': 'Rare Earth Elements', 'Sulphur (Native)': 'Sulphur', Gold: 'Gold',
  // Auctions (PIB)
  Halite: 'Rock Salt',
};

// --- States ------------------------------------------------------------------
export const STATE_ALIASES = { Orissa: 'Odisha', Uttaranchal: 'Uttarakhand', 'Jammu & Kashmir': 'Jammu and Kashmir', 'Ladakh (UT)': 'Ladakh' };
export const UNION_TERRITORIES = new Set(['Jammu and Kashmir', 'Ladakh']);
export const stateName = (raw) => STATE_ALIASES[raw.trim()] || raw.trim();

const KNOWN = new Set(Object.values(COMMODITIES).flat());

/** Canonical commodity name for a source's mineral name; throws when there is none */
export function commodityName(raw) {
  const name = ALIASES[raw.trim()] || raw.trim();
  if (!KNOWN.has(name)) throw new Error(`No commodity for "${raw}": add it to COMMODITIES or ALIASES in db/commodities.js`);
  return name;
}
