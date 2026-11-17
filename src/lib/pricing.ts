import type { Order, OrderLine, Sku, Tier } from './types.ts'

export function priceForQty(tiers: Tier[], qty: number): { price: number; label: string } {
  let best: Tier | null = null
  for (const tier of tiers) {
    if (qty >= tier.minQty && (best === null || tier.minQty > best.minQty)) best = tier
  }
  if (best) return { price: best.price, label: best.label }
  const fallback = tiers[0]
  return { price: fallback?.price ?? 0, label: fallback?.label ?? 'Price A' }
}

export function orderTotal(lines: OrderLine[]): number {
  let sum = 0
  for (const line of lines) sum += line.qty * line.unitPrice
  return Math.round(sum * 100) / 100
}

export function upcomingTier(sku: Sku, qty: number): Tier | null {
  let next: Tier | null = null
  for (const tier of sku.tiers) {
    if (tier.minQty > qty && (next === null || tier.minQty < next.minQty)) next = tier
  }
  return next
}

export function repriceOpenOrders(orders: Order[], skus: Sku[]): Order[] {
  return orders.map((order) => {
    if (order.stage !== 'new' && order.stage !== 'needs_approval') return order
    let changed = false
    const lines = order.lines.map((line) => {
      if (line.customPrice) return line
      const sku = skus.find((row) => row.id === line.skuId)
      if (!sku) return line
      const priced = priceForQty(sku.tiers, line.qty)
      if (priced.price === line.unitPrice) return line
      changed = true
      return { ...line, unitPrice: priced.price }
    })
    return changed ? { ...order, lines } : order
  })
}
