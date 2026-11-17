import { rm } from '../lib/format.ts'
import { AGE_COLOR, AGE_ORDER, AGE_SHORT } from '../lib/ageing.ts'
import type { Ageing } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'

/*
 * Small credit / collections figures shared by Credit, HQ Hold and Payments in.
 *
 * Ageing colours: "current" is neutral grey (nothing wrong), then 30 → 60 → 90 days is one warm hue getting darker
 * (ordinal ramp, dataviz validator: monotone lightness, ≥ 0.06 steps, single hue, light end ≥ 2:1 on white).
 * The old green / gold / amber / rose set failed (30 and 60 days were ΔE 5.9 apart). Every use keeps a text label,
 * so colour never carries the bucket alone.
 */
// Credit-limit meter: what is owed in brand blue, uninvoiced open orders a lighter step of the same blue.
const OWED = '#2a6aa6'
const COMMITTED = '#9ec0e0'
const OVER = '#b33a3a'

const short = (value: number): string =>
  Math.abs(value) >= 1_000_000 ? `RM ${(value / 1_000_000).toFixed(2)}m` : Math.abs(value) >= 10_000 ? `RM ${(value / 1000).toFixed(1)}k` : rm(value).replace(/\.00$/, '')

/** One whole (money owed) split into ageing buckets. Thin = no text (figures sit beside it); tall = share printed inside. */
export function AgeingBar({ buckets, tall = false, className }: { buckets: Record<Ageing, number>; tall?: boolean; className?: string }) {
  const total = AGE_ORDER.reduce((sum, key) => sum + Math.max(0, buckets[key]), 0)
  const label = total > 0 ? AGE_ORDER.filter((k) => buckets[k] > 0).map((k) => `${AGE_SHORT[k]} ${short(buckets[k])} (${Math.round((buckets[k] / total) * 100)}%)`).join(', ') : 'Nothing owed'
  if (total <= 0) return <div className={cn(tall ? 'h-7' : 'h-2', 'rounded-full bg-paper-deep', className)} role="img" aria-label={label} />
  return (
    <div className={cn('flex gap-0.5', tall ? 'h-7' : 'h-2', className)} role="img" aria-label={label}>
      {AGE_ORDER.filter((key) => buckets[key] > 0).map((key) => {
        const share = buckets[key] / total
        const text = `${Math.round(share * 100)}%`
        return (
          <span
            key={key}
            title={`${AGE_SHORT[key]}: ${short(buckets[key])} (${text})`}
            className={cn('flex min-w-0 items-center overflow-visible', tall ? 'rounded-[4px] px-2' : 'rounded-full')}
            style={{ width: `${share * 100}%`, background: AGE_COLOR[key] }}
          >
            {/* Print the share only where it fits (≥ 9% of the bar); otherwise hover / the legend carries it. */}
            {tall && share >= 0.09 ? <span className={cn('text-xs font-semibold', key === '90' || key === '60' ? 'text-white' : 'text-ink')}>{text}</span> : null}
          </span>
        )
      })}
    </div>
  )
}

/** Names-only legend in bucket order, with the amount when asked. */
export function AgeingLegend({ buckets, amounts = true, className }: { buckets: Record<Ageing, number>; amounts?: boolean; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft', className)}>
      {AGE_ORDER.filter((key) => !amounts || buckets[key] > 0).map((key) => (
        <li key={key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: AGE_COLOR[key] }} aria-hidden="true" />
          {AGE_SHORT[key]}
          {amounts ? <span className="font-medium text-ink tabular-nums">{short(buckets[key])}</span> : null}
        </li>
      ))}
    </ul>
  )
}

/**
 * Owed (+ uninvoiced open orders) against the credit limit. The limit is a dark tick; anything past it is drawn in red
 * and said in words, so the state never rests on colour alone.
 */
export function LimitMeter({ owed, committed = 0, limit, text = true, className }: { owed: number; committed?: number; limit: number; text?: boolean; className?: string }) {
  const exposure = owed + committed
  const scale = Math.max(limit, exposure, 1) * 1.08
  const at = (value: number) => `${(Math.min(value, scale) / scale) * 100}%`
  const overBy = exposure - limit
  const owedIn = Math.min(owed, limit)
  const committedIn = Math.max(0, Math.min(exposure, limit) - owedIn)
  return (
    <div className={className}>
      <div
        className="relative flex h-2 gap-0.5"
        role="img"
        aria-label={`Owes ${short(owed)}${committed > 0 ? ` plus ${short(committed)} uninvoiced` : ''} of a ${short(limit)} limit${overBy > 0 ? `, over by ${short(overBy)}` : ''}`}
      >
        <span className="absolute inset-0 rounded-full bg-paper-deep" aria-hidden="true" />
        {owedIn > 0 ? <span className="relative rounded-full" style={{ width: at(owedIn), background: OWED }} /> : null}
        {committedIn > 0 ? <span className="relative rounded-full" style={{ width: at(committedIn), background: COMMITTED }} /> : null}
        {overBy > 0 ? <span className="relative rounded-full" style={{ width: at(overBy), background: OVER }} /> : null}
        <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-ink" style={{ left: at(limit) }} aria-hidden="true" />
      </div>
      {text ? <p className="mt-1 text-xs text-ink-soft tabular-nums">
        {overBy > 0 ? (
          <span className="font-medium text-rose">Over by {short(overBy)}</span>
        ) : (
          <span>{short(limit - exposure)} room</span>
        )}{' '}
        · limit {short(limit)}
      </p> : null}
    </div>
  )
}

export function LimitLegend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
      {[
        ['Owed', OWED],
        ['Open orders, not invoiced', COMMITTED],
        ['Past the limit', OVER],
      ].map(([name, color]) => (
        <li key={name} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />
          {name}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span className="h-3 w-0.5 rounded bg-ink" aria-hidden="true" />
        Credit limit
      </li>
    </ul>
  )
}

/** How far over the limit an order goes, against HQ's own cap. Past the cap = must go to the boss. */
export function AuthorityMeter({ overRm, capRm, className }: { overRm: number; capRm: number; className?: string }) {
  const scale = Math.max(capRm * 1.5, overRm * 1.08, 1)
  const at = (value: number) => `${(Math.min(value, scale) / scale) * 100}%`
  const outside = overRm > capRm
  const near = !outside && overRm >= capRm * 0.75
  return (
    <div className={cn('max-w-sm', className)}>
      <div className="relative h-2" role="img" aria-label={`${short(overRm)} over the credit limit; HQ can approve up to ${short(capRm)}`}>
        <span className="absolute inset-0 rounded-full bg-paper-deep" aria-hidden="true" />
        {overRm > 0 ? (
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: at(overRm), background: outside ? OVER : near ? '#c8611f' : OWED }} />
        ) : null}
        <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-ink" style={{ left: at(capRm) }} aria-hidden="true" />
      </div>
      <p className="mt-1 text-xs text-ink-soft tabular-nums">
        {short(overRm)} over limit · HQ cap {short(capRm)}
        {outside ? <span className="font-medium text-rose"> · {short(overRm - capRm)} past the cap</span> : near ? <span className="font-medium text-amber"> · close to the cap</span> : overRm > 0 ? <span> · {short(capRm - overRm)} to spare</span> : null}
      </p>
    </div>
  )
}
