import { redirect } from 'next/navigation'

/** The plain-language summary is replaced by the full privacy policy. */
export default function Privacy() {
  redirect('/legal/privacy')
}
