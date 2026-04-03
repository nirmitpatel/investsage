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
  last_updated TIMESTAMP DEFAULT NOW()
);

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

-- ─────────────────────────────────────────
-- Row Level Security (RLS)
-- ─────────────────────────────────────────

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_snapshots ENABLE ROW LEVEL SECURITY;

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
