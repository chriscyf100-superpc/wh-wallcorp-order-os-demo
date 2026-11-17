import { Printer } from 'lucide-react'
import { COMPANY, COMPANY_REG } from '../lib/documents.ts'
import { useDesk } from '../lib/useDesk.ts'
import type { Order } from '../lib/types.ts'
import { docDate, Signatures } from './SalesOrder.tsx'
import { Button } from './ui/button.tsx'

export function DeliveryOrder({ order, onBack, onSo }: { order: Order; onBack: () => void; onSo: () => void }) {
  const { moveOrder } = useDesk()
  const snap = order.doSnapshot
  if (!snap || !order.doNumber) return null

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack}>
          ← Back to board
        </Button>
        <Button variant="ghost" onClick={onSo}>
          View {order.soNumber}
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print D/O
          </Button>
          {order.stage === 'preparing' ? (
            <Button variant="palm" onClick={() => moveOrder(order.id, 'delivered')}>
              Mark delivered
            </Button>
          ) : (
            <span className="rounded-full bg-ok-soft px-3 py-1.5 text-xs font-medium text-ok">Delivered</span>
          )}
        </div>
      </div>

      <article className="doc rounded-2xl border border-line bg-white p-6 text-black shadow-sm sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight">
            {COMPANY} <span className="text-sm font-normal">{COMPANY_REG}</span>
          </h2>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight">DELIVERY ORDER</p>
            <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 text-left text-sm">
              <dt>No.</dt>
              <dd className="font-bold">: {order.doNumber}</dd>
              <dt>Date</dt>
              <dd>: {docDate(order.doCreatedAt ?? order.createdAt)}</dd>
              <dt>S.O No.</dt>
              <dd>: {order.soNumber}</dd>
              <dt>P.O No.</dt>
              <dd>: {order.poNumber}</dd>
            </dl>
          </div>
        </header>

        <dl className="mt-5 grid grid-cols-[8.5rem_1fr] gap-y-1 text-sm">
          <dt className="font-semibold">Debtor No</dt>
          <dd>: {snap.debtorNo}</dd>
          <dt className="font-semibold">Customer Name</dt>
          <dd className="font-semibold">: {snap.customer}</dd>
          <dt className="font-semibold">Address</dt>
          <dd>: {snap.address}</dd>
          <dt className="font-semibold">Delivery Site</dt>
          <dd>: {snap.site}</dd>
          <dt className="font-semibold">Delivery Date</dt>
          <dd>: {snap.date}</dd>
          <dt className="font-semibold">Tel. To Contact</dt>
          <dd>: {snap.tel}</dd>
        </dl>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="border-y-2 border-black text-left">
                <th className="py-1.5 pr-2">No.</th>
                <th className="py-1.5 pr-2">Item No.</th>
                <th className="py-1.5 pr-2">Description</th>
                <th className="py-1.5 pr-2 text-right">Quantity</th>
                <th className="py-1.5">UOM</th>
              </tr>
            </thead>
            <tbody>
              {snap.lines.map((line, index) => (
                <tr key={`${line.code}-${index}`} className="align-top">
                  <td className="py-1.5 pr-2">{index + 1}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{line.code}</td>
                  <td className="py-1.5 pr-2">{line.desc}</td>
                  <td className="py-1.5 pr-2 text-right">{line.qty.toLocaleString('en-MY', { minimumFractionDigits: 3 })}</td>
                  <td className="py-1.5 uppercase">{line.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 border-t-2 border-black pt-2 text-xs">
          Goods received in good order and condition. No prices on this copy.
        </p>
        <Signatures labels={['Issued By', 'Transport in charge', 'Received By (sign / chop / date)', 'Approved By']} />
      </article>
    </div>
  )
}
