import { Check, Copy, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { rm } from '../lib/format.ts'
import { todayISO } from '../lib/pricedesk.ts'
import { TOWN_LIST, findProducts, ladderFor, quoteFor, rungLabel, unitOf } from '../lib/quote.ts'
import { tabName } from '../lib/tileSheet.ts'
import type { DeliveryMode } from '../lib/types.ts'
import { useDesk } from '../lib/useDesk.ts'
import { cn } from '../lib/utils.ts'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'

const MODES: { mode: DeliveryMode; label: string }[] = [
  { mode: 'direct', label: 'Delivered' },
  { mode: 'loose', label: 'Loose' },
  { mode: 'own_collection', label: 'Own collection' },
]

// The sales team's calculator: one item, one town, any quantity — read live from the Price Desk, so it is
// always the latest published price. Sell only; cost never shows here.
export function PriceCheck() {
  const { products, skus, priceRows, priceLog } = useDesk()
  const [query, setQuery] = useState('')
  const [code, setCode] = useState('41-01-01-01')
  const [town, setTown] = useState('Shah Alam')
  const [qty, setQty] = useState('2000')
  const [mode, setMode] = useState<DeliveryMode>('direct')
  const [copied, setCopied] = useState(false)
  const today = todayISO()

  const hits = useMemo(() => (query.trim().length >= 2 ? findProducts(query, products, skus, priceRows, 8) : []), [query, products, skus, priceRows])
  const product = products.find((p) => p.code === code)
  const unit = unitOf(product)
  const n = Number(qty.replace(/[^\d.]/g, '')) || 0
  const ladder = ladderFor(priceRows, products, code, town, today)
  const quote = n > 0 ? quoteFor(priceRows, products, code, town, n, mode, today) : null
  const recent = priceLog.find((change) => change.codes.includes(code))
  const towns = TOWN_LIST.map((t) => ({ town: t, quote: n > 0 ? quoteFor(priceRows, products, code, t, n, mode, today) : null, top: ladderFor(priceRows, products, code, t, today).rungs.at(-1) }))
  const priced = ladder.rungs.length > 0 || ladder.extras.length > 0

  const quoteText = product && quote
    ? [
        `${product.name} (${product.code})`,
        `${town}, ${MODES.find((m) => m.mode === mode)?.label.toLowerCase()}`,
        `${n.toLocaleString('en-MY')} ${product.uom} × ${rm(quote.sell)}/${unit} = ${rm(quote.total)}`,
        ladder.since ? `Price list from ${tabName(ladder.since)}. Subject to change; locks when the SO is raised.` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-2xl border border-line bg-card p-4 shadow-sm" aria-labelledby="pc-item">
        <h2 id="pc-item" className="text-sm font-medium text-ink-soft">
          Item
        </h2>
        <p className="font-display text-lg leading-tight tracking-tight">{product?.name ?? 'Pick an item'}</p>
        <p className="text-xs text-ink-soft">
          {product ? `${product.code} · ${product.category}${product.brand ? ` · ${product.brand}` : ''}` : ''}
        </p>
        <label className="relative mt-3 block">
          <span className="sr-only">Search another item</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
          <Input className="h-11 pl-9 text-base" placeholder="Another item — elabana ash, Y12, 红砖, 63-01…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {hits.length > 0 ? (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {hits.map((hit) => (
              <li key={hit.product.code}>
                <button
                  type="button"
                  onClick={() => {
                    setCode(hit.product.code)
                    setQuery('')
                  }}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-sand/60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{hit.product.name}</span>
                    <span className="block text-xs text-ink-soft">{hit.product.code}</span>
                  </span>
                  <span className={cn('shrink-0 text-xs', hit.priced ? 'text-ok' : 'text-ink-soft')}>{hit.priced ? 'priced' : 'no price yet'}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem]">
          <label className="text-sm font-medium">
            Town
            <select className="mt-1 h-11 w-full rounded-lg border border-line bg-card px-3 text-base" value={town} onChange={(e) => setTown(e.target.value)}>
              {TOWN_LIST.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Quantity ({product?.uom ?? 'units'})
            <Input className="mt-1 h-11 text-base tabular-nums" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
        </div>
        {product?.palletQty ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[1, 5, 10, 12].map((plt) => (
              <button key={plt} type="button" onClick={() => setQty(String(plt * (product.palletQty ?? 1)))} className="min-h-9 rounded-full border border-line bg-card px-3 text-xs font-medium hover:bg-sand">
                {plt} plt = {(plt * (product.palletQty ?? 1)).toLocaleString('en-MY')}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-3 inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="Delivery">
          {MODES.map((m) => (
            <button
              key={m.mode}
              type="button"
              aria-pressed={mode === m.mode}
              onClick={() => setMode(m.mode)}
              className={cn('min-h-10 rounded-md px-3 text-sm font-medium', mode === m.mode ? 'bg-brick text-white' : 'text-ink-soft hover:bg-sand')}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-brick/25 bg-card p-4 shadow-sm" aria-live="polite" aria-labelledby="pc-price">
        <h2 id="pc-price" className="sr-only">
          Price
        </h2>
        {!priced ? (
          <p className="text-sm text-amber">No desk price for this item{town ? ` in ${town}` : ''} yet. Ask HQ before quoting.</p>
        ) : quote ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-ink-soft">
                  {n.toLocaleString('en-MY')} {product?.uom} · {town} · {MODES.find((m) => m.mode === mode)?.label.toLowerCase()}
                </p>
                <p className="font-display text-5xl leading-none tracking-tight tabular-nums">
                  {rm(quote.sell)}
                  <span className="ml-1 font-sans text-base text-ink-soft">/{unit}</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-ink-soft">Total</p>
                <p className="text-2xl font-semibold tabular-nums">{rm(quote.total)}</p>
              </div>
            </div>
            {quote.next && mode === 'direct' ? (
              <p className="mt-2 rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
                Take {quote.next.more.toLocaleString('en-MY')} more {product?.uom} and it drops to {rm(quote.next.sell)}/{unit}.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ink-soft">No price for that quantity and mode. Check the ladder below.</p>
        )}
        {ladder.since ? (
          <p className="mt-3 text-xs text-ink-soft">
            Latest published prices, in force from <span className="font-medium text-ink">{tabName(ladder.since)}</span>.
            {recent ? ` Last change: ${recent.title} (${tabName(recent.effectiveFrom)}).` : ''}
          </p>
        ) : null}
        {quote ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => {
              void navigator.clipboard?.writeText(quoteText).catch(() => undefined)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 2000)
            }}
          >
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy quote for WhatsApp'}
          </Button>
        ) : null}
      </section>

      {priced ? (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-2xl border border-line bg-card p-4" aria-labelledby="pc-ladder">
            <h2 id="pc-ladder" className="font-display text-base">
              {town} ladder
            </h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {ladder.rungs.map((rung) => {
                const here = mode === 'direct' && n >= rung.minQty && (rung.maxQty === null || n <= rung.maxQty)
                return (
                  <li key={rung.minQty} className={cn('flex justify-between gap-2 py-2', here && 'font-semibold')}>
                    <span>
                      {here ? <span className="mr-1 text-brick">▸</span> : null}
                      {rungLabel(rung)}
                    </span>
                    <span className="tabular-nums">{rm(rung.sell)}</span>
                  </li>
                )
              })}
              {ladder.extras.map((extra) => (
                <li key={extra.mode} className={cn('flex justify-between gap-2 py-2', mode === extra.mode && 'font-semibold')}>
                  <span>{extra.label}</span>
                  <span className="tabular-nums">{rm(extra.sell)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-line bg-card p-4" aria-labelledby="pc-towns">
            <h2 id="pc-towns" className="font-display text-base">
              Every town{n > 0 ? `, ${n.toLocaleString('en-MY')} ${product?.uom}` : ''}
            </h2>
            <ul className="mt-2 divide-y divide-line text-sm">
              {towns.map((row) => (
                <li key={row.town}>
                  <button type="button" onClick={() => setTown(row.town)} className={cn('flex min-h-10 w-full justify-between gap-2 py-1.5 text-left', row.town === town && 'font-semibold text-brick')}>
                    <span>{row.town}</span>
                    <span className="tabular-nums">{row.quote ? rm(row.quote.sell) : row.top ? rm(row.top.sell) : '—'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      <p className="text-xs leading-5 text-ink-soft">
        On the road? WhatsApp the desk: “price elabana alor setar 2000”, “harga Y12 sungai petani”, “红砖 价钱 kangar”. The reply comes from the same
        prices as this page.
      </p>
    </div>
  )
}
