import { redirect } from 'next/navigation'

/** The plain-language summary is replaced by the full terms. */
export default function Terms() {
  redirect('/legal/terms')
}
