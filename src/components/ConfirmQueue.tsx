import { useEffect, useRef, useState, type FormEvent } from 'react'
import { rm, trimQty, unitWord, whenLabel } from '../lib/format.ts'
import { clientName, findSku, judgeOrder } from '../lib/orders.ts'
import { ANY_ZONE, MODE_LABEL, ORDER_MODES, ZONES, deskHitForLine, todayISO } from '../lib/pricedesk.ts'
import { orderTotal, priceForQty, upcomingTier } from '../lib/pricing.ts'
import { openDocument } from '../lib/useView.ts'
import { useDesk } from '../lib/useDesk.ts'
import type { DeliveryMode, Order, OrderLine, Sku } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'
import { SignalPill, SourcePill } from './bits.tsx'
import { Button } from './ui/button.tsx'
import { NumberField } from './ui/number-field.tsx'

export function ConfirmQueue() {
  const desk = useDesk()
  const orders = desk.orders.filter((order) => order.stage === 'new').toSorted(byNewest)

  useEffect(() => {
    if (!desk.highlightId) return
    document.getElementById(`order-${desk.highlightId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [desk.highlightId])

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-card px-5 py-12 text-center">
        <h2 className="font-display text-3xl tracking-tight">Nothing waiting</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
          Send a note from the sales phone. On a wide screen it stays on the right. On a phone, open the WhatsApp tab.
          The original message will sit beside the lines.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <ConfirmCard key={order.id} order={order} fresh={order.id === desk.highlightId} />
      ))}
    </div>
  )
}

export function ConfirmCard({ order, fresh }: { order: Order; fresh: boolean }) {
  const { clients, skus, setOrderClient, setOrderRouting, confirmOrder, moveOrder } = useDesk()
  const client = clients.find((row) => row.id === order.clientId) ?? null
  const total = orderTotal(order.lines)
  const verdict = judgeOrder(order, clients)
  const [armed, setArmed] = useState(false)
  const together = client ? client.outstanding + total : 0
  const over = client ? together > client.creditLimit : false

  return (
    <article
      id={`order-${order.id}`}
      className={cn(
        'scroll-mt-24 rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5',
        fresh ? 'ring-2 ring-brick just-landed' : '',
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-ink-soft">
            {order.id} · {order.salesperson} · {whenLabel(order.createdAt)}
          </p>
          <h2 className="mt-1 font-display text-lg">{clientName(clients, order.clientId)}</h2>
        </div>
        <SourcePill source={order.source} />
      </header>

      {verdict.flag ? (
        <div className="mt-4 rounded-xl border border-amber/30 bg-amber-soft px-4 py-3 text-sm leading-6 text-amber">
          <p className="font-semibold">Needs HQ approval</p>
          <p className="mt-1">{verdict.reason} Confirming holds it for HQ. The yard does not load it yet.</p>
        </div>
      ) : null}
      {!verdict.flag && verdict.watch ? (
        <div className="mt-4 rounded-xl bg-sand px-4 py-3 text-sm leading-6 text-ink">{verdict.watch}</div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-[#eef3f9] p-4">
          <h3 className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Original message</h3>
          <p className="mt-2 text-[15px] leading-6 whitespace-pre-wrap">{order.rawMessage}</p>
          <p className="mt-3 text-xs text-ink-soft">Demo read — check the lines before you confirm.</p>
        </div>

        <div>
          <label className="text-xs font-semibold tracking-wide text-ink-soft uppercase" htmlFor={`client-${order.id}`}>
            Company
          </label>
          <select
            id={`client-${order.id}`}
            className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card px-3 text-sm"
            value={order.clientId ?? ''}
            onChange={(event) => setOrderClient(order.id, event.target.value || null)}
          >
            <option value="">Unmatched sender</option>
            {clients.map((row) => (
              <option key={row.id} value={row.id}>
                {row.company}
              </option>
            ))}
          </select>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
              Zone / town
              <select
                className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card px-3 text-sm font-normal tracking-normal text-ink normal-case"
                value={order.zone ?? ANY_ZONE}
                onChange={(event) => setOrderRouting(order.id, { zone: event.target.value })}
              >
                <option value={ANY_ZONE}>Not set</option>
                {ZONES.map((z) => (
                  <optgroup key={z.state} label={z.state}>
                    {z.towns.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
              Delivery mode
              <select
                className="mt-1.5 h-10 w-full rounded-lg border border-line bg-card px-3 text-sm font-normal tracking-normal text-ink normal-case"
                value={order.deliveryMode ?? 'direct'}
                onChange={(event) => setOrderRouting(order.id, { deliveryMode: event.target.value as DeliveryMode })}
              >
                {ORDER_MODES.map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ul className="mt-3 space-y-3">
            {order.lines.length === 0 ? (
              <li className="rounded-xl border border-dashed border-line px-3 py-4 text-sm text-ink-soft">
                Nothing matched. Add the lines yourself.
              </li>
            ) : (
              order.lines.map((line) => <LineEditor key={line.id} order={order} line={line} skus={skus} />)
            )}
          </ul>

          <AddLine order={order} skus={skus} />

          <div className="mt-4 rounded-xl border border-line px-3 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-soft">This order</span>
              <span className="font-display text-lg">{rm(total)}</span>
            </div>
            {client ? (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-paper px-2 py-1.5">
                  <dt className="text-xs text-ink-soft">Outstanding</dt>
                  <dd>{rm(client.outstanding)}</dd>
                </div>
                <div className={cn('rounded-lg px-2 py-1.5', over ? 'bg-rose-soft text-rose' : 'bg-paper')}>
                  <dt className="text-xs opacity-80">Together</dt>
                  <dd>{rm(together)}</dd>
                </div>
                <div className="rounded-lg bg-paper px-2 py-1.5">
                  <dt className="text-xs text-ink-soft">Limit</dt>
                  <dd>{rm(client.creditLimit)}</dd>
                </div>
                <div className="rounded-lg bg-paper px-2 py-1.5">
                  <dt className="text-xs text-ink-soft">Ageing</dt>
                  <dd>{client.ageing === 'ok' ? 'Current' : `${client.ageing} days`}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {armed ? (
          <>
            <Button variant="danger" onClick={() => moveOrder(order.id, 'cancelled')}>
              Yes, cancel
            </Button>
            <Button variant="ghost" onClick={() => setArmed(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setArmed(true)}>
            Cancel order
          </Button>
        )}
        <Button disabled={order.lines.length === 0} onClick={() => {
            if (confirmOrder(order.id) === 'confirmed') openDocument(order.id)
          }}>
          {verdict.flag ? 'Confirm — hold for HQ' : 'Confirm order'}
        </Button>
      </footer>
    </article>
  )
}

function LineEditor({ order, line, skus }: { order: Order; line: OrderLine; skus: Sku[] }) {
  const orderId = order.id
  const { updateLine, removeLine, products, priceRows } = useDesk()
  const sku = findSku(skus, line.skuId)
  if (!sku) return <li className="text-sm text-ink-soft">Missing item</li>
  const tier = priceForQty(sku.tiers, line.qty)
  const next = upcomingTier(sku, line.qty)
  const hit = deskHitForLine(order, sku, line.qty, { products, priceRows }, todayISO())

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {sku.name} <span className="font-normal text-ink-soft">{sku.nameZh}</span>
          </p>
          <p className="text-xs text-ink-soft">
            {line.customPrice ? 'Typed price' : hit ? 'Price Desk' : tier.label} · {sku.unitZh}
          </p>
          {sku.stock === 'enough' ? null : (
            <div className="mt-1">
              <SignalPill signal={sku.stock} />
            </div>
          )}
        </div>
        <button
          type="button"
          className="text-xs text-ink-soft underline"
          onClick={() => removeLine(orderId, line.id)}
          aria-label={`Remove ${sku.name}`}
        >
          Remove
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs text-ink-soft">
          Qty ({unitWord(sku.unit, line.qty)})
          <NumberField
            className="mt-1"
            aria-label={`Quantity for ${sku.name}`}
            min={1}
            value={line.qty}
            onCommit={(qty) => updateLine(orderId, line.id, { qty })}
          />
        </label>
        <label className="text-xs text-ink-soft">
          RM each
          <NumberField
            className="mt-1"
            aria-label={`Price for ${sku.name}`}
            min={0}
            value={line.unitPrice}
            onCommit={(unitPrice) => updateLine(orderId, line.id, { unitPrice })}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        {trimQty(line.qty)} × {rm(line.unitPrice)} = {rm(line.qty * line.unitPrice)}
      </p>
      {hit ? (
        <p className="mt-1 text-xs text-palm">
          Price Desk today: sell {rm(hit.sell)} · cost {rm(hit.cost)}. Locks when the order is raised.
        </p>
      ) : (
        <p className="mt-1 text-xs text-amber">No Price Desk row for this zone and mode. It will lock without a cost.</p>
      )}
      {line.customPrice ? (
        <button
          type="button"
          className="mt-1 text-xs font-medium text-brick"
          onClick={() => updateLine(orderId, line.id, { customPrice: false })}
        >
          Use the {hit ? 'desk' : 'tier'} price ({rm(hit?.sell ?? tier.price)})
        </button>
      ) : next && !hit ? (
        <p className="mt-1 text-xs text-palm">
          {trimQty(next.minQty)} {unitWord(sku.unit, next.minQty)} picks up {next.label} at {rm(next.price)}.
        </p>
      ) : null}
    </li>
  )
}

function AddLine({ order, skus }: { order: Order; skus: Sku[] }) {
  const { addLine } = useDesk()
  const used = new Set(order.lines.map((line) => line.skuId))
  const available = skus.filter((sku) => !used.has(sku.id))
  const [skuId, setSkuId] = useState(available[0]?.id ?? '')
  const qtyRef = useRef<HTMLInputElement>(null)
  const selected = available.some((sku) => sku.id === skuId) ? skuId : (available[0]?.id ?? '')

  if (available.length === 0) return null

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const qty = Number(qtyRef.current?.value)
    if (!selected || !Number.isFinite(qty) || qty <= 0) return
    addLine(order.id, selected, qty)
    if (qtyRef.current) qtyRef.current.value = '1'
  }

  return (
    <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={onSubmit}>
      <label className="min-w-40 flex-1 text-xs text-ink-soft">
        Add a line
        <select
          className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink"
          value={selected}
          onChange={(event) => setSkuId(event.target.value)}
          aria-label="Item to add"
        >
          {available.map((sku) => (
            <option key={sku.id} value={sku.id}>
              {sku.name} · {sku.nameZh}
            </option>
          ))}
        </select>
      </label>
      <label className="w-24 text-xs text-ink-soft">
        Qty
        <input
          ref={qtyRef}
          defaultValue="1"
          inputMode="decimal"
          aria-label="Quantity to add"
          className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-3 text-sm"
        />
      </label>
      <Button type="submit" variant="outline">
        Add line
      </Button>
    </form>
  )
}

function byNewest(a: Order, b: Order): number {
  if (a.createdAt === b.createdAt) return 0
  return a.createdAt < b.createdAt ? 1 : -1
}
