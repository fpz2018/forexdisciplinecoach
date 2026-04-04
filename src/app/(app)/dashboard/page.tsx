'use client'

import { useState, useEffect } from 'react'
import { useApp } from '@/lib/context/AppContext'
import { formatCurrency, formatPips, getNextTradingWindow } from '@/lib/utils'
import { TrendingUp, TrendingDown, Activity, Shield, Plus, Clock, AlertTriangle } from 'lucide-react'
import TradeModal from '@/components/TradeModal'
import OpenPositions from '@/components/OpenPositions'
import TradingViewWidget from '@/components/TradingViewWidget'
import { cn } from '@/lib/utils'

export default function DashboardPage() {
  const { profile, todayTrades, openTrades, tradingWindows, canTrade, tradeBlockReason, isInWindow } = useApp()
  const [tradeModalOpen, setTradeModalOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const todayPips = todayTrades
    .filter(t => t.status === 'CLOSED')
    .reduce((sum, t) => sum + (t.result_pips ?? 0), 0)

  const todayMoney = todayTrades
    .filter(t => t.status === 'CLOSED')
    .reduce((sum, t) => sum + (t.result_money ?? 0), 0)

  const totalClosed = todayTrades.filter(t => t.status === 'CLOSED').length
  const checklistTrades = todayTrades.filter(t => t.checklist_completed).length
  const disciplineScore = totalClosed > 0 ? Math.round((checklistTrades / totalClosed) * 100) : 100

  const nextWindow = getNextTradingWindow(tradingWindows)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            {currentTime.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' · '}
            {currentTime.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>

        {/* Trading window status */}
        <div className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
          isInWindow
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-slate-800 text-slate-400 border border-slate-700'
        )}>
          <div className={cn('w-2 h-2 rounded-full', isInWindow ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500')} />
          {isInWindow ? 'Trading Window Open' : `Window gesloten`}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Huidige Balance"
          value={formatCurrency(profile?.account_balance ?? 0)}
          icon={<Shield className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Winst Vandaag"
          value={`${todayPips >= 0 ? '+' : ''}${todayPips.toFixed(1)} pips`}
          subtitle={formatCurrency(todayMoney)}
          icon={todayPips >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
          color={todayPips >= 0 ? 'green' : 'red'}
        />
        <StatCard
          title="Open Posities"
          value={openTrades.length.toString()}
          subtitle={`Max ${profile?.max_trades_per_day ?? 5}`}
          icon={<Activity className="w-5 h-5" />}
          color="orange"
        />
        <StatCard
          title="Discipline Score"
          value={`${disciplineScore}%`}
          subtitle={`${checklistTrades}/${Math.max(totalClosed, todayTrades.length)} trades`}
          icon={<Shield className="w-5 h-5" />}
          color={disciplineScore >= 80 ? 'green' : disciplineScore >= 60 ? 'orange' : 'red'}
        />
      </div>

      {/* Trade button & block reason */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <button
          onClick={() => canTrade && setTradeModalOpen(true)}
          disabled={!canTrade}
          className={cn(
            'flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-base transition-all min-h-[48px]',
            canTrade
              ? 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
          )}
        >
          <Plus className="w-5 h-5" />
          Nieuwe Trade
        </button>

        {tradeBlockReason && (
          <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-lg px-4 py-2 text-orange-400 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{tradeBlockReason}</span>
            {!isInWindow && tradingWindows.length > 0 && (
              <span className="text-slate-400 ml-1">
                · Volgende: {nextWindow}
              </span>
            )}
          </div>
        )}

        {tradingWindows.length === 0 && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2 text-amber-400 text-sm">
            <Clock className="w-4 h-4" />
            Stel trading windows in via Instellingen
          </div>
        )}
      </div>

      {/* TradingView Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-300">
            {profile?.default_pair ?? 'GBPUSD'} · 5 Min Chart
          </h2>
          <span className="text-xs text-slate-500">TradingView</span>
        </div>
        <TradingViewWidget symbol={profile?.default_pair ?? 'GBPUSD'} />
      </div>

      {/* Open Positions */}
      {openTrades.length > 0 && <OpenPositions />}

      {/* Trade Modal */}
      <TradeModal open={tradeModalOpen} onClose={() => setTradeModalOpen(false)} />
    </div>
  )
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  color: 'green' | 'red' | 'blue' | 'orange'
}) {
  const colors = {
    green: 'text-emerald-400 bg-emerald-500/10',
    red: 'text-red-400 bg-red-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    orange: 'text-orange-400 bg-orange-500/10',
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">{title}</span>
        <div className={cn('p-1.5 rounded-lg', colors[color])}>
          <div className={colors[color].split(' ')[0]}>{icon}</div>
        </div>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
    </div>
  )
}
