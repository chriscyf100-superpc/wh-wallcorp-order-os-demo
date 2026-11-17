import { rm } from './format.ts'
import type { Sku, Tier } from './types.ts'

export interface PriceRow {
  sku: string
  minQty: number
  price: number
}

export interface SheetResult {
  skus: Sku[]
  summary: string
}

function tierLabel(index: number): string {
  const names = ['Price A', 'Price B', 'Price C', 'Price D']
  return names[index] ?? `Tier ${index + 1}`
}

function splitCsvLine(line: string): string[] {
  return line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
}

export function parsePriceRows(csv: string): { rows: PriceRow[]; skipped: string[] } {
  const cleaned = csv.replace(/^\uFEFF/, '')
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
  const rows: PriceRow[] = []
  const skipped: string[] = []
  for (const line of lines) {
    if (/^sku\b/i.test(line)) continue
    const [code, qtyRaw, priceRaw] = splitCsvLine(line)
    const minQty = Number(qtyRaw)
    const price = Number(priceRaw)
    if (!code || !Number.isFinite(minQty) || minQty <= 0 || !Number.isFinite(price) || price < 0) {
      skipped.push(line)
      continue
    }
    rows.push({ sku: code, minQty, price: Math.round(price * 100) / 100 })
  }
  return { rows, skipped }
}

function matchSku(skus: Sku[], token: string): Sku | undefined {
  const key = token.trim().toLowerCase()
  return skus.find((sku) => {
    if (sku.code.toLowerCase() === key) return true
    if (sku.name.toLowerCase() === key) return true
    if (sku.nameZh.toLowerCase() === key) return true
    return sku.aliases.some((alias) => alias.toLowerCase() === key)
  })
}

export function applyPriceCsv(skus: Sku[], csv: string): SheetResult | { error: string } {
  const parsed = parsePriceRows(csv)
  if (parsed.rows.length === 0) {
    return { error: 'No price rows found. Use columns sku, min_qty, price.' }
  }

  const grouped = new Map<string, Tier[]>()
  const unknown: string[] = []
  for (const row of parsed.rows) {
    const sku = matchSku(skus, row.sku)
    if (!sku) {
      unknown.push(row.sku)
      continue
    }
    const list = grouped.get(sku.id) ?? []
    list.push({ minQty: row.minQty, price: row.price, label: '' })
    grouped.set(sku.id, list)
  }

  if (grouped.size === 0) {
    return { error: `No known item codes. Skipped: ${unknown.slice(0, 3).join(', ')}.` }
  }

  const next = skus.map((sku) => {
    const tiers = grouped.get(sku.id)
    if (!tiers) return sku
    const sorted = tiers.toSorted((a, b) => a.minQty - b.minQty)
    return {
      ...sku,
      tiers: sorted.map((tier, index) => ({
        ...tier,
        label: tierLabel(index),
      })),
    }
  })

  const names = skus.filter((sku) => grouped.has(sku.id)).map((sku) => sku.name)
  const brick = next.find((sku) => sku.id === 'red-brick')
  const priceB = brick?.tiers.find((tier) => tier.minQty === 15)
  let summary = `Price file loaded for ${names.length} item${names.length === 1 ? '' : 's'}.`
  if (priceB) summary += ` Red clay brick, 15 bundles, is ${priceB.label} at ${rm(priceB.price)}.`
  if (unknown.length > 0) {
    summary += ` Skipped ${unknown.length} unknown row${unknown.length === 1 ? '' : 's'}.`
  }
  if (parsed.skipped.length > 0) {
    summary += ` ${parsed.skipped.length} row${parsed.skipped.length === 1 ? '' : 's'} could not be read.`
  }
  return { skus: next, summary }
}
