import { rm, whenLabel } from '../lib/format.ts'
import type { AuditAction } from '../lib/types.ts'
import { useDesk } from '../lib/useDesk.ts'
import { cn } from '../lib/utils.ts'
import { Note } from './bits.tsx'

const ACTION: Record<AuditAction, { label: string; tone: string }> = {
  hq_approve: { label: 'HQ approved', tone: 'text-palm' },
  escalate: { label: 'Escalated to boss', tone: 'text-brick-deep' },
  re_escalate: { label: 'Re-escalated', tone: 'text-brick-deep' },
  boss_approve: { label: 'Boss approved', tone: 'text-palm' },
  boss_reject: { label: 'Boss rejected', tone: 'text-rose' },
  payment_release: { label: 'Released after payment', tone: 'text-ok' },
}

export function AuditLog() {
  const { auditLog } = useDesk()
  return (
    <div className="space-y-4">
      <Note>
        Append-only. The desk can add entries but never edit or remove them. In this preview the log lives in the
        browser, so Reset demo clears it; the real system would keep it on the server.
      </Note>
      {auditLog.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card px-4 py-6 text-sm text-ink-soft">
          No decisions yet. Approve or escalate a row in HQ Hold.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-card">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-line text-xs text-ink-soft uppercase">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Who</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Over limit</th>
                <th className="px-3 py-2">Overdue</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Email CC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {auditLog.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-ink-soft">{whenLabel(row.at)}</td>
                  <td className="px-3 py-2 font-medium">{row.who}</td>
                  <td className={cn('px-3 py-2 whitespace-nowrap font-medium', ACTION[row.action].tone)}>
                    {ACTION[row.action].label}
                  </td>
                  <td className="px-3 py-2">
                    {row.orderId}
                    <span className="block text-xs text-ink-soft">{row.clientName}</span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{rm(row.amount)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{rm(row.overRm)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{row.agingMonths} mo</td>
                  <td className="px-3 py-2">{row.reason}</td>
                  <td className="px-3 py-2 text-xs text-ink-soft">{row.cc ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
