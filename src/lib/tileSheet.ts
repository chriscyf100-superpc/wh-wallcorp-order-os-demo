import type { PriceDeskRow } from './types.ts'
import { ANY_ZONE } from './pricedesk.ts'

/*
 * The HQ tile price sheet ("Roofing Tiles Monier.xls"), as a model instead of a copied tab.
 *
 * Every number on the Excel tab comes from three inputs:
 *   1. Monier's factory cost per piece (ex-factory, pallet)          e.g. RM 2.56
 *   2. Transport rate per piece to each town (from B'worth)           e.g. Shah Alam RM 0.18
 *   3. Fixed add-ons (the "+ 0.05 / + 0.10" cells over the columns)
 * So "Costing delivered" = cost + transport, and each Price List column = costing + its add-on.
 * HQ changes 1 (sometimes 2) and the sheet recomputes; publishing writes dated Price Desk rows.
 */

export interface SheetTown {
  code: number
  state: string
  town: string
  km: number
  // Lorry cost per trip, kept for reference (W/O crane, with crane) — shown, not used in the maths.
  full30: [number, number] | null
  full8: [number, number] | null
}

export const TOWNS: SheetTown[] = [
  { code: 101, state: 'Perlis', town: 'Kangar', km: 149, full30: [596, 666], full8: [298, 328] },
  { code: 201, state: 'Selangor', town: 'Shah Alam', km: 101, full30: [404, 474], full8: [202, 232] },
  { code: 202, state: 'Selangor', town: 'Baling', km: 138, full30: [552, 622], full8: [276, 306] },
  { code: 203, state: 'Selangor', town: 'Sungai Petani', km: 80, full30: [320, 390], full8: [160, 190] },
  { code: 301, state: 'Penang', town: 'Butterworth', km: 65, full30: [260, 330], full8: [130, 160] },
  { code: 302, state: 'Penang', town: 'Nibong Tebal', km: 78, full30: [312, 382], full8: [156, 186] },
  { code: 303, state: 'Penang', town: 'Penang', km: 80, full30: [368, 438], full8: [180, 210] },
  { code: 401, state: 'Perak', town: 'Pengkalan Hulu', km: 88, full30: null, full8: null },
  { code: 402, state: 'Perak', town: 'Gerik', km: 119, full30: null, full8: null },
  { code: 403, state: 'Perak', town: 'Ipoh', km: 147, full30: null, full8: null },
  { code: 404, state: 'Perak', town: 'Sitiawan', km: 164, full30: null, full8: null },
  { code: 406, state: 'Perak', town: 'Taiping', km: 88, full30: null, full8: null },
]

export interface AddOns {
  // Price List, above 3,180 pcs (10 plts): costing + bulk
  bulk: number
  // Price List, 1,590 – 3,180 pcs: costing + mid
  mid: number
  // Costing delivered, 318 – 1,590 pcs: costing + smallCost
  smallCost: number
  // Price List, 318 – 1,590 pcs: costing + smallPrice
  smallPrice: number
  // Own collection at Monier factory (pallet): cost + factory
  factory: number
  // Remark 1: site delivery in Perlis, Selangor, Penang & Perak
  site: number
  // Remark 2: loose (not on pallet)
  loose: number
}

export const DEFAULT_ADDONS: AddOns = { bulk: 0.05, mid: 0.1, smallCost: 0.1, smallPrice: 0.2, factory: 0.05, site: 0.05, loose: 0.5 }

export interface SheetVersion {
  id: string
  // The old Excel tab name (dd.mm.yyyy). New versions get one too, for people who still think in tabs.
  tab: string
  effectiveFrom: string
  factoryCost: number
  // RM per piece, same order as TOWNS
  transport: number[]
  addOns: AddOns
  // Cells HQ typed by hand instead of letting the formula fill them, by town code. A typed costing also moves
  // the price columns that are still on formula (they are costing + add-on).
  overrides?: Record<string, Partial<Record<CellKey, number>>>
  collectionOverrides?: Partial<Record<CollectionKey, number>>
  note: string
  by: string
  createdAt: string
}

export type CellKey = 'costing' | 'bulk' | 'mid' | 'smallCost' | 'smallPrice'
export type CollectionKey = 'yardCost' | 'yardPrice' | 'factoryCost' | 'factoryPrice'
type Priced = Pick<SheetVersion, 'factoryCost' | 'transport' | 'addOns' | 'overrides' | 'collectionOverrides'>

export interface PriceSheet {
  id: string
  title: string
  subtitle: string
  pcsPerPallet: number
  // EMAS item codes this sheet prices (Monier Elabana roof tiles, all colours)
  codes: string[]
  versions: SheetVersion[]
}

export const ELABANA_CODES = ['41-01-01-01', '41-10-01-01', '41-13-01-01', '41-17-01-01', '41-18-01-01', '41-19-01-01']

// Read from the 13 tabs in "Roofing Tiles Monier - Copy.xls". Older tabs used slightly different add-ons;
// the current add-ons are applied to all of them here.
const TABS: { tab: string; effectiveFrom: string; factoryCost: number; transport: number[] }[] = [
  { tab: '05.08.2026', effectiveFrom: '2026-08-05', factoryCost: 2.56, transport: [0.22, 0.18, 0.18, 0.13, 0.13, 0.18, 0.22, 0.3, 0.3, 0.16, 0.16, 0.18] },
  { tab: '01.08.2026', effectiveFrom: '2026-08-01', factoryCost: 2.56, transport: [0.22, 0.18, 0.18, 0.13, 0.13, 0.18, 0.22, 0.29, 0.29, 0.15, 0.15, 0.17] },
  { tab: '18.06.2026', effectiveFrom: '2026-06-18', factoryCost: 2.325, transport: [0.21, 0.17, 0.17, 0.12, 0.12, 0.17, 0.21, 0.29, 0.29, 0.15, 0.15, 0.17] },
  { tab: '09.04.2026', effectiveFrom: '2026-04-09', factoryCost: 2.325, transport: [0.21, 0.17, 0.17, 0.12, 0.12, 0.17, 0.21, 0.29, 0.29, 0.15, 0.15, 0.17] },
  { tab: '11.03.2026', effectiveFrom: '2026-03-11', factoryCost: 2.325, transport: [0.19, 0.15, 0.15, 0.11, 0.15, 0.15, 0.19, 0.29, 0.29, 0.15, 0.15, 0.15] },
  { tab: '15.07.2025', effectiveFrom: '2025-07-15', factoryCost: 2.0925, transport: [0.19, 0.15, 0.15, 0.11, 0.15, 0.15, 0.19, 0.29, 0.29, 0.15, 0.15, 0.15] },
  { tab: '03.06.2025', effectiveFrom: '2025-06-03', factoryCost: 2.0925, transport: [0.19, 0.15, 0.15, 0.11, 0.15, 0.15, 0.19, 0.29, 0.29, 0.15, 0.15, 0.15] },
  { tab: '06.02.2025', effectiveFrom: '2025-02-06', factoryCost: 2.0925, transport: [0.19, 0.15, 0.15, 0.11, 0.15, 0.15, 0.19, 0.29, 0.29, 0.15, 0.15, 0.15] },
  { tab: '19.11.2024', effectiveFrom: '2024-11-19', factoryCost: 2.0925, transport: [0.19, 0.15, 0.15, 0.11, 0.15, 0.15, 0.19, 0.29, 0.29, 0.15, 0.15, 0.15] },
  { tab: '15.11.2024', effectiveFrom: '2024-11-15', factoryCost: 2.0925, transport: [0.19, 0.15, 0.15, 0.11, 0.15, 0.15, 0.19, 0.29, 0.29, 0.15, 0.15, 0.15] },
  { tab: '21.10.2024', effectiveFrom: '2024-10-21', factoryCost: 2.0925, transport: [0.19, 0.15, 0.15, 0.11, 0.15, 0.15, 0.19, 0.29, 0.29, 0.15, 0.15, 0.15] },
  { tab: '28.08.2024', effectiveFrom: '2024-08-28', factoryCost: 2.0, transport: [0.19, 0.15, 0.15, 0.11, 0.15, 0.15, 0.19, 0.29, 0.29, 0.15, 0.15, 0.15] },
  { tab: '26.05.2024', effectiveFrom: '2024-05-21', factoryCost: 2.0, transport: [0.19, 0.15, 0.15, 0.11, 0.15, 0.15, 0.19, 0.29, 0.29, 0.15, 0.15, 0.15] },
]

export function seedPriceSheets(): PriceSheet[] {
  return [
    {
      id: 'monier-elabana',
      title: 'Monier Tiles (Elabana)',
      subtitle: 'From Sungai Petani · 1 plt = 318 pcs',
      pcsPerPallet: 318,
      codes: ELABANA_CODES,
      versions: TABS.map((tab) => ({
        id: `ms-${tab.tab}`,
        tab: tab.tab,
        effectiveFrom: tab.effectiveFrom,
        factoryCost: tab.factoryCost,
        transport: tab.transport,
        addOns: DEFAULT_ADDONS,
        note: 'Imported from the Excel tab',
        by: 'HQ',
        createdAt: `${tab.effectiveFrom}T09:00:00`,
      })).toSorted((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    },
  ]
}

const r2 = (value: number): number => Math.round(value * 100 + Number.EPSILON * 100) / 100

export interface TownPrices {
  town: SheetTown
  transport: number
  costing: number
  bulk: number
  mid: number
  smallCost: number
  smallPrice: number
  // Which cells were typed rather than worked out
  typed: CellKey[]
}

export function townPrices(version: Priced): TownPrices[] {
  return TOWNS.map((town, index) => {
    const transport = version.transport[index] ?? 0
    const o = version.overrides?.[String(town.code)] ?? {}
    const a = version.addOns
    const costing = o.costing ?? r2(version.factoryCost + transport)
    return {
      town,
      transport,
      costing,
      bulk: o.bulk ?? r2(costing + a.bulk),
      mid: o.mid ?? r2(costing + a.mid),
      smallCost: o.smallCost ?? r2(costing + a.smallCost),
      smallPrice: o.smallPrice ?? r2(costing + a.smallPrice),
      typed: (Object.keys(o) as CellKey[]).filter((key) => o[key] !== undefined),
    }
  })
}

export function collections(version: Priced) {
  const as = TOWNS.findIndex((town) => town.town === 'Shah Alam')
  const o = version.collectionOverrides ?? {}
  const yardCost = o.yardCost ?? r2(version.factoryCost + (version.transport[as] ?? 0))
  return {
    yard: { cost: yardCost, price: o.yardPrice ?? yardCost },
    factory: { cost: o.factoryCost ?? r2(version.factoryCost), price: o.factoryPrice ?? r2(version.factoryCost + version.addOns.factory) },
  }
}

export function typedCount(version: Priced): number {
  const cells = Object.values(version.overrides ?? {}).reduce((n, row) => n + Object.values(row).filter((v) => v !== undefined).length, 0)
  return cells + Object.values(version.collectionOverrides ?? {}).filter((v) => v !== undefined).length
}

// What a customer pays, cell by cell, between two versions — for the change log and the broadcast.
export function sheetDiff(before: Priced | undefined, after: Priced): { label: string; before: number | null; after: number }[] {
  const now = townPrices(after)
  const was = before ? townPrices(before) : null
  const lines: { label: string; before: number | null; after: number }[] = []
  now.forEach((row, i) => {
    for (const col of COLUMNS) {
      if (!col.sell) continue
      const prior = was?.[i]?.[col.key] ?? null
      if (prior === null || Math.abs(prior - row[col.key]) > 0.0001) lines.push({ label: `${row.town.town} · ${col.sub}`, before: prior, after: row[col.key] })
    }
  })
  const c = collections(after)
  const p = before ? collections(before) : null
  if (!p || Math.abs(p.yard.price - c.yard.price) > 0.0001) lines.push({ label: 'Own collection @ Shah Alam', before: p?.yard.price ?? null, after: c.yard.price })
  if (!p || Math.abs(p.factory.price - c.factory.price) > 0.0001) lines.push({ label: 'Own collection @ factory', before: p?.factory.price ?? null, after: c.factory.price })
  return lines
}

export const COLUMNS: { key: 'transport' | CellKey; head: string; sub: string; sell: boolean }[] = [
  { key: 'transport', head: 'Transport', sub: 'RM / pc from B’worth', sell: false },
  { key: 'costing', head: 'Costing delivered', sub: 'above 12 plts', sell: false },
  { key: 'bulk', head: 'Price list', sub: 'above 3,180 pcs', sell: true },
  { key: 'mid', head: 'Price list', sub: '1,590 – 3,180 pcs', sell: true },
  { key: 'smallCost', head: 'Costing delivered', sub: '318 – 1,590 pcs', sell: false },
  { key: 'smallPrice', head: 'Price list', sub: '318 – 1,590 pcs', sell: true },
]

export function currentVersion(sheet: PriceSheet, date: string): SheetVersion | undefined {
  return sheet.versions.filter((v) => v.effectiveFrom <= date).toSorted((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
}

export function tabName(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}.${m}.${y}`
}

export function dayBefore(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

const SHEET_NOTE = 'Monier sheet'

// Price Desk rows for one sheet: the latest three versions (enough for anything still unlocked), each closed
// the day before the next one starts. Rows from older versions are dropped; locked SO lines keep their own copy.
export function sheetRows(sheet: PriceSheet): PriceDeskRow[] {
  const versions = sheet.versions.toSorted((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).slice(0, 3)
  const rows: PriceDeskRow[] = []
  versions.forEach((version, index) => {
    const newer = versions[index - 1]
    const effectiveTo = newer ? dayBefore(newer.effectiveFrom) : null
    const tag = `${SHEET_NOTE} ${version.tab}`
    const make = (code: string, zone: string, mode: PriceDeskRow['mode'], minQty: number, sell: number, cost: number, note: string): PriceDeskRow => ({
      id: `sh-${sheet.id}-${version.tab}-${code}-${zone}-${mode}-${minQty}`.replace(/\s+/g, '_'),
      code,
      zone,
      mode,
      tierUnit: 'unit',
      minQty,
      sell,
      cost,
      effectiveFrom: version.effectiveFrom,
      effectiveTo,
      note: `${tag} · ${note}`,
    })
    for (const code of sheet.codes) {
      for (const p of townPrices(version)) {
        rows.push(make(code, p.town.town, 'any', 3180, p.bulk, p.costing, 'above 3,180 pcs'))
        rows.push(make(code, p.town.town, 'any', 1590, p.mid, p.costing, '1,590 – 3,180 pcs'))
        rows.push(make(code, p.town.town, 'any', 318, p.smallPrice, p.smallCost, '318 – 1,590 pcs'))
        rows.push(make(code, p.town.town, 'loose', 0, r2(p.smallPrice + version.addOns.loose), r2(p.smallCost + version.addOns.loose), 'loose'))
      }
      const c = collections(version)
      rows.push(make(code, ANY_ZONE, 'own_collection', 0, c.yard.price, c.yard.cost, 'own collection @ Shah Alam'))
    }
  })
  return rows
}

export function isSheetRow(row: PriceDeskRow, sheet: PriceSheet): boolean {
  return sheet.codes.includes(row.code) && row.note.startsWith(SHEET_NOTE)
}

/* ---------- download in the same fixed layout ---------- */

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const money = (value: number) => value.toFixed(2)

// An Excel-readable file laid out like the old tab, so it can still be sent to customers as before.
export function sheetAsExcelHtml(sheet: PriceSheet, version: SheetVersion): string {
  const prices = townPrices(version)
  const c = collections(version)
  const longDate = new Date(`${version.effectiveFrom}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  let body = ''
  let state = ''
  for (const p of prices) {
    if (p.town.state !== state) {
      state = p.town.state
      body += `<tr><td></td><td colspan="10"><b>${esc(state)}</b></td></tr>`
    }
    body += `<tr><td>${p.town.code}</td><td>${esc(p.town.town)}</td><td>${p.town.km}</td><td>${p.town.full30?.[0] ?? ''}</td><td>${p.town.full30?.[1] ?? ''}</td><td>${p.town.full8?.[0] ?? ''}</td><td>${p.town.full8?.[1] ?? ''}</td>${COLUMNS.map((col) => `<td>${money(p[col.key])}</td>`).join('')}</tr>`
  }
  const a = version.addOns
  return `<html><head><meta charset="utf-8"></head><body><table border="1">
<tr><td colspan="13"><b>${esc(sheet.title)}-${esc(sheet.subtitle.split('·')[0].trim())}</b></td></tr>
<tr><td colspan="13">Effect ${esc(longDate)}</td></tr>
<tr><td colspan="13">1plt = ${sheet.pcsPerPallet}pcs · Monier cost RM ${version.factoryCost.toFixed(4)}/pc</td></tr>
<tr><th>Code</th><th>Town</th><th>KM from B'worth</th><th>Full load 30T W/O crane</th><th>With crane</th><th>Full load 8T W/O crane</th><th>With crane</th>${COLUMNS.map((col) => `<th>${esc(col.head)}<br>${esc(col.sub)}</th>`).join('')}</tr>
${body}
<tr><td></td><td colspan="6">*Own Collection @ Shah Alam*</td><td></td><td>${money(c.yard.cost)}</td><td>${money(c.yard.price)}</td></tr>
<tr><td></td><td colspan="6">*Own Collection @ Monier Factory (Pallet)*</td><td></td><td>${money(c.factory.cost)}</td><td>${money(c.factory.price)}</td></tr>
<tr><td colspan="13">** Remark :</td></tr>
<tr><td colspan="13">1.) For delivery to site Perlis, Selangor, Penang &amp; Perak add RM${money(a.site)}/pcs</td></tr>
<tr><td colspan="13">2.) Costing delivered &amp; price list for LOOSE add RM${money(a.loose)}/pcs</td></tr>
<tr><td colspan="13">Price Are Subject To Change Without Prior Notice</td></tr>
</table></body></html>`
}
