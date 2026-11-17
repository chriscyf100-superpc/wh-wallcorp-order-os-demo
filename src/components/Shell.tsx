import {
  Banknote,
  Bell,
  BookOpen,
  Building2,
  Calculator,
  ClipboardCheck,
  Columns3,
  Coins,
  ScrollText,
  Search,
  X,
  ShieldAlert,
  LayoutDashboard,
  Lock,
  MessageCircle,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PAGE } from '../lib/labels.ts'
import { useDesk } from '../lib/useDesk.ts'
import { useWaPanel } from '../lib/useWaPanel.ts'
import { useWideDesk } from '../lib/useWideDesk.ts'
import type { View } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'
import { DemoBadge, Mark } from './bits.tsx'
import { AuditLog } from './AuditLog.tsx'
import { Clients } from './Clients.tsx'
import { Commission } from './Commission.tsx'
import { Customers } from './Customers.tsx'
import { Payments } from './Payments.tsx'
import { ConfirmQueue } from './ConfirmQueue.tsx'
import { Dashboard } from './Dashboard.tsx'
import { Hold } from './Hold.tsx'
import { OrderDocument } from './OrderDocument.tsx'
import { Kanban } from './Kanban.tsx'
import { PriceCheck } from './PriceCheck.tsx'
import { PriceDesk } from './PriceDesk.tsx'
import { Prices } from './Prices.tsx'
import { Stock } from './Stock.tsx'
import { Button } from './ui/button.tsx'
import { Modal } from './ui/dialog.tsx'
import { WhatsApp } from './WhatsApp.tsx'

const NAV: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Today', icon: LayoutDashboard },
  { id: 'confirm', label: 'Confirm', icon: ClipboardCheck },
  { id: 'board', label: 'Board', icon: Columns3 },
  { id: 'hold', label: 'HQ Hold', icon: ShieldAlert },
  { id: 'audit', label: 'Audit log', icon: ScrollText },
  { id: 'pricedesk', label: 'Price Desk', icon: Calculator },
  { id: 'pricecheck', label: 'Price check', icon: Search },
  { id: 'commission', label: 'Commission', icon: Coins },
  { id: 'stock', label: 'Stock', icon: Warehouse },
  { id: 'payments', label: 'Payments in', icon: Banknote },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'clients', label: 'Credit', icon: Building2 },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
]

const STEPS = [
  {
    title: 'Send a credit problem from the phone',
    body: 'On the sales phone, tap “2 · Buildmate credit”. Buildmate Supplies is RM 400 under a RM 20,000 limit. The note is the usual mix of Chinese, Malay, and English.',
  },
  {
    title: 'Check it beside the original',
    body: 'Open Confirm. The WhatsApp text sits next to the lines. On the Apex order already waiting, change red brick from 18 to 20 — it moves from Price B to Price C. A low or out item shows 少 or 没货 on the line.',
  },
  {
    title: 'Confirm, and watch it stop',
    body: 'Press “Confirm — hold for HQ” on the Buildmate note. It does not go to the yard. Outstanding plus this order passes the limit, so it lands in HQ Hold.',
  },
  {
    title: 'Clear the hold: HQ first, boss for the rest',
    body: 'Open HQ Hold. Rows inside the HQ caps get HQ Approve — that writes the audit log and CCs the boss (demo). Tick the rows outside the caps and Escalate: the boss phone opens. Approve raises the SO and locks prices; Reject notifies the salesperson and HQ cannot re-approve without a new reason. Then Start preparing on the board.',
  },
  {
    title: 'Prices, stock, then the book',
    body: 'Open Prices. Red clay brick: under 15 is Price A, 15–19 is Price B, 20 and up is Price C. Open Stock for 有货 / 少 / 没货. Y12 rebar is 没货. Clients: Buildmate is close to the limit, WallPro is 30 days, Metro Crest is 60, Mega is 90.',
  },
]

export function Shell({ view, go }: { view: View; go: (view: View) => void }) {
  const desk = useDesk()
  const wide = useWideDesk()
  const [waShown, toggleWa] = useWaPanel()
  const showWa = wide && waShown && view !== 'whatsapp'
  const [scriptOpen, setScriptOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const page = PAGE[view]
  const [deskKey, setDeskKey] = useState(0)
  const unread = desk.notices.filter((notice) => !notice.read)
  const openChange = (refId: string) => {
    try {
      sessionStorage.setItem('pricedesk-tab', 'log')
      sessionStorage.setItem('pricelog-focus', refId)
    } catch {
      // fine without it
    }
    desk.readNotices()
    setDeskKey((k) => k + 1)
    go('pricedesk')
  }
  const waiting = desk.orders.filter((order) => order.stage === 'new').length
  const holding = desk.orders.filter((order) => order.stage === 'needs_approval').length

  return (
    <div className="min-h-screen bg-paper pt-1 text-ink">
      <a
        href="#desk-main"
        className="no-print sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to the desk
      </a>
      <div
        className={cn(
          'shell-grid min-[1180px]:grid',
          waShown
            ? 'min-[1180px]:grid-cols-[220px_minmax(0,1fr)_minmax(320px,380px)]'
            : 'min-[1180px]:grid-cols-[220px_minmax(0,1fr)]',
        )}
      >
        <aside className="no-print sticky top-1 hidden h-[calc(100dvh-4px)] flex-col bg-nav px-3 py-4 text-white min-[1180px]:flex">
          <div className="px-2">
            <div className="flex items-center gap-2">
              <Mark />
              <div>
                <p className="text-sm leading-tight font-semibold">W&H Wallcorp</p>
                <p className="text-xs text-white/60">Order OS · Malaysia demo</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <DemoBadge className="border-white/25 bg-white/10 text-white" />
              <p className="text-xs text-white/60">RiseUp preview</p>
            </div>
          </div>
          <nav className="mt-6 flex flex-col gap-0.5" aria-label="Desk">
            {NAV.filter((item) => item.id !== 'whatsapp').map((item) => (
              <NavLink key={item.id} item={item} view={view} count={item.id === 'confirm' ? waiting : item.id === 'hold' ? holding : 0} />
            ))}
          </nav>
          <div className="mt-auto space-y-2 px-2 pt-4">
            <p className="text-xs leading-5 text-white/55">Nothing here is live. Reset puts the meeting data back.</p>
            <button type="button" onClick={desk.logout} className="-mx-2 rounded-lg px-2 py-2 text-xs font-medium text-white/70 hover:bg-nav-hover hover:text-white">
              Lock the desk
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="no-print sticky top-1 z-20 border-b border-line bg-card/95 backdrop-blur min-[1180px]:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2">
                <Mark className="h-8 w-16" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-lg leading-none">W&H Wallcorp</p>
                    <DemoBadge />
                  </div>
                  <p className="text-xs text-ink-soft">Order OS · RiseUp preview</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <NoticeBell onOpen={openChange} compact />
                <IconButton label="Meeting script" onClick={() => setScriptOpen(true)}>
                  <BookOpen className="h-4 w-4" />
                </IconButton>
                <IconButton label="Reset demo data" onClick={() => setResetOpen(true)}>
                  <RotateCcw className="h-4 w-4" />
                </IconButton>
                <IconButton label="Lock the desk" onClick={desk.logout}>
                  <Lock className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Desk">
              {NAV.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  aria-current={view === item.id ? 'page' : undefined}
                  className={cn(
                    'shrink-0 rounded-full px-3.5 py-2.5 text-sm',
                    view === item.id ? 'bg-nav text-white' : 'border border-line bg-card text-ink-soft hover:text-ink',
                  )}
                >
                  {item.label}
                  {item.id === 'confirm' && waiting > 0 ? ` ${waiting}` : ''}
                  {item.id === 'hold' && holding > 0 ? ` ${holding}` : ''}
                </a>
              ))}
            </nav>
          </header>

          <main id="desk-main" className="px-4 py-5 pb-24 sm:px-6">
            <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-lg text-ink">{page.title}</h1>
                  <DemoBadge />
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">{page.lede}</p>
              </div>
              <div className="hidden gap-2 min-[1180px]:flex">
                <NoticeBell onOpen={openChange} />
                <Button variant="outline" onClick={() => setScriptOpen(true)}>
                  <BookOpen className="h-4 w-4" />
                  Meeting script
                </Button>
                <Button variant="outline" onClick={() => setResetOpen(true)}>
                  <RotateCcw className="h-4 w-4" />
                  Reset demo
                </Button>
                <Button variant="outline" onClick={toggleWa} aria-pressed={waShown}>
                  {waShown ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                  {waShown ? 'Hide WhatsApp' : 'Show WhatsApp'}
                </Button>
              </div>
            </div>

            {unread[0] && !(view === 'pricedesk') ? (
              <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber/40 bg-amber-soft px-3 py-2 text-sm" role="status">
                <p className="min-w-0">
                  <span className="font-semibold">{unread[0].title}.</span> {unread[0].body}
                  {unread.length > 1 ? <span className="text-ink-soft"> (+{unread.length - 1} more)</span> : null}
                </p>
                <span className="flex shrink-0 gap-1">
                  <Button size="sm" onClick={() => openChange(unread[0]?.refId ?? '')}>
                    See what changed
                  </Button>
                  <button type="button" aria-label="Mark as read" onClick={desk.readNotices} className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-white/60">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              </div>
            ) : null}
            {view === 'dashboard' ? <Dashboard onOpen={go} /> : null}
            {view === 'confirm' ? <ConfirmQueue /> : null}
            {view === 'board' ? (
              <Kanban
                onReview={(id) => {
                  desk.highlightOrder(id)
                  go('confirm')
                }}
              />
            ) : null}
            {view === 'document' ? <OrderDocument onBack={() => go('board')} /> : null}
            {view === 'hold' ? <Hold /> : null}
            {view === 'audit' ? <AuditLog /> : null}
            {view === 'pricedesk' ? <PriceDesk key={deskKey} /> : null}
            {view === 'pricecheck' ? <PriceCheck /> : null}
            {view === 'commission' ? <Commission /> : null}
            {view === 'prices' ? <Prices /> : null}
            {view === 'stock' ? <Stock /> : null}
            {view === 'clients' ? <Clients /> : null}
            {view === 'payments' ? <Payments /> : null}
            {view === 'customers' ? <Customers /> : null}
            {view === 'whatsapp' ? (
              <div className="h-[calc(100dvh-9.5rem)] overflow-hidden rounded-2xl border border-line">
                <WhatsApp />
              </div>
            ) : null}
          </main>
        </div>

        {showWa ? (
          <aside className="no-print sticky top-1 h-[calc(100dvh-4px)] border-l border-line">
            <WhatsApp compact />
          </aside>
        ) : null}
      </div>

      <div role="status" aria-live="polite" className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        {desk.toast ? (
          <div className="pointer-events-auto w-[min(100%,28rem)] rounded-xl bg-ink px-4 py-3 text-sm text-paper shadow-lg">
            {desk.toast.view ? (
              <button type="button" className="w-full text-left" onClick={() => go(desk.toast?.view ?? 'dashboard')}>
                <span>{desk.toast.text}</span>
                <span className="mt-1 block text-xs text-sand underline">Open it</span>
              </button>
            ) : (
              <p>{desk.toast.text}</p>
            )}
          </div>
        ) : null}
      </div>

      <Modal
        open={scriptOpen}
        onOpenChange={setScriptOpen}
        title="Three minutes, in this order"
        description="A RiseUp walkthrough for the W&H Wallcorp desk. Stay on the story. Don't open settings."
      >
        <ol className="space-y-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brick text-sm font-semibold text-white">
                {index + 1}
              </span>
              <div>
                <p className="font-medium">{step.title}</p>
                <p className="mt-1 text-sm leading-6 text-ink-soft">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <Button className="mt-5" onClick={() => setScriptOpen(false)}>
          Close
        </Button>
      </Modal>

      <Modal
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Put the meeting data back?"
        description="Orders, prices, yard signals, and the chat return to the original set. This browser only."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setResetOpen(false)}>
            Keep working
          </Button>
          <Button
            onClick={() => {
              desk.resetDemo()
              setResetOpen(false)
            }}
          >
            Reset demo data
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function NoticeBell({ onOpen, compact = false }: { onOpen: (refId: string) => void; compact?: boolean }) {
  const desk = useDesk()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const unread = desk.notices.filter((n) => !n.read).length
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false)
    }
    const esc = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        aria-label={unread > 0 ? `Notices, ${unread} unread` : 'Notices'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          'relative grid place-items-center rounded-full border border-line bg-card text-ink hover:bg-sand',
          compact ? 'h-11 w-11' : 'h-10 w-10',
        )}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-brick px-1 text-[11px] font-semibold text-white">{unread}</span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-card p-2 shadow-lg">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="text-sm font-semibold">Notices</p>
            {unread > 0 ? (
              <button type="button" className="text-xs font-medium text-brick" onClick={desk.readNotices}>
                Mark all read
              </button>
            ) : null}
          </div>
          {desk.notices.length === 0 ? (
            <p className="px-2 py-3 text-sm text-ink-soft">Nothing yet. Price changes land here for everyone.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {desk.notices.slice(0, 12).map((notice) => (
                <li key={notice.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      onOpen(notice.refId)
                    }}
                    className="w-full rounded-lg px-2 py-2 text-left hover:bg-sand/60"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {!notice.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-brick" aria-label="unread" /> : null}
                      {notice.title}
                    </span>
                    <span className="block text-xs text-ink-soft">{notice.body}</span>
                    <span className="block text-[11px] text-ink-soft">{new Date(notice.at).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}

function NavLink({
  item,
  view,
  count,
}: {
  item: { id: View; label: string; icon: LucideIcon }
  view: View
  count: number
}) {
  const Icon = item.icon
  const on = view === item.id
  return (
    <a
      href={`#${item.id}`}
      aria-current={on ? 'page' : undefined}
      className={cn(
        'relative flex min-h-10 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
        on ? 'bg-white/12 font-medium text-white before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r before:bg-[#69a5e2]' : 'text-white/75 hover:bg-nav-hover hover:text-white',
      )}
    >
      <Icon className={cn('h-4 w-4', on ? 'text-[#9bc5ef]' : 'text-white/60')} aria-hidden="true" />
      <span className="flex-1">{item.label}</span>
      {count > 0 ? (
        <span className={cn('min-w-5 rounded-full px-1.5 text-center text-xs font-semibold tabular-nums', on ? 'bg-white text-nav' : 'bg-[#d97706] text-white')}>
          {count}
        </span>
      ) : null}
    </a>
  )
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid h-11 w-11 place-items-center rounded-full border border-line bg-card text-ink hover:bg-sand"
    >
      {children}
    </button>
  )
}
