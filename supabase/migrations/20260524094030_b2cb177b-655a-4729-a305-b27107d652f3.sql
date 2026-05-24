ALTER TABLE public.recurring_bill_runs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.recurring_bill_runs ADD COLUMN IF NOT EXISTS decided_at timestamptz;
ALTER TABLE public.recurring_bill_runs ADD COLUMN IF NOT EXISTS decided_by uuid;