import { Check, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BRANDS, GROUPS } from '../lib/catalog.ts'
import { rm } from '../lib/format.ts'
import { ANY_ZONE, MODES, MODE_LABEL, todayISO } from '../lib/pricedesk.ts'
import { bulkCards, cardOn, keyOf, rowLabel, type CardRow } from '../lib/priceUpdate.ts'
import { TOWN_LIST } from '../lib/quote.ts'
import { tabName } from '../lib/tileSheet.ts'
import type { DeliveryMode, Product, TierUnit } from '../lib/types.ts'
import { useDesk } from '../lib/useDesk.ts'
import { cn } from '../lib/utils.ts'
import { PriceSheetEditor } from './PriceSheetEditor.tsx'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'

const SELECT = 'h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink'
const PAGE = 60

/* ------------------------------------------------------------------ finder */

export function PriceUpdate() {
  const { products, priceRows, priceSheets } = useDesk()
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [pricedOnly, setPricedOnly] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const [focus, setFocus] = useState<string>('41-01-01-01')
  const [picked, setPicked] = useState<string[]>([])

  const today = todayISO()
  const pricedCodes = useMemo(() => new Set(priceRows.map((row) => row.code)), [priceRows])
  const sheetOf = (code: string) => priceSheets.find((sheet) => sheet.codes.includes(code))
  const fromPrice = useMemo(() => {
    const best = new Map<string, number>()
    for (const row of priceRows) {
      if (row.effectiveFrom > today || (row.effectiveTo !== null && row.effectiveTo < today)) continue
      const seen = best.get(row.code)
      if (seen === undefined || row.sell < seen) best.set(row.code, row.sell)
    }
    return best
  }, [priceRows, today])

  const needle = query.trim().toLowerCase()
  const words = needle.split(/\s+/).filter(Boolean)
  const inGroup = (p: Product) => !group || p.group === group
  const list = products.filter((p) => {
    if (!inGroup(p)) return false
    if (category && p.category !== category) return false
    if (brand && p.brand !== brand) return false
    if (pricedOnly && !pricedCodes.has(p.code)) return false
    if (words.length === 0) return true
    const hay = `${p.code} ${p.name} ${p.brand ?? ''} ${p.category}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of products) counts.set(p.group ?? 'Sundries', (counts.get(p.group ?? 'Sundries') ?? 0) + 1)
    return counts
  }, [products])
  const categories = group ? (GROUPS.find((g) => g.name === group)?.categories ?? []) : []
  const demoCats = group ? [...new Set(products.filter((p) => p.group === group && !p.source).map((p) => p.category))].filter((c) => !categories.includes(c)) : []
  const brandsHere = useMemo(() => BRANDS.filter((b) => products.some((p) => p.brand === b && inGroup(p))), [products, group]) // eslint-disable-line react-hooks/exhaustive-deps
  const focused = products.find((p) => p.code === focus)
  const sheet = focused ? sheetOf(focused.code) : undefined
  const pickedSet = new Set(picked)
  const visible = list.slice(0, shown)
  const allVisiblePicked = visible.length > 0 && visible.every((p) => pickedSet.has(p.code))

  const toggle = (code: string) => setPicked((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]))
  const reset = () => setShown(PAGE)

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-card p-3 sm:p-4" aria-labelledby="finder-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="finder-heading" className="font-display text-lg">
              1 · Find the item
            </h2>
            <p className="text-xs text-ink-soft">
              {products.length.toLocaleString('en-MY')} codes in {GROUPS.length} groups · tick several to move them together
            </p>
          </div>
          <label className="relative w-full sm:w-80">
            <span className="sr-only">Search items</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
            <Input
              className="pl-9"
              placeholder="Search code, name or brand — e.g. elabana, keraflex, 63-"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                reset()
              }}
            />
          </label>
        </div>

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Group">
          {[['', 'All', products.length] as const, ...GROUPS.map((g) => [g.name, g.name, groupCounts.get(g.name) ?? 0] as const)].map(([value, label, count]) => (
            <button
              key={label}
              type="button"
              aria-pressed={group === value}
              onClick={() => {
                setGroup(value)
                setCategory('')
                setBrand('')
                reset()
              }}
              className={cn(
                'min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap',
                group === value ? 'border-brick bg-brick text-white' : 'border-line bg-card text-ink-soft hover:bg-sand',
              )}
            >
              {label} <span className={cn('tabular-nums', group === value ? 'text-white/80' : 'text-ink-soft/80')}>{count.toLocaleString('en-MY')}</span>
            </button>
          ))}
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <select
            aria-label="Category"
            className={SELECT}
            value={category}
            disabled={!group}
            onChange={(e) => {
              setCategory(e.target.value)
              reset()
            }}
          >
            <option value="">{group ? `All ${group.toLowerCase()}` : 'Pick a group to narrow by category'}</option>
            {[...categories, ...demoCats].map((c) => (
              <option key={c} value={c}>
                {c} ({products.filter((p) => p.category === c).length})
              </option>
            ))}
          </select>
          <select
            aria-label="Brand"
            className={SELECT}
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value)
              reset()
            }}
          >
            <option value="">All brands</option>
            {brandsHere.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brick" checked={pricedOnly} onChange={(e) => setPricedOnly(e.target.checked)} />
            Has a price
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
          <label className="flex min-h-9 items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brick"
              checked={allVisiblePicked}
              onChange={() =>
                setPicked((current) =>
                  allVisiblePicked ? current.filter((c) => !visible.some((p) => p.code === c)) : [...new Set([...current, ...visible.map((p) => p.code)])],
                )
              }
            />
            Tick all {visible.length} shown
          </label>
          <span>
            {list.length.toLocaleString('en-MY')} match{list.length === 1 ? '' : 'es'}
            {picked.length > 0 ? (
              <>
                {' '}
                · <span className="font-medium text-ink">{picked.length} ticked</span>{' '}
                <button type="button" className="font-medium text-brick" onClick={() => setPicked([])}>
                  clear
                </button>
              </>
            ) : null}
          </span>
        </div>

        <ul className="mt-1 max-h-[22rem] divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {visible.map((p) => {
            const on = pickedSet.has(p.code)
            const active = p.code === focus
            const from = fromPrice.get(p.code)
            return (
              <li key={p.code} className={cn('flex items-center gap-2 px-2', active && 'bg-palm-soft', on && !active && 'bg-sand/60')}>
                <input type="checkbox" aria-label={`Tick ${p.name}`} className="h-4 w-4 shrink-0 accent-brick" checked={on} onChange={() => toggle(p.code)} />
                <button type="button" onClick={() => setFocus(p.code)} aria-current={active ? 'true' : undefined} className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 py-1.5 text-left">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-ink-soft">
                      <span className="tabular-nums">{p.code}</span> · {p.category}
                      {p.brand ? ` · ${p.brand}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums">
                    {from !== undefined ? (
                      <span className="font-medium text-ink">from {rm(from)}</span>
                    ) : (
                      <span className="text-ink-soft">no price yet</span>
                    )}
                    {sheetOf(p.code) ? <span className="block text-[11px] text-palm">price sheet</span> : null}
                  </span>
                </button>
              </li>
            )
          })}
          {list.length === 0 ? <li className="px-3 py-4 text-sm text-ink-soft">No item matches. Try fewer words or another group.</li> : null}
        </ul>
        {list.length > shown ? (
          <button type="button" className="mt-2 min-h-9 text-sm font-medium text-brick" onClick={() => setShown(shown + PAGE)}>
            Show {Math.min(PAGE, list.length - shown)} more of {(list.length - shown).toLocaleString('en-MY')}
          </button>
        ) : null}
      </section>

      {picked.length >= 2 ? (
        <BulkEditor codes={picked} onDone={() => setPicked([])} />
      ) : sheet ? (
        <div className="space-y-2">
          <p className="rounded-xl bg-palm-soft px-3 py-2 text-sm text-palm">
            <span className="font-medium">{focused?.name}</span> is priced on the <span className="font-medium">{sheet.title}</span> sheet — its{' '}
            {sheet.codes.length} colours move together, for every town.
          </p>
          <PriceSheetEditor sheetId={sheet.id} />
        </div>
      ) : focused ? (
        <CardEditor key={focused.code} product={focused} />
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------- one product */

interface RowDraft {
  id: string
  zone: string
  mode: DeliveryMode
  tierUnit: TierUnit
  minQty: string
  cost: string
  sell: string
}

let seq = 0
const rid = () => `r${(seq += 1)}`
const n = (value: string) => Number(value.replace(/[^\d.-]/g, ''))
const ok = (value: string) => value.trim() !== '' && Number.isFinite(n(value))

function CardEditor({ product }: { product: Product }) {
  const { priceRows, publishCards } = useDesk()
  const today = todayISO()
  const now = useMemo(() => cardOn(priceRows, product.code, today), [priceRows, product.code, today])
  const start = (): RowDraft[] =>
    now.length > 0
      ? now.map((row) => ({ id: rid(), zone: row.zone, mode: row.mode, tierUnit: row.tierUnit, minQty: String(row.minQty), cost: String(row.cost), sell: String(row.sell) }))
      : [{ id: rid(), zone: ANY_ZONE, mode: 'any', tierUnit: 'unit', minQty: '1', cost: '', sell: product.listA ? String(product.listA) : '' }]
  const [rows, setRows] = useState<RowDraft[]>(start)
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  const was = new Map(now.map((row) => [keyOf(row), row]))
  const parsed: (CardRow & { id: string })[] = rows
    .filter((row) => ok(row.sell))
    .map((row) => ({ id: row.id, zone: row.zone, mode: row.mode, tierUnit: row.tierUnit, minQty: ok(row.minQty) ? n(row.minQty) : 1, sell: n(row.sell), cost: ok(row.cost) ? n(row.cost) : 0 }))
  const changed = parsed.filter((row) => {
    const prior = was.get(keyOf(row))
    return !prior || Math.abs(prior.sell - row.sell) > 0.00001 || Math.abs(prior.cost - row.cost) > 0.00001
  }).length
  const dropped = now.filter((row) => !parsed.some((p) => keyOf(p) === keyOf(row))).length
  const dirty = changed > 0 || dropped > 0

  const patch = (id: string, change: Partial<RowDraft>) => setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)))
  const shiftSell = (pct: number, add: number) =>
    setRows((current) => current.map((row) => (ok(row.sell) ? { ...row, sell: String(Math.round((n(row.sell) * (1 + pct / 100) + add) * 100) / 100) } : row)))
  const addRow = (kind: 'town' | 'break') =>
    setRows((current) => {
      const last = current.at(-1)
      if (kind === 'town') {
        const used = new Set(current.map((row) => row.zone))
        const zone = TOWN_LIST.find((town) => !used.has(town)) ?? 'Shah Alam'
        return [...current, { id: rid(), zone, mode: 'any', tierUnit: last?.tierUnit ?? 'unit', minQty: '1', cost: last?.cost ?? '', sell: last?.sell ?? '' }]
      }
      return [...current, { id: rid(), zone: last?.zone ?? ANY_ZONE, mode: 'any', tierUnit: last?.tierUnit ?? 'unit', minQty: String((ok(last?.minQty ?? '') ? n(last?.minQty ?? '1') : 1) * 2), cost: last?.cost ?? '', sell: last?.sell ?? '' }]
    })

  function publish() {
    const keys = parsed.map(keyOf)
    if (rows.some((row) => row.sell.trim() !== '' && !ok(row.sell))) return setError('A selling price is not a number.')
    if (parsed.length === 0) return setError('Fill at least one selling price.')
    if (new Set(keys).size !== keys.length) return setError('Two rows have the same town, mode and quantity. Change one.')
    publishCards({
      cards: [{ code: product.code, rows: parsed }],
      effectiveFrom,
      title: `${product.name} (${product.code})`,
      kind: 'card',
      note: `Price card ${tabName(effectiveFrom)}`,
    })
    setConfirming(false)
    setError('')
  }

  const uom = product.uom && product.uom !== '—' ? product.uom : 'unit'

  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5" aria-labelledby="card-heading">
      <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">2 · Price card</p>
      <h2 id="card-heading" className="font-display text-lg">
        {product.name}
      </h2>
      <p className="text-sm text-ink-soft">
        {product.code} · {product.group} › {product.category}
        {product.brand ? ` · ${product.brand}` : ''} · per {uom}
        {product.palletQty ? ` · ${product.palletQty} per pallet` : ''}
        {product.listA ? ` · EMAS price A ${rm(product.listA)}` : ''}
      </p>
      <p className="mt-1 text-sm">
        {now.length > 0 ? (
          <>
            {now.length} price{now.length === 1 ? '' : 's'} in force today. Type straight into any cell — cost, sell, quantity, town.
          </>
        ) : (
          <span className="text-amber">No price yet. Fill the first row; add a town or a quantity break if it needs one.</span>
        )}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-left text-[11px] text-ink-soft uppercase">
            <tr>
              <th className="py-1 pr-2 font-medium">Town</th>
              <th className="pr-2 font-medium">Mode</th>
              <th className="pr-2 font-medium">From qty</th>
              <th className="pr-2 text-right font-medium">Cost</th>
              <th className="pr-2 text-right font-medium text-brick-deep">Sell</th>
              <th className="pr-2 text-right font-medium">GP</th>
              <th className="sr-only">Remove</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const prior = was.get(keyOf({ ...row, minQty: ok(row.minQty) ? n(row.minQty) : 1 }))
              const delta = prior && ok(row.sell) ? n(row.sell) - prior.sell : 0
              const gp = ok(row.sell) && ok(row.cost) ? n(row.sell) - n(row.cost) : null
              return (
                <tr key={row.id} className="border-t border-line">
                  <td className="py-1 pr-2">
                    <select aria-label="Town" className={cn(SELECT, 'h-9 w-36')} value={row.zone} onChange={(e) => patch(row.id, { zone: e.target.value })}>
                      <option value={ANY_ZONE}>All towns</option>
                      {TOWN_LIST.map((town) => (
                        <option key={town} value={town}>
                          {town}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="pr-2">
                    <select aria-label="Mode" className={cn(SELECT, 'h-9 w-32')} value={row.mode} onChange={(e) => patch(row.id, { mode: e.target.value as DeliveryMode })}>
                      {MODES.map((m) => (
                        <option key={m} value={m}>
                          {MODE_LABEL[m]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="pr-2">
                    <span className="inline-flex items-center gap-1">
                      <input aria-label="From quantity" inputMode="decimal" value={row.minQty} onChange={(e) => patch(row.id, { minQty: e.target.value })} className="h-9 w-20 rounded-md border border-line bg-card px-2 text-right tabular-nums" />
                      <select aria-label="Counted in" className="h-9 rounded-md border border-line bg-card px-1 text-xs" value={row.tierUnit} onChange={(e) => patch(row.id, { tierUnit: e.target.value as TierUnit })}>
                        <option value="unit">{uom}</option>
                        <option value="pallet">plt</option>
                      </select>
                    </span>
                  </td>
                  <td className="pr-2 text-right">
                    <input aria-label="Cost" inputMode="decimal" placeholder="—" value={row.cost} onChange={(e) => patch(row.id, { cost: e.target.value })} className="h-9 w-24 rounded-md border border-line bg-card px-2 text-right tabular-nums" />
                  </td>
                  <td className="pr-2 text-right whitespace-nowrap">
                    <input aria-label="Sell" inputMode="decimal" placeholder="RM" value={row.sell} onChange={(e) => patch(row.id, { sell: e.target.value })} className="h-9 w-24 rounded-md border border-brick/40 bg-card px-2 text-right font-medium tabular-nums" />
                    {!prior && now.length > 0 && ok(row.sell) ? <span className="ml-1 rounded bg-palm-soft px-1 text-[11px] text-palm">new</span> : null}
                    {Math.abs(delta) > 0.00001 ? (
                      <span className={cn('ml-1 rounded px-1 text-[11px] font-medium', delta > 0 ? 'bg-amber-soft text-amber' : 'bg-ok-soft text-ok')}>
                        {delta > 0 ? '+' : '−'}
                        {Math.abs(delta).toFixed(2)}
                      </span>
                    ) : null}
                  </td>
                  <td className={cn('pr-2 text-right tabular-nums', gp !== null && gp < 0 && 'text-rose')}>{gp === null ? '—' : gp.toFixed(2)}</td>
                  <td className="text-right">
                    <button type="button" aria-label="Remove this price" disabled={rows.length === 1} onClick={() => setRows(rows.filter((r) => r.id !== row.id))} className="grid h-9 w-9 place-items-center rounded-md text-ink-soft hover:text-rose disabled:opacity-30">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="outline" size="sm" onClick={() => addRow('break')}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Quantity break
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addRow('town')}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Town price
        </Button>
        <span className="mx-1 text-xs text-ink-soft">All sells:</span>
        {(
          [
            ['+2%', 2, 0],
            ['+5%', 5, 0],
            ['+10 sen', 0, 0.1],
            ['+RM 1', 0, 1],
            ['−2%', -2, 0],
          ] as const
        ).map(([label, pct, add]) => (
          <button key={label} type="button" onClick={() => shiftSell(pct, add)} className="min-h-9 rounded-full border border-line bg-card px-3 text-xs font-medium hover:bg-sand">
            {label}
          </button>
        ))}
      </div>

      <div className={cn('mt-4 rounded-xl p-3', dirty ? 'border border-brick/30 bg-card shadow-md' : 'bg-sand/50')}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="text-xs text-ink-soft">
            Effective from
            <Input className="mt-1 h-10 w-44" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </label>
          <p className="min-w-0 flex-1 text-sm">
            {dirty ? (
              <>
                <span className="font-semibold">{changed} price{changed === 1 ? '' : 's'} change</span>
                {dropped > 0 ? `, ${dropped} removed` : ''} from {tabName(effectiveFrom)}. The current card closes the day before.
              </>
            ) : (
              <span className="text-ink-soft">Nothing changed yet.</span>
            )}
          </p>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={publish}>
                <Check className="h-4 w-4" aria-hidden="true" /> Yes, publish and tell everyone
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                Back
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setRows(start())}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" /> Undo
              </Button>
              <Button type="button" disabled={!dirty} onClick={() => setConfirming(true)}>
                Publish
              </Button>
            </div>
          )}
        </div>
        {confirming ? <p className="mt-2 text-xs text-ink-soft">Everyone gets a notice, the sales WhatsApp group gets the new prices, and it goes in the change log. Locked SOs keep their price.</p> : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm text-rose">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  )
}

/* --------------------------------------------------------- many products */

function BulkEditor({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { products, priceRows, priceSheets, publishCards } = useDesk()
  const [pct, setPct] = useState('5')
  const [add, setAdd] = useState('')
  const [withCost, setWithCost] = useState(false)
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO())
  const [confirming, setConfirming] = useState(false)

  const onSheet = codes.filter((code) => priceSheets.some((sheet) => sheet.codes.includes(code)))
  const free = codes.filter((code) => !onSheet.includes(code))
  const move = { pct: Number(pct) || 0, rm: Number(add) || 0, withCost }
  const { cards, skipped } = bulkCards(priceRows, free, effectiveFrom, move)
  const name = (code: string) => products.find((p) => p.code === code)?.name ?? code
  const preview = cards.flatMap((card) => {
    const now = cardOn(priceRows, card.code, effectiveFrom)
    return card.rows.map((row, i) => ({ code: card.code, label: rowLabel(row, products.find((p) => p.code === card.code)?.uom ?? 'unit'), before: now[i]?.sell ?? 0, after: row.sell }))
  })
  const moves = move.pct !== 0 || move.rm !== 0

  return (
    <section className="rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5" aria-labelledby="bulk-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">2 · Move several together</p>
          <h2 id="bulk-heading" className="font-display text-lg">
            {codes.length} items ticked
          </h2>
          <p className="text-sm text-ink-soft">
            {cards.length} have prices and will move · {skipped.length > 0 ? `${skipped.length} have no price yet (skipped — set them one by one)` : 'all have prices'}
            {onSheet.length > 0 ? ` · ${onSheet.length} on the Monier sheet (change those on the sheet)` : ''}
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={onDone}>
          <X className="h-4 w-4" aria-hidden="true" /> Clear ticks
        </Button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="text-xs text-ink-soft">
          Sell by %
          <Input className="mt-1 h-11 text-base tabular-nums" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
        </label>
        <label className="text-xs text-ink-soft">
          and / or by RM
          <Input className="mt-1 h-11 text-base tabular-nums" inputMode="decimal" placeholder="0.00" value={add} onChange={(e) => setAdd(e.target.value)} />
        </label>
        <label className="text-xs text-ink-soft">
          Effective from
          <Input className="mt-1 h-11" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 self-end rounded-lg border border-line px-3 py-2.5 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-brick" checked={withCost} onChange={(e) => setWithCost(e.target.checked)} />
          Cost moves too
        </label>
      </div>

      {cards.length > 0 && moves ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="text-left text-[11px] text-ink-soft uppercase">
              <tr>
                <th className="py-1 pr-2 font-medium">Item</th>
                <th className="pr-2 font-medium">Price</th>
                <th className="pr-2 text-right font-medium">Now</th>
                <th className="pr-2 text-right font-medium">New</th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 12).map((line, i) => (
                <tr key={`${line.code}-${i}`} className="border-t border-line">
                  <td className="max-w-56 truncate py-1 pr-2">{name(line.code)}</td>
                  <td className="pr-2 text-xs text-ink-soft">{line.label}</td>
                  <td className="pr-2 text-right tabular-nums">{line.before.toFixed(2)}</td>
                  <td className="pr-2 text-right font-medium tabular-nums">{line.after.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.length > 12 ? <p className="mt-1 text-xs text-ink-soft">+{preview.length - 12} more prices</p> : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {confirming ? (
          <>
            <span className="text-xs text-ink-soft">{preview.length} prices on {cards.length} items. Everyone is notified.</span>
            <Button
              type="button"
              onClick={() => {
                publishCards({
                  cards,
                  effectiveFrom,
                  title: `${cards.length} items ${move.pct ? `${move.pct > 0 ? '+' : ''}${move.pct}%` : ''}${move.pct && move.rm ? ' and ' : ''}${move.rm ? `${move.rm > 0 ? '+' : '−'}${rm(Math.abs(move.rm))}` : ''}`.trim(),
                  kind: 'bulk',
                  note: `Bulk change ${tabName(effectiveFrom)}`,
                })
                setConfirming(false)
                onDone()
              }}
            >
              <Check className="h-4 w-4" aria-hidden="true" /> Yes, publish
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Back
            </Button>
          </>
        ) : (
          <Button type="button" disabled={cards.length === 0 || !moves} onClick={() => setConfirming(true)}>
            Publish {preview.length} price{preview.length === 1 ? '' : 's'}
          </Button>
        )}
      </div>
    </section>
  )
}
