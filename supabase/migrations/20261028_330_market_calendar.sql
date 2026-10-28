-- 20261028_330_market_calendar.sql
-- Findings: db-logic-09 (freshness ignores market holidays), prerequisite for
-- pages-scan-intraday-sit-05 / sit-06 and the DST-safe cron guards.
-- =============================================================================
-- One NYSE calendar for the whole project (FIX_CONTRACT 1.1):
--   public.market_holidays          full-day NYSE closures (half days = normal days)
--   public.et_now()                 wall clock in America/New_York (timestamp)
--   public.et_today()               today's date in ET
--   public.is_trading_day(d)        Mon-Fri and not a holiday
--   public.prev_trading_day(d)      latest trading day strictly before d
--   public.market_session_date()    most recent COMPLETED session (today after 4:00 PM ET)
--   public.last_eod_date()          latest date whose EOD data must exist (today after 7:00 PM ET)
--   public.last_expected_trading_date() / trading_days_between()  same signatures, now holiday-aware
-- All are STABLE with search_path='' and EXECUTE for anon/authenticated,
-- because security_invoker views call them. trading_days_between moves from
-- IMMUTABLE to STABLE because it now reads market_holidays.
-- Extend market_holidays every December (next year's NYSE calendar).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.market_holidays (
  holiday date PRIMARY KEY,
  name    text NOT NULL
);

INSERT INTO public.market_holidays (holiday, name) VALUES
  ('2026-01-01', 'New Year''s Day'),
  ('2026-01-19', 'Martin Luther King Jr. Day'),
  ('2026-02-16', 'Washington''s Birthday'),
  ('2026-04-03', 'Good Friday'),
  ('2026-05-25', 'Memorial Day'),
  ('2026-06-19', 'Juneteenth'),
  ('2026-07-03', 'Independence Day (observed)'),
  ('2026-09-07', 'Labor Day'),
  ('2026-11-26', 'Thanksgiving Day'),
  ('2026-12-25', 'Christmas Day'),
  ('2027-01-01', 'New Year''s Day'),
  ('2027-01-18', 'Martin Luther King Jr. Day'),
  ('2027-02-15', 'Washington''s Birthday'),
  ('2027-03-26', 'Good Friday'),
  ('2027-05-31', 'Memorial Day'),
  ('2027-06-18', 'Juneteenth (observed)'),
  ('2027-07-05', 'Independence Day (observed)'),
  ('2027-09-06', 'Labor Day'),
  ('2027-11-25', 'Thanksgiving Day'),
  ('2027-12-24', 'Christmas Day (observed)')
ON CONFLICT (holiday) DO UPDATE SET name = EXCLUDED.name;

ALTER TABLE public.market_holidays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read market holidays" ON public.market_holidays;
CREATE POLICY "public read market holidays" ON public.market_holidays
  FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.market_holidays FROM anon, authenticated;
GRANT SELECT ON public.market_holidays TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.et_now()
RETURNS timestamp
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  select now() at time zone 'America/New_York'
$$;

CREATE OR REPLACE FUNCTION public.et_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  select (now() at time zone 'America/New_York')::date
$$;

CREATE OR REPLACE FUNCTION public.is_trading_day(d date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  select d is not null
     and extract(isodow from d) < 6
     and not exists (select 1 from public.market_holidays h where h.holiday = d)
$$;

CREATE OR REPLACE FUNCTION public.prev_trading_day(d date)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  select max(g::date)
  from generate_series(d - 14, d - 1, interval '1 day') g
  where public.is_trading_day(g::date)
$$;

CREATE OR REPLACE FUNCTION public.market_session_date()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  select case
           when public.is_trading_day(public.et_today())
                and public.et_now()::time >= time '16:00'
             then public.et_today()
           else public.prev_trading_day(public.et_today())
         end
$$;

CREATE OR REPLACE FUNCTION public.last_eod_date()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  select case
           when public.is_trading_day(public.et_today())
                and public.et_now()::time >= time '19:00'
             then public.et_today()
           else public.prev_trading_day(public.et_today())
         end
$$;

-- Same signature as before; now skips holidays (latest trading day <= today ET).
CREATE OR REPLACE FUNCTION public.last_expected_trading_date()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  select case
           when public.is_trading_day(public.et_today()) then public.et_today()
           else public.prev_trading_day(public.et_today())
         end
$$;

-- Same signature as before; counts trading days in (d_from, d_to], skipping holidays.
CREATE OR REPLACE FUNCTION public.trading_days_between(d_from date, d_to date)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  select coalesce(count(*), 0)::int
  from generate_series(d_from + 1, d_to, interval '1 day') g
  where public.is_trading_day(g::date)
$$;

GRANT EXECUTE ON FUNCTION public.et_now()                     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.et_today()                   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_trading_day(date)         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prev_trading_day(date)       TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.market_session_date()        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.last_eod_date()              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.last_expected_trading_date() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trading_days_between(date, date) TO anon, authenticated, service_role;

-- Extend every December: add next year's NYSE full-day closures above (ON CONFLICT keeps it idempotent).

-- Rollback:
--   CREATE OR REPLACE FUNCTION public.last_expected_trading_date() RETURNS date LANGUAGE sql STABLE SET search_path = '' AS $$
--     with d as (select (now() at time zone 'America/New_York')::date as today)
--     select case extract(isodow from today) when 6 then today - 1 when 7 then today - 2 else today end from d $$;
--   CREATE OR REPLACE FUNCTION public.trading_days_between(d_from date, d_to date) RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
--     select coalesce(count(*), 0)::int from generate_series(d_from + 1, d_to, interval '1 day') g where extract(isodow from g) < 6 $$;
--   (Only after rolling back 340-470, which call the functions below:)
--   DROP FUNCTION IF EXISTS public.last_eod_date(), public.market_session_date(), public.prev_trading_day(date),
--     public.is_trading_day(date), public.et_today(), public.et_now();
--   DROP TABLE IF EXISTS public.market_holidays;
