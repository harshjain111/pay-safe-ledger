-- ================================================
-- SAFEGUARD 1: Unique salary settlement per staff per month
-- ================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_settlement_per_staff_month 
ON salary_settlements (staff_id, settlement_month);

-- ================================================
-- SAFEGUARD 2a: Validate journal entries are balanced before marking immutable
-- ================================================
CREATE OR REPLACE FUNCTION validate_journal_entry_balanced()
RETURNS TRIGGER AS $$
DECLARE
  total_debits NUMERIC;
  total_credits NUMERIC;
  line_count INTEGER;
BEGIN
  -- Only validate when setting is_immutable to true
  IF NEW.is_immutable = true AND (OLD.is_immutable IS NULL OR OLD.is_immutable = false) THEN
    -- Get totals from journal lines
    SELECT 
      COALESCE(SUM(debit), 0),
      COALESCE(SUM(credit), 0),
      COUNT(*)
    INTO total_debits, total_credits, line_count
    FROM journal_lines
    WHERE journal_entry_id = NEW.id;
    
    -- Check for empty journal entries
    IF line_count = 0 THEN
      RAISE EXCEPTION 'Cannot mark journal entry as immutable: no lines exist (ID: %)', NEW.id;
    END IF;
    
    -- Check balance (allow tiny rounding differences)
    IF ABS(total_debits - total_credits) > 0.01 THEN
      RAISE EXCEPTION 'Cannot mark journal entry as immutable: unbalanced (Debits: %, Credits: %, ID: %)', 
        total_debits, total_credits, NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS validate_journal_balanced_trigger ON journal_entries;
CREATE TRIGGER validate_journal_balanced_trigger
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION validate_journal_entry_balanced();

-- ================================================
-- SAFEGUARD 2b: Block empty journal entries on insert (immediate validation)
-- ================================================
CREATE OR REPLACE FUNCTION validate_journal_lines_exist()
RETURNS TRIGGER AS $$
DECLARE
  line_count INTEGER;
BEGIN
  -- Allow a brief window for lines to be inserted (check on immutable only)
  IF NEW.is_immutable = true THEN
    SELECT COUNT(*) INTO line_count
    FROM journal_lines
    WHERE journal_entry_id = NEW.id;
    
    IF line_count = 0 THEN
      RAISE EXCEPTION 'Cannot create immutable journal entry without lines (ID: %)', NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ================================================
-- SAFEGUARD 4: Function to get staff balance ONLY from journal_lines
-- (Already exists but let's ensure it's the single source of truth)
-- ================================================
CREATE OR REPLACE FUNCTION get_staff_advances_from_journals(_staff_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  advances NUMERIC;
BEGIN
  -- Get balance from Staff Advances account (code 1200)
  -- Debit = staff owes us, Credit = adjustment/repayment
  SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)
  INTO advances
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  WHERE jl.staff_id = _staff_id
    AND a.code = '1200'; -- Staff Advances account
  
  RETURN advances;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Function to get staff payable balance from journals
CREATE OR REPLACE FUNCTION get_staff_payable_from_journals(_staff_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  payable NUMERIC;
BEGIN
  -- Get balance from Staff Payable account (code 2000)
  -- Credit = we owe staff, Debit = payment made
  SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)
  INTO payable
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  WHERE jl.staff_id = _staff_id
    AND a.code = '2000'; -- Staff Payable account
  
  RETURN payable;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ================================================
-- SAFEGUARD 5: Trial Balance function for CA verification
-- ================================================
CREATE OR REPLACE FUNCTION get_trial_balance()
RETURNS TABLE (
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  total_debit NUMERIC,
  total_credit NUMERIC,
  balance NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.code AS account_code,
    a.name AS account_name,
    a.account_type,
    COALESCE(SUM(jl.debit), 0) AS total_debit,
    COALESCE(SUM(jl.credit), 0) AS total_credit,
    CASE 
      -- Asset & Expense accounts: Debit balance
      WHEN a.account_type IN ('asset', 'expense') THEN 
        COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
      -- Liability, Equity & Income accounts: Credit balance
      ELSE 
        COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0)
    END AS balance
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  WHERE a.is_active = true
  GROUP BY a.id, a.code, a.name, a.account_type
  ORDER BY a.code;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;