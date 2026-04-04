'use client'

import { useEffect, useRef } from 'react'

interface TradingViewWidgetProps {
  symbol?: string
  interval?: string
  height?: number
}

export default function TradingViewWidget({
  symbol = 'GBPUSD',
  interval = '5',
  height = 500,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Clear previous widget
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
      studies: [
        'MAExp@tv-basicstudies',
        'MAExp@tv-basicstudies',
        'DonchianChannels@tv-basicstudies',
      ],
      container_id: 'tradingview_chart',
    })

    containerRef.current.appendChild(script)
  }, [symbol, interval])

  return (
    <div
      className="tradingview-widget-container"
      ref={containerRef}
      style={{ height, width: '100%' }}
    >
      <div
        id="tradingview_chart"
        style={{ height: '100%', width: '100%' }}
      />
      <div className="tradingview-widget-copyright hidden" />
    </div>
  )
}
