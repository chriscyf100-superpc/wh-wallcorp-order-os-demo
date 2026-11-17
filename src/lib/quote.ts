import { rm } from './format.ts'
import { ANY_ZONE, MODE_LABEL, lookupPrice, rowActive, todayISO } from './pricedesk.ts'
import { tabName } from './tileSheet.ts'
import type { DeliveryMode, PriceDeskRow, Product, Sku } from './types.ts'

// Price check for the sales team — the same lookup the order desk uses, read for one item and one town.
// Used by the WhatsApp reply ("price a-plas shah alam 200") and the Price check page.

export const TOWN_LIST = ['Kangar', 'Shah Alam', 'Baling', 'Sungai Petani', 'Butterworth', 'Nibong Tebal', 'Penang', 'Pengkalan Hulu', 'Gerik', 'Ipoh', 'Sitiawan', 'Taiping']

const TOWN_WORDS: [RegExp, string][] = [
  [/\bkangar\b|\bperlis\b/i, 'Kangar'],
  [/shah\s*alam|\bs\.?a\.?\b|subang|usj|setia\s*alam/i, 'Shah Alam'],
  [/\bbaling\b/i, 'Baling'],
  [/sungai\s*petani|sg\.?\s*petani|\bs\.?p\.?\b|双溪大年/i, 'Sungai Petani'],
  [/butterworth|b'?worth|\bbw\b|北海/i, 'Butterworth'],
  [/nibong\s*tebal|\bnt\b|高渊/i, 'Nibong Tebal'],
  [/pengkalan\s*hulu|pkl\.?\s*hulu/i, 'Pengkalan Hulu'],
  [/\bg[e]?rik\b/i, 'Gerik'],
  [/\bipoh\b|怡保/i, 'Ipoh'],
  [/sitiawan|实兆远/i, 'Sitiawan'],
  [/taiping|太平/i, 'Taiping'],
  [/\bpenang\b|\bpg\b|槟城|island/i, 'Penang'],
]

const ASK = /\b(price|prices|harga|berapa|rate|quote|how much|pricing)\b|价钱|价格|多少钱|几钱|报价|价/i

export function looksLikePriceCheck(text: string): boolean {
  return ASK.test(text) && !/\b(bayar|paid|received|terima|cheque|cek)\b|收到|付款/i.test(text)
}

export function findTown(text: string): string | null {
  for (const [re, town] of TOWN_WORDS) if (re.test(text)) return town
  return null
}

export function modeIn(text: string): DeliveryMode | null {
  if (/\bloose\b|lepas|散/i.test(text)) return 'loose'
  if (/own\s*collect|self\s*collect|ambil sendiri|自取/i.test(text)) return 'own_collection'
  return null
}

// Quantity: a number followed by a unit, or a bare number that is not a size (100MM, 50KG).
export function qtyIn(text: string, product?: Product): number | null {
  const cleaned = text.replace(/\b\d{2}-[\w-]+/g, ' ')
  const withUnit = cleaned.match(/(\d[\d,]*(?:\.\d+)?)\s*(pcs|pc|keping|biji|plt|pallets?|bags?|beg|ikat|扎|包|块|片|ton|tan|lengths?|batang)\b/i)
  if (withUnit) {
    const n = Number(withUnit[1].replace(/,/g, ''))
    if (/^p(lt|allet)/i.test(withUnit[2]) && product?.palletQty) return n * product.palletQty
    return n
  }
  for (const m of cleaned.matchAll(/(?<![\w.])(\d[\d,]*)(?![\d.,]*\s*(mm|kg|m\b|cm|"|'|ft|l\b|liter|litre|x))/gi)) {
    const n = Number(m[1].replace(/,/g, ''))
    if (n > 0) return n
  }
  return null
}

const STOP = new Set(['price', 'prices', 'harga', 'berapa', 'rate', 'quote', 'how', 'much', 'for', 'the', 'to', 'at', 'ke', 'di', 'untuk', 'pcs', 'pc', 'plt', 'pallet', 'boss', 'bos', 'tolong', 'pls', 'please', 'check', 'semak', 'what', 'is', 'and', 'loose', 'delivered', 'hantar', 'per', 'sekarang', 'now', 'today', 'latest', 'hantar', 'customer', 'cust', 'ambil', 'nak', 'mau', 'mahu', 'dia', 'pakai', 'order', 'delivery', 'deliver', 'send', 'kasi', 'bagi', 'ada', 'lagi', 'sama', 'with', 'can', 'boleh', 'yang', 'itu', 'ini', 'hari', 'kalau', 'if', 'need', 'perlu'])

function tokens(text: string): string[] {
  let t = text.toLowerCase()
  for (const [re] of TOWN_WORDS) t = t.replace(new RegExp(re.source, 'gi'), ' ')
  t = t.replace(ASK, ' ').replace(/\b\d[\d,.]*\s*(pcs|pc|plt|pallets?|bags?|keping)?\b/g, ' ')
  return t
    .split(/[^a-z0-9一-鿿-]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w))
}

export interface ProductHit {
  product: Product
  priced: boolean
}

// Code first, then the yard's own words for an item (红砖, Y12, pasir), then every word in the EMAS name.
export function findProducts(text: string, products: Product[], skus: Sku[], priceRows: PriceDeskRow[], limit = 6): ProductHit[] {
  const pricedCodes = new Set(priceRows.map((row) => row.code))
  const code = text.match(/\b\d{2}-[\w-]+/)?.[0]?.toUpperCase()
  if (code) {
    const exact = products.find((p) => p.code.toUpperCase() === code)
    if (exact) return [{ product: exact, priced: pricedCodes.has(exact.code) }]
  }
  const lower = text.toLowerCase()
  const bySku = skus.find((sku) => [sku.code, sku.name, sku.nameZh, ...sku.aliases].some((alias) => alias.length >= 2 && lower.includes(alias.toLowerCase())))
  if (bySku) {
    const product = products.find((p) => p.code === bySku.code)
    if (product) return [{ product, priced: pricedCodes.has(product.code) }]
  }
  const words = tokens(text)
  if (words.length === 0) return []
  const scored: { product: Product; score: number; priced: boolean }[] = []
  // Every word must match; if none does, take the items matching the most words (chatty messages carry
  // words that are not in any item name).
  const hay = (product: Product) => `${product.code} ${product.name} ${product.brand ?? ''} ${product.category}`.toLowerCase()
  let need = words.length
  if (!products.some((product) => words.every((w) => hay(product).includes(w)))) {
    need = Math.max(0, ...products.map((product) => words.filter((w) => hay(product).includes(w)).length))
    if (need === 0) return []
  }
  for (const product of products) {
    const hits = words.filter((w) => hay(product).includes(w)).length
    if (hits < need) continue
    const priced = pricedCodes.has(product.code)
    // Priced items first, then the main item over its fittings (ROOFTILES over RIDGE END), then shorter names.
    const main = /ROOFTILES|\bTILE\b(?!.*(RIDGE|HIP|WAY|END|APEX))/i.test(product.name) ? 1 : 0
    scored.push({ product, priced, score: (priced ? 100 : 0) + main * 10 - product.name.length / 100 })
  }
  return scored.toSorted((a, b) => b.score - a.score).slice(0, limit).map(({ product, priced }) => ({ product, priced }))
}

export interface Rung {
  minQty: number
  maxQty: number | null
  sell: number
  unit: string
  from: string
  zone: string
}

export interface Ladder {
  rungs: Rung[]
  extras: { mode: DeliveryMode; label: string; sell: number }[]
  since: string | null
}

// Every quantity break for one item in one town, plus the loose / own-collection prices. Sell only — cost
// never goes to the sales phone.
export function ladderFor(priceRows: PriceDeskRow[], products: Product[], code: string, zone: string, date = todayISO()): Ladder {
  const product = products.find((p) => p.code === code)
  const unit = product?.uom && product.uom !== '—' ? product.uom : 'units'
  const best = new Map<string, PriceDeskRow>()
  for (const row of priceRows) {
    if (row.code !== code || !rowActive(row, date)) continue
    if (row.zone !== ANY_ZONE && row.zone !== zone) continue
    const key = `${row.mode}|${row.tierUnit}|${row.minQty}`
    const seen = best.get(key)
    const rank = (r: PriceDeskRow) => (r.zone === ANY_ZONE ? 0 : 1) * 1e9 + Number(r.effectiveFrom.replaceAll('-', ''))
    if (!seen || rank(row) > rank(seen)) best.set(key, row)
  }
  const rows = [...best.values()]
  const main = rows.filter((row) => row.mode === 'any').toSorted((a, b) => qtyOf(a, product) - qtyOf(b, product))
  const rungs: Rung[] = main.map((row, i) => {
    const next = main[i + 1]
    return { minQty: qtyOf(row, product), maxQty: next ? qtyOf(next, product) - 1 : null, sell: row.sell, unit, from: row.effectiveFrom, zone: row.zone }
  })
  const extras = rows
    .filter((row) => row.mode !== 'any')
    .toSorted((a, b) => a.mode.localeCompare(b.mode) || a.minQty - b.minQty)
    .map((row) => ({ mode: row.mode, label: MODE_LABEL[row.mode], sell: row.sell }))
  const since = rows.map((row) => row.effectiveFrom).toSorted().at(-1) ?? null
  return { rungs, extras, since }
}

// "pcs" reads wrong after a price ("RM 2.84/pcs"); say "pc".
export function unitOf(product: Product | undefined): string {
  const uom = product?.uom && product.uom !== '—' ? product.uom : 'unit'
  return uom === 'pcs' ? 'pc' : uom
}

function qtyOf(row: PriceDeskRow, product: Product | undefined): number {
  return row.tierUnit === 'pallet' ? row.minQty * (product?.palletQty ?? 1) : row.minQty
}

export function rungLabel(rung: Rung): string {
  const n = (v: number) => v.toLocaleString('en-MY')
  if (rung.minQty <= 1 && rung.maxQty === null) return 'Any quantity'
  if (rung.maxQty === null) return `${n(rung.minQty)} ${rung.unit} and up`
  if (rung.minQty <= 1) return `Up to ${n(rung.maxQty)} ${rung.unit}`
  return `${n(rung.minQty)} – ${n(rung.maxQty)} ${rung.unit}`
}

export function quoteFor(priceRows: PriceDeskRow[], products: Product[], code: string, zone: string, qty: number, mode: DeliveryMode = 'direct', date = todayISO()) {
  const hit = lookupPrice(priceRows, products, { code, zone, mode, qty, date })
  if (!hit) return null
  const ladder = ladderFor(priceRows, products, code, zone, date)
  const next = ladder.rungs.find((rung) => rung.minQty > qty && rung.sell < hit.sell)
  return { sell: hit.sell, total: Math.round(hit.sell * qty * 100) / 100, row: hit.row, next: next ? { more: next.minQty - qty, sell: next.sell } : null }
}

const SHEET_FAMILY = /^Monier sheet/

export interface PriceReply {
  text: string
  code: string | null
}

export function priceReply(text: string, ctx: { products: Product[]; skus: Sku[]; priceRows: PriceDeskRow[] }, date = todayISO()): PriceReply {
  const hits = findProducts(text, ctx.products, ctx.skus, ctx.priceRows)
  if (hits.length === 0) return { code: null, text: 'Which item? Send the code or a few words, e.g. “price elabana red alor setar 2000” or “harga Y12 sungai petani”.' }
  const priced = hits.filter((hit) => hit.priced)
  if (priced.length === 0) {
    const list = hits.slice(0, 3).map((hit) => `• ${hit.product.code} ${hit.product.name}`).join('\n')
    return { code: hits[0]?.product.code ?? null, text: `No desk price yet for:\n${list}\nHQ sets it on the Price Desk — ask HQ before quoting.` }
  }
  // Several priced matches that share one price sheet (Monier Elabana colours) answer as one.
  const first = priced[0]
  const family = ctx.priceRows.some((row) => row.code === first.product.code && SHEET_FAMILY.test(row.note))
  const same = family ? priced.filter((hit) => ctx.priceRows.some((row) => row.code === hit.product.code && SHEET_FAMILY.test(row.note))) : [first]
  if (!family && priced.length > 1 && !text.match(/\b\d{2}-[\w-]+/)) {
    const pricedTop = priced.slice(0, 4).map((hit) => `• ${hit.product.code} ${hit.product.name}`).join('\n')
    const strong = priced.filter((hit) => hit.product.name.length === first.product.name.length)
    if (strong.length > 1) return { code: null, text: `Which one?\n${pricedTop}\nReply with the code, e.g. “price ${priced[0].product.code} alor setar”.` }
  }
  const product = first.product
  const town = findTown(text)
  const qty = qtyIn(text, product)
  const mode = modeIn(text) ?? 'direct'
  const name = family && same.length > 1 ? `${product.name.replace(/\s+(RED|EBONY|MAHOGANY|SHADOW GR\w*|ASH GREY|ATLANTIC.*)$/i, '')} (all ${same.length} colours, same price)` : product.name
  const head = `${name}\n${product.code}`
  const unit = unitOf(product)
  if (!town) {
    const tops = TOWN_LIST.map((t) => ({ t, top: ladderFor(ctx.priceRows, ctx.products, product.code, t, date).rungs.at(-1) })).filter((row) => row.top)
    const since = ladderFor(ctx.priceRows, ctx.products, product.code, 'Shah Alam', date).since
    const flat = tops.length > 0 && tops.every((row) => row.top?.sell === tops[0]?.top?.sell)
    const body = flat
      ? `Same price in every town: ${rm(tops[0]?.top?.sell ?? 0)}/${unit} (${rungLabel(tops[0]!.top!)}).`
      : `Best price by town (top quantity break), RM/${unit}:\n${tops.map((row) => `${row.t} ${row.top?.sell.toFixed(2)}`).join(' · ')}`
    return {
      code: product.code,
      text: `${head}${since ? ` · prices from ${tabName(since)}` : ''}\n${body}\nAdd the town and quantity for the full ladder, e.g. “price ${product.code} alor setar 2000”.`,
    }
  }
  const ladder = ladderFor(ctx.priceRows, ctx.products, product.code, town, date)
  if (ladder.rungs.length === 0 && ladder.extras.length === 0) return { code: product.code, text: `${head}\nNo price for ${town} on the desk. Ask HQ before quoting.` }
  const lines = [`${head}`, `${town}, delivered${ladder.since ? ` · prices from ${tabName(ladder.since)}` : ''}:`]
  for (const rung of ladder.rungs) lines.push(`• ${rungLabel(rung)}: ${rm(rung.sell)}/${unit}`)
  for (const extra of ladder.extras) lines.push(`• ${extra.label}: ${rm(extra.sell)}/${unit}`)
  if (qty) {
    const q = quoteFor(ctx.priceRows, ctx.products, product.code, town, qty, mode, date)
    if (q) {
      lines.push(`${qty.toLocaleString('en-MY')} ${product.uom}${mode === 'loose' ? ' loose' : ''} → ${rm(q.sell)}/${unit} = ${rm(q.total)}`)
      if (q.next && mode === 'direct') lines.push(`Take ${q.next.more.toLocaleString('en-MY')} more and it drops to ${rm(q.next.sell)}.`)
    }
  }
  lines.push('Price locks when the SO is raised.')
  return { code: product.code, text: lines.join('\n') }
}
