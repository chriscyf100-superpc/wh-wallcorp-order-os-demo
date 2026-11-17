import { useEffect, useId, useRef, useState } from 'react'
import { monthLabel, type MonthPoint } from '../lib/commission.ts'
import { cn } from '../lib/utils.ts'

// Validated pair (dataviz validator, light surface): this year = brand blue, last year = burnt orange.
export const SERIES = { now: '#2a6aa6', last: '#c0661a' } as const

// Draw in real pixels: the SVG's coordinate width follows the box it sits in, so bar widths
// (≤ 24px) and 11px labels stay true at any screen size instead of scaling with the page.
function useBoxWidth(fallback = 600): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)))
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

const M = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export const shortRm = (value: number): string =>
  Math.abs(value) >= 1_000_000
    ? `RM ${(value / 1_000_000).toFixed(2)}m`
    : Math.abs(value) >= 10_000
      ? `RM ${(value / 1000).toFixed(0)}k`
      : `RM ${Math.round(value).toLocaleString('en-MY')}`

const axisRm = (value: number): string =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}m` : value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)

function niceMax(value: number): number {
  if (value <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(value))
  for (const k of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * step >= value) return k * step
  return 10 * step
}

/**
 * Twelve monthly sales bars against the monthly target (solid line), with last year as a line when given.
 * Hover / focus a month for the numbers. The running month is drawn lighter: it is still filling up.
 */
export function MonthBars({
  points,
  lastYear,
  height = 200,
  label,
  className,
}: {
  points: MonthPoint[]
  lastYear?: MonthPoint[]
  height?: number
  label: string
  className?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const titleId = useId()
  const [box, W] = useBoxWidth()
  const H = height
  const pad = { l: 40, r: 8, t: 10, b: 22 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const top = niceMax(Math.max(...points.map((p) => Math.max(p.revenue, p.target)), ...(lastYear ?? []).map((p) => p.revenue)) * 1.05)
  const y = (value: number) => pad.t + innerH - (value / top) * innerH
  const slot = innerW / 12
  const barW = Math.min(24, slot - 8)
  const cx = (i: number) => pad.l + slot * i + slot / 2
  const ticks = [0, top / 2, top]
  const target = points[0]?.target ?? 0
  const lastPts = (lastYear ?? []).map((p, i) => ({ x: cx(i), y: y(p.revenue), p }))
  const active = hover === null ? null : points[hover]
  const activeLast = hover === null ? null : lastYear?.[hover]

  return (
    <figure className={cn('min-w-0', className)}>
      <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.now }} aria-hidden="true" />
          {points[0]?.month.slice(0, 4)} sales
        </span>
        {lastYear ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="18" y2="4" stroke={SERIES.last} strokeWidth="2" />
              <circle cx="9" cy="4" r="3" fill={SERIES.last} stroke="#fff" strokeWidth="1.5" />
            </svg>
            {lastYear[0]?.month.slice(0, 4)} sales
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="18" y2="4" stroke="#1b2430" strokeOpacity="0.7" strokeWidth="1.5" />
          </svg>
          Monthly target
        </span>
      </div>
      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-labelledby={titleId} onMouseLeave={() => setHover(null)}>
          <title id={titleId}>{label}</title>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={pad.l} x2={W - pad.r} y1={y(tick)} y2={y(tick)} stroke="#dce3eb" strokeWidth="1" />
              <text x={pad.l - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-ink-soft" fontSize="11">
                {axisRm(tick)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            if (!p.open || p.revenue <= 0) return null
            const h = Math.max(2, y(0) - y(p.revenue))
            const x = cx(i) - barW / 2
            const r = Math.min(4, barW / 2, h)
            // Rounded data-end only; flat on the baseline.
            const d = `M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barW - r} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + r} V${y(0)} Z`
            return <path key={p.month} d={d} fill={SERIES.now} opacity={p.partial ? 0.45 : hover === null || hover === i ? 1 : 0.55} />
          })}
          {target > 0 ? (
            <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="#1b2430" strokeOpacity="0.7" strokeWidth="1.5" />
          ) : null}
          {lastPts.length > 0 ? (
            <>
              <polyline points={lastPts.map((pt) => `${pt.x},${pt.y}`).join(' ')} fill="none" stroke={SERIES.last} strokeWidth="2" strokeLinejoin="round" />
              {lastPts.map((pt, i) => (
                <circle key={pt.p.month} cx={pt.x} cy={pt.y} r={hover === i ? 5 : 4} fill={SERIES.last} stroke="#fff" strokeWidth="2" />
              ))}
            </>
          ) : null}
          {points.map((p, i) => (
            <text key={p.month} x={cx(i)} y={H - 6} textAnchor="middle" fontSize="11" className={hover === i ? 'fill-ink' : 'fill-ink-soft'}>
              {M[i]}
            </text>
          ))}
          {points.map((p, i) => (
            <rect
              key={`hit-${p.month}`}
              x={pad.l + slot * i}
              y={pad.t}
              width={slot}
              height={innerH + pad.b}
              fill="transparent"
              tabIndex={0}
              aria-label={`${monthLabel(p.month)}: ${p.open ? shortRm(p.revenue) : 'not yet'}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="cursor-default outline-none"
            />
          ))}
        </svg>
        {active ? (
          <div
            className="pointer-events-none absolute top-0 z-10 w-48 rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-md"
            style={{ left: `clamp(0px, calc(${((cx(hover ?? 0) / W) * 100).toFixed(2)}% - 6rem), calc(100% - 12rem))` }}
          >
            <p className="font-medium text-ink">
              {monthLabel(active.month)}
              {active.partial ? ' · month to date' : ''}
            </p>
            {active.open ? (
              <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 tabular-nums">
                <dt className="text-ink-soft">Sales</dt>
                <dd className="text-right text-ink">{shortRm(active.revenue)}</dd>
                <dt className="text-ink-soft">vs target</dt>
                <dd className="text-right text-ink">{(active.attainment * 100).toFixed(0)}%</dd>
                <dt className="text-ink-soft">GP</dt>
                <dd className="text-right text-ink">{shortRm(active.gp)}</dd>
                {activeLast ? (
                  <>
                    <dt className="text-ink-soft">Same month {activeLast.month.slice(0, 4)}</dt>
                    <dd className="text-right text-ink">{shortRm(activeLast.revenue)}</dd>
                  </>
                ) : null}
              </dl>
            ) : (
              <p className="mt-1 text-ink-soft">Not reached yet.</p>
            )}
          </div>
        ) : null}
      </div>
    </figure>
  )
}

/** Horizontal bars, one per person, for a single measure. Text stays in ink; the bar carries the value. */
export function RankBars({
  rows,
  format,
  marker,
}: {
  rows: { key: string; label: string; value: number; sub?: string }[]
  format: (value: number) => string
  marker?: { value: number; label: string }
}) {
  const max = Math.max(...rows.map((row) => row.value), marker?.value ?? 0, 1)
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate">
            <span className="font-medium">{row.label}</span>
            {row.sub ? <span className="block text-xs text-ink-soft">{row.sub}</span> : null}
          </span>
          <span className="relative h-3 rounded-full bg-paper-deep">
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(Math.max(0, row.value) / max) * 100}%`, background: SERIES.now }} />
            {marker ? <span className="absolute -top-1 -bottom-1 w-px bg-ink/50" style={{ left: `${(marker.value / max) * 100}%` }} title={marker.label} /> : null}
          </span>
          <span className="w-20 text-right font-medium tabular-nums">{format(row.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Diverging columns around a zero baseline: one value per month, up = increase, down = decrease.
 * Two opposite hues (validated pair), months with no data leave a gap and say so, zero draws nothing.
 * Only the largest move and the latest month are labelled; hover / focus any month for its value.
 */
export function DivergingMonths({
  points,
  label,
  unit = '%',
  height = 180,
}: {
  points: { key: string; label: string; value: number | null; note?: string }[]
  label: string
  unit?: string
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)
  const titleId = useId()
  const [box, W] = useBoxWidth()
  const H = height
  const pad = { l: 52, r: 8, t: 14, b: 22 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const vals = points.map((p) => p.value ?? 0)
  const span = Math.max(0.5, ...vals.map((v) => Math.abs(v)))
  const top = niceMax(span * 1.15)
  const hasNeg = vals.some((v) => v < 0)
  const lo = hasNeg ? -top : 0
  const y = (v: number) => pad.t + ((top - v) / (top - lo)) * innerH
  const slot = innerW / points.length
  const barW = Math.min(24, slot - 8)
  const cx = (i: number) => pad.l + slot * i + slot / 2
  const fmt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}${unit}`
  const peak = vals.reduce((best, v, i) => (Math.abs(v) > Math.abs(vals[best]) ? i : best), 0)
  const last = points.length - 1
  const ticks = hasNeg ? [-top, 0, top] : [0, top / 2, top]
  const active = hover === null ? null : points[hover]
  return (
    <figure className="min-w-0">
      <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.last }} aria-hidden="true" />
          Prices up
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.now }} aria-hidden="true" />
          Prices down
        </span>
      </div>
      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-labelledby={titleId} onMouseLeave={() => setHover(null)}>
          <title id={titleId}>{label}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? '#9aa6b4' : '#dce3eb'} strokeWidth="1" />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" className="fill-ink-soft">
                {t === 0 ? '0' : `${t > 0 ? '+' : '−'}${Math.abs(t) % 1 === 0 ? Math.abs(t) : Math.abs(t).toFixed(1)}${unit}`}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const v = p.value
            if (v === null) {
              return (
                <text key={p.key} x={cx(i)} y={y(0) - 6} textAnchor="middle" fontSize="10" className="fill-ink-soft">
                  no data
                </text>
              )
            }
            if (Math.abs(v) < 0.005) return null
            const h = Math.max(2, Math.abs(y(v) - y(0)))
            const x = cx(i) - barW / 2
            const r = Math.min(4, barW / 2, h)
            const base = y(0)
            // Rounded data-end, square on the zero line, growing up or down.
            const d =
              v > 0
                ? `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + barW - r} Q${x + barW},${base - h} ${x + barW},${base - h + r} V${base} Z`
                : `M${x},${base} V${base + h - r} Q${x},${base + h} ${x + r},${base + h} H${x + barW - r} Q${x + barW},${base + h} ${x + barW},${base + h - r} V${base} Z`
            const showLabel = i === peak || i === last
            return (
              <g key={p.key}>
                <path d={d} fill={v > 0 ? SERIES.last : SERIES.now} opacity={hover === null || hover === i ? 1 : 0.55} />
                {showLabel ? (
                  <text x={cx(i)} y={v > 0 ? base - h - 5 : base + h + 12} textAnchor="middle" fontSize="11" fontWeight="600" className="fill-ink">
                    {fmt(v)}
                  </text>
                ) : null}
              </g>
            )
          })}
          {points.map((p, i) => (
            <text key={`m-${p.key}`} x={cx(i)} y={H - 6} textAnchor="middle" fontSize="11" className={hover === i ? 'fill-ink' : 'fill-ink-soft'}>
              {p.label}
            </text>
          ))}
          {points.map((p, i) => (
            <rect
              key={`hit-${p.key}`}
              x={pad.l + slot * i}
              y={pad.t}
              width={slot}
              height={innerH + pad.b}
              fill="transparent"
              tabIndex={0}
              aria-label={`${p.label}: ${p.value === null ? 'no comparable prices' : fmt(p.value)}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="cursor-default outline-none"
            />
          ))}
        </svg>
        {active ? (
          <div
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border border-line bg-card px-3 py-2 text-xs shadow-md"
            style={{ left: `clamp(0px, calc(${((cx(hover ?? 0) / W) * 100).toFixed(2)}% - 5.5rem), calc(100% - 11rem))` }}
          >
            <p className="text-sm font-semibold text-ink">{active.value === null ? 'No data' : Math.abs(active.value) < 0.005 ? 'No change' : fmt(active.value)}</p>
            <p className="text-ink-soft">{active.label}</p>
            {active.note ? <p className="text-ink-soft">{active.note}</p> : null}
          </div>
        ) : null}
      </div>
    </figure>
  )
}
