'use client'

import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

interface TradingViewWidgetProps {
  symbol?: string
  interval?: string
}

export default function TradingViewWidget({
  symbol = 'GBPUSD',
  interval = '5',
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.innerHTML = ''

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `FX:${symbol}`,
      interval,
      timezone: 'Europe/Amsterdam',
      theme: 'dark',
      style: '1',
      locale: 'nl_NL',
      backgroundColor: '#0f172a',
      gridColor: 'rgba(51, 65, 85, 0.5)',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      calendar: false,
      allow_symbol_change: true,
    })

    containerRef.current.appendChild(script)
  }, [symbol, interval])

  return (
    <div className={expanded ? 'fixed inset-0 z-30 bg-slate-950 flex flex-col' : 'relative'}>
      {/* Toolbar */}
      <div className={`flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900 ${expanded ? '' : 'rounded-t-none'}`}>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-white">{symbol}</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400">{interval === '5' ? '5 min' : interval}</span>
          <span className="hidden sm:inline text-xs text-slate-600 ml-2">
            💡 Indicatoren instellen via TradingView.com → worden onthouden
          </span>
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          title={expanded ? 'Verkleinen' : 'Volledig scherm'}
        >
          {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      <div
        className="tradingview-widget-container flex-1"
        ref={containerRef}
        style={{
          height: expanded ? '100%' : undefined,
          minHeight: expanded ? undefined : 'clamp(340px, 55vw, 680px)',
          width: '100%',
        }}
      >
        <div style={{ height: '100%', width: '100%', minHeight: 'inherit' }} />
        <div className="tradingview-widget-copyright hidden" />
      </div>
    </div>
  )
}
