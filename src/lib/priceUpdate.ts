import { rm } from './format.ts'
import { ANY_ZONE, MODE_LABEL, rowActive, zoneLabel } from './pricedesk.ts'
import { dayBefore, sheetDiff, tabName, type PriceSheet, type SheetVersion } from './tileSheet.ts'
import type { DeliveryMode, PriceChange, PriceChangeLine, PriceDeskRow, Product, TierUnit } from './types.ts'
import { uid } from './utils.ts'

// How the desk publishes a price change outside the Monier sheet, and how every change is written up
// for the change log and the WhatsApp broadcast.

export interface CardRow {
  zone: string
  mode: DeliveryMode
  tierUnit: TierUnit
  minQty: number
  sell: number
  cost: number
}

const LINE_CAP = 300
const r4 = (value: number) => Math.round(value * 10000) / 10000

export const keyOf = (row: Pick<CardRow, 'zone' | 'mode' | 'tierUnit' | 'minQty'>) => `${row.zone}|${row.mode}|${row.tierUnit}|${row.minQty}`

export function rowLabel(row: Pick<CardRow, 'zone' | 'mode' | 'tierUnit' | 'minQty'>, uom: string): string {
  const qty = row.minQty <= 1 && row.tierUnit === 'unit' ? 'any qty' : `from ${row.minQty.toLocaleString('en-MY')} ${row.tierUnit === 'pallet' ? 'plt' : uom}`
  return [zoneLabel(row.zone), row.mode === 'any' ? null : MODE_LABEL[row.mode], qty].filter(Boolean).join(' · ')
}

// The price card in force on a date: one row per zone / mode / tier, the newest wins.
export function cardOn(priceRows: PriceDeskRow[], code: string, date: string): PriceDeskRow[] {
  const best = new Map<string, PriceDeskRow>()
  for (const row of priceRows) {
    if (row.code !== code || !rowActive(row, date)) continue
    const key = keyOf(row)
    const seen = best.get(key)
    if (!seen || row.effectiveFrom > seen.effectiveFrom) best.set(key, row)
  }
  return [...best.values()].toSorted(
    (a, b) => (a.zone === ANY_ZONE ? -1 : 0) - (b.zone === ANY_ZONE ? -1 : 0) || a.zone.localeCompare(b.zone) || a.mode.localeCompare(b.mode) || a.minQty - b.minQty,
  )
}

/**
 * Publish new price cards. For each code, rows that are still running on the effective date are closed the
 * day before; rows already dated on/after it are replaced. Locked sales-order lines keep their own copy.
 */
export function applyCards(
  priceRows: PriceDeskRow[],
  products: Product[],
  cards: { code: string; rows: CardRow[] }[],
  effectiveFrom: string,
  note: string,
): { priceRows: PriceDeskRow[]; lines: PriceChangeLine[] } {
  const codes = new Set(cards.map((card) => card.code))
  const lines: PriceChangeLine[] = []
  for (const card of cards) {
    const product = products.find((p) => p.code === card.code)
    const was = new Map(cardOn(priceRows, card.code, effectiveFrom).map((row) => [keyOf(row), row]))
    for (const row of card.rows) {
      const prior = was.get(keyOf(row))
      if (!prior || Math.abs(prior.sell - row.sell) > 0.00001) {
        lines.push({ code: card.code, label: `${product?.name ?? card.code} · ${rowLabel(row, product?.uom ?? 'unit')}`, before: prior?.sell ?? null, after: r4(row.sell) })
      }
    }
  }
  const cut = dayBefore(effectiveFrom)
  const kept: PriceDeskRow[] = []
  for (const row of priceRows) {
    if (!codes.has(row.code)) {
      kept.push(row)
      continue
    }
    if (row.effectiveFrom >= effectiveFrom) continue
    if (row.effectiveTo === null || row.effectiveTo >= effectiveFrom) kept.push({ ...row, effectiveTo: cut })
    else kept.push(row)
  }
  const added = cards.flatMap((card) =>
    card.rows.map((row) => ({
      id: uid('pr'),
      code: card.code,
      zone: row.zone,
      mode: row.mode,
      tierUnit: row.tierUnit,
      minQty: row.minQty,
      sell: r4(row.sell),
      cost: r4(row.cost),
      effectiveFrom,
      effectiveTo: null,
      note,
    })),
  )
  return { priceRows: [...added, ...kept], lines }
}

export interface BulkMove {
  // Applied to sell; cost moves too when withCost is on (supplier price went up, keep the margin).
  pct: number
  rm: number
  withCost: boolean
}

export function bulkCards(priceRows: PriceDeskRow[], codes: string[], date: string, move: BulkMove): { cards: { code: string; rows: CardRow[] }[]; skipped: string[] } {
  const cards: { code: string; rows: CardRow[] }[] = []
  const skipped: string[] = []
  const shift = (value: number) => Math.max(0, Math.round((value * (1 + move.pct / 100) + move.rm) * 100) / 100)
  for (const code of codes) {
    const now = cardOn(priceRows, code, date)
    if (now.length === 0) {
      skipped.push(code)
      continue
    }
    cards.push({
      code,
      rows: now.map((row) => ({ zone: row.zone, mode: row.mode, tierUnit: row.tierUnit, minQty: row.minQty, sell: shift(row.sell), cost: move.withCost ? shift(row.cost) : row.cost })),
    })
  }
  return { cards, skipped }
}

function summarise(lines: PriceChangeLine[]): string {
  const moved = lines.filter((line) => line.before !== null)
  if (moved.length === 0) return `${lines.length} new price${lines.length === 1 ? '' : 's'}`
  const deltas = moved.map((line) => line.after - (line.before ?? 0))
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length
  const pct = moved.reduce((sum, line) => sum + (line.after - (line.before ?? 0)) / Math.max(0.0001, line.before ?? 1), 0) / moved.length
  const fresh = lines.length - moved.length
  return `${moved.length} price${moved.length === 1 ? '' : 's'} ${avg >= 0 ? 'up' : 'down'} avg ${rm(Math.abs(avg))} (${avg >= 0 ? '+' : '−'}${Math.abs(pct * 100).toFixed(1)}%)${fresh > 0 ? `, ${fresh} new` : ''}`
}

export function makeChange(input: Omit<PriceChange, 'id' | 'summary' | 'more' | 'lines'> & { lines: PriceChangeLine[] }): PriceChange {
  return {
    ...input,
    id: uid('pc'),
    summary: summarise(input.lines),
    lines: input.lines.slice(0, LINE_CAP),
    more: Math.max(0, input.lines.length - LINE_CAP),
  }
}

export function sheetChange(sheet: PriceSheet, before: SheetVersion | undefined, after: SheetVersion, at: string, by: string): PriceChange {
  const lines = sheetDiff(before, after).map((line) => ({ code: sheet.codes[0] ?? '', ...line }))
  return makeChange({
    at,
    by,
    kind: 'sheet',
    title: `${sheet.title} · sheet ${after.tab}`,
    effectiveFrom: after.effectiveFrom,
    codes: sheet.codes,
    lines,
  })
}

// The 13 old Excel tabs become the start of the log, so the history is there on day one.
export function seedPriceLog(sheets: PriceSheet[]): PriceChange[] {
  return sheets.flatMap((sheet) =>
    sheet.versions.map((version, index) => {
      const change = sheetChange(sheet, sheet.versions[index + 1], version, version.createdAt, version.by)
      return { ...change, id: `pc-${version.id}`, title: `${sheet.title} · tab ${version.tab} (from Excel)` }
    }),
  )
}

// The message the sales group gets. Short enough to read on a phone; the full list is on the desk.
export function broadcastText(change: PriceChange): string {
  const top = change.lines.slice(0, 4).map((line) => (line.before === null ? `• ${line.label}: ${rm(line.after)} (new)` : `• ${line.label}: ${rm(line.before)} → ${rm(line.after)}`))
  const rest = change.lines.length + change.more - top.length
  return [
    `PRICE UPDATE from ${tabName(change.effectiveFrom)}`,
    change.title,
    change.summary + '.',
    ...top,
    rest > 0 ? `+${rest} more on the Price Desk. Ask “price <item> <town>” for any item.` : 'Ask “price <item> <town>” for any item.',
    'Orders already locked keep their price.',
  ].join('\n')
}
