import type { ReactNode } from 'react'
import { AGEING_LABEL, SIGNAL, SOURCE_LABEL, STAGE_COLOR, STAGE_LABEL } from '../lib/labels.ts'
import type { Ageing, HoldStatus, Source, Stage, StockSignal } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'

export function Mark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-9 w-16 items-center justify-center rounded-lg bg-white p-1 shadow-sm', className)} aria-hidden="true">
      <img src="/wh-wallcorp-logo.png" alt="" className="h-full w-full object-contain object-left" />
    </span>
  )
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-brick/30 bg-brick/10 px-2 py-0.5 text-[11px] font-semibold tracking-[0.14em] text-brick',
        className,
      )}
    >
      DEMO
    </span>
  )
}

// Soft fill + dark text of the stage hue (text ≥ 4.5:1); the dot carries the board colour.
const STAGE_CLASS: Record<Stage, string> = {
  new: 'bg-slate-100 text-slate-700',
  needs_approval: 'bg-amber-50 text-amber-800',
  confirmed: 'bg-sky-50 text-[#1d4f80]',
  preparing: 'bg-violet-50 text-violet-800',
  delivered: 'bg-green-50 text-green-800',
  cancelled: 'bg-slate-100 text-slate-500',
}

export function StagePill({ stage }: { stage: Stage }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium', STAGE_CLASS[stage])}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: STAGE_COLOR[stage] }} aria-hidden="true" />
      {STAGE_LABEL[stage]}
    </span>
  )
}

export function SourcePill({ source }: { source: Source }) {
  return (
    <span className="inline-flex rounded-full bg-paper-deep px-2 py-0.5 text-xs font-medium text-ink-soft">
      {SOURCE_LABEL[source]}
    </span>
  )
}

const AGEING_CLASS: Record<Ageing, string> = {
  ok: 'bg-ok-soft text-ok',
  '30': 'bg-sand text-gold',
  '60': 'bg-amber-soft text-amber',
  '90': 'bg-rose-soft text-rose',
}

export function AgeingPill({ ageing }: { ageing: Ageing }) {
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', AGEING_CLASS[ageing])}>
      {AGEING_LABEL[ageing]}
    </span>
  )
}

const SIGNAL_CLASS: Record<StockSignal, string> = {
  enough: 'bg-ok-soft text-ok',
  low: 'bg-amber-soft text-amber',
  out: 'bg-rose-soft text-rose',
}

export function SignalPill({ signal }: { signal: StockSignal }) {
  const meta = SIGNAL[signal]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', SIGNAL_CLASS[signal])}>
      <span>{meta.en}</span>
      <span aria-hidden="true">·</span>
      <span lang="zh">{meta.zh}</span>
    </span>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-sand/70 px-4 py-3 text-sm leading-6 text-ink">{children}</div>
  )
}

const HOLD_CLASS: Record<HoldStatus, string> = {
  hq: 'bg-amber-soft text-amber',
  escalated: 'bg-sand text-brick-deep',
  approved: 'bg-palm-soft text-palm',
  rejected: 'bg-rose-soft text-rose',
}

const HOLD_LABEL: Record<HoldStatus, string> = {
  hq: 'With HQ',
  escalated: 'With boss',
  approved: 'Approved',
  rejected: 'Boss rejected',
}

export function HoldPill({ status }: { status: HoldStatus }) {
  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', HOLD_CLASS[status])}>
      {HOLD_LABEL[status]}
    </span>
  )
}
