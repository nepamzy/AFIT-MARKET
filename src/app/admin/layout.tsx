import type { ReactNode } from 'react'
import { CofounderAlertPopup } from '@/components/domain/cofounder-alert-popup'
import { AppShell } from '@/components/shells/app-shell'
import { ADMIN_NAV } from '@/components/shells/nav-config'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { enforceRoutePolicy } from '@/server/modules/identity-and-access/guard'

export default async function Layout({ children }: { children: ReactNode }) {
  await enforceRoutePolicy('/admin')
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  return (
    <AppShell
      area="Administration"
      signedInAs={data.user?.email}
      items={ADMIN_NAV}
      moreHref="/admin/menu"
      theme="navy"
    >
      <CofounderAlertPopup />
      {children}
    </AppShell>
  )
}
