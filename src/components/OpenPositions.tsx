'use client'

import { useState } from 'react'
import { useApp } from '@/lib/context/AppContext'
import { createClient } from '@/lib/supabase/client'
import { formatDate, cn } from '@/lib/utils'
import { learnFromTrade } from '@/lib/learning'
import { X, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import type { Trade } from '@/lib/supabase/types'

export default function OpenPositions() {
  const { openTrades, refreshTrades } = useApp()
  const [closingTrade, setClosingTrade] = useState<Trade | null>(null)
  const supabase = createClient()

  if (openTrades.length === 0) return null

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl">
      <div className="px-6 py-4 border-b border-slate-800">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          Open Posities ({openTrades.length})
        </h2>
      </div>
      <div className="divide-y divide-slate-800">
        {openTrades.map(trade => (
          <TradeRow
            key={trade.id}
            trade={trade}
            onClose={() => setClosingTrade(trade)}
          />
        ))}
      </div>

      {closingTrade && (
        <CloseTradeModal
          trade={closingTrade}
          onClose={() => setClosingTrade(null)}
          onConfirm={async (closePrice, reason) => {
            const entryPrice = closingTrade.entry_price
            const pipMultiplier = closingTrade.pair.includes('JPY') ? 100 : 10000
            const priceDiff = closingTrade.direction === 'LONG'
              ? closePrice - entryPrice
              : entryPrice - closePrice
            const resultPips = parseFloat((priceDiff * pipMultiplier).toFixed(1))
            const resultMoney = parseFloat((resultPips * closingTrade.lot_size * 10).toFixed(2))

            await supabase.from('trades').update({
              status: 'CLOSED',
              close_price: closePrice,
              close_reason: reason,
              result_pips: resultPips,
              result_money: resultMoney,
              closed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', closingTrade.id)

            // Self-learning: adjust criteria weights based on outcome
            const { data: { user } } = await supabase.auth.getUser()
            if (user && closingTrade.indicator_snapshot) {
              const snapshot = closingTrade.indicator_snapshot as Record<string, number | boolean>
              await learnFromTrade(user.id, snapshot, resultPips > 0)
            }

            await refreshTrades()
            setClosingTrade(null)
          }}
        />
      )}
    </div>
  )
}

function TradeRow({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const isLong = trade.direction === 'LONG'

  return (
    <div className="px-6 py-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center',
          isLong ? 'bg-emerald-500/20' : 'bg-red-500/20'
        )}>
          {isLong
            ? <TrendingUp className="w-5 h-5 text-emerald-400" />
            : <TrendingDown className="w-5 h-5 text-red-400" />
          }
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white text-sm">{trade.pair}</span>
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded font-bold',
              isLong ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
            )}>
              {trade.direction}
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{formatDate(trade.created_at)}</div>
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-6 text-sm">
        <div>
          <div className="text-xs text-slate-500">Entry</div>
          <div className="text-white font-mono">{trade.entry_price.toFixed(5)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">SL</div>
          <div className="text-red-400 font-mono">{trade.stop_loss.toFixed(5)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">TP</div>
          <div className="text-emerald-400 font-mono">{trade.take_profit.toFixed(5)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Lots</div>
          <div className="text-white font-mono">{trade.lot_size}</div>
        </div>
      </div>

      <button
        onClick={onClose}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium transition-colors"
      >
        <X className="w-4 h-4" />
        Sluiten
      </button>
    </div>
  )
}

function CloseTradeModal({
  trade,
  onClose,
  onConfirm,
}: {
  trade: Trade
  onClose: () => void
  onConfirm: (closePrice: number, reason: 'SL' | 'TP' | 'MANUAL') => Promise<void>
}) {
  const [closePrice, setClosePrice] = useState(trade.entry_price.toString())
  const [reason, setReason] = useState<'SL' | 'TP' | 'MANUAL'>('MANUAL')
  const [loading, setLoading] = useState(false)

  const closePriceNum = parseFloat(closePrice)
  const pipMultiplier = trade.pair.includes('JPY') ? 100 : 10000
  const priceDiff = trade.direction === 'LONG'
    ? closePriceNum - trade.entry_price
    : trade.entry_price - closePriceNum
  const estimatedPips = closePriceNum ? parseFloat((priceDiff * pipMultiplier).toFixed(1)) : 0

  const handleClose = async () => {
    setLoading(true)
    await onConfirm(closePriceNum, reason)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-1">Trade Sluiten</h3>
        <p className="text-slate-400 text-sm mb-4">{trade.pair} · {trade.direction} · Entry {trade.entry_price.toFixed(5)}</p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-300 mb-2">Sluit Reden</label>
          <div className="grid grid-cols-3 gap-2">
            {(['SL', 'TP', 'MANUAL'] as const).map(r => (
              <button
                key={r}
                onClick={() => {
                  setReason(r)
                  if (r === 'SL') setClosePrice(trade.stop_loss.toString())
                  if (r === 'TP') setClosePrice(trade.take_profit.toString())
                }}
                className={cn(
                  'py-2 rounded-lg text-sm font-medium border-2 transition-all',
                  reason === r
                    ? r === 'SL' ? 'border-red-500 bg-red-500/20 text-red-400'
                      : r === 'TP' ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                        : 'border-blue-500 bg-blue-500/20 text-blue-400'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                )}
              >
                {r === 'SL' ? '🔴 Stop Loss' : r === 'TP' ? '🟢 Take Profit' : '✋ Handmatig'}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-300 mb-2">Sluitprijs</label>
          <input
            type="number"
            step="0.00001"
            value={closePrice}
            onChange={e => setClosePrice(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        {closePriceNum > 0 && (
          <div className={cn(
            'mb-4 p-3 rounded-lg text-center font-bold',
            estimatedPips >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
          )}>
            {estimatedPips >= 0 ? '+' : ''}{estimatedPips} pips
            {' · '}€{(estimatedPips * trade.lot_size * 10).toFixed(2)}
          </div>
        )}

        {estimatedPips < 0 && (
          <div className="mb-4 flex items-center gap-2 text-amber-400 text-sm">
            <AlertTriangle className="w-4 h-4" />
            Verlies trade: 15 min cooling off periode wordt gestart
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-3 bg-slate-800 border border-slate-700 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors">
            Annuleren
          </button>
          <button
            onClick={handleClose}
            disabled={!closePrice || loading}
            className="flex-1 bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {loading ? 'Sluiten...' : 'Positie Sluiten'}
          </button>
        </div>
      </div>
    </div>
  )
}
