import { useState, type InputHTMLAttributes } from 'react'
import { Input } from './input.tsx'

export function NumberField({
  value,
  onCommit,
  min,
  max,
  className,
  ...props
}: {
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [text, setText] = useState(() => String(value))
  const [prev, setPrev] = useState(value)
  if (value !== prev) {
    setPrev(value)
    setText(String(value))
  }

  return (
    <Input
      {...props}
      className={className}
      inputMode="decimal"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        const next = Number(text)
        if (!Number.isFinite(next)) {
          setText(String(value))
          return
        }
        let clamped = next
        if (min !== undefined) clamped = Math.max(min, clamped)
        if (max !== undefined) clamped = Math.min(max, clamped)
        const rounded = Math.round(clamped * 100) / 100
        onCommit(rounded)
        setText(String(rounded))
      }}
    />
  )
}
