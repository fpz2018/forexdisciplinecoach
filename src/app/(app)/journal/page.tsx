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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trade Journal</h1>
          <p className="text-slate-400 text-sm mt-1">{trades.length} trades totaal</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg text-sm transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Zoek op pair..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <FilterSelect value={filterStatus} onChange={v => setFilterStatus(v as typeof filterStatus)} options={[
          { value: 'ALL', label: 'Alle statussen' },
          { value: 'OPEN', label: 'Open' },
          { value: 'CLOSED', label: 'Gesloten' },
        ]} />

        <FilterSelect value={filterResult} onChange={v => setFilterResult(v as typeof filterResult)} options={[
          { value: 'ALL', label: 'Win & Verlies' },
          { value: 'WIN', label: 'Alleen winst' },
          { value: 'LOSS', label: 'Alleen verlies' },
        ]} />

        <FilterSelect value={filterDirection} onChange={v => setFilterDirection(v as typeof filterDirection)} options={[
          { value: 'ALL', label: 'LONG & SHORT' },
          { value: 'LONG', label: 'Alleen LONG' },
          { value: 'SHORT', label: 'Alleen SHORT' },
        ]} />
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
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
                        onClick={() => {
                          setSelectedTrade(trade)
                          setNoteText(trade.notes ?? '')
                        }}
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

      {/* Note Modal */}
      {selectedTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTrade(null)} />
          <div className="relative bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl p-6">
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
              <button onClick={() => setSelectedTrade(null)} className="px-4 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-700 transition-colors text-sm">
                Annuleren
              </button>
              <button
                onClick={handleSaveNote}
                disabled={savingNote}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
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
      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-emerald-500"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
