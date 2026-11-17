import assert from 'node:assert/strict'
import { buildSeed } from '../src/lib/seed.ts'
import { resumeAfterPayment, bossDecide, escalate } from '../src/lib/hold.ts'
import { confirmPayment } from '../src/lib/payments.ts'
import { collectionRisk } from '../src/lib/collections.ts'
import { monthEnd, priceComparison } from '../src/lib/priceAnalytics.ts'

let data = buildSeed()
const id = 'WH-2404'
const lock = { skus: data.skus, products: data.products, priceRows: data.priceRows, date: '2026-11-04' }
data = escalate(data, [id], '2026-11-04T01:00:00Z').data
data = bossDecide(data, id, false, 'Please collect overdue payment first', '2026-11-04T02:00:00Z', lock).data
assert.equal(resumeAfterPayment(data, id, '2026-11-04T03:00:00Z', lock).data, data, 'Rejected request cannot resume without payment')
const order = data.orders.find((o) => o.id === id)!
const client = data.clients.find((c) => c.id === order.clientId)!
const original = JSON.stringify(order.lines)
data = {
  ...data,
  payments: [
    {
      id: 'test-payment',
      clientId: client.id,
      amount: client.outstanding,
      method: 'transfer',
      ref: 'TEST',
      reportedBy: order.salesperson,
      reportedAt: '2026-11-04T03:00:00Z',
      receivedOn: '2026-11-04',
      status: 'reported',
    },
    ...data.payments,
  ],
}
data = confirmPayment(data, 'test-payment', '2026-11-04T03:01:00Z', lock).data
assert.equal(data.orders.find((o) => o.id === id)!.hold!.status, 'rejected', 'Payment alone cannot override boss')
assert.equal(JSON.stringify(data.orders.find((o) => o.id === id)!.lines), original, 'Original lines retained while pending')
const resumed = resumeAfterPayment(data, id, '2026-11-04T03:02:00Z', lock).data
assert.equal(resumed.orders.find((o) => o.id === id)!.stage, 'confirmed')
assert.ok(resumed.orders.find((o) => o.id === id)!.soNumber)
assert.ok(resumed.orders.find((o) => o.id === id)!.lines.every((l) => l.lockDate))
assert.ok(resumed.auditLog.some((a) => a.orderId === id && a.action === 'boss_reject'))
assert.ok(resumed.auditLog.some((a) => a.orderId === id && a.action === 'payment_release' && a.reason.includes('test-payment')))
assert.equal(resumeAfterPayment(resumed, id, '2026-11-04T03:03:00Z', lock).data, resumed, 'Idempotent resume')
const blocked = { ...data, clients: data.clients.map((c) => (c.id === client.id ? { ...c, outstanding: c.creditLimit } : c)) }
assert.equal(resumeAfterPayment(blocked, id, '2026-11-04T03:02:00Z', lock).data, blocked, 'Credit still blocks resume')
const risk = collectionRisk(client, [])
assert.equal(risk.average, null, 'No invented history')
assert.equal(monthEnd('2026-01', -1), '2025-12-31')
assert.equal(monthEnd('2024-03', -1), '2024-02-29')
const base = data.priceRows[0]
const prices = [
  { ...base, id: 'old', sell: 10, effectiveFrom: '2025-01-01', effectiveTo: '2026-10-31' },
  { ...base, id: 'new', sell: 12, effectiveFrom: '2026-11-01', effectiveTo: null },
]
assert.ok(Math.abs(priceComparison(prices, '2026-11-04', '2026-10-31')[0].pct - 20) < 0.001)
assert.equal(priceComparison(prices, '2026-11-04', '2024-10-31').length, 0)
assert.equal(
  priceComparison([prices[0], { ...prices[1], zone: 'DIFFERENT' }], '2026-11-04', '2026-10-31').length,
  0,
  'No cross-zone comparisons',
)
console.log('Collection, pending-payment and price analytics checks passed')
