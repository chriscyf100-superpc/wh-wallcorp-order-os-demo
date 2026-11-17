import { Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { GROUPS } from '../lib/catalog.ts'
import { rm, qty, whenLabel } from '../lib/format.ts'
import { isStale, type StockRow } from '../lib/inventory.ts'
import type { StockCount as Count } from '../lib/types.ts'
import { useDesk } from '../lib/useDesk.ts'
import { cn } from '../lib/utils.ts'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'

type Scope = 'due' | 'flagged' | 'all' | string

// Cycle counts: pick what to count, the yard fills in what is on the ground, the desk sees the difference
// in units and ringgit, then posts it. Stock that moved while counting is carried over, not lost.
export function StockCount({ rows }: { rows: StockRow[] }) {
  const { stockCounts, beginCount } = useDesk()
  const [scope, setScope] = useState<Scope>('due')
  const [openId, setOpenId] = useState<string | null>(() => stockCounts.find((c) => !c.postedAt)?.id ?? null)
  const groupsHere = GROUPS.filter((g) => rows.some((row) => row.product?.group === g.name))
  const inScope = (row: StockRow) =>
    scope === 'all' ? true : scope === 'due' ? isStale(row.item.lastCountAt) || Boolean(row.item.checkFlag) : scope === 'flagged' ? Boolean(row.item.checkFlag) || row.signal !== 'enough' : row.product?.group === scope
  const picked = rows.filter(inScope)
  const active = stockCounts.find((count) => count.id === openId) ?? null

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-card p-4" aria-labelledby="count-start">
        <h2 id="count-start" className="font-display text-lg">
          Start a count
        </h2>
        <p className="text-sm text-ink-soft">Count a slice each week rather than the whole yard at month-end. The system number is frozen when the count starts.</p>
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="What to count">
          {[
            { id: 'due', label: 'Count due + yard flagged' },
            { id: 'flagged', label: 'Low, out or flagged' },
            { id: 'all', label: 'Whole yard' },
            ...groupsHere.map((g) => ({ id: g.name, label: g.name })),
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={scope === opt.id}
              onClick={() => setScope(opt.id)}
              className={cn('min-h-9 rounded-full border px-3 text-xs font-medium', scope === opt.id ? 'border-ink bg-ink text-paper' : 'border-line bg-card text-ink-soft hover:bg-sand')}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={picked.length === 0}
            onClick={() => {
              const label = scope === 'due' ? 'Count due' : scope === 'flagged' ? 'Low/out check' : scope === 'all' ? 'Full yard count' : scope
              const day = new Date().toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
              setOpenId(beginCount(picked.map((row) => row.item.code), `${label} ${day}`))
            }}
          >
            Start counting {picked.length} item{picked.length === 1 ? '' : 's'}
          </Button>
          <span className="text-xs text-ink-soft">{picked.length === 0 ? 'Nothing in this slice.' : picked.slice(0, 3).map((r) => r.product?.name ?? r.item.code).join(', ') + (picked.length > 3 ? ` +${picked.length - 3} more` : '')}</span>
        </div>
      </section>

      {active ? <CountSheet count={active} rows={rows} onClose={() => setOpenId(null)} /> : null}

      <section className="rounded-2xl border border-line bg-card p-4" aria-labelledby="count-history">
        <h2 id="count-history" className="font-display text-lg">
          Counts
        </h2>
        {stockCounts.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">No counts yet in this demo. The opening balances come from the 31 Oct month-end count.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {stockCounts.map((count) => {
              const filled = count.lines.filter((line) => line.counted !== null).length
              return (
                <li key={count.id}>
                  <button type="button" onClick={() => setOpenId(count.id)} className="flex min-h-11 w-full items-center justify-between gap-2 py-1.5 text-left hover:bg-sand/40">
                    <span>
                      <span className="font-medium">{count.name}</span>
                      <span className="block text-xs text-ink-soft">
                        {count.postedAt ? `Posted ${whenLabel(count.postedAt)}` : `Started ${whenLabel(count.startedAt)} · ${filled}/${count.lines.length} counted`}
                      </span>
                    </span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', count.postedAt ? 'bg-ok-soft text-ok' : 'bg-amber/15 text-amber')}>{count.postedAt ? 'Posted' : 'Open'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function CountSheet({ count, rows, onClose }: { count: Count; rows: StockRow[]; onClose: () => void }) {
  const { setCountLine, finishCount, discardCount, products } = useDesk()
  const byCode = useMemo(() => new Map(rows.map((row) => [row.item.code, row])), [rows])
  const names = useMemo(() => new Map(products.map((p) => [p.code, p])), [products])
  const posted = Boolean(count.postedAt)
  const filled = count.lines.filter((line) => line.counted !== null)
  const diffs = filled.filter((line) => line.counted !== line.system)
  const money = diffs.reduce((sum, line) => sum + ((line.counted ?? 0) - line.system) * (byCode.get(line.code)?.item.avgCost ?? 0), 0)

  return (
    <section className="rounded-2xl border border-brick/25 bg-card p-4 print:border-0" aria-labelledby="count-sheet">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="count-sheet" className="font-display text-lg">
          {count.name}
        </h2>
        <div className="flex gap-2 print:hidden">
          <Button type="button" variant="ghost" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden="true" /> Print sheet
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
      <p className="text-sm text-ink-soft">
        {posted ? `Posted ${whenLabel(count.postedAt ?? '')}.` : 'Type what is on the ground. Leave a line blank to skip it. Only what you fill in is posted.'}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-left text-xs text-ink-soft">
            <tr className="border-b border-line">
              <th className="py-1.5 font-normal">Item · bin</th>
              <th className="text-right font-normal">System</th>
              <th className="text-right font-normal">Counted</th>
              <th className="text-right font-normal">Diff</th>
              <th className="text-right font-normal">RM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {count.lines.map((line) => {
              const row = byCode.get(line.code)
              const p = names.get(line.code)
              const diff = line.counted === null ? null : line.counted - line.system
              return (
                <tr key={line.code}>
                  <td className="max-w-72 py-1.5 pr-2">
                    <span className="block truncate font-medium">{p?.name ?? line.code}</span>
                    <span className="block text-xs text-ink-soft">
                      {line.code} · {row?.item.bin || 'no bin'}
                    </span>
                  </td>
                  <td className="text-right text-ink-soft tabular-nums">{qty(line.system)}</td>
                  <td className="py-1 text-right">
                    {posted ? (
                      <span className="tabular-nums">{line.counted === null ? '—' : qty(line.counted)}</span>
                    ) : (
                      <Input
                        aria-label={`Counted ${p?.name ?? line.code}`}
                        className="ml-auto h-9 w-24 text-right tabular-nums"
                        inputMode="decimal"
                        value={line.counted ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^\d.]/g, '')
                          setCountLine(count.id, line.code, raw === '' ? null : Number(raw))
                        }}
                      />
                    )}
                  </td>
                  <td className={cn('text-right tabular-nums', diff !== null && diff < 0 && 'text-rose', diff !== null && diff > 0 && 'text-ok')}>{diff === null ? '' : diff === 0 ? '✓' : `${diff > 0 ? '+' : ''}${qty(diff)}`}</td>
                  <td className="text-right text-xs text-ink-soft tabular-nums">{diff ? signedRm(diff * (row?.item.avgCost ?? 0)) : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 print:hidden">
        <p className="text-sm text-ink-soft">
          {filled.length}/{count.lines.length} counted · {diffs.length} different ·{' '}
          <span className={cn('font-medium tabular-nums', money < 0 ? 'text-rose' : 'text-ink')}>{signedRm(money)}</span> at average cost
        </p>
        {!posted ? (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => { discardCount(count.id); onClose() }}>
              Discard
            </Button>
            <Button type="button" disabled={filled.length === 0} onClick={() => finishCount(count.id)}>
              Post {filled.length} line{filled.length === 1 ? '' : 's'}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function signedRm(value: number): string {
  if (Math.abs(value) < 0.005) return rm(0)
  return `${value < 0 ? '−' : '+'}${rm(Math.abs(value))}`
}
