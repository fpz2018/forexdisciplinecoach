'use client'

import { useState, useEffect } from 'react'
import { X, ChevronRight, Loader2, TrendingUp, TrendingDown, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/lib/context/AppContext'
import { calculateStopLoss, calculateTakeProfit, calculateLotSize, getPipValue, cn } from '@/lib/utils'
import { ensureCriteriaExist } from '@/lib/learning'
import type { CriterionResult, AnalysisResult } from '@/app/api/analyze/route'

interface TradeModalProps {
  open: boolean
  onClose: () => void
}

const PAIRS = ['GBPUSD', 'EURUSD', 'GBPJPY', 'EURJPY', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'EURGBP']

export default function TradeModal({ open, onClose }: TradeModalProps) {
  const { profile, refreshTrades } = useApp()
  const supabase = createClient()

  const [step, setStep] = useState<'entry' | 'analysis' | 'confirm'>('entry')
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG')
  const [pair, setPair] = useState(profile?.default_pair ?? 'GBPUSD')
  const [entryPrice, setEntryPrice] = useState('')
  const [lotSize, setLotSize] = useState('')
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')

  useEffect(() => {
    if (open) {
      setStep('entry')
      setAnalysis(null)
      setAnalyzeError(null)
      setOverrideReason('')
      setPair(profile?.default_pair ?? 'GBPUSD')
      setEntryPrice('')
      setLotSize('')
    }
  }, [open, profile?.default_pair])

  useEffect(() => {
    if (entryPrice && profile) {
      const pipVal = getPipValue(pair)
      const lot = calculateLotSize(profile.account_balance, profile.risk_percentage, 6, pipVal)
      setLotSize(lot.toString())
    }
  }, [entryPrice, pair, profile])

  const entryNum = parseFloat(entryPrice)
  const sl = entryNum ? calculateStopLoss(entryNum, direction) : null
  const tp = entryNum ? calculateTakeProfit(entryNum, direction) : null

  const runAnalysis = async () => {
    if (!entryNum || !profile) return
    setAnalyzing(true)
    setAnalyzeError(null)
    setStep('analysis')

    try {
      // Load user's custom criteria weights
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Niet ingelogd')

      const criteria = await ensureCriteriaExist(user.id)
      const criteriaPayload = criteria.map(c => ({
        key: c.key,
        weight: c.weight,
        enabled: c.enabled,
      }))

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair,
          direction,
          entryPrice: entryNum,
          fomoThreshold: profile.fomo_threshold_pips,
          criteria: criteriaPayload,
          threshold: 60,
        }),
      })

      const data: AnalysisResult = await res.json()
      if (data.error) throw new Error(data.error)
      setAnalysis(data)
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analyse mislukt')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleSubmit = async (overrideAdvice = false) => {
    if (!sl || !tp || !profile || !analysis) return
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('trades').insert({
      user_id: user.id,
      direction,
      pair,
      entry_price: entryNum,
      stop_loss: sl,
      take_profit: tp,
      lot_size: parseFloat(lotSize),
      checklist_completed: analysis.recommendation === 'WEL_DOEN',
      checklist_items: {},
      indicator_snapshot: {
        ...analysis.snapshot,
        override: overrideAdvice,
        override_reason: overrideReason,
      },
      analysis_score: analysis.score,
      status: 'OPEN',
    })

    await refreshTrades()
    setSubmitting(false)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <h2 className="text-lg font-bold text-white">Nieuwe Trade</h2>
            <div className="flex items-center gap-2 mt-1">
              <StepDot active={step === 'entry'} done={step !== 'entry'} label="1. Invoer" />
              <div className="w-8 h-px bg-slate-700" />
              <StepDot active={step === 'analysis'} done={step === 'confirm'} label="2. Analyse" />
              <div className="w-8 h-px bg-slate-700" />
              <StepDot active={step === 'confirm'} done={false} label="3. Bevestig" />
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">

          {/* STEP 1: ENTRY */}
          {step === 'entry' && (
            <div className="space-y-4">
              {/* Direction */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Richting</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDirection('LONG')}
                    className={cn(
                      'py-3 rounded-xl font-bold text-base transition-all border-2 flex items-center justify-center gap-2',
                      direction === 'LONG'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    )}
                  >
                    <TrendingUp className="w-5 h-5" /> LONG / BUY
                  </button>
                  <button
                    onClick={() => setDirection('SHORT')}
                    className={cn(
                      'py-3 rounded-xl font-bold text-base transition-all border-2 flex items-center justify-center gap-2',
                      direction === 'SHORT'
                        ? 'bg-red-500/20 border-red-500 text-red-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    )}
                  >
                    <TrendingDown className="w-5 h-5" /> SHORT / SELL
                  </button>
                </div>
              </div>

              {/* Pair */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Currency Pair</label>
                <select
                  value={pair}
                  onChange={e => setPair(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                >
                  {PAIRS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Entry price */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Entry Prijs
                  <span className="text-slate-500 font-normal ml-2 text-xs">(van cTrader)</span>
                </label>
                <input
                  type="number"
                  step="0.00001"
                  value={entryPrice}
                  onChange={e => setEntryPrice(e.target.value)}
                  placeholder="bijv. 1.27345"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Auto-calculated SL/TP */}
              {entryNum > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <div className="text-xs text-slate-400 mb-1">Stop Loss (6 pips)</div>
                    <div className="text-red-400 font-bold font-mono">{sl?.toFixed(5)}</div>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                    <div className="text-xs text-slate-400 mb-1">Take Profit (12 pips)</div>
                    <div className="text-emerald-400 font-bold font-mono">{tp?.toFixed(5)}</div>
                  </div>
                </div>
              )}

              {/* Lot size */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Lot Size
                  <span className="text-slate-500 font-normal ml-2 text-xs">(automatisch berekend)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={lotSize}
                  onChange={e => setLotSize(e.target.value)}
                  placeholder="bijv. 0.50"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                {profile && entryPrice && (
                  <p className="text-xs text-slate-500 mt-1">
                    Risico: {profile.risk_percentage}% = €{((profile.account_balance * profile.risk_percentage) / 100).toFixed(2)}
                  </p>
                )}
              </div>

              <button
                onClick={runAnalysis}
                disabled={!entryPrice || !lotSize}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                Analyseer deze trade →
              </button>
            </div>
          )}

          {/* STEP 2: ANALYSIS */}
          {step === 'analysis' && (
            <div>
              {analyzing && (
                <div className="text-center py-12">
                  <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mx-auto mb-4" />
                  <p className="text-white font-medium">Live data ophalen...</p>
                  <p className="text-slate-400 text-sm mt-1">EMA's, Donchian Channel, FOMO check</p>
                </div>
              )}

              {analyzeError && (
                <div className="text-center py-8">
                  <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
                  <p className="text-red-400 font-medium">{analyzeError}</p>
                  <button
                    onClick={runAnalysis}
                    className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-700 text-sm"
                  >
                    <RefreshCw className="w-4 h-4" /> Opnieuw proberen
                  </button>
                  <button onClick={() => setStep('entry')} className="mt-2 text-slate-500 text-sm hover:text-slate-300 block mx-auto">
                    ← Terug
                  </button>
                </div>
              )}

              {!analyzing && !analyzeError && analysis && (
                <div className="space-y-4">
                  {/* Score + Recommendation */}
                  <AnalysisHeader analysis={analysis} direction={direction} pair={pair} />

                  {/* Criteria breakdown */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Analyse per criterium</p>
                    {analysis.criteria.map(c => (
                      <CriterionRow key={c.key} criterion={c} />
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="pt-2 space-y-3">
                    {analysis.recommendation === 'WEL_DOEN' && (
                      <button
                        onClick={() => handleSubmit(false)}
                        disabled={submitting}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                      >
                        <CheckCircle className="w-5 h-5" />
                        {submitting ? 'Opslaan...' : 'Trade openen ✅'}
                      </button>
                    )}

                    {analysis.recommendation === 'NIET_DOEN' && (
                      <button
                        onClick={onClose}
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-colors"
                      >
                        Trade overslaan — goede beslissing 👍
                      </button>
                    )}

                    {analysis.recommendation === 'TWIJFEL' && (
                      <button
                        onClick={() => handleSubmit(false)}
                        disabled={submitting}
                        className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
                      >
                        {submitting ? 'Opslaan...' : 'Toch openen (twijfelgeval)'}
                      </button>
                    )}

                    {/* Override: always possible but requires reason */}
                    {analysis.recommendation !== 'WEL_DOEN' && (
                      <details className="group">
                        <summary className="text-xs text-slate-500 hover:text-slate-400 cursor-pointer select-none">
                          Toch handelen tegen het advies in?
                        </summary>
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={overrideReason}
                            onChange={e => setOverrideReason(e.target.value)}
                            placeholder="Waarom wil je toch handelen? (wordt opgeslagen voor analyse)"
                            rows={2}
                            className="w-full bg-slate-800 border border-orange-500/40 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 text-sm resize-none"
                          />
                          <button
                            onClick={() => handleSubmit(true)}
                            disabled={submitting || !overrideReason.trim()}
                            className="w-full bg-orange-500/20 border border-orange-500/50 text-orange-400 hover:bg-orange-500/30 disabled:opacity-40 font-medium py-2 rounded-lg text-sm transition-colors"
                          >
                            Overschrijven en trade openen
                          </button>
                        </div>
                      </details>
                    )}

                    <button
                      onClick={() => { setStep('entry'); setAnalysis(null) }}
                      className="text-slate-500 text-sm hover:text-slate-300 block mx-auto"
                    >
                      ← Gegevens aanpassen
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={cn(
        'w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold',
        done ? 'bg-emerald-500 text-white' : active ? 'bg-emerald-500/30 border border-emerald-500 text-emerald-400' : 'bg-slate-700 text-slate-500'
      )}>
        {done ? '✓' : ''}
      </div>
      <span className={cn('text-xs', active ? 'text-white' : 'text-slate-500')}>{label}</span>
    </div>
  )
}

function AnalysisHeader({ analysis, direction, pair }: { analysis: AnalysisResult; direction: string; pair: string }) {
  const rec = analysis.recommendation
  const config = {
    WEL_DOEN: {
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      icon: <CheckCircle className="w-8 h-8 text-emerald-400" />,
      text: 'text-emerald-400',
      label: '✅ WEL DOEN',
      sub: 'De analyse ondersteunt deze trade',
    },
    NIET_DOEN: {
      bg: 'bg-red-500/10 border-red-500/30',
      icon: <XCircle className="w-8 h-8 text-red-400" />,
      text: 'text-red-400',
      label: '❌ NIET DOEN',
      sub: 'Te weinig criteria zijn groen',
    },
    TWIJFEL: {
      bg: 'bg-orange-500/10 border-orange-500/30',
      icon: <AlertCircle className="w-8 h-8 text-orange-400" />,
      text: 'text-orange-400',
      label: '⚠️ TWIJFELGEVAL',
      sub: 'Net niet genoeg bevestiging',
    },
  }[rec]

  const passCount = analysis.criteria.filter(c => c.pass).length
  const total = analysis.criteria.length

  return (
    <div className={cn('border rounded-2xl p-4', config.bg)}>
      <div className="flex items-center gap-3 mb-3">
        {config.icon}
        <div>
          <div className={cn('text-xl font-bold', config.text)}>{config.label}</div>
          <div className="text-sm text-slate-400">{pair} {direction} · {config.sub}</div>
        </div>
      </div>

      {/* Score bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-400">
          <span>Score: {analysis.score}/100 ({passCount}/{total} criteria groen)</span>
          <span>Drempel: 60</span>
        </div>
        <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              rec === 'WEL_DOEN' ? 'bg-emerald-500' : rec === 'TWIJFEL' ? 'bg-orange-500' : 'bg-red-500'
            )}
            style={{ width: `${analysis.score}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function CriterionRow({ criterion }: { criterion: CriterionResult }) {
  return (
    <div className={cn(
      'border rounded-xl p-3 flex items-start gap-3 transition-all',
      criterion.pass ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'
    )}>
      <div className="shrink-0 mt-0.5">
        {criterion.pass
          ? <CheckCircle className="w-4 h-4 text-emerald-400" />
          : <XCircle className="w-4 h-4 text-red-400" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn('text-sm font-semibold', criterion.pass ? 'text-emerald-400' : 'text-red-400')}>
            {criterion.label}
          </span>
          <span className="text-xs text-slate-500 shrink-0">gewicht: {criterion.weight.toFixed(0)}%</span>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">{criterion.reason}</p>
        <p className="text-xs text-slate-600 mt-0.5 font-mono">{criterion.value}</p>
      </div>
    </div>
  )
}
