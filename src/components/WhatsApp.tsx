import { FileText, Mic } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SAMPLES } from '../lib/samples.ts'
import { useDesk } from '../lib/useDesk.ts'
import type { Source, WaMessage } from '../lib/types.ts'
import { whenLabel } from '../lib/format.ts'
import { STAGE_LABEL } from '../lib/labels.ts'
import { rm } from '../lib/format.ts'
import { orderTotal } from '../lib/pricing.ts'
import { DemoBadge } from './bits.tsx'

export function WhatsApp({ compact = false }: { compact?: boolean }) {
  const { messages: allMessages, sendOrder, orders, clients, salespeople } = useDesk()
  const [person, setPerson] = useState(() => {
    try {
      return sessionStorage.getItem('wa-person') ?? 'Boon'
    } catch {
      return 'Boon'
    }
  })
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [showOrders, setShowOrders] = useState(false)
  const draft = drafts[person] ?? ''
  const setDraft = (text: string) => setDrafts((now) => ({ ...now, [person]: text }))
  const owner = (m: WaMessage) => m.salesperson ?? orders.find((o) => o.id === m.orderId)?.salesperson ?? 'Boon'
  const isBroadcast = (m: WaMessage) => m.broadcast || m.text.startsWith('PRICE UPDATE')
  const messages = allMessages.filter((m) => isBroadcast(m) || owner(m) === person)
  const ownOrders = orders.filter((o) => o.salesperson === person).toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
  const selectPerson = (name: string) => {
    setPerson(name)
    try {
      sessionStorage.setItem('wa-person', name)
    } catch {
      /* optional preference */
    }
    setShowOrders(false)
  }
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, person])

  function submit(event?: FormEvent) {
    event?.preventDefault()
    const text = draft.trim()
    if (!text) return
    sendOrder(text, 'text', person)
    setDraft('')
  }

  return (
    <div className={compact ? 'h-full' : 'grid h-full min-h-0 grid-cols-1 md:grid-cols-[240px_1fr]'}>
      {!compact && (
        <aside className="hidden min-h-0 overflow-y-auto border-r border-line bg-card p-3 md:block">
          <h2 className="font-semibold">Sales inbox</h2>
          <input
            className="my-3 h-10 w-full rounded-lg border border-line px-3 text-sm"
            aria-label="Find salesperson conversation"
            placeholder="Find salesperson"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex gap-2 overflow-x-auto md:block">
            {salespeople
              .filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(query.toLowerCase()))
              .map((p) => {
                const latest = allMessages.filter((m) => isBroadcast(m) || owner(m) === p.name).at(-1)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={person === p.name}
                    onClick={() => selectPerson(p.name)}
                    className={`mb-2 min-w-36 rounded-xl p-3 text-left md:w-full ${person === p.name ? 'bg-brick text-white' : 'bg-paper hover:bg-sand'}`}
                  >
                    <span className="block text-sm font-semibold">
                      {p.name} · {p.code}
                    </span>
                    <span className="mt-1 block max-w-44 truncate text-xs opacity-75">{latest?.text ?? 'Start a conversation'}</span>
                    <span className="mt-1 block text-xs">
                      {orders.filter((o) => o.salesperson === p.name && o.stage !== 'delivered' && o.stage !== 'cancelled').length} active
                      requests
                    </span>
                  </button>
                )
              })}
          </div>
        </aside>
      )}
      <section className="flex h-full min-h-0 min-w-0 flex-col bg-[#efe7de]" aria-label="Simulated WhatsApp">
        <header className="bg-palm px-4 py-3 text-paper">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-paper/80">SIMULATED WHATSAPP</p>
            <DemoBadge className="border-paper/30 bg-paper/10 text-paper" />
          </div>
          <p className="mt-1 font-medium">{person} · to the Shah Alam desk</p>
          <p className="text-xs text-paper/75">1. Paste the note. 2. Open Confirm. 3. Check the tier, then confirm.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {
              <select
                aria-label="Salesperson conversation"
                className={`h-10 rounded bg-white px-2 text-sm text-ink ${compact ? '' : 'md:hidden'}`}
                value={person}
                onChange={(e) => selectPerson(e.target.value)}
              >
                {salespeople.map((p) => (
                  <option key={p.id}>{p.name}</option>
                ))}
              </select>
            }
            <button className="min-h-10 rounded-lg bg-white/15 px-3 text-xs" onClick={() => sendOrder('My orders', 'text', person)}>
              My orders
            </button>
            <button className="min-h-10 rounded-lg bg-white/15 px-3 text-xs" onClick={() => setShowOrders(!showOrders)}>
              {showOrders ? 'Show conversation' : 'Order list'}
            </button>
            {compact && (
              <a className="flex min-h-10 items-center text-xs underline" href="#whatsapp">
                Open inbox
              </a>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {showOrders ? (
            <div className="space-y-2">
              {!ownOrders.length && <p className="p-4 text-sm">No orders for {person} yet.</p>}
              {ownOrders.map((o) => (
                <a
                  key={o.id}
                  href={o.stage === 'needs_approval' ? '#hold' : o.stage === 'new' ? '#confirm' : '#board'}
                  className="block rounded-xl bg-white p-3 text-sm"
                >
                  <strong>
                    {o.id} · {clients.find((c) => c.id === o.clientId)?.company ?? 'Unmatched'}
                  </strong>
                  <p>
                    {rm(orderTotal(o.lines))} · {o.hold?.status === 'rejected' ? 'Pending payment' : STAGE_LABEL[o.stage]}
                  </p>
                  {o.hold?.status === 'rejected' && (
                    <p className="text-amber">Boss: {o.hold.rejectReason}. Chase payment; HQ can resume this same request.</p>
                  )}
                </a>
              ))}
            </div>
          ) : (
            messages.map((message) => <Bubble key={message.id} message={{ ...message, salesperson: owner(message) }} />)
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-black/5 bg-[#efe7de]">
          <p className="px-3 pt-3 text-[11px] leading-4 text-ink-soft">
            Tap a sample note. Credit problems wait for HQ. 没货 still sends. A “received cheque RM …” note goes to Payments in; “harga …
            berapa” gets the latest price.
          </p>
          <div className="flex gap-2 overflow-x-auto px-3 pt-2">
            {SAMPLES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                title={sample.hint}
                className={
                  sample.id === 'hardware'
                    ? 'shrink-0 rounded-full border border-brick bg-white px-3.5 py-2.5 text-xs font-medium text-brick'
                    : sample.id === 'stock'
                      ? 'shrink-0 rounded-full border border-rose bg-white px-3.5 py-2.5 text-xs font-medium text-rose'
                      : sample.id === 'payment' || sample.id === 'price'
                        ? 'shrink-0 rounded-full border border-ok bg-white px-3.5 py-2.5 text-xs font-medium text-ok'
                        : sample.id === 'utara'
                          ? 'shrink-0 rounded-full border border-palm bg-white px-3.5 py-2.5 text-xs font-medium text-palm'
                          : 'shrink-0 rounded-full border border-black/10 bg-white px-3.5 py-2.5 text-xs text-ink'
                }
                onClick={() => sendOrder(sample.text, sample.source, person)}
              >
                {sample.label}
              </button>
            ))}
          </div>
          <form className="flex items-end gap-2 p-3" onSubmit={submit}>
            <label className="sr-only" htmlFor="wa-draft">
              Order message
            </label>
            <textarea
              id="wa-draft"
              rows={2}
              value={draft}
              placeholder="Paste an order… 红砖 20扎"
              className="min-h-11 min-w-0 flex-1 resize-none rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus-visible:border-palm focus-visible:ring-2 focus-visible:ring-palm/30"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
            />
            <button
              type="submit"
              className="h-11 rounded-full bg-palm px-4 text-sm font-medium text-white disabled:opacity-50"
              disabled={draft.trim().length === 0}
            >
              Send
            </button>
          </form>
        </div>
      </section>
    </div>
  )
}

function Bubble({ message }: { message: WaMessage }) {
  const mine = message.from === 'sales'
  return (
    <div className={mine ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          mine
            ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-[#d8f5cc] px-3 py-2 text-sm text-ink shadow-sm'
            : 'max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-sm text-ink shadow-sm'
        }
      >
        <p className="text-[11px] font-semibold tracking-wide text-ink-soft">{mine ? (message.salesperson ?? 'Sales') : 'Desk'}</p>
        {message.source !== 'text' ? <Attachment source={message.source} /> : null}
        <p className="mt-1 whitespace-pre-wrap break-words leading-5">{message.text}</p>
        <p className="mt-1 text-right text-[11px] text-ink-soft">{whenLabel(message.at)}</p>
      </div>
    </div>
  )
}

function Attachment({ source }: { source: Source }) {
  if (source === 'photo') {
    return (
      <div className="mt-1 overflow-hidden rounded-lg bg-[#d7cbb8]">
        <div className="flex h-24 items-end gap-1 px-3 pb-3">
          <span className="h-8 w-6 rounded-sm bg-brick/80" />
          <span className="h-12 w-6 rounded-sm bg-brick" />
          <span className="h-6 w-6 rounded-sm bg-brick/70" />
          <span className="ml-2 text-xs font-medium text-ink/80">Photo from site</span>
        </div>
      </div>
    )
  }
  if (source === 'pdf') {
    return (
      <div className="mt-1 flex items-center gap-2 rounded-lg bg-paper px-2 py-2 text-xs">
        <FileText className="h-4 w-4 text-brick" />
        <span>PO-8841.pdf · demo extract</span>
      </div>
    )
  }
  return (
    <div className="mt-1 flex items-center gap-2 rounded-lg bg-paper px-2 py-2 text-xs">
      <Mic className="h-4 w-4 text-palm" />
      <span className="flex-1">Voice note 0:38 · transcript below</span>
      <span className="h-1 flex-1 rounded-full bg-palm/30" />
    </div>
  )
}
