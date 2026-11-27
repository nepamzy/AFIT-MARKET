import type { ReactNode } from 'react'
import { AppShell } from '@/components/shells/app-shell'
import { COFOUNDER_NAV } from '@/components/shells/nav-config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { enforceRoutePolicy } from '@/server/modules/identity-and-access/guard'

export default async function Layout({ children }: { children: ReactNode }) {
  await enforceRoutePolicy('/cofounder')
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  return (
    <AppShell area="Co-founder" signedInAs={data.user?.email} items={COFOUNDER_NAV} theme="navy">
      {children}
    </AppShell>
  )
}
