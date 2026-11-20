import 'server-only'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { decryptField } from '@/server/security/field-crypto'

export type CustomerContact = { name: string | null; phone: string | null; clothing: string | null }

/**
 * How the assigned rider can reach the customer on a live delivery: phone number and what the customer is wearing. The database
 * only answers for the rider who holds the delivery, and only while it is live; the phone number is decrypted here.
 */
export async function riderCustomerContact(assignmentId: string): Promise<CustomerContact | null> {
  const sb = await createSupabaseServerClient()
  const { data, error } = await sb.rpc('rider_customer_contact', { p_assignment: assignmentId })
  if (error || !data) return null
  const d = data as {
    phone_cipher: string | null
    name: string | null
    clothing_note: string | null
  }
  let phone: string | null = null
  try {
    phone = d.phone_cipher ? decryptField(d.phone_cipher) : null
  } catch {
    phone = null
  }
  return { name: d.name, phone, clothing: d.clothing_note }
}
