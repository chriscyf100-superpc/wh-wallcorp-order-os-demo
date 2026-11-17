import { rm } from './format.ts'
import type { Client, CreditVerdict } from './types.ts'

export function creditVerdict(client: Client | null, total: number): CreditVerdict {
  if (!client) {
    return {
      flag: true,
      reason: 'No company matched. Attach one before the yard loads.',
      watch: null,
    }
  }

  const reasons: string[] = []
  if (client.ageing === '60' || client.ageing === '90') {
    reasons.push(`${client.company} is ${client.ageing} days overdue.`)
  }
  const next = client.outstanding + total
  if (next > client.creditLimit + 0.001) {
    reasons.push(
      `Outstanding ${rm(client.outstanding)} plus this order ${rm(total)} is ${rm(next)}, over the ${rm(client.creditLimit)} limit.`,
    )
  }
  if (reasons.length > 0) {
    return { flag: true, reason: reasons.join(' '), watch: null }
  }
  if (client.ageing === '30') {
    return {
      flag: false,
      reason: null,
      watch: '30 days on the book, still inside the limit. Confirm if the order looks right.',
    }
  }
  return { flag: false, reason: null, watch: null }
}
