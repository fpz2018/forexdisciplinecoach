'use client'

import { useState, useMemo } from 'react'
import { useApp } from '@/lib/context/AppContext'
import { createClient } from '@/lib/supabase/client'
import { formatDate, cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Download, Search, ChevronDown, ChevronUp, FileText, CheckSquare, Square } from 'lucide-react'
import type { Trade } from '@/lib/supabase/types'

export default function JournalPage() {
  const { trades, refreshTrades } = useApp()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL')
  const [filterResult, setFilterResult] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL')
  const [filterDirection, setFilterDirection] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL')
  const [sortField, setSortField] = useState<'date' | 'pips' | 'money'>('date')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const supabase = createClient()

  const filtered = useMemo(() => {
    let result = [...trades]

    if (search) {
      result = result.filter(t =>
        t.pair.toLowerCase().includes(search.toLowerCase())
      )
    }
    if (filterStatus !== 'ALL') {
      result = result.filter(t => t.status === filterStatus)
    }
    if (filterResult !== 'ALL') {
      result = result.filter(t => {
        if (filterResult === 'WIN') return (t.result_pips ?? 0) > 0
        return (t.result_pips ?? 0) <= 0 && t.status === 'CLOSED'
      })
    }
    if (filterDirection !== 'ALL') {
      result = result.filter(t => t.direction === filterDirection)
    }

    result.sort((a, b) => {
      let diff = 0
      if (sortField === 'date') diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sortField === 'pips') diff = (b.result_pips ?? 0) - (a.result_pips ?? 0)
      if (sortField === 'money') diff = (b.result_money ?? 0) - (a.result_money ?? 0)
      return sortDir === 'desc' ? diff : -diff
    })

    return result
  }, [trades, search, filterStatus, filterResult, filterDirection, sortField, sortDir])

  const exportCSV = () => {
    const headers = ['Datum', 'Pair', 'Richting', 'Entry', 'SL', 'TP', 'Lots', 'Status', 'Sluitprijs', 'Pips', 'Geld', 'Reden', 'Notities']
    const rows = filtered.map(t => [
      formatDate(t.created_at),
      t.pair,
      t.direction,
      t.entry_price,
      t.stop_loss,
      t.take_profit,
      t.lot_size,
      t.status,
      t.close_price ?? '',
      t.result_pips ?? '',
      t.result_money ?? '',
      t.close_reason ?? '',
      (t.notes ?? '').replace(/,/g, ';'),
    ])

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `forex-journal-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSaveNote = async () => {
    if (!selectedTrade) return
    setSavingNote(true)
    await supabase.from('trades').update({ notes: noteText }).eq('id', selectedTrade.id)
    await refreshTrades()
    setSavingNote(false)
    setSelectedTrade(null)
  }

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />
    return sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
  }

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortField(field); setSortDir('desc') }
  }

  const openNote = (trade: Trade) => {
    setSelectedTrade(trade)
    setNoteText(trade.notes ?? '')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trade Journal</h1>
          <p className="text-slate-400 text-sm mt-1">{trades.length} trades totaal</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg text-sm transition-colors min-h-[44px]"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Export CSV</span>
          <span className="sm:hidden">CSV</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-32">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Zoek pair..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <FilterSelect value={filterStatus} onChange={v => setFilterStatus(v as typeof filterStatus)} options={[
          { value: 'ALL', label: 'Alle' },
          { value: 'OPEN', label: 'Open' },
          { value: 'CLOSED', label: 'Gesloten' },
        ]} />

        <FilterSelect value={filterResult} onChange={v => setFilterResult(v as typeof filterResult)} options={[
          { value: 'ALL', label: 'W+V' },
          { value: 'WIN', label: 'Winst' },
          { value: 'LOSS', label: 'Verlies' },
        ]} />

        <FilterSelect value={filterDirection} onChange={v => setFilterDirection(v as typeof filterDirection)} options={[
          { value: 'ALL', label: 'L+S' },
          { value: 'LONG', label: 'LONG' },
          { value: 'SHORT', label: 'SHORT' },
        ]} />
      </div>

      {/* Mobile Card List */}
      <div className="sm:hidden space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
            Geen trades gevonden
          </div>
        ) : (
          filtered.map(trade => (
            <div key={trade.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'flex items-center gap-1 text-sm font-bold',
                    trade.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'
                  )}>
                    {trade.direction === 'LONG'
                      ? <TrendingUp className="w-4 h-4" />
                      : <TrendingDown className="w-4 h-4" />
                    }
                    {trade.direction}
                  </span>
                  <span className="font-semibold text-white">{trade.pair}</span>
                </div>
                <div className="flex items-center gap-2">
                  {trade.result_pips != null ? (
                    <span className={cn(
                      'text-sm font-bold',
                      trade.result_pips > 0 ? 'text-emerald-400' : 'text-red-400'
                    )}>
                      {trade.result_pips > 0 ? '+' : ''}{trade.result_pips} pips
                    </span>
                  ) : (
                    <span className={cn(
                      'text-xs px-2 py-1 rounded-full font-medium',
                      trade.status === 'OPEN' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700 text-slate-400'
                    )}>
                      {trade.status}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{formatDate(trade.created_at)}</span>
                <div className="flex items-center gap-3">
                  {trade.checklist_completed
                    ? <CheckSquare className="w-4 h-4 text-emerald-400" />
                    : <Square className="w-4 h-4 text-slate-600" />
                  }
                  <button
                    onClick={() => openNote(trade)}
                    className="flex items-center gap-1 text-slate-400 active:text-white py-1"
                  >
                    <FileText className="w-4 h-4" />
                    {trade.notes ? 'Notitie' : 'Voeg toe'}
                  </button>
                </div>
              </div>

              {trade.result_pips != null && trade.status === 'CLOSED' && (
                <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
                  <span>Entry: <span className="font-mono text-slate-400">{trade.entry_price.toFixed(5)}</span></span>
                  <span>Sluit: <span className="font-mono text-slate-400">{trade.close_price?.toFixed(5) ?? '-'}</span></span>
                  {trade.result_money != null && (
                    <span className={trade.result_money >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {trade.result_money >= 0 ? '+' : ''}€{trade.result_money.toFixed(2)}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-white">
                    Datum <SortIcon field="date" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Pair</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Richting</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Entry</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  <button onClick={() => toggleSort('pips')} className="flex items-center gap-1 hover:text-white">
                    Pips <SortIcon field="pips" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Checklist</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Notities</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-500">
                    Geen trades gevonden
                  </td>
                </tr>
              ) : (
                filtered.map(trade => (
                  <tr key={trade.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">
                      {formatDate(trade.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{trade.pair}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'flex items-center gap-1 text-xs font-bold',
                        trade.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'
                      )}>
                        {trade.direction === 'LONG'
                          ? <TrendingUp className="w-3 h-3" />
                          : <TrendingDown className="w-3 h-3" />
                        }
                        {trade.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">{trade.entry_price.toFixed(5)}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'text-xs px-2 py-1 rounded-full font-medium',
                        trade.status === 'OPEN' ? 'bg-blue-500/20 text-blue-400' :
                          trade.status === 'CLOSED' ? 'bg-slate-700 text-slate-300' :
                            'bg-slate-700 text-slate-500'
                      )}>
                        {trade.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {trade.result_pips != null ? (
                        <span className={cn(
                          'font-bold',
                          trade.result_pips > 0 ? 'text-emerald-400' : 'text-red-400'
                        )}>
                          {trade.result_pips > 0 ? '+' : ''}{trade.result_pips}
                        </span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {trade.checklist_completed
                        ? <CheckSquare className="w-4 h-4 text-emerald-400" />
                        : <Square className="w-4 h-4 text-slate-600" />
                      }
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => openNote(trade)}
                        className="flex items-center gap-1 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                      >
                        <FileText className="w-3 h-3" />
                        {trade.notes ? 'Bekijk' : 'Voeg toe'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Note Modal — bottom sheet on mobile */}
      {selectedTrade && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTrade(null)} />
          <div className="relative bg-slate-900 border-t border-slate-800 sm:border sm:rounded-2xl rounded-t-2xl w-full sm:max-w-md shadow-2xl p-6 pb-8 sm:pb-6">
            <div className="sm:hidden flex justify-center mb-4">
              <div className="w-10 h-1 bg-slate-600 rounded-full" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Notitie</h3>
            <p className="text-slate-400 text-sm mb-4">
              {selectedTrade.pair} · {selectedTrade.direction} · {formatDate(selectedTrade.created_at)}
            </p>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              rows={5}
              placeholder="Wat heb je geleerd van deze trade? Wat ging goed/fout?"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setSelectedTrade(null)}
                className="px-4 py-3 bg-slate-800 border border-slate-700 text-slate-300 rounded-xl hover:bg-slate-700 transition-colors text-sm min-h-[48px]"
              >
                Annuleren
              </button>
              <button
                onClick={handleSaveNote}
                disabled={savingNote}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors text-sm min-h-[48px]"
              >
                {savingNote ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterSelect({
  value, onChange, options
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500 min-h-[44px]"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
