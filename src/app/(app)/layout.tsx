import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppProvider } from '@/lib/context/AppContext'
import Navigation from '@/components/Navigation'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <AppProvider>
      <div className="min-h-screen bg-slate-950 flex flex-col">
        <Navigation />
        <main className="flex-1 container mx-auto px-4 py-6 max-w-7xl pb-24 md:pb-6">
          {children}
        </main>
      </div>
    </AppProvider>
  )
}
