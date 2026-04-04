/**
 * Self-learning system
 *
 * Two mechanisms:
 *
 * 1. WEIGHT ADJUSTMENT
 *    After every trade close, criteria that were green at entry get +/- weight
 *    based on win/loss outcome. This makes the score more accurate over time.
 *
 * 2. PATTERN DISCOVERY
 *    After every 5 trades, the system analyzes ALL trade history to find:
 *    - Criteria that are irrelevant (high win rate even when failing → reduce weight)
 *    - Successful partial patterns (e.g. "1H+4H green, 5min red → 75% win rate")
 *    - Auto-generates new rules for strong patterns with enough samples
 */

import { createClient } from '@/lib/supabase/client'
import type { TradeCriterion } from '@/lib/supabase/types'

const LEARN_RATE  = 1.5   // weight points per trade
const MIN_WEIGHT  = 4
const MAX_WEIGHT  = 45
const MIN_SAMPLES = 6     // minimum trades before pattern detection
const WIN_RATE_THRESHOLD = 0.68  // 68%+ win rate → strong pattern
const IRRELEVANCE_THRESHOLD = 0.55 // criterion failing still leads to 55%+ wins → possibly irrelevant

export const DEFAULT_CRITERIA: Array<{
  key: string
  label: string
  description: string
  weight: number
}> = [
  {
    key: 'ema_trend_1h',
    label: 'Trend 1-uurs grafiek',
    description: 'De 1-uurs EMA 11 staat boven EMA 25 (LONG) — bepaalt de dagtrend',
    weight: 25,
  },
  {
    key: 'ema_trend_4h',
    label: 'Trend 4-uurs grafiek',
    description: 'De 4-uurs EMA 11 staat boven EMA 25 (LONG) — zwaarste indicator',
    weight: 25,
  },
  {
    key: 'ema_trend_5m',
    label: 'Korte trend (5min)',
    description: 'EMA 11/25 op 5min — minder zwaar dan 1H/4H, maar helpt bij timing',
    weight: 15,
  },
  {
    key: 'donchian_position',
    label: 'Donchian positie',
    description: 'Prijs in onderste deel van kanaal (LONG) — goede entry zone',
    weight: 20,
  },
  {
    key: 'mean_reversion',
    label: 'Mean reversion check',
    description: 'EMA\'s niet te ver uit elkaar — markt niet overstretched',
    weight: 8,
  },
  {
    key: 'fomo_check',
    label: 'FOMO check',
    description: 'Laatste candle niet te groot — geen achteraan lopen',
    weight: 7,
  },
]

// ─── helpers ─────────────────────────────────────────────────────────────────

function normalize(criteria: TradeCriterion[]): Array<{ id: string; weight: number }> {
  const enabled = criteria.filter(c => c.enabled)
  if (enabled.length === 0) return []
  const total = enabled.reduce((s, c) => s + c.weight, 0)
  if (total === 0) return []
  const scale = 100 / total
  return enabled.map(c => ({
    id: c.id,
    weight: parseFloat(Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, c.weight * scale)).toFixed(2)),
  }))
}

function patternKey(keys: string[]): string {
  return 'pattern_' + [...keys].sort().join('_')
}

function patternLabel(passingKeys: string[], failingKeys: string[]): string {
  const passingNames = passingKeys.map(k => DEFAULT_CRITERIA.find(d => d.key === k)?.label ?? k)
  const failingNames = failingKeys.map(k => DEFAULT_CRITERIA.find(d => d.key === k)?.label ?? k)
  const parts: string[] = []
  if (passingNames.length) parts.push(`${passingNames.join(' + ')} groen`)
  if (failingNames.length) parts.push(`${failingNames.join(' + ')} rood`)
  return parts.join(' & ') + ' → winnend patroon'
}

// ─── public API ──────────────────────────────────────────────────────────────

export async function ensureCriteriaExist(userId: string): Promise<TradeCriterion[]> {
  const supabase = createClient()

  const { data: existing } = await supabase
    .from('trade_criteria')
    .select('*')
    .eq('user_id', userId)

  const existingKeys = new Set((existing ?? []).map(c => c.key))
  const toInsert = DEFAULT_CRITERIA
    .filter(c => !existingKeys.has(c.key))
    .map(c => ({
      user_id: userId,
      key: c.key,
      label: c.label,
      description: c.description,
      weight: c.weight,
      enabled: true,
      auto_learn: true,
      auto_generated: false,
    }))

  if (toInsert.length > 0) {
    await supabase.from('trade_criteria').insert(toInsert)
  }

  const { data: all } = await supabase
    .from('trade_criteria')
    .select('*')
    .eq('user_id', userId)
    .order('weight', { ascending: false })

  return all ?? []
}

// ─── Step 1: weight adjustment after single trade ────────────────────────────

export async function learnFromTrade(
  userId: string,
  indicatorSnapshot: Record<string, number | boolean>,
  isWin: boolean
): Promise<void> {
  const supabase = createClient()

  const { data: criteria } = await supabase
    .from('trade_criteria')
    .select('*')
    .eq('user_id', userId)
    .eq('auto_learn', true)

  if (!criteria || criteria.length === 0) return

  const updates: Array<{ id: string; weight: number; win_count: number; loss_count: number }> = []

  for (const c of criteria) {
    if (!c.enabled) continue
    const wasGreen = indicatorSnapshot[`criteria_${c.key}`] === true
    if (!wasGreen) continue

    const delta = isWin ? LEARN_RATE : -LEARN_RATE
    updates.push({
      id: c.id,
      weight: Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, c.weight + delta)),
      win_count: c.win_count + (isWin ? 1 : 0),
      loss_count: c.loss_count + (isWin ? 0 : 1),
    })
  }

  for (const u of updates) {
    await supabase.from('trade_criteria').update({
      weight: u.weight,
      win_count: u.win_count,
      loss_count: u.loss_count,
    }).eq('id', u.id)
  }

  // Re-normalize
  const { data: updated } = await supabase
    .from('trade_criteria')
    .select('*')
    .eq('user_id', userId)
  if (!updated) return

  for (const { id, weight } of normalize(updated)) {
    await supabase.from('trade_criteria').update({ weight }).eq('id', id)
  }

  // Run pattern discovery every 5 trades
  const totalTrades = (criteria[0]?.win_count ?? 0) + (criteria[0]?.loss_count ?? 0) + 1
  if (totalTrades % 5 === 0) {
    await discoverPatterns(userId)
  }
}

// ─── Step 2: pattern discovery across all trade history ──────────────────────

async function discoverPatterns(userId: string): Promise<void> {
  const supabase = createClient()

  // Get all closed trades with snapshots
  const { data: trades } = await supabase
    .from('trades')
    .select('id, result_pips, indicator_snapshot')
    .eq('user_id', userId)
    .eq('status', 'CLOSED')
    .not('indicator_snapshot', 'is', null)

  if (!trades || trades.length < MIN_SAMPLES) return

  // Build structured trade data
  const tradeData = trades
    .map(t => {
      const snap = t.indicator_snapshot as Record<string, boolean | number> | null
      if (!snap) return null
      const criteriaResults: Record<string, boolean> = {}
      for (const key of DEFAULT_CRITERIA.map(c => c.key)) {
        const val = snap[`criteria_${key}`]
        if (typeof val === 'boolean') criteriaResults[key] = val
      }
      return {
        isWin: (t.result_pips ?? 0) > 0,
        criteria: criteriaResults,
      }
    })
    .filter(Boolean) as Array<{ isWin: boolean; criteria: Record<string, boolean> }>

  if (tradeData.length < MIN_SAMPLES) return

  const criteriaKeys = DEFAULT_CRITERIA.map(c => c.key)

  // ── A: Find irrelevant criteria (high win rate even when failing) ──────────
  const { data: existingCriteria } = await supabase
    .from('trade_criteria')
    .select('*')
    .eq('user_id', userId)

  for (const key of criteriaKeys) {
    const whenFail = tradeData.filter(t => t.criteria[key] === false)
    if (whenFail.length < 4) continue

    const winRateWhenFail = whenFail.filter(t => t.isWin).length / whenFail.length

    if (winRateWhenFail >= IRRELEVANCE_THRESHOLD) {
      // This criterion doesn't hurt when it fails → reduce weight gradually
      const crit = existingCriteria?.find(c => c.key === key)
      if (!crit || !crit.auto_learn) continue

      const reduction = Math.min(3, (winRateWhenFail - IRRELEVANCE_THRESHOLD) * 20)
      const newWeight = Math.max(MIN_WEIGHT, crit.weight - reduction)

      await supabase.from('trade_criteria').update({
        weight: parseFloat(newWeight.toFixed(2)),
        description: (crit.description ?? '') + '' // keep description
      }).eq('id', crit.id)
    }
  }

  // ── B: Find strong partial patterns ──────────────────────────────────────
  // Look at pairs of criteria that are green on winning trades where other criteria fail
  // Pattern: [passing subset] + [failing subset] → high win rate

  const { data: existingAutoRules } = await supabase
    .from('trade_criteria')
    .select('*')
    .eq('user_id', userId)
    .eq('auto_generated', true)

  const existingPatternKeys = new Set((existingAutoRules ?? []).map(c => c.key))

  // Focus on the high-TF indicators as anchors for patterns
  const anchorKeys = ['ema_trend_1h', 'ema_trend_4h']
  const otherKeys  = criteriaKeys.filter(k => !anchorKeys.includes(k))

  // Pattern: both anchors green, but some others failing → still winning
  for (let i = 0; i < otherKeys.length; i++) {
    const failingKey = otherKeys[i]

    const matchingTrades = tradeData.filter(t =>
      anchorKeys.every(ak => t.criteria[ak] === true) &&
      t.criteria[failingKey] === false
    )

    if (matchingTrades.length < MIN_SAMPLES) continue

    const winRate = matchingTrades.filter(t => t.isWin).length / matchingTrades.length
    if (winRate < WIN_RATE_THRESHOLD) continue

    // Strong pattern found: 1H + 4H green, failingKey red → still wins
    const pKey = patternKey([...anchorKeys, `NOT_${failingKey}`])
    if (existingPatternKeys.has(pKey)) {
      // Update win stats on existing pattern
      const existing = existingAutoRules?.find(c => c.key === pKey)
      if (existing) {
        await supabase.from('trade_criteria').update({
          win_count: matchingTrades.filter(t => t.isWin).length,
          loss_count: matchingTrades.filter(t => !t.isWin).length,
          weight: Math.min(MAX_WEIGHT, existing.weight + 1),
        }).eq('id', existing.id)
      }
      continue
    }

    // Create new auto-generated rule
    const label = patternLabel(anchorKeys, [failingKey])
    const description =
      `Systeem ontdekte: wanneer 1H en 4H beide groen zijn en ${DEFAULT_CRITERIA.find(d => d.key === failingKey)?.label ?? failingKey} rood is, win je nog steeds ${Math.round(winRate * 100)}% van de tijd (${matchingTrades.length} trades).`

    await supabase.from('trade_criteria').insert({
      user_id: userId,
      key: pKey,
      label,
      description,
      weight: 12,
      enabled: true,
      auto_learn: true,
      auto_generated: true,
      pattern_keys: anchorKeys,          // these must be green
      exception_keys: [failingKey],      // these CAN be red
      win_count: matchingTrades.filter(t => t.isWin).length,
      loss_count: matchingTrades.filter(t => !t.isWin).length,
    })
  }

  // Final normalize
  const { data: allCriteria } = await supabase
    .from('trade_criteria')
    .select('*')
    .eq('user_id', userId)
  if (!allCriteria) return

  for (const { id, weight } of normalize(allCriteria)) {
    await supabase.from('trade_criteria').update({ weight }).eq('id', id)
  }
}
