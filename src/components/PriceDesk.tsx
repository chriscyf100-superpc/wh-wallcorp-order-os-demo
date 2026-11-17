import { PriceAnalytics } from './PriceAnalytics.tsx'
import { Prices } from './Prices.tsx'
import { Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { rm } from '../lib/format.ts'
import { ANY_ZONE, MODES, MODE_LABEL, ZONES, lookupPrice, rowActive, todayISO, zoneLabel } from '../lib/pricedesk.ts'
import { useDesk } from '../lib/useDesk.ts'
import type { DeliveryMode, PriceDeskRow, TierUnit } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'
import { Note } from './bits.tsx'
import { PriceLog } from './PriceLog.tsx'
import { PriceUpdate } from './PriceUpdate.tsx'
import { EMAS_SOURCE } from '../lib/catalog.ts'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'

const SELECT = 'h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink'

interface Draft {
  code: string
  zone: string
  mode: DeliveryMode
  tierUnit: TierUnit
  minQty: string
  sell: string
  cost: string
  effectiveFrom: string
  effectiveTo: string
  note: string
}

function blank(code: string): Draft {
  return {
    code,
    zone: ANY_ZONE,
    mode: 'any',
    tierUnit: 'unit',
    minQty: '1',
    sell: '',
    cost: '',
    effectiveFrom: todayISO(),
    effectiveTo: '',
    note: '',
  }
}

function fromRow(row: PriceDeskRow): Draft {
  return {
    code: row.code,
    zone: row.zone,
    mode: row.mode,
    tierUnit: row.tierUnit,
    minQty: String(row.minQty),
    sell: String(row.sell),
    cost: String(row.cost),
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo ?? '',
    note: row.note,
  }
}

type Tab = 'update' | 'log' | 'rows' | 'analytics' | 'fallback'

function readTab(): Tab {
  try {
    const saved = sessionStorage.getItem('pricedesk-tab')
    return saved === 'log' || saved === 'rows' || saved === 'analytics' || saved === 'fallback' ? saved : 'update'
  } catch {
    return 'update'
  }
}

export function PriceDesk() {
  const [tab, setTabState] = useState<Tab>(readTab)
  const setTab = (next: Tab) => {
    setTabState(next)
    try {
      sessionStorage.setItem('pricedesk-tab', next)
    } catch {
      // fine without it
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap rounded-lg border border-line bg-card p-0.5" role="tablist" aria-label="Price Desk">
        {(
          [
            ['analytics', 'Price trends'],
            ['update', 'Update prices'],
            ['log', 'Change log'],
            ['rows', 'All price rows'],
            ['fallback', 'Fallback tiers'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn('min-h-10 rounded-md px-4 text-sm font-medium', tab === key ? 'bg-brick text-white' : 'text-ink-soft hover:bg-sand')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'analytics' ? <PriceAnalytics /> : tab === 'fallback' ? <><Note>Fallback prices only, used when no dated Price Desk row matches. Maintain normal prices in Update prices.</Note><Prices /></> : tab === 'update' ? <PriceUpdate /> : tab === 'log' ? <PriceLog /> : <RowsDesk />}
    </div>
  )
}

const SHOW = 150

function RowsDesk() {
  const { products, priceRows, savePriceRow, deletePriceRow } = useDesk()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [code, setCode] = useState(() => products.find((p) => priceRows.some((r) => r.code === p.code))?.code ?? '')
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(() => blank(code))
  const [error, setError] = useState('')

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].toSorted(), [products])
  const rowCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of priceRows) counts.set(row.code, (counts.get(row.code) ?? 0) + 1)
    return counts
  }, [priceRows])
  const list = products.filter((p) => {
    if (category && p.category !== category) return false
    const needle = query.trim().toLowerCase()
    return !needle || p.code.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)
  })
  const product = products.find((p) => p.code === code)
  const rows = priceRows
    .filter((r) => r.code === code)
    .toSorted(
      (a, b) =>
        a.zone.localeCompare(b.zone) ||
        a.mode.localeCompare(b.mode) ||
        a.minQty - b.minQty ||
        b.effectiveFrom.localeCompare(a.effectiveFrom),
    )
  const today = todayISO()

  function pick(next: string) {
    setCode(next)
    setEditId(null)
    setDraft(blank(next))
    setError('')
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const sell = Number(draft.sell)
    const cost = Number(draft.cost)
    const minQty = Number(draft.minQty)
    if (!draft.code) return setError('Pick a product first.')
    if (draft.sell === '' || !Number.isFinite(sell) || sell < 0) return setError('Sell must be a number.')
    if (draft.cost === '' || !Number.isFinite(cost) || cost < 0) return setError('Cost must be a number.')
    if (!Number.isFinite(minQty) || minQty < 0) return setError('Min qty must be 0 or more.')
    if (!draft.effectiveFrom) return setError('Set an effective-from date.')
    if (draft.effectiveTo && draft.effectiveTo < draft.effectiveFrom) return setError('Effective-to is before effective-from.')
    savePriceRow({
      id: editId ?? undefined,
      code: draft.code,
      zone: draft.zone,
      mode: draft.mode,
      tierUnit: draft.tierUnit,
      minQty,
      sell: Math.round(sell * 10000) / 10000,
      cost: Math.round(cost * 10000) / 10000,
      effectiveFrom: draft.effectiveFrom,
      effectiveTo: draft.effectiveTo || null,
      note: draft.note.trim(),
    })
    setError('')
    setEditId(null)
    setDraft(blank(draft.code))
  }

  return (
    <div className="space-y-4">
      <Note>
        Sell and cost are dated rows. A sales order picks the row that matches its product, zone, quantity tier,
        delivery mode and today&apos;s date, then <span className="font-medium">locks</span> that sell and cost on the
        line when it is raised. Changing the desk later never moves a locked line. Prices are stored in this browser.
      </Note>

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <section className="rounded-2xl border border-line bg-card p-3">
          <h2 className="font-display text-base">Product master</h2>
          <p className="text-xs text-ink-soft">
            {products.length.toLocaleString('en-MY')} codes · {EMAS_SOURCE}
            {list.length > SHOW ? ` · showing ${SHOW} of ${list.length.toLocaleString('en-MY')}, search to narrow` : ''}
          </p>
          <div className="mt-2 space-y-2">
            <Input aria-label="Search products" placeholder="Search code or name" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select aria-label="Category" className={SELECT} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <ul className="mt-2 max-h-[28rem] space-y-1 overflow-y-auto">
            {list.slice(0, SHOW).map((p) => (
              <li key={p.code}>
                <button
                  type="button"
                  onClick={() => pick(p.code)}
                  aria-current={p.code === code ? 'true' : undefined}
                  className={cn(
                    'w-full rounded-lg px-2 py-1.5 text-left text-sm',
                    p.code === code ? 'bg-ink text-paper' : 'hover:bg-sand',
                  )}
                >
                  <span className="flex items-center justify-between gap-2 font-medium">
                    {p.code}
                    {p.source === 'emas' ? <span className={cn('text-[10px] font-semibold tracking-wide', p.code === code ? 'text-paper/70' : 'text-ink-soft')}>EMAS</span> : null}
                  </span>
                  <span className={cn('block text-xs', p.code === code ? 'text-paper/80' : 'text-ink-soft')}>
                    {p.name} · {rowCount.get(p.code) ?? 0} rows
                  </span>
                </button>
              </li>
            ))}
            {list.length === 0 ? <li className="px-2 py-3 text-sm text-ink-soft">No product matches.</li> : null}
          </ul>
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-card p-4">
            {product ? (
              <>
                <h2 className="font-display text-lg">{product.name}</h2>
                <p className="text-xs text-ink-soft">
                  {product.code} · {product.category} · per {product.uom}
                  {product.palletQty ? ` · ${product.palletQty} per pallet` : ''}
                  {product.listA ? ` · EMAS price A RM ${product.listA.toFixed(2)}` : ''}
                </p>
              </>
            ) : (
              <p className="text-sm text-ink-soft">Pick a product on the left.</p>
            )}

            {product ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[44rem] text-left text-sm">
                  <thead className="text-xs text-ink-soft uppercase">
                    <tr>
                      <th className="py-1 pr-2">Zone</th>
                      <th className="pr-2">Mode</th>
                      <th className="pr-2">Min qty</th>
                      <th className="pr-2 text-right">Sell</th>
                      <th className="pr-2 text-right">Cost</th>
                      <th className="pr-2 text-right">GP</th>
                      <th className="pr-2">Effective</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const live = rowActive(r, today)
                      return (
                        <tr key={r.id} className={cn('border-t border-line', !live && 'text-ink-soft')}>
                          <td className="py-1.5 pr-2">{zoneLabel(r.zone)}</td>
                          <td className="pr-2">{MODE_LABEL[r.mode]}</td>
                          <td className="pr-2">
                            {r.minQty}
                            {r.tierUnit === 'pallet' ? ' plt' : ` ${product.uom}`}
                          </td>
                          <td className="pr-2 text-right">{rm(r.sell)}</td>
                          <td className="pr-2 text-right">{rm(r.cost)}</td>
                          <td className="pr-2 text-right">{rm(r.sell - r.cost)}</td>
                          <td className="pr-2 text-xs">
                            {r.effectiveFrom} → {r.effectiveTo ?? 'open'}
                            {!live ? <span className="ml-1 rounded bg-paper-deep px-1">{r.effectiveFrom > today ? 'future' : 'expired'}</span> : null}
                          </td>
                          <td className="text-right whitespace-nowrap">
                            <button
                              type="button"
                              className="px-1 text-xs font-medium text-brick"
                              onClick={() => {
                                setEditId(r.id)
                                setDraft(fromRow(r))
                                setError('')
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="px-1 align-middle text-ink-soft hover:text-rose"
                              aria-label="Delete row"
                              onClick={() => {
                                deletePriceRow(r.id)
                                if (editId === r.id) {
                                  setEditId(null)
                                  setDraft(blank(code))
                                }
                              }}
                            >
                              <Trash2 className="inline h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {rows.length === 0 ? (
                  <p className="py-3 text-sm text-ink-soft">Codes only so far. No price rows for this product.</p>
                ) : null}
              </div>
            ) : null}
          </section>

          <form className="rounded-2xl border border-line bg-card p-4" onSubmit={onSubmit}>
            <h3 className="font-display text-base">{editId ? 'Edit price row' : 'Add price row'}</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="col-span-2 text-xs text-ink-soft">
                Product
                <select className={cn(SELECT, 'mt-1')} value={draft.code} onChange={(e) => set('code', e.target.value)}>
                  {[...(product ? [product] : []), ...list.slice(0, SHOW).filter((p) => p.code !== product?.code)].map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} · {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-soft">
                Zone / town
                <select className={cn(SELECT, 'mt-1')} value={draft.zone} onChange={(e) => set('zone', e.target.value)}>
                  <option value={ANY_ZONE}>All zones</option>
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
              <label className="text-xs text-ink-soft">
                Delivery mode
                <select className={cn(SELECT, 'mt-1')} value={draft.mode} onChange={(e) => set('mode', e.target.value as DeliveryMode)}>
                  {MODES.map((m) => (
                    <option key={m} value={m}>
                      {MODE_LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-soft">
                Tier counted in
                <select className={cn(SELECT, 'mt-1')} value={draft.tierUnit} onChange={(e) => set('tierUnit', e.target.value as TierUnit)}>
                  <option value="unit">Units</option>
                  <option value="pallet">Pallets</option>
                </select>
              </label>
              <label className="text-xs text-ink-soft">
                Min qty (tier)
                <Input className="mt-1" inputMode="decimal" value={draft.minQty} onChange={(e) => set('minQty', e.target.value)} />
              </label>
              <label className="text-xs text-ink-soft">
                Sell (RM)
                <Input className="mt-1" inputMode="decimal" value={draft.sell} onChange={(e) => set('sell', e.target.value)} />
              </label>
              <label className="text-xs text-ink-soft">
                Cost (RM)
                <Input className="mt-1" inputMode="decimal" value={draft.cost} onChange={(e) => set('cost', e.target.value)} />
              </label>
              <label className="text-xs text-ink-soft">
                Effective from
                <Input className="mt-1" type="date" value={draft.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} />
              </label>
              <label className="text-xs text-ink-soft">
                Effective to (optional)
                <Input className="mt-1" type="date" value={draft.effectiveTo} onChange={(e) => set('effectiveTo', e.target.value)} />
              </label>
              <label className="col-span-2 text-xs text-ink-soft">
                Note
                <Input className="mt-1" value={draft.note} onChange={(e) => set('note', e.target.value)} />
              </label>
            </div>
            {error ? (
              <p role="alert" className="mt-3 text-sm text-rose">
                {error}
              </p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button type="submit">{editId ? 'Save row' : 'Add row'}</Button>
              {editId ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditId(null)
                    setDraft(blank(code))
                  }}
                >
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </form>

          <Tester />
        </div>
      </div>
    </div>
  )
}

function Tester() {
  const { products, priceRows } = useDesk()
  const [code, setCode] = useState(products[0]?.code ?? '')
  const [zone, setZone] = useState('Shah Alam')
  const [mode, setMode] = useState<DeliveryMode>('direct')
  const [qty, setQty] = useState('20')
  const [date, setDate] = useState(todayISO())
  const pricedProducts = useMemo(() => {
    const codes = new Set(priceRows.map((r) => r.code))
    return products.filter((p) => codes.has(p.code))
  }, [products, priceRows])
  const hit = lookupPrice(priceRows, products, { code, zone, mode, qty: Number(qty) || 0, date })
  const product = products.find((p) => p.code === code)

  return (
    <section className="rounded-2xl border border-dashed border-line bg-sand/40 p-4">
      <h3 className="font-display text-base">Try a lookup</h3>
      <p className="text-xs text-ink-soft">
        Quantity is in {product?.uom ?? 'units'}
        {product?.palletQty ? `; pallet tiers use ${product.palletQty} per pallet` : ''}.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <select aria-label="Lookup product" className={SELECT} value={code} onChange={(e) => setCode(e.target.value)}>
          {pricedProducts.map((p) => (
            <option key={p.code} value={p.code}>
              {p.code}
            </option>
          ))}
        </select>
        <select aria-label="Lookup zone" className={SELECT} value={zone} onChange={(e) => setZone(e.target.value)}>
          <option value={ANY_ZONE}>No zone</option>
          {ZONES.flatMap((z) => z.towns).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select aria-label="Lookup mode" className={SELECT} value={mode} onChange={(e) => setMode(e.target.value as DeliveryMode)}>
          {MODES.filter((m) => m !== 'any').map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
        <Input aria-label="Lookup quantity" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        <Input aria-label="Lookup date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <p className="mt-3 text-sm">
        {hit ? (
          <>
            Sell <span className="font-medium">{rm(hit.sell)}</span> · Cost <span className="font-medium">{rm(hit.cost)}</span> ·
            GP {rm(hit.sell - hit.cost)}
            <span className="block text-xs text-ink-soft">
              Row: {zoneLabel(hit.row.zone)}, {MODE_LABEL[hit.row.mode]}, from {hit.row.minQty}
              {hit.row.tierUnit === 'pallet' ? ' plt' : ''}, effective {hit.row.effectiveFrom}
            </span>
          </>
        ) : (
          <span className="text-ink-soft">No row matches. The order line would fall back to the quick tier sheet with no cost.</span>
        )}
      </p>
    </section>
  )
}
