import type { Client, Sku } from './types.ts'

const SPLIT = /\n|[,，;；]+/

const UNIT_QTY = /(\d+(?:\.\d+)?)\s*(扎|包|条|片|车|pcs|pc|bags?|bundles?|loads?)/i

const BARE_QTY = /(\d+(?:\.\d+)?)(?=$|[^\d.])/g

const CN_QTY: ReadonlyArray<{ re: RegExp; n: number }> = [
  { re: /三十\s*[扎包条片车]/, n: 30 },
  { re: /二十\s*[扎包条片车]/, n: 20 },
  { re: /十五\s*[扎包条片车]/, n: 15 },
  { re: /十二\s*[扎包条片车]/, n: 12 },
  { re: /十\s*[扎包条片车]/, n: 10 },
  { re: /两\s*[扎包条片车]/, n: 2 },
  { re: /二\s*[扎包条片车]/, n: 2 },
  { re: /九\s*[扎包条片车]/, n: 9 },
  { re: /八\s*[扎包条片车]/, n: 8 },
  { re: /七\s*[扎包条片车]/, n: 7 },
  { re: /六\s*[扎包条片车]/, n: 6 },
  { re: /五\s*[扎包条片车]/, n: 5 },
  { re: /四\s*[扎包条片车]/, n: 4 },
  { re: /三\s*[扎包条片车]/, n: 3 },
  { re: /一\s*[扎包条片车]/, n: 1 },
]

export interface ParsedItem {
  skuId: string
  qty: number
}

export interface ParseResult {
  clientId: string | null
  items: ParsedItem[]
}

interface AliasRow {
  sku: Sku
  alias: string
}

function aliasTable(skus: Sku[]): AliasRow[] {
  const rows: AliasRow[] = []
  for (const sku of skus) {
    for (const alias of sku.aliases) {
      const trimmed = alias.trim().toLowerCase()
      if (trimmed.length > 0) rows.push({ sku, alias: trimmed })
    }
  }
  rows.sort((a, b) => b.alias.length - a.alias.length)
  return rows
}

function isShortLatin(alias: string): boolean {
  return /[a-z]/i.test(alias) && alias.replace(/[^a-z0-9]/g, '').length <= 4
}

function hasBoundary(hay: string, index: number, length: number): boolean {
  const before = index === 0 ? '' : hay.charAt(index - 1)
  const after = hay.charAt(index + length)
  const edge = (ch: string) => ch === '' || /[^a-z0-9]/i.test(ch)
  return edge(before) && edge(after)
}

function findAlias(hay: string, alias: string): number {
  const bounded = isShortLatin(alias)
  let from = 0
  while (from < hay.length) {
    const idx = hay.indexOf(alias, from)
    if (idx === -1) return -1
    if (!bounded || hasBoundary(hay, idx, alias.length)) return idx
    from = idx + 1
  }
  return -1
}

function chineseQty(fragment: string): number | null {
  for (const row of CN_QTY) {
    if (row.re.test(fragment)) return row.n
  }
  return null
}

function bareQty(fragment: string): number | null {
  BARE_QTY.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BARE_QTY.exec(fragment)) !== null) {
    const after = fragment.slice(match.index + match[0].length)
    if (/^\s*(mm|cm|kg|m)\b/i.test(after)) continue
    if (/^\s*["”]/.test(after)) continue
    const qty = Number(match[1])
    if (qty > 0 && qty < 100000) return qty
  }
  return null
}

export function extractQty(fragment: string): number | null {
  const unit = fragment.match(UNIT_QTY)
  if (unit) {
    const qty = Number(unit[1])
    if (qty > 0 && qty < 100000) return qty
  }
  const spoken = chineseQty(fragment)
  if (spoken !== null) return spoken
  return bareQty(fragment)
}

function matchClient(text: string, clients: Client[]): Client | null {
  const hay = text.toLowerCase()
  let best: { client: Client; len: number } | null = null
  for (const client of clients) {
    const names = [client.company, ...client.aliases]
    for (const name of names) {
      const alias = name.trim().toLowerCase()
      if (alias.length < 3) continue
      if (!hay.includes(alias)) continue
      if (best === null || alias.length > best.len) best = { client, len: alias.length }
    }
  }
  return best?.client ?? null
}

export function parseOrderText(text: string, skus: Sku[], clients: Client[]): ParseResult {
  const client = matchClient(text, clients)
  const table = aliasTable(skus)
  const used = new Set<string>()
  const items: ParsedItem[] = []
  const parts = text.split(SPLIT)

  for (const part of parts) {
    let remaining = part
    const lowerFull = () => remaining.toLowerCase()
    for (let guard = 0; guard < 8 && remaining.trim(); guard += 1) {
      const lower = lowerFull()
      let bestIndex = Number.POSITIVE_INFINITY
      let best: AliasRow | null = null
      for (const row of table) {
        const idx = findAlias(lower, row.alias)
        if (idx === -1) continue
        if (idx < bestIndex) {
          bestIndex = idx
          best = row
        }
      }
      if (!best || !Number.isFinite(bestIndex)) break
      const windowText = remaining.slice(
        Math.max(0, bestIndex - 28),
        Math.min(remaining.length, bestIndex + best.alias.length + 28),
      )
      const qty = extractQty(windowText)
      if (qty && !used.has(best.sku.id)) {
        used.add(best.sku.id)
        items.push({ skuId: best.sku.id, qty })
      }
      remaining = remaining.slice(bestIndex + best.alias.length)
    }
  }

  return { clientId: client?.id ?? null, items }
}
