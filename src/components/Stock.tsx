import { ClipboardPaste, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { rm, qty, whenLabel } from '../lib/format.ts'
import { GROUPS, groupOf } from '../lib/catalog.ts'
import { STALE_DAYS, isStale, readYardStock, stockRows, type StockRow } from '../lib/inventory.ts'
import type { MoveKind, StockSignal } from '../lib/types.ts'
import { useDesk } from '../lib/useDesk.ts'
import { cn } from '../lib/utils.ts'
import { Note, SignalPill } from './bits.tsx'
import { StockCount } from './StockCount.tsx'
import { StockRestock } from './StockRestock.tsx'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'

type Tab = 'items' | 'restock' | 'count' | 'moves'
type Show = 'all' | 'restock' | StockSignal | 'stale' | 'flagged'

const TAB_KEY = 'stock-tab'
const SAMPLE = `Yard update 4pm:
Y12 lorry dah sampai 120
洋灰 tinggal 40
pasir sikit
BRC count 18`

const KIND: Record<MoveKind, { label: string; tone: string }> = {
  opening: { label: 'Opening', tone: 'text-ink-soft' },
  receive: { label: 'Goods in', tone: 'text-ok' },
  issue: { label: 'Delivered', tone: 'text-ink' },
  adjust: { label: 'Adjust', tone: 'text-amber' },
  count: { label: 'Count', tone: 'text-brick' },
}

export function Stock() {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (sessionStorage.getItem(TAB_KEY) as Tab | null) ?? 'items'
    } catch {
      return 'items'
    }
  })
  const pick = (next: Tab) => {
    setTab(next)
    try {
      sessionStorage.setItem(TAB_KEY, next)
    } catch {
      /* private mode */
    }
  }
  const desk = useDesk()
  const rows = useMemo(() => stockRows(desk, desk.products), [desk])
  const drafted = new Set(desk.purchaseOrders.filter((po) => po.status === 'draft').flatMap((po) => po.lines.map((line) => line.code)))
  const restock = rows.filter((row) => row.needsRestock && !drafted.has(row.item.code)).length
  const open = desk.stockCounts.filter((count) => !count.postedAt).length
  const drafts = desk.purchaseOrders.filter((po) => po.status === 'draft').length

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'items', label: 'Stock on hand' },
    { id: 'restock', label: 'Re-stock & POs', badge: restock + drafts },
    { id: 'count', label: 'Stock count', badge: open },
    { id: 'moves', label: 'Movements' },
  ]

  return (
    <div className="space-y-4">
      <Kpis rows={rows} />
      <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Stock">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => pick(t.id)}
            className={cn(
              '-mb-px flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium',
              tab === t.id ? 'border-brick text-ink' : 'border-transparent text-ink-soft hover:text-ink',
            )}
          >
            {t.label}
            {t.badge ? <span className="rounded-full bg-amber/15 px-1.5 text-xs text-amber tabular-nums">{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {tab === 'items' ? <Items rows={rows} /> : null}
      {tab === 'restock' ? <StockRestock rows={rows} /> : null}
      {tab === 'count' ? <StockCount rows={rows} /> : null}
      {tab === 'moves' ? <Moves /> : null}
    </div>
  )
}

function Kpis({ rows }: { rows: StockRow[] }) {
  const value = rows.reduce((sum, row) => sum + row.value, 0)
  const out = rows.filter((row) => row.signal === 'out').length
  const restock = rows.filter((row) => row.needsRestock).length
  const stale = rows.filter((row) => isStale(row.item.lastCountAt)).length
  const tiles = [
    { label: 'Items in the yard', value: String(rows.length), hint: 'Same codes as the Price Desk' },
    { label: 'Stock value', value: rm(value).replace(/\.\d\d$/, ''), hint: 'On hand × average cost' },
    { label: 'Need re-stock', value: String(restock), hint: 'At or under re-order level', warn: restock > 0 },
    { label: 'Out (没货)', value: String(out), hint: 'Nothing free after open orders', warn: out > 0 },
    { label: `Not counted ${STALE_DAYS}+ days`, value: String(stale), hint: 'Put them on the next count' },
  ]
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-2xl border border-line bg-card px-3 py-2.5">
          <p className="text-xs text-ink-soft">{tile.label}</p>
          <p className={cn('font-display text-lg tabular-nums', tile.warn && 'text-amber')}>{tile.value}</p>
          <p className="text-[11px] leading-4 text-ink-soft">{tile.hint}</p>
        </div>
      ))}
    </div>
  )
}

/* ---------------- stock on hand ---------------- */

function Items({ rows }: { rows: StockRow[] }) {
  const { products, stockItems, addStockItems } = useDesk()
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const [show, setShow] = useState<Show>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const needle = query.trim().toLowerCase()
  const shown = rows
    .filter((row) => !group || (row.product?.group ?? groupOf(row.product?.category ?? '')) === group)
    .filter((row) => {
      if (show === 'all') return true
      if (show === 'restock') return row.needsRestock
      if (show === 'stale') return isStale(row.item.lastCountAt)
      if (show === 'flagged') return Boolean(row.item.checkFlag)
      return row.signal === show
    })
    .filter((row) => !needle || [row.item.code, row.product?.name ?? '', row.product?.brand ?? '', row.product?.category ?? '', row.item.bin].some((text) => text.toLowerCase().includes(needle)))
    .toSorted((a, b) => rank(a.signal) - rank(b.signal) || Number(b.needsRestock) - Number(a.needsRestock) || (a.product?.name ?? '').localeCompare(b.product?.name ?? ''))
  const groupsHere = GROUPS.filter((g) => rows.some((row) => (row.product?.group ?? '') === g.name))
  const count = (key: Show) =>
    key === 'all' ? rows.length : key === 'restock' ? rows.filter((r) => r.needsRestock).length : key === 'stale' ? rows.filter((r) => isStale(r.item.lastCountAt)).length : key === 'flagged' ? rows.filter((r) => r.item.checkFlag).length : rows.filter((r) => r.signal === key).length

  return (
    <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <section className="min-w-0 rounded-2xl border border-line bg-card p-4" aria-labelledby="stock-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="stock-heading" className="font-display text-lg">
            Stock on hand
          </h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(!adding)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add item from Price Desk list
          </Button>
        </div>
        {adding ? <AddItems have={new Set(stockItems.map((i) => i.code))} products={products} onAdd={(codes) => { addStockItems(codes); setAdding(false) }} /> : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <label className="relative min-w-0 flex-1 basis-56">
            <span className="sr-only">Search stock</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden="true" />
            <Input className="pl-9" placeholder="Code, name, brand, bin…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <select aria-label="Group" className="h-10 min-w-0 rounded-lg border border-line bg-card px-2 text-sm" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All groups</option>
            {groupsHere.map((g) => (
              <option key={g.name} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {(['all', 'restock', 'out', 'low', 'stale', 'flagged'] as Show[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={show === key}
              onClick={() => setShow(key)}
              className={cn('min-h-9 rounded-full border px-3 text-xs font-medium', show === key ? 'border-ink bg-ink text-paper' : 'border-line bg-card text-ink-soft hover:bg-sand')}
            >
              {SHOW_LABEL[key]} <span className="tabular-nums opacity-70">{count(key)}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 hidden grid-cols-[1fr_5rem_5rem_5rem_6rem] gap-2 border-b border-line pb-1 text-xs text-ink-soft md:grid">
          <span>Item</span>
          <span className="text-right">On hand</span>
          <span className="text-right">Booked</span>
          <span className="text-right">Free</span>
          <span className="text-right">Sales see</span>
        </div>
        <ul className="divide-y divide-line">
          {shown.map((row) => (
            <li key={row.item.code}>
              <button
                type="button"
                aria-expanded={open === row.item.code}
                onClick={() => setOpen(open === row.item.code ? null : row.item.code)}
                className={cn('grid w-full grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1 py-2.5 text-left hover:bg-sand/40 md:grid-cols-[1fr_5rem_5rem_5rem_6rem]', open === row.item.code && 'bg-sand/40')}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{row.product?.name ?? row.item.code}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {row.item.code} · {row.item.bin || 'no bin'}
                    {row.needsRestock ? <span className="text-amber"> · re-stock</span> : null}
                    {row.item.checkFlag ? <span className="text-rose"> · check</span> : null}
                  </span>
                </span>
                <span className="hidden text-right text-sm tabular-nums md:block">{qty(row.item.onHand)}</span>
                <span className="hidden text-right text-sm text-ink-soft tabular-nums md:block">{row.reserved ? qty(row.reserved) : '—'}</span>
                <span className={cn('hidden text-right text-sm font-semibold tabular-nums md:block', row.available <= 0 && 'text-rose')}>{qty(row.available)}</span>
                <span className="flex justify-end">
                  <SignalPill signal={row.signal} />
                </span>
                <span className="col-span-2 text-xs text-ink-soft tabular-nums md:hidden">
                  On hand {qty(row.item.onHand)} · booked {qty(row.reserved)} · <span className="font-semibold text-ink">free {qty(row.available)}</span> {row.product?.uom}
                </span>
              </button>
              {open === row.item.code ? <ItemPanel row={row} /> : null}
            </li>
          ))}
          {shown.length === 0 ? <li className="py-4 text-sm text-ink-soft">No item matches.</li> : null}
        </ul>
      </section>

      <div className="space-y-4">
        <YardNote />
        <Note>
          <b>How the numbers work.</b> Booked = Confirmed and Preparing orders. Free = on hand − booked. Sales see 有货 / 少 / 没货 worked out
          from Free and the re-order level, so the Confirm screen and WhatsApp stay honest. Delivering an order takes its lines out; goods
          received and counts put them right. Factory-direct items (Monier tiles) are not kept in the yard.
        </Note>
      </div>
    </div>
  )
}

const SHOW_LABEL: Record<Show, string> = { all: 'All', restock: 'Need re-stock', out: 'Out 没货', low: 'Low 少', enough: 'Enough', stale: 'Count due', flagged: 'Yard flagged' }

function rank(signal: StockSignal): number {
  return signal === 'out' ? 0 : signal === 'low' ? 1 : 2
}

function AddItems({ have, products, onAdd }: { have: Set<string>; products: { code: string; name: string; category: string; uom: string }[]; onAdd: (codes: string[]) => void }) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const hits = words.length === 0 ? [] : products.filter((p) => !have.has(p.code) && words.every((w) => `${p.code} ${p.name} ${p.category}`.toLowerCase().includes(w))).slice(0, 12)
  return (
    <div className="mt-3 rounded-xl border border-line bg-sand/40 p-3">
      <p className="text-sm">Pick from the 3,768-item Price Desk list. New items start at 0 — count them to set the quantity.</p>
      <Input className="mt-2" placeholder="Search e.g. mapei, nail, 63-01…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto">
        {hits.map((p) => (
          <li key={p.code}>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 py-1 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-brick" checked={picked.includes(p.code)} onChange={() => setPicked(picked.includes(p.code) ? picked.filter((c) => c !== p.code) : [...picked, p.code])} />
              <span className="min-w-0">
                <span className="block truncate">{p.name}</span>
                <span className="block text-xs text-ink-soft">
                  {p.code} · {p.category}
                </span>
              </span>
            </label>
          </li>
        ))}
        {words.length > 0 && hits.length === 0 ? <li className="py-2 text-sm text-ink-soft">Nothing new matches — it may already be on the yard list.</li> : null}
      </ul>
      <Button type="button" className="mt-2" disabled={picked.length === 0} onClick={() => onAdd(picked)}>
        Add {picked.length || ''} to the yard list
      </Button>
    </div>
  )
}

const REASONS = ['Damaged / broken', 'Found extra', 'Used in the yard', 'Sample to customer', 'Correction']

function ItemPanel({ row }: { row: StockRow }) {
  const { stockMoves, updateStockItem, stockAdjust, highlightOrder } = useDesk()
  const { item } = row
  const [amount, setAmount] = useState('')
  const [dir, setDir] = useState<1 | -1>(-1)
  const [reason, setReason] = useState(REASONS[0])
  const moves = stockMoves.filter((move) => move.code === item.code).slice(0, 6)
  const uom = row.product?.uom ?? ''
  const n = Number(amount) || 0

  const field = (label: string, key: 'reorderAt' | 'reorderQty' | 'leadDays' | 'avgCost', step = 1) => (
    <label className="text-xs text-ink-soft">
      {label}
      <Input
        key={`${key}-${item[key]}`}
        className="mt-0.5 h-9 tabular-nums"
        type="number"
        min={0}
        step={step}
        defaultValue={item[key]}
        onBlur={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v >= 0 && v !== item[key]) updateStockItem(item.code, { [key]: v })
        }}
      />
    </label>
  )

  return (
    <div className="mb-3 space-y-3 rounded-xl border border-line bg-paper p-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        {[
          ['On hand', `${qty(item.onHand)} ${uom}`],
          ['Booked', `${qty(row.reserved)} ${uom}`],
          ['Free', `${qty(row.available)} ${uom}`],
          ['On order', row.onOrder ? `${qty(row.onOrder)} ${uom}` : '—'],
          ['Average cost', rm(item.avgCost)],
          ['Value', rm(row.value)],
          ['Last counted', item.lastCountAt ? whenLabel(item.lastCountAt) : 'never'],
          ['Supplier', item.supplier],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-ink-soft">{k}</dt>
            <dd className="truncate font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {row.reservedOrders.length > 0 ? (
        <p className="text-xs text-ink-soft">
          Booked by{' '}
          {row.reservedOrders.map((id, i) => (
            <span key={id}>
              {i > 0 ? ', ' : ''}
              <button type="button" className="font-medium text-brick underline-offset-2 hover:underline" onClick={() => highlightOrder(id)}>
                {id}
              </button>
            </span>
          ))}
        </p>
      ) : null}
      {item.checkFlag ? <p className="rounded-lg bg-rose/10 px-3 py-2 text-xs text-rose">{item.checkFlag} — the system says {qty(row.available)} free. Count it.</p> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {field('Re-order at', 'reorderAt')}
        {field('Re-order qty', 'reorderQty')}
        {field('Lead days', 'leadDays')}
        {field('Avg cost (RM)', 'avgCost', 0.01)}
        <label className="col-span-2 text-xs text-ink-soft">
          Supplier
          <Input key={`s-${item.supplier}`} className="mt-0.5 h-9" defaultValue={item.supplier} onBlur={(e) => e.target.value.trim() && e.target.value !== item.supplier && updateStockItem(item.code, { supplier: e.target.value.trim() })} />
        </label>
        <label className="col-span-2 text-xs text-ink-soft">
          Bin / bay
          <Input key={`b-${item.bin}`} className="mt-0.5 h-9" defaultValue={item.bin} onBlur={(e) => e.target.value !== item.bin && updateStockItem(item.code, { bin: e.target.value.trim() })} />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
        <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="Direction">
          {([-1, 1] as const).map((d) => (
            <button key={d} type="button" aria-pressed={dir === d} onClick={() => setDir(d)} className={cn('min-h-9 rounded-md px-3 text-sm font-medium', dir === d ? 'bg-ink text-paper' : 'text-ink-soft')}>
              {d < 0 ? '− Take out' : '+ Put in'}
            </button>
          ))}
        </div>
        <Input aria-label="Quantity" className="h-10 w-24 tabular-nums" inputMode="decimal" placeholder="Qty" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
        <select aria-label="Reason" className="h-10 rounded-lg border border-line bg-card px-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          disabled={n <= 0}
          onClick={() => {
            stockAdjust(item.code, { qty: dir * n }, reason)
            setAmount('')
          }}
        >
          Adjust
        </Button>
      </div>

      {moves.length > 0 ? (
        <ul className="divide-y divide-line border-t border-line text-xs">
          {moves.map((move) => (
            <li key={move.id} className="flex justify-between gap-2 py-1.5">
              <span className="min-w-0 truncate">
                <span className={cn('font-medium', KIND[move.kind].tone)}>{KIND[move.kind].label}</span> · {move.ref} · {whenLabel(move.at)}
                {move.note ? <span className="text-ink-soft"> · {move.note}</span> : null}
              </span>
              <span className="shrink-0 tabular-nums">
                {move.qty > 0 ? '+' : ''}
                {qty(move.qty)} → {qty(move.balance)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/* ---------------- yard WhatsApp ---------------- */

function YardNote() {
  const { skus, stockItems, products, applyYardStock } = useDesk()
  const [note, setNote] = useState('')
  const reads = note.trim() ? readYardStock(note, skus, stockItems, products) : []
  const onHand = new Map(stockItems.map((i) => [i.code, i.onHand]))
  return (
    <section className="rounded-2xl border border-line bg-card p-4" aria-labelledby="yard-heading">
      <h2 id="yard-heading" className="font-display text-lg">
        Paste the yard’s WhatsApp
      </h2>
      <p className="text-sm text-ink-soft">
        A number with tinggal / 剩 / count sets on hand. With sampai / 到货 / masuk it is goods in. 没货 sets zero. Sikit / 少 without a number goes on the next count.
      </p>
      <textarea
        aria-label="Yard message"
        rows={5}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={SAMPLE}
        className="mt-2 w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus-visible:border-brick focus-visible:ring-2 focus-visible:ring-brick/20"
      />
      {reads.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm">
          {reads.map((read) => (
            <li key={read.code} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{read.name}</span>
              <span className="shrink-0 text-xs tabular-nums">
                {read.action === 'receive' ? (
                  <span className="text-ok">+{read.qty} in</span>
                ) : read.action === 'count' ? (
                  <span>
                    {qty(onHand.get(read.code) ?? 0)} → <b>{read.qty}</b>
                  </span>
                ) : (
                  <span className="text-rose">flag for count</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : note.trim() ? (
        <p className="mt-2 text-sm text-ink-soft">No stocked item with a number or stock word yet.</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={reads.length === 0} onClick={() => applyYardStock(note) > 0 && setNote('')}>
          Apply {reads.length || ''} line{reads.length === 1 ? '' : 's'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setNote(SAMPLE)}>
          <ClipboardPaste className="h-4 w-4" aria-hidden="true" /> Try a sample
        </Button>
      </div>
    </section>
  )
}

/* ---------------- ledger ---------------- */

function Moves() {
  const { stockMoves, products } = useDesk()
  const [kind, setKind] = useState<MoveKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(60)
  const names = useMemo(() => new Map(products.map((p) => [p.code, p.name])), [products])
  const needle = query.trim().toLowerCase()
  const rows = stockMoves
    .filter((move) => kind === 'all' || move.kind === kind)
    .filter((move) => !needle || `${move.code} ${names.get(move.code) ?? ''} ${move.ref} ${move.note}`.toLowerCase().includes(needle))
  return (
    <section className="rounded-2xl border border-line bg-card p-4" aria-labelledby="moves-heading">
      <h2 id="moves-heading" className="font-display text-lg">
        Movements
      </h2>
      <p className="text-sm text-ink-soft">Every change to on hand, newest first. Nothing here can be edited — a mistake is fixed with another adjustment.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Input className="min-w-0 flex-1 basis-56" placeholder="Item, PO, order…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Kind" className="h-10 rounded-lg border border-line bg-card px-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as MoveKind | 'all')}>
          <option value="all">All kinds</option>
          {(Object.keys(KIND) as MoveKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND[k].label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-left text-xs text-ink-soft">
            <tr className="border-b border-line">
              <th className="py-1.5 font-normal">When</th>
              <th className="font-normal">Item</th>
              <th className="font-normal">Kind</th>
              <th className="font-normal">Ref</th>
              <th className="text-right font-normal">Qty</th>
              <th className="text-right font-normal">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.slice(0, limit).map((move) => (
              <tr key={move.id}>
                <td className="py-1.5 pr-2 whitespace-nowrap text-ink-soft">{whenLabel(move.at)}</td>
                <td className="max-w-64 pr-2">
                  <span className="block truncate">{names.get(move.code) ?? move.code}</span>
                  <span className="block truncate text-xs text-ink-soft">{move.note || move.code}</span>
                </td>
                <td className={cn('pr-2 font-medium', KIND[move.kind].tone)}>{KIND[move.kind].label}</td>
                <td className="pr-2 text-ink-soft">{move.ref}</td>
                <td className="text-right tabular-nums">
                  {move.qty > 0 ? '+' : ''}
                  {qty(move.qty)}
                </td>
                <td className="text-right tabular-nums">{qty(move.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit ? (
        <Button type="button" variant="ghost" className="mt-2" onClick={() => setLimit(limit + 100)}>
          Show more ({rows.length - limit} older)
        </Button>
      ) : null}
    </section>
  )
}
