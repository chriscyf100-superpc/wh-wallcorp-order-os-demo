import { creditVerdict } from './credit.ts'
import { rm } from './format.ts'
import { findClient, relocateOrder, type LockContext } from './orders.ts'
import { orderTotal } from './pricing.ts'
import type { AuditAction, AuditEntry, Client, DeskData, HoldInfo, Order } from './types.ts'
import { uid } from './utils.ts'

// Demo authority caps. Chris has not fixed the real numbers yet — edit here.
export const HQ_AUTHORITY = {
  maxOverRm: 5000,
  maxAgingMonths: 2,
  // Whitelisted customers (good payment record) get a wider cap.
  whitelistMaxOverRm: 12000,
  whitelistMaxAgingMonths: 3,
}

export const BOSS_EMAIL = 'boss@whwallcorp.example'
export const BOSS_NAME = 'Managing Director'

const AGING_MONTHS = { ok: 0, '30': 1, '60': 2, '90': 3 } as const

export interface Authority {
  overRm: number
  agingMonths: number
  capOverRm: number
  capAgingMonths: number
  whitelist: boolean
  within: boolean
  breaches: string[]
  reason: string
}

// Live check against the client book and the current order total.
export function assessAuthority(client: Client | null, total: number): Authority {
  const whitelist = Boolean(client?.whitelist)
  const capOverRm = whitelist ? HQ_AUTHORITY.whitelistMaxOverRm : HQ_AUTHORITY.maxOverRm
  const capAgingMonths = whitelist ? HQ_AUTHORITY.whitelistMaxAgingMonths : HQ_AUTHORITY.maxAgingMonths
  const overRm = client ? Math.max(0, Math.round((client.outstanding + total - client.creditLimit) * 100) / 100) : 0
  // Only 60 / 90 days is a credit stop; 30 days alone is not.
  const stopAging = client && (client.ageing === '60' || client.ageing === '90')
  const agingMonths = client && stopAging ? AGING_MONTHS[client.ageing] : 0

  const breaches: string[] = []
  if (!client) breaches.push('No company matched')
  if (overRm > capOverRm) breaches.push(`${rm(overRm)} over the limit, HQ cap is ${rm(capOverRm)}`)
  if (agingMonths > capAgingMonths) breaches.push(`${agingMonths} months overdue, HQ cap is ${capAgingMonths}`)

  const parts: string[] = []
  if (overRm > 0) parts.push(`${rm(overRm)} over limit`)
  if (agingMonths > 0) parts.push(`${agingMonths} months overdue`)
  if (parts.length === 0) parts.push('Held by the desk')
  if (whitelist) parts.push('whitelisted customer')

  return {
    overRm,
    agingMonths,
    capOverRm,
    capAgingMonths,
    whitelist,
    within: breaches.length === 0,
    breaches,
    reason: parts.join(', '),
  }
}

export function authorityFor(order: Order, clients: Client[]): Authority {
  return assessAuthority(findClient(clients, order.clientId), orderTotal(order.lines))
}

export interface HoldResult {
  data: DeskData
  toast: string
}

function entry(
  order: Order,
  data: DeskData,
  who: AuditEntry['who'],
  action: AuditAction,
  reason: string,
  cc: string | null,
  at: string,
): AuditEntry {
  const client = findClient(data.clients, order.clientId)
  const auth = authorityFor(order, data.clients)
  return Object.freeze({
    id: uid('audit'),
    at,
    orderId: order.id,
    clientName: client?.company ?? 'Unmatched sender',
    who,
    action,
    amount: orderTotal(order.lines),
    overRm: auth.overRm,
    agingMonths: auth.agingMonths,
    reason,
    cc,
  })
}

function patchOrder(data: DeskData, orderId: string, next: Order): DeskData {
  return { ...data, orders: data.orders.map((row) => (row.id === orderId ? next : row)) }
}

function say(data: DeskData, order: Order, text: string, at: string): DeskData {
  return { ...data, messages: [...data.messages, { id: uid('msg'), from: 'hq', salesperson: order.salesperson, text, source: 'text', at, orderId: order.id }] }
}

function holdOf(data: DeskData, orderId: string): { order: Order; hold: HoldInfo } | null {
  const order = data.orders.find((row) => row.id === orderId)
  if (!order || order.stage !== 'needs_approval' || !order.hold) return null
  return { order, hold: order.hold }
}

// Approve into the yard: marks the hold approved, then lets relocateOrder raise the SO and lock prices.
function release(
  data: DeskData,
  order: Order,
  hold: HoldInfo,
  who: 'HQ' | 'Boss',
  at: string,
  lock: LockContext,
): DeskData {
  const approvedOrder: Order = { ...order, hold: { ...hold, status: 'approved', decidedBy: who, decidedAt: at } }
  const moved = relocateOrder(approvedOrder, 'confirmed', data.clients, lock)
  return patchOrder(data, order.id, moved.order)
}

export function hqApprove(data: DeskData, orderId: string, at: string, lock: LockContext): HoldResult {
  const found = holdOf(data, orderId)
  if (!found) return { data, toast: `${orderId} is not in HQ Hold.` }
  const { order, hold } = found
  if (hold.status !== 'hq') {
    return { data, toast: `${orderId} is already ${hold.status === 'escalated' ? 'with the boss' : hold.status}.` }
  }
  const auth = authorityFor(order, data.clients)
  if (!auth.within) {
    return { data, toast: `${orderId} is outside HQ authority — ${auth.breaches.join('; ')}. Escalate to the boss.` }
  }
  const row = entry(order, data, 'HQ', 'hq_approve', auth.reason, `${BOSS_EMAIL} (demo, not sent)`, at)
  let next = release(data, order, hold, 'HQ', at, lock)
  next = { ...next, auditLog: [row, ...next.auditLog] }
  next = say(next, order, `${orderId} approved by HQ (${auth.reason}). SO is being raised.`, at)
  return { data: next, toast: `${orderId} approved by HQ. Audit logged. Email CC'd to boss (demo — nothing sent).` }
}

export function escalate(data: DeskData, orderIds: string[], at: string): HoldResult {
  let next = data
  const sent: string[] = []
  for (const id of orderIds) {
    const found = holdOf(next, id)
    if (!found || found.hold.status !== 'hq') continue
    const { order, hold } = found
    const auth = authorityFor(order, next.clients)
    const row = entry(order, next, 'HQ', 'escalate', auth.reason, null, at)
    next = patchOrder(next, id, {
      ...order,
      hold: { ...hold, status: 'escalated', escalations: hold.escalations + 1, escalatedAt: at, rejectReason: undefined },
    })
    next = { ...next, auditLog: [row, ...next.auditLog] }
    sent.push(id)
  }
  if (sent.length === 0) return { data, toast: 'Nothing to escalate — pick rows that are still with HQ.' }
  return {
    data: next,
    toast: `${sent.length} ${sent.length === 1 ? 'order' : 'orders'} sent to ${BOSS_NAME} on WhatsApp (simulated).`,
  }
}

export function reEscalate(data: DeskData, orderId: string, reason: string, at: string): HoldResult {
  const found = holdOf(data, orderId)
  const note = reason.trim()
  if (!found || found.hold.status !== 'rejected') return { data, toast: `${orderId} was not rejected by the boss.` }
  if (note.length < 8) return { data, toast: 'Add a new reason (a sentence) before re-escalating.' }
  const { order, hold } = found
  const row = entry(order, data, 'HQ', 're_escalate', note, null, at)
  let next = patchOrder(data, orderId, {
    ...order,
    hold: { ...hold, status: 'escalated', escalations: hold.escalations + 1, escalatedAt: at, reEscalateReason: note },
  })
  next = { ...next, auditLog: [row, ...next.auditLog] }
  return { data: next, toast: `${orderId} re-sent to ${BOSS_NAME} with the new reason (simulated WhatsApp).` }
}

export function bossDecide(
  data: DeskData,
  orderId: string,
  approve: boolean,
  reason: string,
  at: string,
  lock: LockContext,
): HoldResult {
  const found = holdOf(data, orderId)
  if (!found || found.hold.status !== 'escalated') return { data, toast: `${orderId} is not waiting on the boss.` }
  const { order, hold } = found
  const note = reason.trim()
  const auth = authorityFor(order, data.clients)

  if (approve) {
    const row = entry(order, data, 'Boss', 'boss_approve', note || auth.reason, null, at)
    let next = release(data, order, hold, 'Boss', at, lock)
    next = { ...next, auditLog: [row, ...next.auditLog] }
    next = say(next, order, `${orderId} approved by the boss. SO is being raised.`, at)
    return { data: next, toast: `Boss approved ${orderId}. SO raised and prices locked.` }
  }

  const why = note || 'No reason given'
  const row = entry(order, data, 'Boss', 'boss_reject', why, null, at)
  let next = patchOrder(data, orderId, {
    ...order,
    hold: { ...hold, status: 'rejected', decidedBy: 'Boss', decidedAt: at, rejectReason: why },
  })
  next = { ...next, auditLog: [row, ...next.auditLog] }
  next = say(
    next,
    order,
    `${order.salesperson}, ${orderId} (${row.clientName}) was rejected by the boss: ${why}. No SO raised. Request saved in Pending payment. Chase payment; after HQ confirms it, HQ can recheck and resume this request, or re-escalate with a new reason.`,
    at,
  )
  return { data: next, toast: `Boss rejected ${orderId}. ${order.salesperson} notified on WhatsApp (simulated).` }
}

// Chris: preserve rejected requests and allow HQ to resume after a newly confirmed payment.
export function resumeAfterPayment(data: DeskData, orderId: string, at: string, lock: LockContext): HoldResult {
  const found = holdOf(data, orderId)
  if (!found || found.hold.status !== 'rejected') return { data, toast: 'This request is not pending payment.' }
  const { order, hold } = found
  const payment = data.payments.find(p => p.clientId === order.clientId && p.status === 'confirmed' && p.amount > 0 && p.decidedAt && p.decidedAt > (hold.decidedAt ?? at))
  if (!payment) return { data, toast: 'Confirm a new customer payment after the rejection before resuming.' }
  const client = findClient(data.clients, order.clientId)
  const committed = data.orders.filter(o => o.clientId === order.clientId && !o.invoicedAt && (o.stage === 'confirmed' || o.stage === 'preparing')).reduce((s,o) => s + orderTotal(o.lines),0)
  const verdict = creditVerdict(client ? { ...client, outstanding: client.outstanding + committed } : null, orderTotal(order.lines))
  if (verdict.flag) return { data, toast: `Still pending: ${verdict.reason}. Chase payment or re-escalate with a new reason.` }
  const reason = `HQ rechecked after confirmed payment ${payment.id} (${rm(payment.amount)}). Previous boss rejection: ${hold.rejectReason}. Credit including open SOs now passes.`
  const row = entry(order, data, 'HQ', 'payment_release', reason, `${BOSS_EMAIL} (demo, not sent)`, at)
  let next = release(data, order, hold, 'HQ', at, lock)
  next = { ...next, auditLog: [row, ...next.auditLog] }
  next = say(next, order, `${order.salesperson}, ${order.id} resumed after payment. Same request, SO raised; no re-entry needed.`, at)
  return { data: next, toast: `${order.id} resumed. SO raised, prices locked, audit recorded.` }
}
