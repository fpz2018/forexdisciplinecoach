'use client'

import { useState, useEffect, useCallback } from 'react'
import { useApp } from '@/lib/context/AppContext'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, Save, Clock, Bell, Calendar, Ban, Brain, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ensureCriteriaExist, DEFAULT_CRITERIA } from '@/lib/learning'
import type { TradingWindow, TradeCriterion } from '@/lib/supabase/types'

const PAIRS = ['GBPUSD', 'EURUSD', 'GBPJPY', 'EURJPY', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'EURGBP']

// JS day numbers: 0=Sun, 1=Mon, ..., 6=Sat
const DAYS = [
  { label: 'Ma', value: 1 },
  { label: 'Di', value: 2 },
  { label: 'Wo', value: 3 },
  { label: 'Do', value: 4 },
  { label: 'Vr', value: 5 },
  { label: 'Za', value: 6 },
  { label: 'Zo', value: 0 },
]

export default function SettingsPage() {
  const { profile, tradingWindows, refreshProfile } = useApp()
  const supabase = createClient()

  // Profile state
  const [balance, setBalance] = useState('')
  const [riskPct, setRiskPct] = useState('')
  const [maxTrades, setMaxTrades] = useState('')
  const [maxLosses, setMaxLosses] = useState('')
  const [fomoThreshold, setFomoThreshold] = useState('')
  const [defaultPair, setDefaultPair] = useState('GBPUSD')
  const [tradingDays, setTradingDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [blockedDates, setBlockedDates] = useState<string[]>([])
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  // Windows state
  const [windows, setWindows] = useState<TradingWindow[]>([])
  const [newStart, setNewStart] = useState('07:00')
  const [newEnd, setNewEnd] = useState('09:00')
  const [savingWindow, setSavingWindow] = useState(false)

  // Criteria state
  const [criteria, setCriteria] = useState<TradeCriterion[]>([])
  const [savingCriteria, setSavingCriteria] = useState(false)
  const [criteriaMsg, setCriteriaMsg] = useState('')

  const loadCriteria = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const list = await ensureCriteriaExist(user.id)
    setCriteria(list.sort((a, b) => b.weight - a.weight))
  }, [supabase])

  useEffect(() => { loadCriteria() }, [loadCriteria])

  useEffect(() => {
    if (profile) {
      setBalance(profile.account_balance.toString())
      setRiskPct(profile.risk_percentage.toString())
      setMaxTrades(profile.max_trades_per_day.toString())
      setMaxLosses(profile.max_daily_losses.toString())
      setFomoThreshold(profile.fomo_threshold_pips.toString())
      setDefaultPair(profile.default_pair)
      setTradingDays(profile.trading_days ?? [1, 2, 3, 4, 5])
      setBlockedDates(profile.blocked_dates ?? [])
    }
  }, [profile])

  useEffect(() => {
    setWindows(tradingWindows)
  }, [tradingWindows])

  const toggleDay = (day: number) => {
    setTradingDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const saveProfile = async () => {
    if (!profile) return
    setSavingProfile(true)

    await supabase.from('profiles').update({
      account_balance: parseFloat(balance),
      risk_percentage: parseFloat(riskPct),
      max_trades_per_day: parseInt(maxTrades),
      max_daily_losses: parseInt(maxLosses),
      fomo_threshold_pips: parseFloat(fomoThreshold),
      default_pair: defaultPair,
      trading_days: tradingDays,
      blocked_dates: blockedDates,
    }).eq('id', profile.id)

    await refreshProfile()
    setSavingProfile(false)
    setProfileSaved(true)
    setTimeout(() => setProfileSaved(false), 2000)
  }

  const blockToday = async () => {
    const today = new Date().toISOString().split('T')[0]
    if (blockedDates.includes(today)) return
    const updated = [...blockedDates, today]
    setBlockedDates(updated)
    if (!profile) return
    await supabase.from('profiles').update({ blocked_dates: updated }).eq('id', profile.id)
    await refreshProfile()
  }

  const unblockDate = async (date: string) => {
    const updated = blockedDates.filter(d => d !== date)
    setBlockedDates(updated)
    if (!profile) return
    await supabase.from('profiles').update({ blocked_dates: updated }).eq('id', profile.id)
    await refreshProfile()
  }

  const saveCriteria = async () => {
    setSavingCriteria(true)
    for (const c of criteria) {
      await supabase.from('trade_criteria').update({
        weight: c.weight,
        enabled: c.enabled,
        auto_learn: c.auto_learn,
      }).eq('id', c.id)
    }
    setSavingCriteria(false)
    setCriteriaMsg('Opgeslagen!')
    setTimeout(() => setCriteriaMsg(''), 2000)
  }

  const resetCriteriaWeights = async () => {
    const reset = criteria.map(c => {
      const def = DEFAULT_CRITERIA.find(d => d.key === c.key)
      return { ...c, weight: def?.weight ?? 16.67 }
    })
    setCriteria(reset)
  }

  const updateCriterion = (id: string, field: keyof TradeCriterion, value: number | boolean) => {
    setCriteria(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  const addWindow = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setSavingWindow(true)
    await supabase.from('trading_windows').insert({
      user_id: user.id,
      start_time: newStart,
      end_time: newEnd,
      active: true,
    })
    await refreshProfile()
    setSavingWindow(false)
  }

  const deleteWindow = async (id: string) => {
    await supabase.from('trading_windows').delete().eq('id', id)
    await refreshProfile()
  }

  const toggleWindow = async (id: string, active: boolean) => {
    await supabase.from('trading_windows').update({ active }).eq('id', id)
    await refreshProfile()
  }

  const requestNotifications = async () => {
    if (!('Notification' in window)) {
      alert('Browser ondersteunt geen notificaties')
      return
    }
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      new Notification('Forex Discipline Coach', { body: 'Notificaties zijn ingeschakeld!' })
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const todayBlocked = blockedDates.includes(today)

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Instellingen</h1>
        <p className="text-slate-400 text-sm mt-1">Pas je trading parameters aan</p>
      </div>

      {/* Account Settings */}
      <Section title="Account Instellingen" icon={<Save className="w-4 h-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Account Balance (€)" type="number" value={balance} onChange={setBalance} step="100" placeholder="10000" />
          <Field label="Risico % per Trade" type="number" value={riskPct} onChange={setRiskPct} step="0.1" min="0.1" max="5" placeholder="1" />
          <Field label="Max Trades per Dag" type="number" value={maxTrades} onChange={setMaxTrades} step="1" min="1" max="20" placeholder="5" />
          <Field label="Max Daily Losses" type="number" value={maxLosses} onChange={setMaxLosses} step="1" min="1" max="10" placeholder="2" />
          <Field label="FOMO Drempel (pips in 5 min)" type="number" value={fomoThreshold} onChange={setFomoThreshold} step="1" min="5" placeholder="10" />
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Standaard Currency Pair</label>
            <select
              value={defaultPair}
              onChange={e => setDefaultPair(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
            >
              {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {balance && riskPct && (
          <div className="mt-4 bg-slate-800 rounded-lg p-3 text-sm">
            <span className="text-slate-400">Risico per trade: </span>
            <span className="text-emerald-400 font-bold">
              €{((parseFloat(balance) * parseFloat(riskPct)) / 100).toFixed(2)}
            </span>
            <span className="text-slate-500 ml-2">({riskPct}% van €{parseFloat(balance).toLocaleString()})</span>
          </div>
        )}

        <button
          onClick={saveProfile}
          disabled={savingProfile}
          className={cn(
            'mt-4 flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all',
            profileSaved
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-emerald-500 hover:bg-emerald-400 text-white'
          )}
        >
          <Save className="w-4 h-4" />
          {profileSaved ? '✓ Opgeslagen!' : savingProfile ? 'Opslaan...' : 'Instellingen Opslaan'}
        </button>
      </Section>

      {/* Trading Days */}
      <Section title="Trading Dagen" icon={<Calendar className="w-4 h-4" />}>
        <p className="text-slate-400 text-sm mb-4">
          Selecteer op welke dagen je mag traden. Weekend is standaard uitgeschakeld.
        </p>

        <div className="flex gap-2 flex-wrap mb-6">
          {DAYS.map(({ label, value }) => {
            const active = tradingDays.includes(value)
            const isWeekend = value === 0 || value === 6
            return (
              <button
                key={value}
                onClick={() => toggleDay(value)}
                className={cn(
                  'w-12 h-12 rounded-xl font-semibold text-sm transition-all border-2',
                  active
                    ? isWeekend
                      ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                      : 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                    : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-600'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>

        {tradingDays.includes(6) && (
          <div className="flex items-start gap-2 bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-orange-400 text-sm mb-4">
            <span className="shrink-0">⚠️</span>
            Zaterdag trading ingeschakeld — forex markten zijn dan gesloten.
          </div>
        )}
        {tradingDays.includes(0) && !tradingDays.includes(6) && (
          <div className="flex items-start gap-2 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-blue-400 text-sm mb-4">
            <span className="shrink-0">💡</span>
            Zondag ingeschakeld — forex markt opent zondagavond 23:00 CET. Stel een trading window in vanaf 23:00.
          </div>
        )}

        <button
          onClick={saveProfile}
          disabled={savingProfile}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg text-sm transition-colors"
        >
          <Save className="w-4 h-4" />
          Dagen opslaan
        </button>
      </Section>

      {/* Feestdagen / geblokkeerde dagen */}
      <Section title="Feestdagen & Gesloten Dagen" icon={<Ban className="w-4 h-4" />}>
        <p className="text-slate-400 text-sm mb-4">
          Blokkeer specifieke dagen waarop de markt gesloten is (feestdagen, bankholidays).
          Trading is dan de hele dag uitgeschakeld.
        </p>

        {/* Block today button */}
        <button
          onClick={blockToday}
          disabled={todayBlocked}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all mb-4',
            todayBlocked
              ? 'bg-red-500/10 border border-red-500/30 text-red-400 cursor-default'
              : 'bg-slate-800 border border-slate-700 text-slate-300 hover:text-red-400 hover:border-red-500/50'
          )}
        >
          <Ban className="w-4 h-4" />
          {todayBlocked ? '✓ Vandaag geblokkeerd' : 'Blokkeer vandaag (feestdag)'}
        </button>

        {/* List of blocked dates */}
        {blockedDates.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-2">Geblokkeerde datums</p>
            {blockedDates
              .slice()
              .sort()
              .map(date => (
                <div key={date} className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5">
                  <span className="text-sm text-white font-medium">
                    {new Date(date + 'T12:00:00').toLocaleDateString('nl-NL', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <button
                    onClick={() => unblockDate(date)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-slate-600 text-sm">Geen datums geblokkeerd.</p>
        )}
      </Section>

      {/* Analyse Criteria */}
      <Section title="Analyse Criteria & Gewichten" icon={<Brain className="w-4 h-4" />}>
        <p className="text-slate-400 text-sm mb-2">
          Het systeem leert automatisch van jouw trades. 1H en 4H wegen het zwaarst.
          Score ≥ 60 = <span className="text-emerald-400 font-medium">WEL DOEN</span>.
        </p>

        {/* Discovered patterns — shown separately */}
        {criteria.filter(c => c.auto_generated).length > 0 && (
          <div className="mb-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl">
            <p className="text-xs font-semibold text-purple-400 uppercase tracking-wide mb-2 flex items-center gap-1">
              <Brain className="w-3 h-3" /> Geleerde patronen ({criteria.filter(c => c.auto_generated).length})
            </p>
            {criteria.filter(c => c.auto_generated).map(c => {
              const wr = c.win_count + c.loss_count > 0 ? Math.round(c.win_count / (c.win_count + c.loss_count) * 100) : 0
              return (
                <div key={c.id} className="mb-2 last:mb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-sm font-medium text-purple-300">{c.label}</span>
                      <p className="text-xs text-slate-400 mt-0.5">{c.description}</p>
                    </div>
                    <span className="text-xs text-emerald-400 font-bold shrink-0">{wr}% wins</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {criteria.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">Laden...</div>
        ) : (
          <div className="space-y-3">
            {criteria.filter(c => !c.auto_generated).map(c => {
              const winRate = c.win_count + c.loss_count > 0
                ? Math.round((c.win_count / (c.win_count + c.loss_count)) * 100)
                : null
              return (
                <div key={c.id} className={cn(
                  'border rounded-xl p-4 transition-all',
                  c.enabled ? 'border-slate-700 bg-slate-800/50' : 'border-slate-800 bg-slate-900 opacity-60'
                )}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white text-sm">{c.label}</span>
                        {winRate !== null && (
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded font-medium',
                            winRate >= 55 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                          )}>
                            {winRate >= 55 ? <TrendingUp className="w-3 h-3 inline mr-0.5" /> : <TrendingDown className="w-3 h-3 inline mr-0.5" />}
                            {winRate}% ({c.win_count}W/{c.loss_count}V)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{c.description}</p>
                    </div>
                    {/* Enable toggle */}
                    <button
                      onClick={() => updateCriterion(c.id, 'enabled', !c.enabled)}
                      className={cn(
                        'w-10 h-6 rounded-full transition-all relative shrink-0',
                        c.enabled ? 'bg-emerald-500' : 'bg-slate-600'
                      )}
                    >
                      <div className={cn('absolute top-1 w-4 h-4 bg-white rounded-full transition-all', c.enabled ? 'left-5' : 'left-1')} />
                    </button>
                  </div>

                  {/* Weight slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Gewicht</span>
                      <span className="font-bold text-white">{Math.round(c.weight)}%</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={45}
                      step={1}
                      value={Math.round(c.weight)}
                      onChange={e => updateCriterion(c.id, 'weight', parseFloat(e.target.value))}
                      disabled={!c.enabled}
                      className="w-full accent-emerald-500 disabled:opacity-30"
                    />
                  </div>

                  {/* Auto-learn toggle */}
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      id={`learn-${c.id}`}
                      checked={c.auto_learn}
                      onChange={e => updateCriterion(c.id, 'auto_learn', e.target.checked)}
                      className="accent-emerald-500"
                    />
                    <label htmlFor={`learn-${c.id}`} className="text-xs text-slate-400 cursor-pointer">
                      Auto-leren aan
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={saveCriteria}
            disabled={savingCriteria || criteria.length === 0}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              criteriaMsg ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-500 hover:bg-emerald-400 text-white'
            )}
          >
            <Save className="w-4 h-4" />
            {criteriaMsg || (savingCriteria ? 'Opslaan...' : 'Criteria opslaan')}
          </button>
          <button
            onClick={resetCriteriaWeights}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white rounded-lg text-sm transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset gewichten
          </button>
        </div>
      </Section>

      {/* Trading Windows */}
      <Section title="Trading Windows" icon={<Clock className="w-4 h-4" />}>
        <p className="text-slate-400 text-sm mb-4">
          Trades zijn alleen mogelijk tijdens deze tijdvensters. Buiten deze tijden is de &quot;Nieuwe Trade&quot; knop geblokkeerd.
        </p>

        {windows.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-sm">
            Geen trading windows ingesteld. Voeg hieronder toe.
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {windows.map(w => (
              <div key={w.id} className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleWindow(w.id, !w.active)}
                    className={cn('w-10 h-6 rounded-full transition-all relative', w.active ? 'bg-emerald-500' : 'bg-slate-600')}
                  >
                    <div className={cn('absolute top-1 w-4 h-4 bg-white rounded-full transition-all', w.active ? 'left-5' : 'left-1')} />
                  </button>
                  <div>
                    <span className="font-medium text-white">{w.start_time} – {w.end_time}</span>
                    <span className={cn('ml-2 text-xs', w.active ? 'text-emerald-400' : 'text-slate-500')}>
                      {w.active ? 'Actief' : 'Inactief'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => deleteWindow(w.id)}
                  className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-sm font-medium text-slate-300 mb-3">Nieuw window toevoegen</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <input
                type="time"
                value={newStart}
                onChange={e => setNewStart(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 text-sm"
              />
              <span className="text-slate-500">–</span>
              <input
                type="time"
                value={newEnd}
                onChange={e => setNewEnd(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 text-sm"
              />
            </div>
            <button
              onClick={addWindow}
              disabled={savingWindow}
              className="flex items-center gap-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Toevoegen
            </button>
          </div>
        </div>
      </Section>

      {/* Notifications */}
      <Section title="Notificaties" icon={<Bell className="w-4 h-4" />}>
        <p className="text-slate-400 text-sm mb-4">
          Ontvang browser notificaties bij het starten van trading windows en bij 4H candle closes.
        </p>
        <button
          onClick={requestNotifications}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg text-sm transition-colors"
        >
          <Bell className="w-4 h-4" />
          Notificaties Inschakelen
        </button>
        <p className="text-xs text-slate-500 mt-2">
          Notificaties: trading window start, 4H candle close (07:00, 11:00, 15:00, 19:00), bijna daily loss limit
        </p>
      </Section>
    </div>
  )
}

function Section({ title, icon, children }: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold text-white mb-4">
        <span className="text-emerald-400">{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  )
}

function Field({ label, type, value, onChange, step, min, max, placeholder }: {
  label: string
  type: string
  value: string
  onChange: (v: string) => void
  step?: string
  min?: string
  max?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
      />
    </div>
  )
}
