import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.TWELVEDATA_API_KEY!
const BASE_URL = 'https://api.twelvedata.com'

function toApiSymbol(pair: string): string {
  return pair.slice(0, 3) + '/' + pair.slice(3)
}

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

// ── Higher-TF configuration ────────────────────────────────────────────────
// Twelve Data interval names + cache lifetime + how many candles to request
type IntervalKey = '5min' | '30min' | '1h' | '4h' | '8h' | '1day' | '1week' | '1month'

const INTERVALS: Record<IntervalKey, { revalidate: number; outputsize: number; label: string }> = {
  '5min':   { revalidate: 60,    outputsize: 50, label: '5m'      },
  '30min':  { revalidate: 300,   outputsize: 30, label: '30m'     },
  '1h':     { revalidate: 600,   outputsize: 30, label: '1H'      },
  '4h':     { revalidate: 1800,  outputsize: 30, label: '4H'      },
  '8h':     { revalidate: 3600,  outputsize: 30, label: '8H'      },
  '1day':   { revalidate: 3600,  outputsize: 30, label: 'Daily'   },
  '1week':  { revalidate: 14400, outputsize: 30, label: 'Weekly'  },
  '1month': { revalidate: 14400, outputsize: 30, label: 'Monthly' },
}

async function fetchCandles(symbol: string, interval: IntervalKey): Promise<Candle[]> {
  const cfg = INTERVALS[interval]
  const url = `${BASE_URL}/time_series?symbol=${symbol}&interval=${interval}&outputsize=${cfg.outputsize}&apikey=${API_KEY}&format=JSON`
  const res = await fetch(url, { next: { revalidate: cfg.revalidate } })
  const data = await res.json()
  if (data.status === 'error' || !data.values) {
    throw new Error(data.message ?? `Geen data voor ${symbol} ${interval}`)
  }
  return data.values.map((v: Record<string, string>) => ({
    datetime: v.datetime,
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
  }))
}

/**
 * Twelve Data returns candles newest-first. The first candle (index 0) is the
 * still-forming "current" candle if you query during market hours. For trend
 * analysis we only want CLOSED candles, so we drop the first one.
 */
function closedOnly(candles: Candle[]): Candle[] {
  return candles.slice(1)
}

function calcEMA(candles: Candle[], period: number): number {
  // Twelve Data is newest-first; reverse so oldest comes first for EMA seeding.
  const closes = [...candles].reverse().map((c) => c.close)
  if (closes.length === 0) return 0
  const multiplier = 2 / (period + 1)
  let ema = closes[0]
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * multiplier + ema * (1 - multiplier)
  }
  return ema
}

function calcDonchian(candles: Candle[], period: number) {
  const recent = candles.slice(0, period)
  const upper = Math.max(...recent.map((c) => c.high))
  const lower = Math.min(...recent.map((c) => c.low))
  return { upper, lower, middle: (upper + lower) / 2 }
}

function calcBollinger(candles: Candle[], period = 20, mult = 2) {
  const recent = candles.slice(0, period)
  if (recent.length < period) return null
  const closes = recent.map((c) => c.close)
  const mean = closes.reduce((a, b) => a + b, 0) / period
  const variance = closes.reduce((s, c) => s + (c - mean) ** 2, 0) / period
  const sd = Math.sqrt(variance)
  return { upper: mean + mult * sd, lower: mean - mult * sd, middle: mean }
}

/**
 * Generate psycho-numbers (00/25/50/75 on the last two decimals) between two
 * price levels. Step = 0.0025 for 4-decimal pairs, 0.25 for JPY pairs.
 */
function psychoNumbersBetween(low: number, high: number, pipMul: number): number[] {
  const isJpy = pipMul === 100
  const step = isJpy ? 0.25 : 0.0025
  const decimals = isJpy ? 2 : 4
  const out: number[] = []
  const start = Math.ceil(low / step) * step
  for (let p = start; p <= high + step / 2; p += step) {
    out.push(parseFloat(p.toFixed(decimals + 1)))
  }
  return out
}

type TfStatus = 'neutral' | 'outside_bb' | 'traveling_to_target' | 'job_done' | 'breaking_through'

export interface MagnetTarget {
  type: 'ema11' | 'ema25' | 'psycho' | 'bb_band'
  level: number
  label: string
}

interface TfStateOutput {
  status: TfStatus
  setupDirection: 'LONG' | 'SHORT' | null
  primaryTarget: MagnetTarget | null
  secondaryTarget: MagnetTarget | null
  distanceToTargetPips: number | null
  bbUpper: number | null
  bbLower: number | null
}

function determineTfState(
  closedCandles: Candle[],
  ema11: number,
  ema25: number,
  pipMul: number
): TfStateOutput {
  const bb = calcBollinger(closedCandles, 20, 2)
  if (!bb || closedCandles.length === 0) {
    return {
      status: 'neutral',
      setupDirection: null,
      primaryTarget: null,
      secondaryTarget: null,
      distanceToTargetPips: null,
      bbUpper: null,
      bbLower: null,
    }
  }

  const currentPrice = closedCandles[0].close
  const decimals = pipMul === 100 ? 3 : 5

  // Find trigger: most recent close outside BB in last 5 closed candles
  let triggerIdx = -1
  let direction: 'LONG' | 'SHORT' | null = null
  for (let i = 0; i < Math.min(5, closedCandles.length); i++) {
    const close = closedCandles[i].close
    if (close > bb.upper) {
      triggerIdx = i
      direction = 'SHORT'
      break
    }
    if (close < bb.lower) {
      triggerIdx = i
      direction = 'LONG'
      break
    }
  }

  if (triggerIdx === -1 || direction === null) {
    return {
      status: 'neutral',
      setupDirection: null,
      primaryTarget: null,
      secondaryTarget: null,
      distanceToTargetPips: null,
      bbUpper: bb.upper,
      bbLower: bb.lower,
    }
  }

  const triggerClose = closedCandles[triggerIdx].close

  // Build candidate magnets in mean-reversion direction
  const candidates: MagnetTarget[] = []
  const labelPrice = (p: number) => p.toFixed(pipMul === 100 ? 2 : 4)

  if (direction === 'SHORT') {
    if (ema11 < triggerClose) candidates.push({ type: 'ema11', level: ema11, label: 'EMA11' })
    if (ema25 < triggerClose) candidates.push({ type: 'ema25', level: ema25, label: 'EMA25' })
    const lowerBound = Math.min(ema11, ema25, currentPrice) - (pipMul === 100 ? 0.5 : 0.005)
    for (const p of psychoNumbersBetween(lowerBound, triggerClose, pipMul)) {
      if (p < triggerClose) candidates.push({ type: 'psycho', level: p, label: labelPrice(p) })
    }
    candidates.sort((a, b) => b.level - a.level) // highest first (nearest to trigger)
  } else {
    if (ema11 > triggerClose) candidates.push({ type: 'ema11', level: ema11, label: 'EMA11' })
    if (ema25 > triggerClose) candidates.push({ type: 'ema25', level: ema25, label: 'EMA25' })
    const upperBound = Math.max(ema11, ema25, currentPrice) + (pipMul === 100 ? 0.5 : 0.005)
    for (const p of psychoNumbersBetween(triggerClose, upperBound, pipMul)) {
      if (p > triggerClose) candidates.push({ type: 'psycho', level: p, label: labelPrice(p) })
    }
    candidates.sort((a, b) => a.level - b.level) // lowest first (nearest to trigger)
  }

  const primary = candidates[0] ?? null

  // Walk candles since trigger. For each magnet determine:
  //   - touched: wick crossed but candle closed back on the original side
  //   - brokenThrough: at least one candle CLOSED past the magnet (mean-rev side)
  // Track the FURTHEST magnet that has been closed past — that becomes the
  // anchor for breaking_through and the new target is the next magnet beyond.
  const isPastMagnet = (close: number, level: number) =>
    direction === 'SHORT' ? close < level : close > level

  let touchedAny = false
  let furthestBrokenLevel: number | null = null

  for (let i = triggerIdx; i >= 0; i--) {
    const c = closedCandles[i]
    for (const m of candidates) {
      const wickCrossed = c.low <= m.level && c.high >= m.level
      const closedPast = isPastMagnet(c.close, m.level)
      if (closedPast) {
        if (furthestBrokenLevel === null) {
          furthestBrokenLevel = m.level
        } else {
          furthestBrokenLevel =
            direction === 'SHORT'
              ? Math.min(furthestBrokenLevel, m.level)
              : Math.max(furthestBrokenLevel, m.level)
        }
      } else if (wickCrossed) {
        touchedAny = true
      }
    }
  }

  let status: TfStatus
  let activePrimary: MagnetTarget | null = primary
  let secondary: MagnetTarget | null = null

  if (furthestBrokenLevel !== null) {
    status = 'breaking_through'
    // Find the next magnet BEYOND the furthest broken level (in mean-rev direction)
    const beyond = candidates.filter((m) =>
      direction === 'SHORT' ? m.level < furthestBrokenLevel! : m.level > furthestBrokenLevel!
    )
    if (beyond.length > 0) {
      activePrimary = beyond[0]
      secondary =
        direction === 'SHORT'
          ? { type: 'bb_band', level: bb.lower, label: `BB lower ${labelPrice(bb.lower)}` }
          : { type: 'bb_band', level: bb.upper, label: `BB upper ${labelPrice(bb.upper)}` }
    } else {
      activePrimary =
        direction === 'SHORT'
          ? { type: 'bb_band', level: bb.lower, label: `BB lower ${labelPrice(bb.lower)}` }
          : { type: 'bb_band', level: bb.upper, label: `BB upper ${labelPrice(bb.upper)}` }
    }
  } else if (touchedAny) {
    status = 'job_done'
  } else if (triggerIdx === 0) {
    status = 'outside_bb'
  } else {
    status = 'traveling_to_target'
  }

  const distancePips = activePrimary
    ? Math.abs(currentPrice - activePrimary.level) * pipMul
    : null

  void decimals
  return {
    status,
    setupDirection: direction,
    primaryTarget: activePrimary,
    secondaryTarget: secondary,
    distanceToTargetPips: distancePips,
    bbUpper: bb.upper,
    bbLower: bb.lower,
  }
}

/**
 * Compute when the next candle of `interval` will close, given the most recent
 * CLOSED candle's datetime (UTC). Twelve Data datetimes are UTC strings like
 * "2026-04-07 09:00:00". The next close is `lastClosed + interval duration`.
 */
const INTERVAL_MS: Record<IntervalKey, number> = {
  '5min':   5 * 60 * 1000,
  '30min':  30 * 60 * 1000,
  '1h':     60 * 60 * 1000,
  '4h':     4 * 60 * 60 * 1000,
  '8h':     8 * 60 * 60 * 1000,
  '1day':   24 * 60 * 60 * 1000,
  '1week':  7 * 24 * 60 * 60 * 1000,
  '1month': 30 * 24 * 60 * 60 * 1000, // approximation, only used for display
}

function nextCloseMs(interval: IntervalKey, lastClosedDatetime: string): number {
  // Twelve Data datetimes are UTC. Append "Z" so JS parses as UTC.
  const lastClosedTs = new Date(lastClosedDatetime.replace(' ', 'T') + 'Z').getTime()
  if (Number.isNaN(lastClosedTs)) return 0
  // The next candle CLOSES one full interval after the previous one closed.
  // i.e. lastClosed already represents the START of the candle that just
  // finished, so the next close is lastClosed + 2 * interval.
  // But Twelve Data's datetime field is the candle OPEN time, so close = open + interval.
  // For the *next* close, we need open + 2*interval.
  return lastClosedTs + 2 * INTERVAL_MS[interval]
}

export interface TimeframeSummary {
  interval: IntervalKey
  label: string
  trend: 'UP' | 'DOWN' | 'FLAT'
  ema11: number
  ema25: number
  lastClosedAt: string
  nextCloseAtMs: number
  secondsUntilClose: number
  status: TfStatus
  setupDirection: 'LONG' | 'SHORT' | null
  primaryTarget: MagnetTarget | null
  secondaryTarget: MagnetTarget | null
  distanceToTargetPips: number | null
  bbUpper: number | null
  bbLower: number | null
}

export interface CriterionResult {
  key: string
  label: string
  pass: boolean
  weight: number
  value: string
  reason: string
  autoGenerated?: boolean
}

export interface AnalysisResult {
  score: number
  recommendation: 'WEL_DOEN' | 'NIET_DOEN' | 'TWIJFEL'
  criteria: CriterionResult[]
  snapshot: Record<string, number | boolean>
  timeframes: TimeframeSummary[]
  error?: string
}

function trendOf(ema11: number, ema25: number, pipMul: number): 'UP' | 'DOWN' | 'FLAT' {
  const diffPips = (ema11 - ema25) * pipMul
  if (Math.abs(diffPips) < 0.5) return 'FLAT'
  return diffPips > 0 ? 'UP' : 'DOWN'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      pair,
      direction,
      entryPrice: _entryPrice,
      fomoThreshold = 10,
      criteria: userCriteria = [],
      threshold = 60,
    } = body

    void _entryPrice

    const symbol = toApiSymbol(pair)
    const pipMul = pipMultiplier(pair)

    // ── Fetch all timeframes in parallel (each with its own cache lifetime) ─
    const [c5m, c30m, c1h, c4h, c8h, c1d, c1w, c1mo] = await Promise.all([
      fetchCandles(symbol, '5min'),
      fetchCandles(symbol, '30min'),
      fetchCandles(symbol, '1h'),
      fetchCandles(symbol, '4h'),
      fetchCandles(symbol, '8h'),
      fetchCandles(symbol, '1day'),
      fetchCandles(symbol, '1week'),
      fetchCandles(symbol, '1month'),
    ])

    // ── 5-minute uses ALL candles (entry timeframe — current price matters) ─
    const ema11_5m = calcEMA(c5m, 11)
    const ema25_5m = calcEMA(c5m, 25)
    const donchian = calcDonchian(c5m, 9)
    const lastCandle = c5m[0]
    const prevCandle = c5m[1]
    const recentMovePips = Math.abs(lastCandle.close - prevCandle.close) * pipMul
    const emaDiffPips = Math.abs(ema11_5m - ema25_5m) * pipMul
    const channelWidthPips = (donchian.upper - donchian.lower) * pipMul
    const positionInChannel =
      channelWidthPips > 0
        ? ((lastCandle.close - donchian.lower) / (donchian.upper - donchian.lower)) * 100
        : 50

    // ── Higher TFs use CLOSED candles only ──────────────────────────────────
    // For each TF compute EMA11/EMA25 and a trend summary with countdown.
    const now = Date.now()
    const buildTfSummary = (interval: IntervalKey, candles: Candle[]): TimeframeSummary => {
      const closed = closedOnly(candles)
      const ema11 = calcEMA(closed, 11)
      const ema25 = calcEMA(closed, 25)
      const lastClosedAt = closed[0]?.datetime ?? ''
      const nextAt = nextCloseMs(interval, lastClosedAt)
      const state = determineTfState(closed, ema11, ema25, pipMul)
      return {
        interval,
        label: INTERVALS[interval].label,
        trend: trendOf(ema11, ema25, pipMul),
        ema11,
        ema25,
        lastClosedAt,
        nextCloseAtMs: nextAt,
        secondsUntilClose: Math.max(0, Math.floor((nextAt - now) / 1000)),
        ...state,
      }
    }

    const timeframes: TimeframeSummary[] = [
      buildTfSummary('30min', c30m),
      buildTfSummary('1h', c1h),
      buildTfSummary('4h', c4h),
      buildTfSummary('8h', c8h),
      buildTfSummary('1day', c1d),
      buildTfSummary('1week', c1w),
      buildTfSummary('1month', c1mo),
    ]

    // Trend EMAs from CLOSED candles for the criteria that already exist
    const tf1h = timeframes.find((t) => t.interval === '1h')!
    const tf4h = timeframes.find((t) => t.interval === '4h')!
    const ema11_1h = tf1h.ema11
    const ema25_1h = tf1h.ema25
    const ema11_4h = tf4h.ema11
    const ema25_4h = tf4h.ema25

    const isLong = direction === 'LONG'

    // ── Criteria definitions (1H + 4H now use closed-candle EMAs) ───────────
    const defaultCriteria: CriterionResult[] = [
      {
        key: 'ema_trend_1h',
        label: 'Trend 1-uurs grafiek',
        pass: isLong ? ema11_1h > ema25_1h : ema11_1h < ema25_1h,
        weight: 25,
        value: `EMA11: ${ema11_1h.toFixed(5)} | EMA25: ${ema25_1h.toFixed(5)}`,
        reason: isLong
          ? ema11_1h > ema25_1h
            ? '1H trend is opwaarts — bevestigt LONG ✓'
            : '1H trend is NEERWAARTS — tegen de dagtrend'
          : ema11_1h < ema25_1h
            ? '1H trend is neerwaarts — bevestigt SHORT ✓'
            : '1H trend is OPWAARTS — tegen de dagtrend',
      },
      {
        key: 'ema_trend_4h',
        label: 'Trend 4-uurs grafiek',
        pass: isLong ? ema11_4h > ema25_4h : ema11_4h < ema25_4h,
        weight: 25,
        value: `EMA11: ${ema11_4h.toFixed(5)} | EMA25: ${ema25_4h.toFixed(5)}`,
        reason: isLong
          ? ema11_4h > ema25_4h
            ? '4H trend bevestigt richting ✓'
            : '4H trend CONFLICTEERT — sterke tegenwind'
          : ema11_4h < ema25_4h
            ? '4H trend bevestigt richting ✓'
            : '4H trend CONFLICTEERT — sterke tegenwind',
      },
      {
        key: 'ema_trend_5m',
        label: 'Korte trend (5min)',
        pass: isLong ? ema11_5m > ema25_5m : ema11_5m < ema25_5m,
        weight: 15,
        value: `EMA11: ${ema11_5m.toFixed(5)} | EMA25: ${ema25_5m.toFixed(5)}`,
        reason: isLong
          ? ema11_5m > ema25_5m
            ? 'Korte trend mee ✓'
            : 'Korte trend tegen — maar 1H/4H bepalen de richting'
          : ema11_5m < ema25_5m
            ? 'Korte trend mee ✓'
            : 'Korte trend tegen',
      },
      {
        key: 'donchian_position',
        label: 'Donchian positie',
        pass: isLong ? positionInChannel <= 40 : positionInChannel >= 60,
        weight: 20,
        value: `Positie: ${positionInChannel.toFixed(0)}% | Kanaal: ${channelWidthPips.toFixed(1)} pips`,
        reason: isLong
          ? positionInChannel <= 40
            ? `Prijs in onderste ${positionInChannel.toFixed(0)}% — gunstige entry ✓`
            : `Prijs te hoog in kanaal (${positionInChannel.toFixed(0)}%)`
          : positionInChannel >= 60
            ? `Prijs in bovenste deel — gunstige entry ✓`
            : `Prijs te laag in kanaal (${positionInChannel.toFixed(0)}%)`,
      },
      {
        key: 'mean_reversion',
        label: 'Mean reversion check',
        pass: emaDiffPips < 15,
        weight: 8,
        value: `EMA spread: ${emaDiffPips.toFixed(1)} pips`,
        reason: emaDiffPips < 15
          ? `Spread ${emaDiffPips.toFixed(1)} pips — markt niet overstretched ✓`
          : `Spread ${emaDiffPips.toFixed(1)} pips — overstretched, correctie risico`,
      },
      {
        key: 'fomo_check',
        label: 'FOMO check',
        pass: recentMovePips <= fomoThreshold,
        weight: 7,
        value: `Laatste candle: ${recentMovePips.toFixed(1)} pips`,
        reason: recentMovePips <= fomoThreshold
          ? `${recentMovePips.toFixed(1)} pips — geen FOMO ✓`
          : `${recentMovePips.toFixed(1)} pips bewogen — wacht op pull-back`,
      },
    ]

    // Apply user-customized weights & enabled/disabled state
    type UserCriterion = {
      key: string
      label?: string
      weight: number
      enabled: boolean
      autoGenerated?: boolean
      patternKeys?: string[]
    }
    const criteriaMap = new Map<string, UserCriterion>(
      (userCriteria as UserCriterion[]).map((c) => [c.key, c])
    )

    const allCriteriaKeys = new Set([
      ...defaultCriteria.map((c) => c.key),
      ...(userCriteria as UserCriterion[]).filter((c) => c.autoGenerated).map((c) => c.key),
    ])

    const finalCriteria: CriterionResult[] = []

    for (const key of allCriteriaKeys) {
      const custom = criteriaMap.get(key)
      const base = defaultCriteria.find((c) => c.key === key)

      if (custom?.autoGenerated && custom.patternKeys) {
        const patternPass = custom.patternKeys.every((pk) => {
          const baseCrit = defaultCriteria.find((c) => c.key === pk)
          return baseCrit?.pass ?? false
        })
        finalCriteria.push({
          key,
          label: custom.label ?? key,
          pass: patternPass,
          weight: custom.weight ?? 10,
          value: `Patroon: ${custom.patternKeys.join(' + ')}`,
          reason: patternPass ? 'Geleerd patroon aanwezig ✓' : 'Geleerd patroon niet compleet',
          autoGenerated: true,
        })
        continue
      }

      if (!base) continue

      finalCriteria.push({
        ...base,
        weight: custom?.weight ?? base.weight,
        pass: custom?.enabled === false ? false : base.pass,
        reason: custom?.enabled === false ? '(uitgeschakeld)' : base.reason,
      })
    }

    const totalWeight = finalCriteria.reduce((s, c) => s + c.weight, 0)
    const earnedWeight = finalCriteria.filter((c) => c.pass).reduce((s, c) => s + c.weight, 0)
    const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0

    let recommendation: AnalysisResult['recommendation']
    if (score >= threshold) recommendation = 'WEL_DOEN'
    else if (score >= threshold - 15) recommendation = 'TWIJFEL'
    else recommendation = 'NIET_DOEN'

    const snapshot: Record<string, number | boolean> = {
      ema11_5m,
      ema25_5m,
      ema11_1h,
      ema25_1h,
      ema11_4h,
      ema25_4h,
      donchian_upper: donchian.upper,
      donchian_lower: donchian.lower,
      donchian_position: positionInChannel,
      ema_diff_pips: emaDiffPips,
      recent_move_pips: recentMovePips,
      score,
      ...Object.fromEntries(finalCriteria.map((c) => [`criteria_${c.key}`, c.pass])),
    }

    finalCriteria.sort((a, b) => {
      if (a.pass === b.pass) return b.weight - a.weight
      return a.pass ? 1 : -1
    })

    return NextResponse.json({
      score,
      recommendation,
      criteria: finalCriteria,
      snapshot,
      timeframes,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analyse mislukt'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
