/**
 * Self-learning weight adjustment system
 *
 * After each closed trade, weights of criteria that were GREEN at entry are adjusted:
 * - WIN trade → those criteria earn +learnRate points (they predicted well)
 * - LOSS trade → those criteria lose -learnRate points (they led you astray)
 *
 * Weights are normalized to always sum to 100.
 * Each weight stays between MIN_WEIGHT and MAX_WEIGHT.
 */

import { createClient } from '@/lib/supabase/client'
import type { TradeCriterion } from '@/lib/supabase/types'

const LEARN_RATE = 2     // how many points shift per trade
const MIN_WEIGHT = 5     // minimum weight per criterion
const MAX_WEIGHT = 45    // maximum weight per criterion

export const DEFAULT_CRITERIA: Array<{
  key: string
  label: string
  description: string
  weight: number
}> = [
  {
    key: 'ema_trend_5m',
    label: 'EMA Trend (5min)',
    description: 'EMA 11 staat boven EMA 25 op de 5-minuten grafiek (LONG) of eronder (SHORT)',
    weight: 15,
  },
  {
    key: 'ema_trend_30m',
    label: 'Hoofdtrend (30min)',
    description: 'De 30-minuten trend bevestigt de richting — dit is het zwaarst meewegende criterium',
    weight: 25,
  },
  {
    key: 'ema_trend_4h',
    label: 'Hogere Timeframe (4H)',
    description: 'De 4-uurs trend staat achter de trade — geen conflict met hogere timeframe',
    weight: 20,
  },
  {
    key: 'donchian_position',
    label: 'Donchian Positie',
    description: 'Prijs bevindt zich in het onderste deel van het kanaal (LONG) of bovenste deel (SHORT)',
    weight: 20,
  },
  {
    key: 'mean_reversion',
    label: 'Mean Reversion Check',
    description: 'De EMA\'s staan niet te ver uit elkaar — markt is niet overstretched',
    weight: 10,
  },
  {
    key: 'fomo_check',
    label: 'FOMO Check',
    description: 'De prijs heeft de laatste candle niet te veel bewogen — geen achteraan lopen',
    weight: 10,
  },
]

export async function ensureCriteriaExist(userId: string): Promise<TradeCriterion[]> {
  const supabase = createClient()

  const { data: existing } = await supabase
    .from('trade_criteria')
    .select('*')
    .eq('user_id', userId)

  if (existing && existing.length >= DEFAULT_CRITERIA.length) return existing

  // Insert missing criteria
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
    }))

  if (toInsert.length > 0) {
    await supabase.from('trade_criteria').insert(toInsert)
  }

  const { data: all } = await supabase
    .from('trade_criteria')
    .select('*')
    .eq('user_id', userId)

  return all ?? []
}

function normalize(criteria: TradeCriterion[]): Array<{ id: string; weight: number }> {
  const enabled = criteria.filter(c => c.enabled)
  if (enabled.length === 0) return []

  const total = enabled.reduce((s, c) => s + c.weight, 0)
  const scale = 100 / total

  return enabled.map(c => ({
    id: c.id,
    weight: Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, c.weight * scale)),
  }))
}

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

  for (const criterion of criteria) {
    if (!criterion.enabled) continue

    const wasGreen = indicatorSnapshot[`criteria_${criterion.key}`] === true

    if (!wasGreen) continue // only adjust criteria that were active at entry

    const delta = isWin ? LEARN_RATE : -LEARN_RATE
    const newWeight = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, criterion.weight + delta))

    updates.push({
      id: criterion.id,
      weight: newWeight,
      win_count: criterion.win_count + (isWin ? 1 : 0),
      loss_count: criterion.loss_count + (isWin ? 0 : 1),
    })
  }

  // Apply updates + normalize
  for (const update of updates) {
    await supabase
      .from('trade_criteria')
      .update({
        weight: update.weight,
        win_count: update.win_count,
        loss_count: update.loss_count,
      })
      .eq('id', update.id)
  }

  // Re-fetch and normalize so weights always sum to ~100
  const { data: updated } = await supabase
    .from('trade_criteria')
    .select('*')
    .eq('user_id', userId)

  if (!updated) return

  const normalized = normalize(updated)
  for (const { id, weight } of normalized) {
    await supabase.from('trade_criteria').update({ weight }).eq('id', id)
  }
}
