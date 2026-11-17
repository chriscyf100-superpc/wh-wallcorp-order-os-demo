import type { Client, Order, Payment } from './types.ts'
import { orderTotal } from './pricing.ts'

export function accountOwner(clientId: string, orders: Order[], payments: Payment[]): string {
  return (
    orders.filter((o) => o.clientId === clientId && o.stage !== 'cancelled').toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
      ?.salesperson ??
    payments.filter((p) => p.clientId === clientId).toSorted((a, b) => b.reportedAt.localeCompare(a.reportedAt))[0]?.reportedBy ??
    'Unassigned'
  )
}
export function collectionRisk(client: Client, orders: Order[]) {
  const own = orders.filter((o) => o.clientId === client.id && o.stage !== 'cancelled')
  const open = own.filter((o) => o.stage === 'confirmed' || o.stage === 'preparing')
  const history = own.filter((o) => o.stage === 'delivered')
  const average = history.length ? history.reduce((s, o) => s + orderTotal(o.lines), 0) / history.length : null
  const committed = open.filter((o) => !o.invoicedAt).reduce((s, o) => s + orderTotal(o.lines), 0)
  const exposure = client.outstanding + committed
  const shortage = Math.max(0, exposure + (average ?? 0) - client.creditLimit)
  return {
    open: open.length,
    average,
    sample: history.length,
    committed,
    exposure,
    shortage,
    overdue: client.ageing === '60' || client.ageing === '90',
  }
}
