import { ANY_ZONE } from './pricedesk.ts'
import { seedPriceSheets, sheetRows } from './tileSheet.ts'
import type { DeliveryMode, PriceDeskRow, Product, Sku, TierUnit } from './types.ts'

// Illustrative master + prices only. The tile and brick rows follow the shape of HQ sheet exports.
// Everything here is fictional W&H Wallcorp demo data. EMAS (~3768 codes) replaces the master later.


const BRICKS: { code: string; name: string; palletQty: number }[] = [
  { code: 'BR-CCB-672', name: 'Clay common brick 672/plt', palletQty: 672 },
  { code: 'BR-CCB-624S', name: 'Clay common brick 624/plt solid', palletQty: 624 },
  { code: 'BR-CCB-624H', name: 'Clay common brick 624/plt 3-hole', palletQty: 624 },
  { code: 'BR-CCB-720S', name: 'Clay common brick 720/plt solid', palletQty: 720 },
  { code: 'BR-CCB-720H', name: 'Clay common brick 720/plt 3-hole', palletQty: 720 },
]

function codesOnly(
  list: [code: string, name: string, uom: string, category: string][],
): Product[] {
  return list.map(([code, name, uom, category]) => ({ code, name, uom, category }))
}

export function seedProducts(skus: Sku[]): Product[] {
  const legacy: Product[] = skus.map((sku) => ({
    code: sku.code,
    name: sku.name,
    uom: sku.unit,
    category: LEGACY_CATEGORY[sku.id] ?? 'General',
  }))
  const bricks: Product[] = BRICKS.map((brick) => ({
    code: brick.code,
    name: brick.name,
    uom: 'pcs',
    category: 'Clay bricks',
    palletQty: brick.palletQty,
  }))
  const rest = codesOnly([
    ['RT-FLAT-TERRA', 'Flat roof tile Terracotta', 'pcs', 'Roof tiles'],
    ['RT-FLAT-GREY', 'Flat roof tile Grey', 'pcs', 'Roof tiles'],
    ['RT-RIDGE-CEM', 'Ridge cement 25kg', 'bag', 'Roof tile accessories'],
    ['BR-FACE-RED', 'Face brick red', 'pcs', 'Clay bricks'],
    ['BR-FACE-BUFF', 'Face brick buff', 'pcs', 'Clay bricks'],
    ['BR-AIR-225', 'Air brick 225mm', 'pcs', 'Clay bricks'],
    ['BL-CON-4', 'Concrete block 4"', 'pcs', 'Blocks'],
    ['BL-CON-6', 'Concrete block 6"', 'pcs', 'Blocks'],
    ['BL-HOLLOW-6', 'Hollow block 6"', 'pcs', 'Blocks'],
    ['BL-LIGHT-100', 'Lightweight block 100mm', 'pcs', 'Blocks'],
    ['PV-INT-60', 'Interlocking paver 60mm grey', 'pcs', 'Pavers'],
    ['PV-INT-80', 'Interlocking paver 80mm grey', 'pcs', 'Pavers'],
    ['PV-KERB-1', 'Kerb stone 1m', 'pcs', 'Pavers'],
    ['FT-600-GREY', 'Floor tile 600x600 grey', 'box', 'Floor tiles'],
    ['FT-600-BEIGE', 'Floor tile 600x600 beige', 'box', 'Floor tiles'],
    ['FT-300-ANTI', 'Floor tile 300x300 anti-slip', 'box', 'Floor tiles'],
    ['WT-300-WHT', 'Wall tile 300x600 white', 'box', 'Wall tiles'],
    ['WT-250-GLOSS', 'Wall tile 250x400 gloss', 'box', 'Wall tiles'],
    ['TA-GREY-25', 'Tile adhesive grey 25kg', 'bag', 'Tile fixing'],
    ['TA-WHITE-25', 'Tile adhesive white 25kg', 'bag', 'Tile fixing'],
    ['TG-GREY-5', 'Tile grout grey 5kg', 'bag', 'Tile fixing'],
    ['TG-WHITE-5', 'Tile grout white 5kg', 'bag', 'Tile fixing'],
    ['TS-SPACER-2', 'Tile spacer 2mm (bag)', 'bag', 'Tile fixing'],
    ['WH-APLAS-25', 'W&H A-plas mortar additive 25kg', 'bag', 'Mortar additives'],
    ['WH-BOND-20', 'W&H BondPlus latex 20L', 'pail', 'Mortar additives'],
    ['WH-WALLSKIM-20', 'W&H WallSkim finish coat 20kg', 'bag', 'Wall products'],
    ['WP-BIT-4', 'Waterproofing membrane 4mm', 'roll', 'Waterproofing'],
    ['WP-CEM-20', 'Cementitious waterproofing 20kg', 'bag', 'Waterproofing'],
  ])
  return [...legacy, ...bricks, ...rest]
}

const LEGACY_CATEGORY: Record<string, string> = {
  'red-brick': 'Clay bricks',
  paver: 'Pavers',
  'river-sand': 'Aggregates',
  stone: 'Aggregates',
  cement: 'Cement & mortar',
  emix: 'Cement & mortar',
  'oka-300': 'Drainage',
  'u-drain': 'Drainage',
  'cem-board': 'Boards',
  y12: 'Steel',
  brc: 'Steel',
}

let counter = 0
function row(
  code: string,
  zone: string,
  mode: DeliveryMode,
  tierUnit: TierUnit,
  minQty: number,
  sell: number,
  cost: number,
  effectiveFrom: string,
  effectiveTo: string | null,
  note = '',
): PriceDeskRow {
  counter += 1
  return {
    id: `pd-seed-${String(counter).padStart(4, '0')}`,
    code,
    zone,
    mode,
    tierUnit,
    minQty,
    sell: round(sell),
    cost: round(cost),
    effectiveFrom,
    effectiveTo,
    note,
  }
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

// Delivered cost RM/pc per zone for 672/plt direct bricks (illustrative).
const BRICK_COST: Record<string, number> = {
  Kangar: 0.46,
  'Shah Alam': 0.45,
  Baling: 0.46,
  'Sungai Petani': 0.44,
  Butterworth: 0.43,
  Ipoh: 0.47,
}

export function seedPriceRows(skus: Sku[]): PriceDeskRow[] {
  counter = 0
  const rows: PriceDeskRow[] = []

  // Quick-sheet items: a flat all-zones row per tier, so the demo orders have a cost to lock.
  for (const sku of skus) {
    for (const tier of sku.tiers) {
      rows.push(
        row(sku.code, ANY_ZONE, 'any', 'unit', tier.minQty, tier.price, tier.price * 0.82, '2026-01-01', null, 'Base list'),
      )
    }
  }
  // One zone override so the demo can show "exact zone beats all zones".
  rows.push(row('CEMENT-50', 'Kangar', 'any', 'unit', 1, 22.8, 19.1, '2026-01-01', null, 'Kangar freight'))

  // Monier Elabana tiles come from the price sheet (tileSheet.ts), not from here.
  rows.push(...seedPriceSheets().flatMap(sheetRows))

  for (const brick of BRICKS) {
    const bump = brick.code.endsWith('H') ? -0.01 : 0
    for (const [zone, base] of Object.entries(BRICK_COST)) {
      const cost = base + bump
      // Old sheet, superseded on 15 Oct 2026 by the dated rows below.
      rows.push(row(brick.code, zone, 'direct', 'pallet', 13, cost + 0.01, cost, '2026-07-12', '2026-10-14', '13 plts & above'))
      rows.push(row(brick.code, zone, 'direct', 'pallet', 13, cost + 0.04, cost + 0.03, '2026-10-15', null, '13 plts & above'))
      rows.push(row(brick.code, zone, 'direct', 'pallet', 4, cost + 0.08, cost + 0.03, '2026-10-15', null, 'Min del 4 plts & above'))
      rows.push(row(brick.code, zone, 'shop_site', 'pallet', 19, cost + 0.06, cost + 0.03, '2026-10-15', null, 'Full load 19 plts'))
      rows.push(row(brick.code, zone, 'loose', 'pallet', 0, cost + 0.14, cost + 0.05, '2026-10-15', null, 'Below 4 plts, loose'))
    }
    rows.push(row(brick.code, ANY_ZONE, 'own_collection', 'unit', 1, base0(brick) + 0.02, base0(brick) - 0.06, '2026-10-15', null, 'Ex-yard collection'))
  }

  return rows
}

function base0(brick: { code: string }): number {
  return brick.code.endsWith('H') ? 0.44 : 0.45
}
