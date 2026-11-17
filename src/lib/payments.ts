import { creditVerdict } from './credit.ts'
import { rm } from './format.ts'
import { relocateOrder, type LockContext } from './orders.ts'
import { parseOrderText } from './parser.ts'
import { todayISO } from './pricedesk.ts'
import { orderTotal } from './pricing.ts'
import type { Ageing, AuditEntry, Client, DeskData, Order, PayMethod, Payment } from './types.ts'
import { uid } from './utils.ts'

// Oldest first: a payment clears the 90-day money before the 60, and so on.
export const AGE_OLDEST_FIRST: Ageing[] = ['90', '60', '30', 'ok']

const r2 = (value: number): number => Math.round(value * 100) / 100

export function emptyBuckets(): Record<Ageing, number> {
  return { ok: 0, '30': 0, '60': 0, '90': 0 }
}

// Demo split of an EMAS balance into ageing buckets, from the account's worst bucket.
export function seedBuckets(client: Client): Record<Ageing, number> {
  const total = client.outstanding
  const split: Record<Ageing, Partial<Record<Ageing, number>>> = {
    ok: { ok: 1 },
    '30': { '30': 0.6, ok: 0.4 },
    '60': { '60': 0.5, '30': 0.25, ok: 0.25 },
    '90': { '90': 0.45, '60': 0.2, '30': 0.15, ok: 0.2 },
  }
  const shares = split[client.ageing]
  const buckets = emptyBuckets()
  let left = total
  for (const age of AGE_OLDEST_FIRST) {
    const share = shares[age] ?? 0
    if (share === 0) continue
    const amount = age === 'ok' ? r2(left) : r2(total * share)
    buckets[age] = amount
    left = r2(left - amount)
  }
  if (left > 0) buckets[client.ageing] = r2(buckets[client.ageing] + left)
  return buckets
}

export function clientBuckets(client: Client): Record<Ageing, number> {
  if (client.buckets) return client.buckets
  const buckets = emptyBuckets()
  buckets[client.ageing] = client.outstanding
  return buckets
}

// The account's ageing is its oldest bucket with real money in it (RM 1 and up).
export function ageingOf(buckets: Record<Ageing, number>): Ageing {
  return AGE_OLDEST_FIRST.find((age) => age !== 'ok' && buckets[age] >= 1) ?? 'ok'
}

export interface PaymentEffect {
  client: Client
  applied: number
  unapplied: number
  cleared: { age: Ageing; amount: number }[]
}

export function applyToClient(client: Client, amount: number, receivedOn: string): PaymentEffect {
  const buckets = { ...clientBuckets(client) }
  let left = r2(amount)
  const cleared: PaymentEffect['cleared'] = []
  for (const age of AGE_OLDEST_FIRST) {
    if (left <= 0) break
    const take = Math.min(buckets[age], left)
    if (take <= 0) continue
    buckets[age] = r2(buckets[age] - take)
    left = r2(left - take)
    cleared.push({ age, amount: r2(take) })
  }
  const outstanding = r2(AGE_OLDEST_FIRST.reduce((sum, age) => sum + buckets[age], 0))
  return {
    client: { ...client, buckets, outstanding, ageing: ageingOf(buckets), lastPaymentAt: receivedOn },
    applied: r2(amount - left),
    unapplied: left,
    cleared,
  }
}

/* ---------- reading the salesperson's WhatsApp ---------- */

const PAY_WORDS = /\b(received|receive|rcvd|collected|collect|terima|dapat|cheque|chq|cek|payment|paid|bayar|bank[- ]?in|banked|transfer(?:red)?|ibg|duitnow)\b|收到|支票|付款|转账|还钱|过数/i
const AMOUNT = /(?:RM|MYR)\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?|([\d,]+(?:\.\d{1,2})?)\s*(k)?\s*(?:ringgit|令吉|块)/i

export function looksLikePayment(text: string): boolean {
  return PAY_WORDS.test(text) && AMOUNT.test(text)
}

export function readAmount(text: string): number | null {
  const match = text.match(AMOUNT)
  if (!match) return null
  const raw = (match[1] ?? match[3] ?? '').replaceAll(',', '')
  const value = Number(raw) * (match[2] || match[4] ? 1000 : 1)
  return Number.isFinite(value) && value > 0 ? r2(value) : null
}

export function readMethod(text: string): PayMethod {
  if (/cheque|chq|\bcek\b|支票/i.test(text)) return 'cheque'
  if (/\bcash\b|tunai|现金/i.test(text)) return 'cash'
  return 'transfer'
}

export function readRef(text: string): string {
  const bank = text.match(/\b(PBB|MBB|CIMB|RHB|HLB|AMB|BIMB|UOB|OCBC|Public\s*Bank|Maybank|Hong\s*Leong|AmBank)\b[^\d\n]{0,12}(\d{4,})/i)
  if (bank) return `${bank[1].toUpperCase().replace(/\s+/g, ' ')} ${bank[2]}`
  const ref = text.match(/(?:ref|no\.?|#|chq\s*no\.?|cheque\s*no\.?)\s*[:.]?\s*([A-Z0-9-]{4,})/i)
  return ref ? ref[1] : ''
}

export const METHOD_LABEL: Record<PayMethod, string> = { cheque: 'Cheque', transfer: 'Bank transfer', cash: 'Cash' }

export function paymentFromMessage(text: string, data: DeskData, reportedBy: string, at: string): Payment | null {
  if (!looksLikePayment(text)) return null
  const amount = readAmount(text)
  if (amount === null) return null
  const { clientId } = parseOrderText(text, data.skus, data.clients)
  return {
    id: uid('pay'),
    clientId,
    amount,
    method: readMethod(text),
    ref: readRef(text),
    reportedBy,
    reportedAt: at,
    receivedOn: todayISO(new Date(at)),
    status: 'reported',
    rawMessage: text,
  }
}

/* ---------- HQ confirms ---------- */

export interface PaymentPreview {
  before: Client
  after: Client
  applied: number
  unapplied: number
  cleared: PaymentEffect['cleared']
  settles: Order[]
  releases: Order[]
  stillHeld: Order[]
}

// What confirming this payment would do, without doing it. Same rules as confirmPayment.
export function previewPayment(data: Pick<DeskData, 'clients' | 'orders'>, payment: Pick<Payment, 'clientId' | 'amount' | 'receivedOn'>): PaymentPreview | null {
  const before = data.clients.find((client) => client.id === payment.clientId)
  if (!before) return null
  const effect = applyToClient(before, payment.amount, payment.receivedOn)
  // Board invoices for this customer that are delivered and unpaid, oldest first, fully covered by the money.
  let pot = payment.amount
  const settles: Order[] = []
  const unpaid = data.orders
    .filter((order) => order.clientId === before.id && order.stage === 'delivered' && !order.paidAt)
    .toSorted((a, b) => (a.invoicedAt ?? a.createdAt).localeCompare(b.invoicedAt ?? b.createdAt))
  for (const order of unpaid) {
    const total = orderTotal(order.lines)
    if (total > pot + 0.001) break
    pot -= total
    settles.push(order)
  }
  // Orders sitting in HQ Hold for this customer: re-run the credit check on the new book, one by one.
  let running = effect.client.outstanding
  const releases: Order[] = []
  const stillHeld: Order[] = []
  const held = data.orders
    .filter((order) => order.clientId === before.id && order.stage === 'needs_approval' && order.hold && order.hold.status !== 'rejected')
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const order of held) {
    const total = orderTotal(order.lines)
    const verdict = creditVerdict({ ...effect.client, outstanding: running }, total)
    if (verdict.flag) {
      stillHeld.push(order)
    } else {
      releases.push(order)
      running += total
    }
  }
  return { before, after: effect.client, applied: effect.applied, unapplied: effect.unapplied, cleared: effect.cleared, settles, releases, stillHeld }
}

export interface PaymentResult {
  data: DeskData
  toast: string
}

export function confirmPayment(data: DeskData, paymentId: string, at: string, lock: LockContext): PaymentResult {
  const payment = data.payments.find((row) => row.id === paymentId)
  if (!payment || payment.status !== 'reported') return { data, toast: 'That payment is already dealt with.' }
  if (!payment.clientId) return { data, toast: 'Attach the customer first, then confirm.' }
  const preview = previewPayment(data, payment)
  if (!preview) return { data, toast: 'Customer not found.' }
  const { after, settles, releases } = preview

  const clients = data.clients.map((client) => (client.id === after.id ? after : client))
  const settleIds = new Set(settles.map((order) => order.id))
  const releaseIds = new Set(releases.map((order) => order.id))
  const audit: AuditEntry[] = []
  const orders = data.orders.map((order) => {
    if (settleIds.has(order.id)) return { ...order, paidAt: payment.receivedOn }
    if (releaseIds.has(order.id) && order.hold) {
      audit.push({
        id: uid('audit'),
        at,
        orderId: order.id,
        clientName: after.company,
        who: 'HQ',
        action: 'payment_release',
        amount: orderTotal(order.lines),
        overRm: 0,
        agingMonths: 0,
        reason: `Payment ${rm(payment.amount)} (${METHOD_LABEL[payment.method]}${payment.ref ? ` ${payment.ref}` : ''}) brought the account back inside the limit`,
        cc: null,
      })
      const approved: Order = { ...order, creditFlag: false, creditReason: null, hold: { ...order.hold, status: 'approved', decidedBy: 'HQ', decidedAt: at } }
      return relocateOrder(approved, 'confirmed', clients, lock).order
    }
    return order
  })

  const done: Payment = {
    ...payment,
    status: 'confirmed',
    decidedAt: at,
    settledOrders: settles.map((order) => order.id),
    releasedOrders: releases.map((order) => order.id),
    outstandingBefore: preview.before.outstanding,
    outstandingAfter: after.outstanding,
  }
  const room = after.creditLimit - after.outstanding
  const parts = [
    `Payment ${rm(payment.amount)} from ${after.company} confirmed.`,
    `Outstanding ${rm(preview.before.outstanding)} → ${rm(after.outstanding)}${after.ageing === 'ok' ? ', nothing overdue' : `, oldest now ${after.ageing} days`}.`,
    room >= 0 ? `Room to order: ${rm(room)}.` : `Still ${rm(-room)} over the limit.`,
  ]
  if (releases.length > 0) parts.push(`${releases.map((order) => order.id).join(', ')} now ${releases.length === 1 ? 'passes' : 'pass'} credit and ${releases.length === 1 ? 'goes' : 'go'} to the yard.`)
  if (preview.stillHeld.length > 0) parts.push(`${preview.stillHeld.map((order) => order.id).join(', ')} still ${preview.stillHeld.length === 1 ? 'needs' : 'need'} approval.`)
  const reply = parts.join(' ')
  return {
    data: {
      ...data,
      clients,
      orders,
      payments: data.payments.map((row) => (row.id === payment.id ? done : row)),
      auditLog: [...audit, ...data.auditLog],
      messages: [...data.messages, { id: uid('msg'), from: 'hq', salesperson: payment.reportedBy, text: reply, source: 'text', at }],
    },
    toast: reply,
  }
}

export function rejectPayment(data: DeskData, paymentId: string, reason: string, at: string): PaymentResult {
  const payment = data.payments.find((row) => row.id === paymentId)
  if (!payment || payment.status !== 'reported') return { data, toast: 'That payment is already dealt with.' }
  const why = reason.trim() || 'Not seen in the bank'
  const client = data.clients.find((row) => row.id === payment.clientId)
  const text = `${payment.reportedBy}, the ${rm(payment.amount)} ${METHOD_LABEL[payment.method].toLowerCase()} from ${client?.company ?? 'the customer'} was not accepted: ${why}. The account is unchanged.`
  return {
    data: {
      ...data,
      payments: data.payments.map((row) => (row.id === paymentId ? { ...row, status: 'rejected', decidedAt: at, rejectReason: why } : row)),
      messages: [...data.messages, { id: uid('msg'), from: 'hq', text, source: 'text', at }],
    },
    toast: `Payment rejected. ${payment.reportedBy} told on WhatsApp (simulated).`,
  }
}

export function seedPayments(): Payment[] {
  const now = new Date()
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()
  return [
    {
      id: 'pay-seed-1',
      clientId: 'as-hardware',
      amount: 9000,
      method: 'cheque',
      ref: 'PBB 004512',
      reportedBy: 'Han',
      reportedAt: ago(42),
      receivedOn: todayISO(now),
      status: 'reported',
      rawMessage: 'Boss, received cheque RM 9,000 from Shah Alam Hardware, PBB 004512. Can release their order?',
    },
    {
      id: 'pay-seed-2',
      clientId: 'sg-petani-builders',
      amount: 6500,
      method: 'transfer',
      ref: 'IBG 88120',
      reportedBy: 'Geh',
      reportedAt: ago(95),
      receivedOn: todayISO(now),
      status: 'reported',
      rawMessage: 'Sungai Petani Builders dah bank-in RM 6,500 pagi tadi, ref IBG 88120',
    },
  ]
}
