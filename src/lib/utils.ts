import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatPips(pips: number): string {
  const sign = pips > 0 ? '+' : ''
  return `${sign}${pips.toFixed(1)} pips`
}

export function calculateStopLoss(entryPrice: number, direction: 'LONG' | 'SHORT', pips = 6): number {
  const pipValue = 0.0001
  if (direction === 'LONG') {
    return parseFloat((entryPrice - pips * pipValue).toFixed(5))
  }
  return parseFloat((entryPrice + pips * pipValue).toFixed(5))
}

export function calculateTakeProfit(entryPrice: number, direction: 'LONG' | 'SHORT', pips = 12): number {
  const pipValue = 0.0001
  if (direction === 'LONG') {
    return parseFloat((entryPrice + pips * pipValue).toFixed(5))
  }
  return parseFloat((entryPrice - pips * pipValue).toFixed(5))
}

export function calculateLotSize(
  accountBalance: number,
  riskPercentage: number,
  stopLossPips: number,
  pipValuePerLot = 10 // EUR/USD standard lot pip value in USD ≈ €10
): number {
  const riskAmount = (accountBalance * riskPercentage) / 100
  const lotSize = riskAmount / (stopLossPips * pipValuePerLot)
  return parseFloat(lotSize.toFixed(2))
}

export function getPipValue(pair: string): number {
  // Simplified pip values per standard lot in EUR
  const pipValues: Record<string, number> = {
    GBPUSD: 10,
    EURUSD: 10,
    GBPJPY: 8,
    EURJPY: 8,
    USDJPY: 7,
    AUDUSD: 10,
    NZDUSD: 10,
    USDCAD: 8,
    USDCHF: 9,
    EURGBP: 12,
  }
  return pipValues[pair] ?? 10
}

export function isTradingDay(tradingDays: number[], blockedDates: string[]): boolean {
  const now = new Date()
  // JS: 0=Sun,1=Mon,...,6=Sat → we use same convention
  if (!tradingDays.includes(now.getDay())) return false
  const todayStr = now.toISOString().split('T')[0]
  if (blockedDates.includes(todayStr)) return false
  return true
}

export function getTradingDayBlockReason(tradingDays: number[], blockedDates: string[]): string | null {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  if (blockedDates.includes(todayStr)) return 'Feestdag / geblokkeerde dag'
  if (!tradingDays.includes(now.getDay())) {
    const dayNames = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']
    return `Geen trading op ${dayNames[now.getDay()]}`
  }
  return null
}

export function isInTradingWindow(windows: Array<{ start_time: string; end_time: string; active: boolean }>): boolean {
  const now = new Date()
  const currentTime = now.getHours() * 60 + now.getMinutes()

  return windows.some(window => {
    if (!window.active) return false
    const [startH, startM] = window.start_time.split(':').map(Number)
    const [endH, endM] = window.end_time.split(':').map(Number)
    const startMinutes = startH * 60 + startM
    const endMinutes = endH * 60 + endM
    return currentTime >= startMinutes && currentTime < endMinutes
  })
}

export function getNextTradingWindow(windows: Array<{ start_time: string; end_time: string; active: boolean }>): string {
  const now = new Date()
  const currentTime = now.getHours() * 60 + now.getMinutes()

  const activeWindows = windows.filter(w => w.active)
  if (activeWindows.length === 0) return 'Geen trading windows ingesteld'

  const futureWindows = activeWindows
    .map(w => {
      const [h, m] = w.start_time.split(':').map(Number)
      const minutes = h * 60 + m
      return { ...w, minutes }
    })
    .filter(w => w.minutes > currentTime)
    .sort((a, b) => a.minutes - b.minutes)

  if (futureWindows.length === 0) {
    const tomorrow = activeWindows
      .map(w => {
        const [h, m] = w.start_time.split(':').map(Number)
        return { ...w, minutes: h * 60 + m }
      })
      .sort((a, b) => a.minutes - b.minutes)
    return `Morgen ${tomorrow[0].start_time}`
  }

  return futureWindows[0].start_time
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
}
