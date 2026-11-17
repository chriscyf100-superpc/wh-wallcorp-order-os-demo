import { useState } from 'react'
import { useDesk } from '../lib/useDesk.ts'
import { readDocId } from '../lib/useView.ts'
import { DeliveryOrder } from './DeliveryOrder.tsx'
import { SalesOrder } from './SalesOrder.tsx'
import { Button } from './ui/button.tsx'

// Confirmed shows the Sales Order. Preparing / Delivered show the Delivery Order (SO still one click away).
export function OrderDocument({ onBack }: { onBack: () => void }) {
  const { orders } = useDesk()
  const id = readDocId()
  const order = orders.find((row) => row.id === id)
  const [forceSo, setForceSo] = useState<string | null>(null)

  if (!order || !order.soNumber) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6 text-sm">
        <p>No Sales Order for {id || 'this order'} yet. It is raised when the order is confirmed.</p>
        <Button className="mt-3" onClick={onBack}>
          Back to board
        </Button>
      </div>
    )
  }
  const showDo = !!order.doNumber && (order.stage === 'preparing' || order.stage === 'delivered') && forceSo !== order.id
  if (showDo) return <DeliveryOrder order={order} onBack={onBack} onSo={() => setForceSo(order.id)} />
  return (
    <div>
      {order.doNumber && order.stage !== 'confirmed' ? (
        <Button variant="ghost" className="no-print mb-2" onClick={() => setForceSo(null)}>
          View {order.doNumber}
        </Button>
      ) : null}
      <SalesOrder order={order} onBack={onBack} />
    </div>
  )
}
