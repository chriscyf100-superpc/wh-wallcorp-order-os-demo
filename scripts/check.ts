import { creditVerdict } from '../src/lib/credit.ts'
import { openDemand, relocateOrder } from '../src/lib/orders.ts'
import { parseOrderText } from '../src/lib/parser.ts'
import { priceForQty } from '../src/lib/pricing.ts'
import { applyPriceCsv } from '../src/lib/pricesheet.ts'
import { SAMPLE_PRICE_CSV } from '../src/lib/samplePrices.ts'
import { SAMPLES } from '../src/lib/samples.ts'
import { buildSeed } from '../src/lib/seed.ts'
import type { Order } from '../src/lib/types.ts'
import { EMAS_PRODUCTS, withCatalog } from '../src/lib/catalog.ts'
import { teamYear } from '../src/lib/commission.ts'
import { confirmPayment, paymentFromMessage, previewPayment } from '../src/lib/payments.ts'
import { lookupPrice } from '../src/lib/pricedesk.ts'
import { readYardNote } from '../src/lib/stock.ts'
import { collections, sheetDiff, townPrices } from '../src/lib/tileSheet.ts'
import { applyCards, bulkCards, cardOn } from '../src/lib/priceUpdate.ts'
import { looksLikePriceCheck, priceReply } from '../src/lib/quote.ts'
import { draftPurchaseOrders, issueForDelivery, postCount, postMoves, readYardStock, receivePurchase, startCount, stockRows } from '../src/lib/inventory.ts'

let failed = 0

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`ok  ${name}`)
    return
  }
  failed += 1
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`)
}

const seed = buildSeed()
check('21 clients', seed.clients.length === 21)
check('25 orders', seed.orders.length === 25)

const stages = ['new', 'needs_approval', 'confirmed', 'preparing', 'delivered', 'cancelled']
for (const stage of stages) {
  const count = seed.orders.filter((order) => order.stage === stage).length
  check(`stage ${stage} present`, count > 0, String(count))
}

const brick = seed.skus.find((sku) => sku.id === 'red-brick')
if (!brick) throw new Error('missing brick')
check('11 products', seed.skus.length === 11)
check('brick 14 is Price A', priceForQty(brick.tiers, 14).label === 'Price A' && priceForQty(brick.tiers, 14).price === 52)
check('brick 15 is Price B', priceForQty(brick.tiers, 15).label === 'Price B' && priceForQty(brick.tiers, 15).price === 46)
check('brick 19 is Price B', priceForQty(brick.tiers, 19).price === 46)
check('brick 20 is Price C', priceForQty(brick.tiers, 20).label === 'Price C' && priceForQty(brick.tiers, 20).price === 42)

const expected: Record<string, { clientId: string | null; items: [string, number][] }> = {
  hardware: { clientId: 'as-hardware', items: [['oka-300', 12], ['u-drain', 10], ['emix', 20]] },
  utara: { clientId: 'utara', items: [['red-brick', 22], ['cement', 40]] },
  stock: { clientId: 'utara', items: [['y12', 8], ['river-sand', 2]] },
  kedah: { clientId: 'kedah-construction', items: [['cem-board', 16], ['red-brick', 20]] },
  idaman: { clientId: 'idaman', items: [['paver', 18], ['cement', 10]] },
}

for (const sample of SAMPLES) {
  if (sample.id === 'payment' || sample.id === 'price') continue
  const parsed = parseOrderText(sample.text, seed.skus, seed.clients)
  const want = expected[sample.id]
  if (!want) {
    check(`sample ${sample.id} expected`, false)
    continue
  }
  const got = parsed.items.map((item) => `${item.skuId}:${item.qty}`).join(', ')
  const need = want.items.map(([id, qty]) => `${id}:${qty}`).join(', ')
  check(`${sample.id} client`, parsed.clientId === want.clientId, String(parsed.clientId))
  check(`${sample.id} lines`, got === need, got)
}

const board = parseOrderText('水泥板 10片', seed.skus, seed.clients)
check('cement board not cement', board.items.length === 1 && board.items[0]?.skuId === 'cem-board')

const cement = parseOrderText('洋灰 10包', seed.skus, seed.clients)
check('洋灰 is cement', cement.items.length === 1 && cement.items[0]?.skuId === 'cement' && cement.items[0]?.qty === 10)

const dimension = parseOrderText('OKA管 300mm', seed.skus, seed.clients)
check('300mm is not a quantity', dimension.items.length === 0)

const pipe = parseOrderText('OKA管 300mm 12条', seed.skus, seed.clients)
check('pipe qty is 12', pipe.items[0]?.qty === 12)

const english = parseOrderText('20 bags portland cement\ncement board 16 pcs', seed.skus, seed.clients)
check(
  'english lines',
  english.items.some((item) => item.skuId === 'cement' && item.qty === 20) &&
    english.items.some((item) => item.skuId === 'cem-board' && item.qty === 16),
  english.items.map((item) => `${item.skuId}:${item.qty}`).join(', '),
)

const hardware = seed.clients.find((client) => client.id === 'as-hardware') ?? null
const kedah = seed.clients.find((client) => client.id === 'kedah-construction') ?? null
const bina = seed.clients.find((client) => client.id === 'bina-maju') ?? null
check('hardware small order stays inside', !creditVerdict(hardware, 100).flag)
check('hardware sample-sized order trips', creditVerdict(hardware, 1000).flag)
check('kedah flags on ageing', creditVerdict(kedah, 10).flag)
check('bina maju clear', !creditVerdict(bina, 100).flag)
check('unknown flags', creditVerdict(null, 10).flag)

check('open brick demand', openDemand(seed.orders, 'red-brick').qty === 20)
check('open cement demand', openDemand(seed.orders, 'cement').qty === 60)
check('open brc demand', openDemand(seed.orders, 'brc').qty === 5)
check('open y12 demand', openDemand(seed.orders, 'y12').qty === 4)
check('delivered brick not in demand', openDemand(seed.orders, 'red-brick').orders === 1)

const clean = seed.orders.find((order) => order.id === 'WH-2401')
if (!clean) throw new Error('missing WH-2401')
const moved = relocateOrder(clean, 'confirmed', seed.clients)
check('clean confirm stays confirmed', moved.order.stage === 'confirmed')

const held = seed.orders.find((order) => order.id === 'WH-2403')
if (!held) throw new Error('missing WH-2403')
const freshHold: Order = { ...held, stage: 'new', creditFlag: false, creditReason: null, approved: false }
const bounced = relocateOrder(freshHold, 'confirmed', seed.clients)
check('over-limit confirm bounces', bounced.order.stage === 'needs_approval')

const sheet = applyPriceCsv(seed.skus, SAMPLE_PRICE_CSV)
if ('error' in sheet) {
  check('sample csv', false, sheet.error)
} else {
  const nextBrick = sheet.skus.find((sku) => sku.id === 'red-brick')
  const priceA = nextBrick?.tiers.find((tier) => tier.minQty === 15)
  const priceB = nextBrick?.tiers.find((tier) => tier.minQty === 20)
  check('sample csv brick 15 is Price B at 44', priceA?.label === 'Price B' && priceA.price === 44, `${priceA?.label} ${priceA?.price}`)
  check('sample csv brick 20 is Price C at 40', priceB?.label === 'Price C' && priceB.price === 40, `${priceB?.label} ${priceB?.price}`)
}

const bad = applyPriceCsv(seed.skus, 'sku,min_qty,price\nNOPE,1,10\n')
check('unknown sku errors', 'error' in bad)

/* ---------- EMAS catalogue ---------- */
check('3768 EMAS codes', EMAS_PRODUCTS.length === 3768, String(EMAS_PRODUCTS.length))
check('EMAS codes unique', new Set(EMAS_PRODUCTS.map((p) => p.code)).size === 3768)
check('cement has price A 10', EMAS_PRODUCTS.filter((p) => p.listA === 10).length === 3)
check('Monier in its category', EMAS_PRODUCTS.find((p) => p.code === '41-01-01-01')?.category === 'Monier roof tiles')

/* ---------- Monier sheet = the Excel 05.08.2026 tab ---------- */
const monier = seed.priceSheets[0]
const v0805 = monier.versions.find((v) => v.tab === '05.08.2026')
if (!v0805) throw new Error('missing 05.08.2026')
const as = townPrices(v0805).find((p) => p.town.town === 'Shah Alam')
check('AS costing 2.74', as?.costing === 2.74, String(as?.costing))
check('AS price >3180 2.79', as?.bulk === 2.79, String(as?.bulk))
check('AS price 1590-3180 2.84', as?.mid === 2.84, String(as?.mid))
check('AS costing small 2.84', as?.smallCost === 2.84, String(as?.smallCost))
check('AS price small 2.94', as?.smallPrice === 2.94, String(as?.smallPrice))
const kangar = townPrices(v0805).find((p) => p.town.town === 'Kangar')
check('Kangar 2.78/2.83/2.88/2.98', kangar?.costing === 2.78 && kangar.bulk === 2.83 && kangar.mid === 2.88 && kangar.smallPrice === 2.98)
const col = collections(v0805)
check('factory collect 2.56/2.61', col.factory.cost === 2.56 && col.factory.price === 2.61)
const deskHit = lookupPrice(seed.priceRows, withCatalog(seed.products), { code: '41-01-01-01', zone: 'Shah Alam', mode: 'direct', qty: 2000, date: '2026-11-04' })
check('desk picks 2.84 for 2,000 pcs to AS', deskHit?.sell === 2.84 && deskHit.cost === 2.74, `${deskHit?.sell}/${deskHit?.cost}`)

/* ---------- payments ---------- */
const paySample = SAMPLES.find((s) => s.id === 'payment')
const pay = paySample ? paymentFromMessage(paySample.text, seed, 'Boon', '2026-11-04T09:00:00') : null
check('payment note read', pay?.clientId === 'kedah-construction' && pay.amount === 12000 && pay.method === 'cheque' && pay.ref === 'MBB 228761', JSON.stringify(pay))
check('order note is not a payment', paymentFromMessage(SAMPLES[0].text, seed, 'Boon', '2026-11-04T09:00:00') === null)
if (pay) {
  const withPay = { ...seed, payments: [pay, ...seed.payments] }
  const result = confirmPayment(withPay, pay.id, '2026-11-04T09:05:00', { skus: seed.skus, products: seed.products, priceRows: seed.priceRows })
  const kedah = result.data.clients.find((c) => c.id === 'kedah-construction')
  check('kedah no longer 60 days', kedah?.ageing === '30', kedah?.ageing)
  check('kedah outstanding drops 12k', kedah?.outstanding === 6600, String(kedah?.outstanding))
  const o2404 = result.data.orders.find((o) => o.id === 'WH-2404')
  check('WH-2404 released to yard', o2404?.stage === 'confirmed', o2404?.stage)
  check('release is audited', result.data.auditLog.some((a) => a.action === 'payment_release' && a.orderId === 'WH-2404'))
}
const small = previewPayment(seed, { clientId: 'as-hardware', amount: 100, receivedOn: '2026-11-04' })
check('small payment keeps WH-2403 held', small?.stillHeld.some((o) => o.id === 'WH-2403') === true)

/* ---------- stock note ---------- */
const reads = readYardNote('Y12 没货 lagi\npasir tinggal sikit\nBRC dah sampai\n红砖 有货', seed.skus)
const sig = Object.fromEntries(reads.map((r) => [r.sku.id, r.to]))
check('yard note: y12 out, sand low, brc enough, brick enough', sig.y12 === 'out' && sig['river-sand'] === 'low' && sig.brc === 'enough' && sig['red-brick'] === 'enough', JSON.stringify(sig))

/* ---------- year view ---------- */
const now = new Date('2026-11-04T10:00:00')
const yr = teamYear(seed.orders, seed.clients, seed.salespeople, seed.commissionAdjustments, 2026, now)
check('year has 11 open months', yr.months.filter((m) => m.open).length === 11)
check('annual target is 12 × monthly', Math.abs(yr.target - 12 * seed.salespeople.reduce((s, p) => s + p.monthTarget, 0)) < 1)
check('YTD attainment believable', yr.attainmentToDate > 0.7 && yr.attainmentToDate < 1.1, String(yr.attainmentToDate))

/* ---------- categories from the description ---------- */
const catOf = (code: string) => EMAS_PRODUCTS.find((p) => p.code.startsWith(code))
const cats: [string, string][] = [
  ['31-20', 'Metal roofing sheets'],
  ['22-09', 'Skim coat, render & plaster'],
  ['52-32-06', 'Skim coat, render & plaster'],
  ['83-06', 'Tile adhesive & grout'],
  ['63-01', 'Cement'],
  ['53-A', 'BRC & wire mesh'],
  ['61-01', 'RC pipes'],
  ['99-04', 'U-drains & box culverts'],
  ['41-01-01-01', 'Monier roof tiles'],
]
for (const [code, cat] of cats) check(`${code} is ${cat}`, catOf(code)?.category === cat, catOf(code)?.category)
check('every EMAS item has a group', EMAS_PRODUCTS.every((p) => p.group))
check('few items left as Other', EMAS_PRODUCTS.filter((p) => p.category === 'Other').length < 160, String(EMAS_PRODUCTS.filter((p) => p.category === 'Other').length))
check('Mapei brand read', catOf('83-06')?.brand === 'Mapei')

/* ---------- typed cells on the Monier sheet ---------- */
const v0 = seed.priceSheets[0].versions[0]
const typedV = { ...v0, overrides: { '201': { costing: 2.8 } } }
const typedAS = townPrices(typedV).find((r) => r.town.town === 'Shah Alam')
check('typed costing moves formula columns', typedAS?.costing === 2.8 && typedAS.bulk === 2.85 && typedAS.smallPrice === 3.0, JSON.stringify(typedAS))
const typedBulk = townPrices({ ...v0, overrides: { '201': { bulk: 3.1 } } }).find((r) => r.town.town === 'Shah Alam')
check('typed price list stays as typed', typedBulk?.bulk === 3.1 && typedBulk.mid === 2.84 && typedBulk.typed.includes('bulk'))
check('diff lists one moved cell', sheetDiff(v0, { ...v0, overrides: { '201': { bulk: 3.1 } } }).length === 1)

/* ---------- price cards ---------- */
const products = withCatalog(seed.products)
const pr = seed.priceRows
const before = cardOn(pr, 'CEMENT-50', '2026-11-04')
const bulk = bulkCards(pr, ['CEMENT-50', '63-01-01-01'], '2026-11-10', { pct: 10, rm: 0, withCost: false })
check('bulk skips unpriced items', bulk.skipped.includes('63-01-01-01') && bulk.cards.length === 1)
const applied = applyCards(pr, products, bulk.cards, '2026-11-10', 'test')
const after = cardOn(applied.priceRows, 'CEMENT-50', '2026-11-10')
check('new card in force from its date', after.length === before.length && after.every((row, i) => Math.abs(row.sell - Math.round(before[i].sell * 1.1 * 100) / 100) < 0.001))
check('old card still answers the day before', cardOn(applied.priceRows, 'CEMENT-50', '2026-11-09').every((row, i) => row.sell === before[i].sell))
check('change lines recorded', applied.lines.length === before.length && applied.lines.every((l) => l.before !== null))

/* ---------- WhatsApp price check ---------- */
const ctx = { products, skus: seed.skus, priceRows: seed.priceRows }
check('order samples are not price checks', SAMPLES.filter((x) => x.id !== 'price').every((x) => !looksLikePriceCheck(x.text)))
const reply = priceReply(SAMPLES.find((x) => x.id === 'price')?.text ?? '', ctx).text
check('price sample: Elabana, Shah Alam, 2000 pcs at 2.84', reply.includes('ELABANA') && reply.includes('Shah Alam') && reply.includes('RM 2.84/pc = RM 5,680.00'), reply)
check('price check by code + town', priceReply('price 41-18-01-01 kangar 4000', ctx).text.includes('RM 2.83/pc'))
check('price check in Chinese alias', priceReply('红砖 价钱 alor setar 20', ctx).text.includes('RM 42.00'))
check('unpriced item says ask HQ', priceReply('harga keraflex', ctx).text.includes('ask HQ'))
check('price log seeded from the 13 tabs', seed.priceLog.length === 13)

/* ---------- inventory ---------- */
{
  const inv = stockRows(seed, products)
  check('54 stocked items, all on Price Desk codes', inv.length === 54 && inv.every((row) => row.product), String(inv.length))
  const bad = seed.skus.filter((sku) => inv.find((row) => row.item.code === sku.code)?.signal !== sku.stock)
  check('counted stock gives the same 有货/少/没货 as the seed', bad.length === 0, bad.map((b) => b.code).join(','))
  check('re-stock list is not empty', inv.filter((row) => row.needsRestock).length >= 5)
  check('Y12 is on order (PO-2601) so it is not suggested twice', inv.find((r) => r.item.code === 'Y12')?.onOrder === 120)

  const preparing = seed.orders.find((o) => o.stage === 'preparing' && o.lines.some((l) => seed.stockItems.some((i) => i.code === seed.skus.find((k) => k.id === l.skuId)?.code)))
  if (preparing) {
    const line = preparing.lines[0]
    const code = seed.skus.find((k) => k.id === line.skuId)?.code ?? ''
    const before = seed.stockItems.find((i) => i.code === code)?.onHand ?? 0
    const after = issueForDelivery(seed, { ...preparing, stage: 'delivered' })
    check('delivery takes stock out', after.stockItems.find((i) => i.code === code)?.onHand === before - line.qty && after.stockMoves[0].kind === 'issue')
  } else check('a preparing order with stocked lines exists', false)

  const got = receivePurchase(seed, 'PO-2601', { Y12: 120 })
  const y12 = got.stockItems.find((i) => i.code === 'Y12')
  check('goods in adds stock and moves average cost', y12?.onHand === 124 && Math.abs((y12?.avgCost ?? 0) - (4 * 148 + 120 * 150) / 124) < 0.01, JSON.stringify(y12))
  check('PO received in full closes it', got.purchaseOrders.find((po) => po.id === 'PO-2601')?.status === 'received')
  check('Y12 signal flips to enough after goods in', got.skus.find((k) => k.code === 'Y12')?.stock === 'enough')
  const part = receivePurchase(seed, 'PO-2601', { Y12: 50 })
  check('part delivery keeps the PO open', part.purchaseOrders.find((po) => po.id === 'PO-2601')?.status === 'partial' && stockRows(part, products).find((r) => r.item.code === 'Y12')?.onOrder === 70)

  const drafts = draftPurchaseOrders(seed, [{ code: 'CEMENT-50', qty: 600 }, { code: 'RIVER-SAND', qty: 6 }, { code: 'Y12', qty: 10 }, { code: 'BRC-A7', qty: 10 }])
  check('PO drafts are one per supplier', drafts.created.length === 3 && drafts.created.some((po) => po.lines.length === 2), drafts.created.map((po) => po.supplier).join(' | '))

  const started = startCount(seed, ['PAVER', 'STONE'], 'test')
  const id = started.count.id
  const filled = { ...started.data, stockCounts: started.data.stockCounts.map((c) => (c.id === id ? { ...c, lines: c.lines.map((l) => (l.code === 'PAVER' ? { ...l, counted: 85 } : l)) } : c)) }
  const moved = postMoves(filled, [{ code: 'PAVER', qty: -10, kind: 'issue', ref: 'x' }], 'test')
  const posted = postCount(moved, id)
  check('count posts counted + what moved since (85 − 10 = 75)', posted.stockItems.find((i) => i.code === 'PAVER')?.onHand === 75)
  check('blank count lines are skipped', posted.stockItems.find((i) => i.code === 'STONE')?.onHand === 8)

  const yard = readYardStock('Y12 lorry dah sampai 120\n洋灰 tinggal 40\npasir sikit\nBRC count 18', seed.skus, seed.stockItems, products)
  const by = (code: string) => yard.find((r) => r.code === code)
  check('yard note: Y12 120 in', by('Y12')?.action === 'receive' && by('Y12')?.qty === 120, JSON.stringify(yard))
  check('yard note: cement 40 left is a count', by('CEMENT-50')?.action === 'count' && by('CEMENT-50')?.qty === 40)
  check('yard note: sand sikit is flagged', by('RIVER-SAND')?.action === 'check')
  check('yard note: BRC count 18', by('BRC-A7')?.action === 'count' && by('BRC-A7')?.qty === 18)
}

if (failed > 0) {
  console.error(`${failed} failed`)
  process.exit(1)
}
console.log('all checks passed')
