'use client'

import { useMemo } from 'react'
import { useApp } from '@/lib/context/AppContext'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell
} from 'recharts'

export default function StatsPage() {
  const { trades, profile } = useApp()

  const closedTrades = trades.filter(t => t.status === 'CLOSED')
  const wins = closedTrades.filter(t => (t.result_pips ?? 0) > 0)
  const losses = closedTrades.filter(t => (t.result_pips ?? 0) <= 0)

  const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.result_pips ?? 0), 0) / wins.length : 0
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.result_pips ?? 0), 0) / losses.length) : 0
  const rrRatio = avgLoss > 0 ? avgWin / avgLoss : 0
  const expectancy = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss
  const checklistTrades = trades.filter(t => t.checklist_completed).length
  const disciplineScore = trades.length > 0 ? (checklistTrades / trades.length) * 100 : 100
  const totalPips = closedTrades.reduce((s, t) => s + (t.result_pips ?? 0), 0)
  const totalMoney = closedTrades.reduce((s, t) => s + (t.result_money ?? 0), 0)

  // Equity curve
  const equityCurve = useMemo(() => {
    let balance = profile?.account_balance ?? 10000
    // subtract total P&L to get starting balance
    const startBalance = balance - totalMoney

    const sorted = [...closedTrades].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    const points = [{ date: 'Start', balance: startBalance }]
    let running = startBalance
    sorted.forEach(t => {
      running += (t.result_money ?? 0)
      points.push({
        date: new Date(t.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }),
        balance: parseFloat(running.toFixed(2)),
      })
    })
    return points
  }, [closedTrades, profile?.account_balance, totalMoney])

  // Per day of week
  const byDayOfWeek = useMemo(() => {
    const days = ['Ma', 'Di', 'Wo', 'Do', 'Vr']
    const counts = days.map((day, i) => ({
      day,
      wins: closedTrades.filter(t => {
        const d = new Date(t.created_at).getDay()
        return d === (i + 1) && (t.result_pips ?? 0) > 0
      }).length,
      losses: closedTrades.filter(t => {
        const d = new Date(t.created_at).getDay()
        return d === (i + 1) && (t.result_pips ?? 0) <= 0
      }).length,
    }))
    return counts
  }, [closedTrades])

  // Per hour heatmap
  const byHour = useMemo(() => {
    const hours = Array.from({ length: 16 }, (_, i) => i + 6) // 6:00 - 21:00
    return hours.map(h => {
      const tradesInHour = closedTrades.filter(t => new Date(t.created_at).getHours() === h)
      const pipSum = tradesInHour.reduce((s, t) => s + (t.result_pips ?? 0), 0)
      return { hour: `${h}:00`, pips: parseFloat(pipSum.toFixed(1)), count: tradesInHour.length }
    })
  }, [closedTrades])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Statistieken</h1>
        <p className="text-slate-400 text-sm mt-1">{closedTrades.length} gesloten trades geanalyseerd</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Win Rate"
          value={`${winRate.toFixed(1)}%`}
          sub={`${wins.length}W / ${losses.length}L`}
          color={winRate >= 50 ? 'green' : 'red'}
        />
        <KPICard
          label="Risico/Rendement"
          value={`1:${rrRatio.toFixed(2)}`}
          sub={`Gem. win: ${avgWin.toFixed(1)} pips`}
          color={rrRatio >= 1.5 ? 'green' : 'orange'}
        />
        <KPICard
          label="Expectancy"
          value={`${expectancy >= 0 ? '+' : ''}${expectancy.toFixed(2)} pips`}
          sub="Per trade gemiddeld"
          color={expectancy >= 0 ? 'green' : 'red'}
        />
        <KPICard
          label="Discipline Score"
          value={`${disciplineScore.toFixed(0)}%`}
          sub={`${checklistTrades}/${trades.length} trades`}
          color={disciplineScore >= 80 ? 'green' : disciplineScore >= 60 ? 'orange' : 'red'}
        />
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Totaal Pips</div>
          <div className={`text-2xl font-bold ${totalPips >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalPips >= 0 ? '+' : ''}{totalPips.toFixed(1)}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs text-slate-400 mb-1">Totaal Geld</div>
          <div className={`text-2xl font-bold ${totalMoney >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatCurrency(totalMoney)}
          </div>
        </div>
      </div>

      {/* Equity Curve */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-white mb-4">Equity Curve</h2>
        {equityCurve.length < 2 ? (
          <div className="text-center py-12 text-slate-500">Niet genoeg data om een equity curve te tonen</div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={equityCurve}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `€${v.toLocaleString()}`} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v) => [formatCurrency(Number(v)), 'Balance']}
              />
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#22c55e' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per day of week */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-white mb-4">Win/Verlies per Dag van de Week</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byDayOfWeek}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 12 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Bar dataKey="wins" name="Winst" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="losses" name="Verlies" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per hour */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-white mb-4">Pips per Tijdstip (Heatmap)</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byHour}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 10 }} interval={1} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              labelStyle={{ color: '#94a3b8' }}
              formatter={(v) => [`${Number(v)} pips`, 'Totaal']}
            />
            <ReferenceLine y={0} stroke="#475569" />
            <Bar dataKey="pips" name="Pips" radius={[4, 4, 0, 0]}>
              {byHour.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.pips >= 0 ? '#22c55e' : '#ef4444'}
                  fillOpacity={entry.count === 0 ? 0.2 : 0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function KPICard({ label, value, sub, color }: {
  label: string
  value: string
  sub: string
  color: 'green' | 'red' | 'orange'
}) {
  const colorMap = {
    green: 'text-emerald-400',
    red: 'text-red-400',
    orange: 'text-orange-400',
  }
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="text-xs text-slate-400 uppercase tracking-wide mb-2">{label}</div>
      <div className={`text-2xl font-bold ${colorMap[color]}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{sub}</div>
    </div>
  )
}
