import { Printer } from 'lucide-react'
import { COMPANY, COMPANY_REG, debtorNo, lineQtyLabel } from '../lib/documents.ts'
import { findClient } from '../lib/orders.ts'
import { isLocked } from '../lib/pricedesk.ts'
import { orderTotal } from '../lib/pricing.ts'
import { useDesk, type OrderMeta } from '../lib/useDesk.ts'
import type { Order } from '../lib/types.ts'
import { Button } from './ui/button.tsx'

export function docDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const money = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function SalesOrder({ order, onBack }: { order: Order; onBack: () => void }) {
  const { clients, skus, moveOrder, setOrderMeta } = useDesk()
  const client = findClient(clients, order.clientId)
  const editable = order.stage === 'confirmed'
  const meta = (key: keyof OrderMeta) => ({
    value: order[key] ?? '',
    readOnly: !editable,
    onChange: (value: string) => setOrderMeta(order.id, { [key]: value }),
  })
  const anyLocked = order.lines.some(isLocked)

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack}>
          ← Back to board
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print SO
          </Button>
          {editable ? <Button onClick={() => moveOrder(order.id, 'preparing')}>Move to Preparing</Button> : null}
        </div>
      </div>
      {editable ? (
        <p className="no-print mb-3 text-xs text-ink-soft">
          Lines {anyLocked ? 'are locked at the Price Desk sell. ' : ''}Edit the boxed fields below; they print as typed.
          Moving to Preparing creates the Delivery Order.
        </p>
      ) : null}

      <article className="doc rounded-2xl border border-line bg-white p-6 text-black shadow-sm sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight">
            {COMPANY} <span className="text-sm font-normal">{COMPANY_REG}</span>
          </h2>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-tight">SALES ORDER</p>
            <dl className="mt-2 grid grid-cols-[auto_auto] justify-end gap-x-3 text-left text-sm">
              <Meta label="No." value={order.soNumber ?? ''} bold />
              <Meta label="Date" value={docDate(order.createdAt)} />
              <MetaField label="P.O No." field={meta('poNumber')} />
              <Meta label="Agent" value={order.salesperson} />
              <MetaField label="Term" field={meta('term')} />
            </dl>
          </div>
        </header>

        <dl className="mt-5 grid grid-cols-[8.5rem_1fr] gap-y-1 text-sm">
          <Row label="Debtor No" value={debtorNo(client)} />
          <Row label="Customer Name" value={client?.company ?? 'Unmatched sender'} bold />
          <Row label="Address" value={order.addressSnapshot ?? client?.address ?? ''} />
          <RowField label="Delivery Site" field={meta('deliverySite')} />
          <RowField label="Delivery Date" field={meta('deliveryDate')} />
          <RowField label="Tel. To Contact" field={meta('contactTel')} />
        </dl>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-y-2 border-black text-left">
                <th className="py-1.5 pr-2">No.</th>
                <th className="py-1.5 pr-2">Item No.</th>
                <th className="py-1.5 pr-2">Description</th>
                <th className="py-1.5 pr-2">Weight</th>
                <th className="py-1.5 pr-2 text-right">Quantity</th>
                <th className="py-1.5 pr-2 text-right">Unit Price</th>
                <th className="py-1.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line, index) => {
                const sku = skus.find((row) => row.id === line.skuId)
                const price = line.lockedSell ?? line.unitPrice
                return (
                  <tr key={line.id} className="align-top">
                    <td className="py-1.5 pr-2">{index + 1}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{sku?.code}</td>
                    <td className="py-1.5 pr-2">{sku?.name}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{sku ? `/ ${sku.unit.toUpperCase()}` : ''}</td>
                    <td className="py-1.5 pr-2 text-right whitespace-nowrap">{lineQtyLabel(sku, line.qty)}</td>
                    <td className="py-1.5 pr-2 text-right">{price.toFixed(4)}</td>
                    <td className="py-1.5 text-right">{money(line.qty * price)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center justify-end gap-4 border-t-2 border-black pt-3">
          <span className="text-sm font-semibold">NETT TOTAL (RM)</span>
          <span className="border-y-4 border-double border-black px-3 py-1 text-lg font-bold">
            {money(orderTotal(order.lines.map((l) => ({ ...l, unitPrice: l.lockedSell ?? l.unitPrice }))))}
          </span>
        </div>

        <Signatures labels={['Issued By', 'Transport in charge', 'Sales', 'Approved By']} />
      </article>
    </div>
  )
}

export function Signatures({ labels }: { labels: string[] }) {
  return (
    <div className="mt-14 grid grid-cols-2 gap-6 text-sm sm:grid-cols-4">
      {labels.map((label) => (
        <div key={label}>
          <div className="border-t border-dotted border-black pt-1">{label}</div>
        </div>
      ))}
    </div>
  )
}

interface FieldProps {
  value: string
  readOnly: boolean
  onChange: (value: string) => void
}

function Input({ field, label }: { field: FieldProps; label: string }) {
  if (field.readOnly) return <span>{field.value}</span>
  return (
    <input
      aria-label={label}
      value={field.value}
      onChange={(event) => field.onChange(event.target.value)}
      className="no-print-border w-full rounded border border-line bg-amber-soft/40 px-1.5 py-0.5 text-sm"
    />
  )
}

function Meta({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={bold ? 'font-bold' : ''}>: {value}</dd>
    </>
  )
}

function MetaField({ label, field }: { label: string; field: FieldProps }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="flex gap-1">
        :<Input field={field} label={label} />
      </dd>
    </>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <>
      <dt className="font-semibold">{label}</dt>
      <dd className={bold ? 'font-semibold' : ''}>: {value}</dd>
    </>
  )
}

function RowField({ label, field }: { label: string; field: FieldProps }) {
  return (
    <>
      <dt className="font-semibold">{label}</dt>
      <dd className="flex gap-1">
        :<Input field={field} label={label} />
      </dd>
    </>
  )
}
