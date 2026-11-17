import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { rm } from '../lib/format.ts'
import { tabName } from '../lib/tileSheet.ts'
import type { PriceChange } from '../lib/types.ts'
import { useDesk } from '../lib/useDesk.ts'
import { cn } from '../lib/utils.ts'

const KIND: Record<PriceChange['kind'], string> = { sheet: 'Price sheet', card: 'Price card', bulk: 'Several items' }

function when(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at
  return d.toLocaleString('en-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Every published price change, newest first — who, when, from which date, and every selling price that moved.
export function PriceLog({ focusId }: { focusId?: string | null }) {
  const { priceLog } = useDesk()
  const [open, setOpen] = useState<string | null>(() => {
    try {
      const saved = sessionStorage.getItem('pricelog-focus')
      sessionStorage.removeItem('pricelog-focus')
      if (saved) return saved
    } catch {
      // fine without it
    }
    return focusId ?? priceLog[0]?.id ?? null
  })
  const [kind, setKind] = useState<'all' | PriceChange['kind']>('all')
  const rows = priceLog.filter((row) => kind === 'all' || row.kind === kind)

  return (
    <section className="rounded-2xl border border-line bg-card p-3 sm:p-4" aria-labelledby="log-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="log-heading" className="font-display text-lg">
            Price change log
          </h2>
          <p className="text-xs text-ink-soft">
            {priceLog.length} changes kept · the 13 Excel tabs are at the bottom · every publish notifies the desk and the sales WhatsApp group
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="Show">
          {(['all', 'sheet', 'card', 'bulk'] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={kind === key}
              onClick={() => setKind(key)}
              className={cn('min-h-9 rounded-md px-2.5 text-xs font-medium', kind === key ? 'bg-ink text-paper' : 'text-ink-soft hover:bg-sand')}
            >
              {key === 'all' ? 'All' : KIND[key]}
            </button>
          ))}
        </div>
      </div>

      <ol className="mt-3 divide-y divide-line rounded-xl border border-line">
        {rows.map((row) => {
          const expanded = open === row.id
          return (
            <li key={row.id}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : row.id)}
                className={cn('flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left', expanded ? 'bg-palm-soft/60' : 'hover:bg-sand/50')}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{row.title}</span>
                  <span className="block text-xs text-ink-soft">
                    {KIND[row.kind]} · effective <span className="tabular-nums">{tabName(row.effectiveFrom)}</span> · {row.by} · published {when(row.at)}
                  </span>
                  <span className="mt-0.5 block text-sm">{row.summary}</span>
                </span>
                <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-ink-soft transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
              </button>
              {expanded ? (
                <div className="overflow-x-auto px-3 pb-3">
                  {row.lines.length === 0 ? (
                    <p className="text-sm text-ink-soft">No selling price moved (cost or layout only).</p>
                  ) : (
                    <table className="w-full min-w-[28rem] text-sm">
                      <thead className="text-left text-[11px] text-ink-soft uppercase">
                        <tr>
                          <th className="py-1 pr-2 font-medium">Price</th>
                          <th className="pr-2 text-right font-medium">Was</th>
                          <th className="pr-2 text-right font-medium">Now</th>
                          <th className="pr-2 text-right font-medium">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.lines.map((line, i) => {
                          const delta = line.before === null ? null : line.after - line.before
                          return (
                            <tr key={`${line.label}-${i}`} className="border-t border-line">
                              <td className="py-1 pr-2">{line.label}</td>
                              <td className="pr-2 text-right text-ink-soft tabular-nums">{line.before === null ? 'new' : line.before.toFixed(2)}</td>
                              <td className="pr-2 text-right font-medium tabular-nums">{line.after.toFixed(2)}</td>
                              <td className={cn('pr-2 text-right tabular-nums', delta !== null && delta > 0 ? 'text-amber' : delta !== null && delta < 0 ? 'text-ok' : 'text-ink-soft')}>
                                {delta === null ? '—' : `${delta >= 0 ? '+' : '−'}${rm(Math.abs(delta))}`}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                  {row.more > 0 ? <p className="mt-1 text-xs text-ink-soft">+{row.more} more prices not kept in this browser.</p> : null}
                </div>
              ) : null}
            </li>
          )
        })}
        {rows.length === 0 ? <li className="px-3 py-4 text-sm text-ink-soft">No changes of this kind yet.</li> : null}
      </ol>
    </section>
  )
}
