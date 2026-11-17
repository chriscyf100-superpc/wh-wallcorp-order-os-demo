import emas from '../data/emas-items.json'
import type { Product } from './types.ts'

// EMAS "Item code listing" printed 03/11/2026 — all 3,768 codes, read from price list.pdf.
// Each code is sorted by what the description says it is (scripts/emas-categories.py: name rules first, code
// prefix as fallback), into 12 groups → 52 categories, with the brand where the description names one.
// Prices in the listing are 0.0000 except three cement codes at A = 10.00, so selling prices live on the Price Desk.
interface EmasFile {
  source: string
  groups: { name: string; categories: number[] }[]
  categories: string[]
  brands: string[]
  items: [code: string, name: string, unit: string, listA: number, category: number, brand: number][]
}

const file = emas as EmasFile

export const EMAS_SOURCE = file.source
export const BRANDS = file.brands

export const GROUPS: { name: string; categories: string[] }[] = file.groups.map((group) => ({
  name: group.name,
  categories: group.categories.map((index) => file.categories[index] ?? 'Other'),
}))

const GROUP_OF = new Map(GROUPS.flatMap((group) => group.categories.map((category) => [category, group.name] as const)))

// Demo (non-EMAS) products use their own short category names; fold them into the same groups.
const DEMO_GROUP: Record<string, string> = {
  'Clay bricks': 'Bricks & blocks',
  Blocks: 'Bricks & blocks',
  Pavers: 'Paving & landscape',
  'Floor tiles': 'Paving & landscape',
  'Wall tiles': 'Paving & landscape',
  'Roof tiles': 'Roofing',
  'Roof tile accessories': 'Roofing',
  'Tile fixing': 'Cement, mortar & render',
  'Cement & mortar': 'Cement, mortar & render',
  Waterproofing: 'Waterproofing & chemicals',
  Aggregates: 'Sundries',
  Drainage: 'Concrete & drainage',
  Boards: 'Boards & timber',
  Steel: 'Steel',
}

export function groupOf(category: string): string {
  return GROUP_OF.get(category) ?? DEMO_GROUP[category] ?? 'Sundries'
}

export const EMAS_PRODUCTS: Product[] = file.items.map(([code, name, unit, listA, category, brand]) => {
  const cat = file.categories[category] ?? 'Other'
  const product: Product = { code, name, uom: unit ? unit.toLowerCase() : '—', category: cat, group: groupOf(cat), source: 'emas' }
  if (brand >= 0) product.brand = file.brands[brand]
  if (listA > 0) product.listA = listA
  if (cat === 'Monier roof tiles' && /ROOFTILES/.test(name)) product.palletQty = 318
  return product
})

// Demo products first (they carry the seeded price rows), then every EMAS code not already present.
export function withCatalog(demo: Product[]): Product[] {
  const seen = new Set(demo.map((p) => p.code))
  return [...demo.map((p) => (p.group ? p : { ...p, group: groupOf(p.category) })), ...EMAS_PRODUCTS.filter((p) => !seen.has(p.code))]
}
