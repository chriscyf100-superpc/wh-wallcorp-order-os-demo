import type { InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils.ts'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink outline-none placeholder:text-ink-soft/80 focus-visible:border-brick focus-visible:ring-2 focus-visible:ring-brick/30',
        className,
      )}
      {...props}
    />
  )
}
