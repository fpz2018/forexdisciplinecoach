'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Profile, Trade, TradingWindow } from '@/lib/supabase/types'
import { isInTradingWindow, isTradingDay, getTradingDayBlockReason } from '@/lib/utils'

interface AppContextType {
  profile: Profile | null
  trades: Trade[]
  todayTrades: Trade[]
  openTrades: Trade[]
  tradingWindows: TradingWindow[]
  isInWindow: boolean
  canTrade: boolean
  tradeBlockReason: string | null
  coolingOffUntil: Date | null
  refreshTrades: () => Promise<void>
  refreshProfile: () => Promise<void>
  loading: boolean
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [tradingWindows, setTradingWindows] = useState<TradingWindow[]>([])
  const [loading, setLoading] = useState(true)
  const [coolingOffUntil, setCoolingOffUntil] = useState<Date | null>(null)

  const supabase = createClient()

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (data) setProfile(data)

    const { data: windows } = await supabase
      .from('trading_windows')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)

    if (windows) setTradingWindows(windows)
  }, [supabase])

  const refreshTrades = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (data) {
      setTrades(data)

      // Check cooling off: last closed loss trade
      const lastLoss = data.find(t => t.status === 'CLOSED' && (t.result_pips ?? 0) < 0)
      if (lastLoss?.closed_at) {
        const closedAt = new Date(lastLoss.closed_at)
        const coolingEnd = new Date(closedAt.getTime() + 15 * 60 * 1000)
        if (coolingEnd > new Date()) {
          setCoolingOffUntil(coolingEnd)
        } else {
          setCoolingOffUntil(null)
        }
      }
    }
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      await refreshProfile()
      await refreshTrades()
      setLoading(false)
    }
    init()
  }, [refreshProfile, refreshTrades])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('trades-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => {
        refreshTrades()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, refreshTrades])

  const today = new Date().toDateString()
  const todayTrades = trades.filter(t => new Date(t.created_at).toDateString() === today)
  const openTrades = trades.filter(t => t.status === 'OPEN')

  const tradingDays = profile?.trading_days ?? [1, 2, 3, 4, 5]
  const blockedDates = profile?.blocked_dates ?? []
  const isInWindow = isInTradingWindow(tradingWindows)
  const isTradingDayOk = isTradingDay(tradingDays, blockedDates)
  const todayLosses = todayTrades.filter(t => t.status === 'CLOSED' && (t.result_pips ?? 0) < 0).length
  const maxLosses = profile?.max_daily_losses ?? 2
  const maxTrades = profile?.max_trades_per_day ?? 5

  let tradeBlockReason: string | null = null
  if (!isTradingDayOk) {
    tradeBlockReason = getTradingDayBlockReason(tradingDays, blockedDates) ?? 'Geen trading vandaag'
  } else if (!isInWindow) {
    tradeBlockReason = 'Buiten trading window'
  } else if (todayLosses >= maxLosses) {
    tradeBlockReason = `Daily loss limit bereikt (${todayLosses}/${maxLosses} verliezen)`
  } else if (todayTrades.filter(t => t.status === 'OPEN').length >= maxTrades) {
    tradeBlockReason = `Maximum trades per dag bereikt (${maxTrades})`
  } else if (coolingOffUntil && coolingOffUntil > new Date()) {
    const remaining = Math.ceil((coolingOffUntil.getTime() - Date.now()) / 1000 / 60)
    tradeBlockReason = `Cooling off periode: nog ${remaining} minuten`
  }

  const canTrade = tradeBlockReason === null

  return (
    <AppContext.Provider value={{
      profile,
      trades,
      todayTrades,
      openTrades,
      tradingWindows,
      isInWindow,
      canTrade,
      tradeBlockReason,
      coolingOffUntil,
      refreshTrades,
      refreshProfile,
      loading,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
