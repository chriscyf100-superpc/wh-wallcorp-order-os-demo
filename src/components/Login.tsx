import { useState, type FormEvent } from 'react'
import { deskPassword, usingDefaultPassword } from '../lib/auth.ts'
import { useDesk } from '../lib/useDesk.ts'
import { DemoBadge, Mark } from './bits.tsx'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'

const POINTS = [
  'Sales paste a WhatsApp note. The lines, the price tier, and the company come up for a person to check.',
  'If the account is overdue or over the limit, the order waits for HQ. The yard does not load it yet.',
  'Prices are volume tiers. Stock is a yard signal — 有货, 少, 没货 — not a piece-count ledger.',
]

export function Login() {
  const { login } = useDesk()
  const preset = usingDefaultPassword()
  const [password, setPassword] = useState(preset ? deskPassword() : '')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const ok = login(password)
    if (!ok) setError("That doesn't match the demo password.")
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-palm px-10 py-12 text-paper lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <Mark className="h-10 w-24 bg-paper" />
            <div>
              <p className="text-sm text-paper/80">W&H Wallcorp Sdn. Bhd. · Malaysia</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="font-display text-xl">Order OS</p>
                <DemoBadge className="border-paper/30 bg-paper/10 text-paper" />
              </div>
            </div>
          </div>
          <h1 className="mt-16 max-w-md font-display text-4xl leading-tight tracking-tight">
            A desk for orders that still arrive as a WhatsApp.
          </h1>
          <ul className="mt-8 max-w-md space-y-4 text-sm leading-6 text-paper/85">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-paper" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="max-w-md text-sm leading-6 text-paper/70">
          A RiseUp preview for the discovery meeting. Not connected to EMAS, WhatsApp Business, or a real stock book.
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 lg:hidden">
            <Mark className="h-9 w-20" />
            <DemoBadge />
          </div>
          <p className="mt-6 text-sm text-ink-soft lg:mt-0">W&H Wallcorp — Order OS (Demo)</p>
          <h2 className="mt-2 font-display text-4xl tracking-tight">Open the desk</h2>
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            Shared password for the meeting. This is a RiseUp preview, not the live system.
          </p>
          <form className="mt-8 space-y-4" autoComplete="off" onSubmit={onSubmit}>
            <div>
              <label htmlFor="desk-password" className="text-sm font-medium">
                Desk password
              </label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="desk-password"
                  name="desk-gate"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className={show ? undefined : 'secret-text'}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    if (error) setError('')
                  }}
                />
                <Button type="button" variant="outline" onClick={() => setShow((value) => !value)}>
                  {show ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-rose">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="lg" className="w-full">
              Open the desk
            </Button>
          </form>
          {preset ? (
            <p className="mt-4 text-sm leading-6 text-ink-soft">
              Demo password, already filled in:{' '}
              <span className="font-medium text-ink">wh demo</span>
            </p>
          ) : (
            <p className="mt-4 text-sm text-ink-soft">This desk is using a password set for the meeting.</p>
          )}
          <p className="mt-8 text-xs leading-5 text-ink-soft lg:hidden">
            RiseUp preview for W&H Wallcorp. Nothing on this screen is live.
          </p>
        </div>
      </section>
    </div>
  )
}
