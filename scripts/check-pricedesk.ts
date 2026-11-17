// Run: see docs/PRICE-DESK.md (Checks). Compiles with tsc, then runs under plain node.
import { buildSeed } from '../src/lib/seed.ts'
import { relocateOrder } from '../src/lib/orders.ts'
import { lookupPrice } from '../src/lib/pricedesk.ts'
const s = buildSeed()
const ok = (n: string, c: boolean, d = '') => console.log(c ? 'ok  ' : 'FAIL', n, d)
ok('products>=30', s.products.length >= 30, String(s.products.length))
const conf = s.orders.find((o) => o.id === 'WH-2405')!
ok('seed confirmed locked', conf.lines.every((l) => l.lockDate && l.lockedCost != null), JSON.stringify(conf.lines[0]))
const ctx = { skus: s.skus, products: s.products, priceRows: s.priceRows, date: '2026-11-03' }
const o2 = s.orders.find((o) => o.id === 'WH-2402')!
ok('draft unlocked', o2.lines.every((l) => !l.lockDate))
const m = relocateOrder(o2, 'confirmed', s.clients, ctx)
ok('confirm locks', m.order.stage === 'confirmed' && m.order.lines.every((l) => l.lockedSell === l.unitPrice && l.lockedCost! > 0), JSON.stringify(m.order.lines))
// desk change after lock
const rows2 = s.priceRows.map((r) => ({ ...r, sell: r.sell + 5, cost: r.cost + 5 }))
ok('lookup moves', lookupPrice(rows2, s.products, { code: 'CEMENT-50', zone: 'Alor Setar', mode: 'direct', qty: 36, date: '2026-11-03' })!.sell !== m.order.lines[1]!.lockedSell)
const again = relocateOrder({ ...m.order, stage: 'needs_approval' }, 'confirmed', s.clients, { ...ctx, priceRows: rows2 })
ok('locked survives re-approve', JSON.stringify(again.order.lines) === JSON.stringify(m.order.lines))
const held = relocateOrder({ ...s.orders.find((o) => o.id === 'WH-2403')!, stage: 'new' }, 'confirmed', s.clients, ctx)
ok('credit-hold not locked', held.order.stage === 'needs_approval' && held.order.lines.every((l) => !l.lockDate))
// HQ / boss approval marks the hold approved first (hold.ts release), then the move locks.
const appr = relocateOrder({ ...held.order, hold: { ...held.order.hold!, status: 'approved' } }, 'confirmed', s.clients, ctx)
ok('boss override locks', appr.order.lines.every((l) => l.lockDate === '2026-11-03'))
const q = (zone: string, mode: any, qty: number, date = '2026-11-03') => lookupPrice(s.priceRows, s.products, { code: 'BR-CCB-672', zone, mode, qty, date })
ok('brick 13plts direct', q('Alor Setar', 'direct', 13 * 672)!.row.minQty === 13)
ok('brick 5plts direct->4 tier', q('Alor Setar', 'direct', 5 * 672)!.row.minQty === 4)
ok('old sheet before 15 Oct', q('Alor Setar', 'direct', 13 * 672, '2026-09-01')!.row.effectiveTo === '2026-10-14')
ok('loose', q('Alor Setar', 'loose', 100)!.row.mode === 'loose')
const k = lookupPrice(s.priceRows, s.products, { code: 'CEMENT-50', zone: 'Kangar', mode: 'direct', qty: 36, date: '2026-11-03' })!
ok('zone override wins', k.row.zone === 'Kangar')
