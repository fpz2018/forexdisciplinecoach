'use client'

import { useState, useEffect } from 'react'
import { X, Info, ChevronRight, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/lib/context/AppContext'
import { calculateStopLoss, calculateTakeProfit, calculateLotSize, getPipValue, cn } from '@/lib/utils'
import type { ChecklistItems } from '@/lib/supabase/types'

interface TradeModalProps {
  open: boolean
  onClose: () => void
}

const CHECKLIST_ITEMS = [
  {
    key: 'trend_check' as keyof ChecklistItems,
    label: 'Trend Check',
    description: 'Oranje EMA (11) staat boven Gele EMA (25) op 30min+ timeframe voor LONG / Onder voor SHORT',
    tooltip: 'Controleer de EMAs op een hogere timeframe (30min of 1H). Voor een LONG trade wil je de snelle EMA (11) boven de langzame EMA (25) zien.',
  },
  {
    key: 'channel_check' as keyof ChecklistItems,
    label: 'Channel Check',
    description: 'Prijs zit in onderste helft Donchian Channel (LONG) / Bovenste helft (SHORT)',
    tooltip: 'Het Donchian Channel toont de high/low range van de laatste 9 perioden. Voor LONG: prijs zit in de onderste helft (koop bij steun). Voor SHORT: prijs in bovenste helft.',
  },
  {
    key: 'pattern_check' as keyof ChecklistItems,
    label: 'Patroon Check',
    description: 'Higher lows patroon gezien (LONG: Rood-Groen-Rood met hogere low) / Lower highs (SHORT)',
    tooltip: 'Zoek naar een bevestigd price action patroon. LONG: drie candles waarbij de middelste groen is en de derde candle een hogere low heeft dan de eerste. SHORT: omgekeerd.',
  },
  {
    key: 'higher_tf_check' as keyof ChecklistItems,
    label: 'Higher Timeframe Check',
    description: 'Geen conflict met Daily/4H chart (prijs niet direct tegen EMA op hogere timeframe)',
    tooltip: 'Check de Daily en 4H charts. Als de prijs tegen een sterke EMA aanloopt op hogere timeframe, vermijd dan een trade in die richting.',
  },
  {
    key: 'mean_reversion_check' as keyof ChecklistItems,
    label: 'Mean Reversion Check',
    description: 'EMA\'s staan niet extreem ver uit elkaar (geen overbought/oversold situatie)',
    tooltip: 'Als de twee EMAs extreem ver van elkaar staan, is de markt overstretched en is een correctie waarschijnlijker. Wacht op mean reversion voor betere entry.',
  },
  {
    key: 'fomo_check' as keyof ChecklistItems,
    label: 'FOMO Check',
    description: 'Prijs heeft NIET in de laatste 5 minuten meer dan de drempelwaarde in pips bewogen',
    tooltip: 'Als de prijs al fors is bewogen in korte tijd, is het gevaarlijk om er achteraan te gaan. Wacht op een betere entry of sla de trade over.',
  },
]

const PAIRS = ['GBPUSD', 'EURUSD', 'GBPJPY', 'EURJPY', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'EURGBP']

export default function TradeModal({ open, onClose }: TradeModalProps) {
  const { profile, refreshTrades } = useApp()
  const supabase = createClient()

  const [step, setStep] = useState<'checklist' | 'entry'>('checklist')
  const [checklist, setChecklist] = useState<ChecklistItems>({
    trend_check: false,
    channel_check: false,
    pattern_check: false,
    higher_tf_check: false,
    mean_reversion_check: false,
    fomo_check: false,
  })

  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG')
  const [pair, setPair] = useState(profile?.default_pair ?? 'GBPUSD')
  const [entryPrice, setEntryPrice] = useState('')
  const [lotSize, setLotSize] = useState('')
  const [loading, setLoading] = useState(false)
  const [tooltip, setTooltip] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setStep('checklist')
      setChecklist({
        trend_check: false,
        channel_check: false,
        pattern_check: false,
        higher_tf_check: false,
        mean_reversion_check: false,
        fomo_check: false,
      })
      setDirection('LONG')
      setPair(profile?.default_pair ?? 'GBPUSD')
      setEntryPrice('')
      setLotSize('')
    }
  }, [open, profile?.default_pair])

  // Auto-calculate lot size when entry price changes
  useEffect(() => {
    if (entryPrice && profile) {
      const pipVal = getPipValue(pair)
      const lot = calculateLotSize(profile.account_balance, profile.risk_percentage, 6, pipVal)
      setLotSize(lot.toString())
    }
  }, [entryPrice, pair, profile])

  const allChecked = Object.values(checklist).every(Boolean)

  const entryNum = parseFloat(entryPrice)
  const sl = entryNum ? calculateStopLoss(entryNum, direction) : null
  const tp = entryNum ? calculateTakeProfit(entryNum, direction) : null

  const handleSubmit = async () => {
    if (!sl || !tp || !profile) return
    setLoading(true)

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
      checklist_completed: allChecked,
      checklist_items: checklist,
      status: 'OPEN',
    })

    await refreshTrades()
    setLoading(false)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold text-white">
              {step === 'checklist' ? '✅ Pre-Trade Checklist' : '📊 Trade Invoeren'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {step === 'checklist' ? 'Alle vakjes moeten aangevinkt zijn' : 'Vul de trade details in'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 flex items-center gap-2">
          <div className={cn('flex items-center gap-2 text-sm font-medium', step === 'checklist' ? 'text-emerald-400' : 'text-slate-500')}>
            <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs', step === 'checklist' ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400')}>1</div>
            Checklist
          </div>
          <ChevronRight className="w-4 h-4 text-slate-600" />
          <div className={cn('flex items-center gap-2 text-sm font-medium', step === 'entry' ? 'text-emerald-400' : 'text-slate-500')}>
            <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs', step === 'entry' ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400')}>2</div>
            Trade Entry
          </div>
        </div>

        <div className="px-6 py-4">
          {step === 'checklist' ? (
            <>
              <div className="space-y-3">
                {CHECKLIST_ITEMS.map((item) => (
                  <div
                    key={item.key}
                    className={cn(
                      'border rounded-xl p-4 transition-all cursor-pointer',
                      checklist[item.key]
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    )}
                    onClick={() => setChecklist(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 border-2 transition-all',
                        checklist[item.key]
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-slate-600 bg-transparent'
                      )}>
                        {checklist[item.key] && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-sm font-semibold', checklist[item.key] ? 'text-emerald-400' : 'text-white')}>
                            {item.label}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setTooltip(tooltip === item.key ? null : item.key)
                            }}
                            className="text-slate-500 hover:text-slate-300"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{item.description}</p>
                        {tooltip === item.key && (
                          <div className="mt-2 p-3 bg-slate-700 rounded-lg text-xs text-slate-300 border border-slate-600">
                            {item.tooltip}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {!allChecked && (
                <div className="mt-4 flex items-center gap-2 text-amber-400 text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  Vink alle {Object.values(checklist).filter(Boolean).length}/{CHECKLIST_ITEMS.length} items aan om door te gaan
                </div>
              )}

              <button
                onClick={() => setStep('entry')}
                disabled={!allChecked}
                className="mt-4 w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Doorgaan naar Trade Entry →
              </button>
            </>
          ) : (
            <>
              {/* Direction toggle */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">Richting</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setDirection('LONG')}
                    className={cn(
                      'py-3 rounded-xl font-bold text-base transition-all border-2',
                      direction === 'LONG'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    )}
                  >
                    📈 LONG / BUY
                  </button>
                  <button
                    onClick={() => setDirection('SHORT')}
                    className={cn(
                      'py-3 rounded-xl font-bold text-base transition-all border-2',
                      direction === 'SHORT'
                        ? 'bg-red-500/20 border-red-500 text-red-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'
                    )}
                  >
                    📉 SHORT / SELL
                  </button>
                </div>
              </div>

              {/* Pair */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">Currency Pair</label>
                <select
                  value={pair}
                  onChange={e => setPair(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                >
                  {PAIRS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Entry price */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Entry Prijs
                  <span className="text-slate-500 font-normal ml-2">(voer handmatig in van cTrader)</span>
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

              {/* Auto-calculated values */}
              {entryNum > 0 && (
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                    <div className="text-xs text-slate-400 mb-1">Stop Loss (6 pips)</div>
                    <div className="text-red-400 font-bold">{sl?.toFixed(5)}</div>
                  </div>
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                    <div className="text-xs text-slate-400 mb-1">Take Profit (12 pips)</div>
                    <div className="text-emerald-400 font-bold">{tp?.toFixed(5)}</div>
                  </div>
                </div>
              )}

              {/* Lot size */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Lot Size
                  <span className="text-slate-500 font-normal ml-2">(automatisch berekend, aanpasbaar)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={lotSize}
                  onChange={e => setLotSize(e.target.value)}
                  placeholder="bijv. 0.50"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                {profile && (
                  <p className="text-xs text-slate-500 mt-1">
                    Risico: {profile.risk_percentage}% van €{profile.account_balance.toLocaleString()} = €{((profile.account_balance * profile.risk_percentage) / 100).toFixed(2)}
                  </p>
                )}
              </div>

              {/* R:R info */}
              <div className="mb-4 bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-sm text-slate-400">
                <span className="text-white font-medium">Risico/Rendement: 1:2</span>
                {' · '}SL = 6 pips · TP = 12 pips
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('checklist')}
                  className="px-4 py-3 bg-slate-800 border border-slate-700 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors"
                >
                  ← Terug
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!entryPrice || !lotSize || loading}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
                >
                  {loading ? 'Opslaan...' : '✅ Trade Openen'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
