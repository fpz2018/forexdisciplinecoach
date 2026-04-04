'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, LayoutDashboard, BookOpen, BarChart2, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/stats', label: 'Stats', icon: BarChart2 },
  { href: '/settings', label: 'Instellingen', icon: Settings },
]

export default function Navigation() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <>
      {/* Top bar — desktop only */}
      <nav className="hidden md:block bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex items-center justify-between h-16">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-white">FX Discipline</span>
            </Link>

            <div className="flex items-center gap-1">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    pathname === href
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              ))}
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Uitloggen
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile top bar — logo only */}
      <nav className="md:hidden bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
        <div className="px-4 flex items-center justify-between h-14">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-white text-sm">FX Discipline</span>
          </Link>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-500 active:text-red-400"
            aria-label="Uitloggen"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-900 border-t border-slate-800 safe-area-pb">
        <div className="grid grid-cols-4">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors active:bg-slate-800',
                  active ? 'text-emerald-400' : 'text-slate-500'
                )}
              >
                <Icon className={cn('w-5 h-5', active ? 'text-emerald-400' : 'text-slate-500')} />
                <span>{label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
