-- InvestIQ Database Schema
-- Run this in the Supabase SQL editor

-- portfolios: one per user
CREATE TABLE portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL DEFAULT 'My Portfolio',
  brokerage VARCHAR(50) DEFAULT 'fidelity',
  last_import_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- positions: current holdings
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  description VARCHAR(255),
  total_shares DECIMAL(15,6),
  current_price DECIMAL(15,4),
  current_value DECIMAL(15,4),
  total_cost_basis DECIMAL(15,4),
  total_gain_loss DECIMAL(15,4),
  total_gain_loss_percent DECIMAL(8,4),
  percent_of_account DECIMAL(6,4),
  sector VARCHAR(50),
  previous_close DECIMAL(15,4),
  account_type VARCHAR(20) DEFAULT 'individual',
  last_updated TIMESTAMP DEFAULT NOW()
);
-- Migration (run if schema already applied):
-- ALTER TABLE positions ADD COLUMN IF NOT EXISTS previous_close DECIMAL(15,4);
-- ALTER TABLE positions ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'individual';
-- ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS investment_style VARCHAR(30);
-- ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS federal_tax_bracket DECIMAL(4,2);
-- ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS state_tax_bracket DECIMAL(4,2);

-- tax_lots: reconstructed from transaction history (FIFO)
CREATE TABLE tax_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID REFERENCES positions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  shares DECIMAL(15,6),
  purchase_date DATE NOT NULL,
  purchase_price DECIMAL(15,4),
  cost_basis DECIMAL(15,4),
  -- lt_transition_date is always purchase_date + 1 year (immutable, safe as generated)
  lt_transition_date DATE GENERATED ALWAYS AS (
    purchase_date + INTERVAL '365 days'
  ) STORED,
  -- is_short_term is NOT a generated column — CURRENT_DATE is not immutable.
  -- Compute in queries: purchase_date > CURRENT_DATE - INTERVAL '365 days'
  current_gain_loss DECIMAL(15,4),
  is_harvested BOOLEAN DEFAULT FALSE,
  harvest_date DATE,
  wash_sale_restriction_until DATE
);

-- smart_money_trades: congressional + hedge fund trades (shared, not per-user)
CREATE TABLE smart_money_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_type VARCHAR(20) NOT NULL,  -- 'congress', 'hedge_fund', 'insider'
  trader_name VARCHAR(255),
  trader_detail JSONB,               -- party, state, committee / fund name, AUM
  symbol VARCHAR(10) NOT NULL,
  trade_type VARCHAR(10),            -- 'buy', 'sell'
  trade_date DATE,
  disclosure_date DATE,
  amount_range VARCHAR(50),
  shares DECIMAL(15,6),
  price DECIMAL(15,4),
  source VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- policy_events: legislation/regulatory events mapped to stocks (shared)
CREATE TABLE policy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50),           -- 'legislation', 'regulation', 'fed_decision'
  event_name VARCHAR(500),
  event_description TEXT,
  event_date DATE,
  status VARCHAR(50),               -- 'pending', 'passed', 'failed'
  affected_symbols JSONB,           -- ["NVDA", "AMD"]
  impact_direction VARCHAR(20),     -- 'positive', 'negative', 'mixed'
  impact_magnitude VARCHAR(20),     -- 'high', 'medium', 'low'
  source_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);

-- recommendation_snapshots: track what was recommended and outcome
CREATE TABLE recommendation_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  recommendation_type VARCHAR(20) NOT NULL,  -- 'SELL', 'HOLD', 'BUY_MORE'
  confidence VARCHAR(10),
  reasoning TEXT,
  snapshot_date DATE NOT NULL,
  price_at_recommendation DECIMAL(15,4),
  value_at_recommendation DECIMAL(15,4),
  user_action VARCHAR(20) DEFAULT 'pending', -- 'followed', 'ignored', 'pending'
  factors_at_time JSONB,
  combined_score DECIMAL(6,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- portfolio_snapshots: daily point-in-time portfolio value (for value-over-time chart)
CREATE TABLE portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_value DECIMAL(15,4) NOT NULL,
  total_cost DECIMAL(15,4),
  UNIQUE(portfolio_id, snapshot_date)
);
-- Migration (run if schema already applied):
-- CREATE TABLE IF NOT EXISTS portfolio_snapshots (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
--   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
--   snapshot_date DATE NOT NULL,
--   total_value DECIMAL(15,4) NOT NULL,
--   total_cost DECIMAL(15,4),
--   UNIQUE(portfolio_id, snapshot_date)
-- );

-- share_tokens: public share links for read-only portfolio snapshots
CREATE TABLE share_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(32) UNIQUE NOT NULL,
  portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);
-- Migration (run if schema already applied):
-- CREATE TABLE IF NOT EXISTS share_tokens (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   token VARCHAR(32) UNIQUE NOT NULL,
--   portfolio_id UUID REFERENCES portfolios(id) ON DELETE CASCADE,
--   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
--   created_at TIMESTAMP DEFAULT NOW()
-- );

-- recommendation_outcomes: shadow portfolio checkpoints (30/60/90/180/365 days)
CREATE TABLE recommendation_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES recommendation_snapshots(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  checkpoint_days INT NOT NULL,          -- 30, 60, 90, 180, 365
  actual_value DECIMAL(15,4),            -- current position value (0 if SELL was followed)
  shadow_value DECIMAL(15,4),            -- shares_at_recommendation * price_at_checkpoint
  price_at_checkpoint DECIMAL(15,4),
  checked_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(recommendation_id, checkpoint_days)
);
-- Migration (run if schema already applied):
-- CREATE TABLE IF NOT EXISTS recommendation_outcomes (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   recommendation_id UUID REFERENCES recommendation_snapshots(id) ON DELETE CASCADE,
--   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
--   checkpoint_days INT NOT NULL,
--   actual_value DECIMAL(15,4),
--   shadow_value DECIMAL(15,4),
--   price_at_checkpoint DECIMAL(15,4),
--   checked_at TIMESTAMP DEFAULT NOW(),
--   UNIQUE(recommendation_id, checkpoint_days)
-- );

-- ai_training_feedback: outcome correctness for learning loop
CREATE TABLE ai_training_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID REFERENCES recommendation_snapshots(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  outcome_correct BOOLEAN,
  factor_scores JSONB,                   -- per-factor accuracy post-outcome
  sector VARCHAR(50),
  market_condition VARCHAR(50),          -- 'bull', 'bear', 'sideways'
  created_at TIMESTAMP DEFAULT NOW()
);
-- Migration (run if schema already applied):
-- CREATE TABLE IF NOT EXISTS ai_training_feedback (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   recommendation_id UUID REFERENCES recommendation_snapshots(id) ON DELETE CASCADE,
--   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
--   outcome_correct BOOLEAN,
--   factor_scores JSONB,
--   sector VARCHAR(50),
--   market_condition VARCHAR(50),
--   created_at TIMESTAMP DEFAULT NOW()
-- );

-- Migration: add shares_at_recommendation to recommendation_snapshots
-- ALTER TABLE recommendation_snapshots ADD COLUMN IF NOT EXISTS shares_at_recommendation DECIMAL(15,6);

-- ─────────────────────────────────────────
-- Row Level Security (RLS)
-- ─────────────────────────────────────────

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_training_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_tokens ENABLE ROW LEVEL SECURITY;

-- smart_money_trades and policy_events are public read (shared data)
ALTER TABLE smart_money_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_events ENABLE ROW LEVEL SECURITY;

-- Policies: users see only their own data
CREATE POLICY "Users see own portfolios" ON portfolios
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own positions" ON positions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own tax lots" ON tax_lots
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own recommendations" ON recommendation_snapshots
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own recommendation outcomes" ON recommendation_outcomes
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own ai training feedback" ON ai_training_feedback
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own snapshots" ON portfolio_snapshots
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own share tokens" ON share_tokens
  FOR ALL USING (auth.uid() = user_id);

-- Smart money + policy: all authenticated users can read
CREATE POLICY "Authenticated users read smart money" ON smart_money_trades
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users read policy events" ON policy_events
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────

CREATE INDEX idx_positions_portfolio ON positions(portfolio_id);
CREATE INDEX idx_positions_symbol ON positions(symbol);
CREATE INDEX idx_tax_lots_symbol ON tax_lots(symbol);
CREATE INDEX idx_tax_lots_transition ON tax_lots(lt_transition_date);
CREATE INDEX idx_smart_money_symbol ON smart_money_trades(symbol);
CREATE INDEX idx_smart_money_date ON smart_money_trades(trade_date DESC);
CREATE INDEX idx_policy_symbols ON policy_events USING GIN(affected_symbols);
CREATE INDEX idx_snapshots_portfolio_date ON portfolio_snapshots(portfolio_id, snapshot_date DESC);
CREATE INDEX idx_rec_snapshots_user ON recommendation_snapshots(user_id, snapshot_date DESC);
CREATE INDEX idx_rec_outcomes_rec ON recommendation_outcomes(recommendation_id);
CREATE INDEX idx_rec_outcomes_user ON recommendation_outcomes(user_id);
CREATE INDEX idx_share_tokens_token ON share_tokens(token);
