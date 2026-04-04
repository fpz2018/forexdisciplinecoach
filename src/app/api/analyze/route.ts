import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.TWELVEDATA_API_KEY!
const BASE_URL = 'https://api.twelvedata.com'

// Convert GBPUSD → GBP/USD
function toApiSymbol(pair: string): string {
  return pair.slice(0, 3) + '/' + pair.slice(3)
}

// Pip value per pair (JPY pairs use 100 multiplier)
function pipMultiplier(pair: string): number {
  return pair.toUpperCase().includes('JPY') ? 100 : 10000
}

interface Candle {
  datetime: string
  open: number
  high: number
  low: number
  close: number
}

async function fetchCandles(symbol: string, interval: string, count: number): Promise<Candle[]> {
  const url = `${BASE_URL}/time_series?symbol=${symbol}&interval=${interval}&outputsize=${count}&apikey=${API_KEY}&format=JSON`
  const res = await fetch(url, { next: { revalidate: 60 } })
  const data = await res.json()
  if (data.status === 'error' || !data.values) throw new Error(data.message ?? 'API error')
  return data.values.map((v: Record<string, string>) => ({
    datetime: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
  }))
}

function calcEMA(candles: Candle[], period: number): number {
  // candles: most recent first → reverse for calculation
  const closes = [...candles].reverse().map(c => c.close)
  const multiplier = 2 / (period + 1)
  let ema = closes[0]
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * multiplier + ema * (1 - multiplier)
  }
  return ema
}

function calcDonchian(candles: Candle[], period: number) {
  const recent = candles.slice(0, period) // most recent N, index 0 = latest
  const upper = Math.max(...recent.map(c => c.high))
  const lower = Math.min(...recent.map(c => c.low))
  const middle = (upper + lower) / 2
  return { upper, lower, middle }
}

export interface CriterionResult {
  key: string
  label: string
  pass: boolean
  weight: number
  value: string
  reason: string
}

export interface AnalysisResult {
  score: number
  recommendation: 'WEL_DOEN' | 'NIET_DOEN' | 'TWIJFEL'
  criteria: CriterionResult[]
  snapshot: Record<string, number | boolean>
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      pair,
      direction,
      entryPrice,
      fomoThreshold = 10,
      criteria: userCriteria = [], // [{key, weight, enabled}]
      threshold = 60,
    } = body

    const symbol = toApiSymbol(pair)
    const pipMul = pipMultiplier(pair)

    // Fetch candles in parallel: 5min (50), 30min (35), 4H (20)
    const [candles5m, candles30m, candles4h] = await Promise.all([
      fetchCandles(symbol, '5min', 50),
      fetchCandles(symbol, '30min', 35),
      fetchCandles(symbol, '4h', 20),
    ])

    // Indicator calculations
    const ema11_5m = calcEMA(candles5m, 11)
    const ema25_5m = calcEMA(candles5m, 25)
    const ema11_30m = calcEMA(candles30m, 11)
    const ema25_30m = calcEMA(candles30m, 25)
    const ema11_4h = calcEMA(candles4h, 11)
    const ema25_4h = calcEMA(candles4h, 25)
    const donchian = calcDonchian(candles5m, 9)

    const lastCandle = candles5m[0]
    const prevCandle = candles5m[1]
    const currentPrice = lastCandle.close
    const recentMovePips = Math.abs(currentPrice - prevCandle.close) * pipMul
    const emaDiffPips = Math.abs(ema11_5m - ema25_5m) * pipMul
    const channelWidthPips = (donchian.upper - donchian.lower) * pipMul
    const positionInChannel = channelWidthPips > 0
      ? ((currentPrice - donchian.lower) / (donchian.upper - donchian.lower)) * 100
      : 50

    const isLong = direction === 'LONG'

    // Build default criteria results
    const defaultCriteria: CriterionResult[] = [
      {
        key: 'ema_trend_5m',
        label: 'EMA Trend (5min)',
        pass: isLong ? ema11_5m > ema25_5m : ema11_5m < ema25_5m,
        weight: 15,
        value: `EMA11: ${ema11_5m.toFixed(5)} | EMA25: ${ema25_5m.toFixed(5)}`,
        reason: isLong
          ? ema11_5m > ema25_5m ? 'Snelle EMA boven langzame EMA op 5min ✓' : 'Snelle EMA ONDER langzame EMA — tegenstroom'
          : ema11_5m < ema25_5m ? 'Snelle EMA onder langzame EMA op 5min ✓' : 'Snelle EMA BOVEN langzame EMA — tegenstroom',
      },
      {
        key: 'ema_trend_30m',
        label: 'Hoofdtrend (30min)',
        pass: isLong ? ema11_30m > ema25_30m : ema11_30m < ema25_30m,
        weight: 25,
        value: `EMA11: ${ema11_30m.toFixed(5)} | EMA25: ${ema25_30m.toFixed(5)}`,
        reason: isLong
          ? ema11_30m > ema25_30m ? 'Trend op 30min is opwaarts ✓' : 'Trend op 30min is NEERWAARTS — handelen tegen de trend'
          : ema11_30m < ema25_30m ? 'Trend op 30min is neerwaarts ✓' : 'Trend op 30min is OPWAARTS — handelen tegen de trend',
      },
      {
        key: 'ema_trend_4h',
        label: 'Hogere Timeframe (4H)',
        pass: isLong ? ema11_4h > ema25_4h : ema11_4h < ema25_4h,
        weight: 20,
        value: `EMA11: ${ema11_4h.toFixed(5)} | EMA25: ${ema25_4h.toFixed(5)}`,
        reason: isLong
          ? ema11_4h > ema25_4h ? '4H trend bevestigt richting ✓' : '4H trend CONFLICTEERT met richting'
          : ema11_4h < ema25_4h ? '4H trend bevestigt richting ✓' : '4H trend CONFLICTEERT met richting',
      },
      {
        key: 'donchian_position',
        label: 'Donchian Positie',
        pass: isLong ? positionInChannel <= 40 : positionInChannel >= 60,
        weight: 20,
        value: `Positie: ${positionInChannel.toFixed(0)}% | Kanaal: ${channelWidthPips.toFixed(1)} pips`,
        reason: isLong
          ? positionInChannel <= 40
            ? `Prijs in onderste ${positionInChannel.toFixed(0)}% van kanaal — gunstige entry ✓`
            : `Prijs te hoog in kanaal (${positionInChannel.toFixed(0)}%) — wacht op terugval`
          : positionInChannel >= 60
            ? `Prijs in bovenste ${(100 - positionInChannel).toFixed(0)}% van kanaal ✓`
            : `Prijs te laag in kanaal (${positionInChannel.toFixed(0)}%) — wacht op stijging`,
      },
      {
        key: 'mean_reversion',
        label: 'Mean Reversion Check',
        pass: emaDiffPips < 15,
        weight: 10,
        value: `EMA spread: ${emaDiffPips.toFixed(1)} pips`,
        reason: emaDiffPips < 15
          ? `EMA spread ${emaDiffPips.toFixed(1)} pips — markt niet overstretched ✓`
          : `EMA spread ${emaDiffPips.toFixed(1)} pips — markt overstretched, risico op correctie`,
      },
      {
        key: 'fomo_check',
        label: 'FOMO Check',
        pass: recentMovePips <= fomoThreshold,
        weight: 10,
        value: `Beweging laatste candle: ${recentMovePips.toFixed(1)} pips`,
        reason: recentMovePips <= fomoThreshold
          ? `Beweging ${recentMovePips.toFixed(1)} pips — geen FOMO situatie ✓`
          : `Beweging ${recentMovePips.toFixed(1)} pips — prijs is al hard bewogen, wacht op pull-back`,
      },
    ]

    // Apply user-customized weights and enabled state
    type UserCriterion = { key: string; weight: number; enabled: boolean }
    const criteriaMap = new Map<string, UserCriterion>(
      (userCriteria as UserCriterion[]).map(c => [c.key, c])
    )
    const finalCriteria = defaultCriteria.map(c => {
      const custom = criteriaMap.get(c.key)
      return {
        ...c,
        weight: custom?.weight ?? c.weight,
        pass: custom?.enabled === false ? false : c.pass,
        reason: custom?.enabled === false ? '(uitgeschakeld)' : c.reason,
      }
    })

    // Weighted score
    const totalWeight = finalCriteria
      .filter(c => c.pass !== false || true) // all criteria
      .reduce((sum, c) => sum + c.weight, 0)

    const earnedWeight = finalCriteria
      .filter(c => c.pass)
      .reduce((sum, c) => sum + c.weight, 0)

    const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0

    let recommendation: AnalysisResult['recommendation']
    if (score >= threshold) recommendation = 'WEL_DOEN'
    else if (score >= threshold - 15) recommendation = 'TWIJFEL'
    else recommendation = 'NIET_DOEN'

    // Snapshot for learning
    const snapshot: Record<string, number | boolean> = {
      ema11_5m, ema25_5m, ema11_30m, ema25_30m, ema11_4h, ema25_4h,
      donchian_upper: donchian.upper,
      donchian_lower: donchian.lower,
      donchian_position: positionInChannel,
      ema_diff_pips: emaDiffPips,
      recent_move_pips: recentMovePips,
      score,
      ...Object.fromEntries(finalCriteria.map(c => [`criteria_${c.key}`, c.pass])),
    }

    return NextResponse.json({ score, recommendation, criteria: finalCriteria, snapshot })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analyse mislukt'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
