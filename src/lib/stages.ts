import type { Order, Stage } from './types.ts'

/** Where an order can step back to from the board or the order panel. */
export function previousStage(order: Order): { stage: Stage; label: string } | null {
  if (order.stage === 'needs_approval') {
    return order.hold?.status === 'hq' ? { stage: 'new', label: 'Back to confirm' } : null
  }
  // An approved hold is audited, so it cannot be undone from the board.
  if (order.stage === 'confirmed') return order.hold ? null : { stage: 'new', label: 'Back to confirm' }
  if (order.stage === 'preparing') return { stage: 'confirmed', label: 'Back' }
  if (order.stage === 'delivered') return { stage: 'preparing', label: 'Back' }
  return null
}
