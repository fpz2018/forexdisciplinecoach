export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          account_balance: number
          risk_percentage: number
          max_trades_per_day: number
          max_daily_losses: number
          fomo_threshold_pips: number
          default_pair: string
          trading_days: number[]
          blocked_dates: string[]
          created_at: string
        }
        Insert: {
          id: string
          email?: string | null
          account_balance?: number
          risk_percentage?: number
          max_trades_per_day?: number
          max_daily_losses?: number
          fomo_threshold_pips?: number
          default_pair?: string
          trading_days?: number[]
          blocked_dates?: string[]
          created_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          account_balance?: number
          risk_percentage?: number
          max_trades_per_day?: number
          max_daily_losses?: number
          fomo_threshold_pips?: number
          default_pair?: string
          trading_days?: number[]
          blocked_dates?: string[]
          created_at?: string
        }
        Relationships: []
      }
      trading_windows: {
        Row: {
          id: string
          user_id: string
          start_time: string
          end_time: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          start_time: string
          end_time: string
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          start_time?: string
          end_time?: string
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          id: string
          user_id: string
          created_at: string
          updated_at: string
          direction: 'LONG' | 'SHORT'
          pair: string
          entry_price: number
          stop_loss: number
          take_profit: number
          lot_size: number
          checklist_completed: boolean
          checklist_items: Json
          indicator_snapshot: Json | null
          analysis_score: number | null
          status: 'OPEN' | 'CLOSED' | 'CANCELLED'
          close_price: number | null
          close_reason: 'SL' | 'TP' | 'MANUAL' | null
          result_pips: number | null
          result_money: number | null
          notes: string | null
          closed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string
          updated_at?: string
          direction: 'LONG' | 'SHORT'
          pair: string
          entry_price: number
          stop_loss: number
          take_profit: number
          lot_size: number
          checklist_completed?: boolean
          checklist_items?: Json
          indicator_snapshot?: Json | null
          analysis_score?: number | null
          status?: 'OPEN' | 'CLOSED' | 'CANCELLED'
          close_price?: number | null
          close_reason?: 'SL' | 'TP' | 'MANUAL' | null
          result_pips?: number | null
          result_money?: number | null
          notes?: string | null
          closed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string
          updated_at?: string
          direction?: 'LONG' | 'SHORT'
          pair?: string
          entry_price?: number
          stop_loss?: number
          take_profit?: number
          lot_size?: number
          checklist_completed?: boolean
          checklist_items?: Json
          indicator_snapshot?: Json | null
          analysis_score?: number | null
          status?: 'OPEN' | 'CLOSED' | 'CANCELLED'
          close_price?: number | null
          close_reason?: 'SL' | 'TP' | 'MANUAL' | null
          result_pips?: number | null
          result_money?: number | null
          notes?: string | null
          closed_at?: string | null
        }
        Relationships: []
      }
      trade_criteria: {
        Row: {
          id: string
          user_id: string
          key: string
          label: string
          description: string | null
          weight: number
          enabled: boolean
          auto_learn: boolean
          win_count: number
          loss_count: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          key: string
          label: string
          description?: string | null
          weight?: number
          enabled?: boolean
          auto_learn?: boolean
          win_count?: number
          loss_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          key?: string
          label?: string
          description?: string | null
          weight?: number
          enabled?: boolean
          auto_learn?: boolean
          win_count?: number
          loss_count?: number
          created_at?: string
        }
        Relationships: []
      }
      daily_stats: {
        Row: {
          id: string
          user_id: string
          date: string
          trades_count: number
          wins: number
          losses: number
          pips_total: number
          money_total: number
        }
        Insert: {
          id?: string
          user_id: string
          date?: string
          trades_count?: number
          wins?: number
          losses?: number
          pips_total?: number
          money_total?: number
        }
        Update: {
          id?: string
          user_id?: string
          date?: string
          trades_count?: number
          wins?: number
          losses?: number
          pips_total?: number
          money_total?: number
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Trade = Database['public']['Tables']['trades']['Row']
export type TradingWindow = Database['public']['Tables']['trading_windows']['Row']
export type DailyStat = Database['public']['Tables']['daily_stats']['Row']
export type TradeCriterion = Database['public']['Tables']['trade_criteria']['Row']

export type ChecklistItems = {
  trend_check: boolean
  channel_check: boolean
  pattern_check: boolean
  higher_tf_check: boolean
  mean_reversion_check: boolean
  fomo_check: boolean
}
