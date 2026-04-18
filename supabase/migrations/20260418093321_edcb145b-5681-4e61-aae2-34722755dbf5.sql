-- Recurring bill templates
CREATE TABLE public.recurring_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  created_by uuid NOT NULL,
  title text NOT NULL,
  total_amount numeric NOT NULL,
  category text DEFAULT 'general',
  notes text,
  paid_by uuid NOT NULL,
  split_type text NOT NULL DEFAULT 'equal',
  frequency text NOT NULL CHECK (frequency IN ('weekly','monthly')),
  day_of_week integer CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month integer CHECK (day_of_month BETWEEN 1 AND 28),
  next_run_date date NOT NULL,
  last_run_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Per-member split template
CREATE TABLE public.recurring_bill_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_bill_id uuid NOT NULL REFERENCES public.recurring_bills(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Run history (idempotency)
CREATE TABLE public.recurring_bill_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_bill_id uuid NOT NULL REFERENCES public.recurring_bills(id) ON DELETE CASCADE,
  run_date date NOT NULL,
  expense_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recurring_bill_id, run_date)
);

CREATE INDEX idx_recurring_bills_next_run ON public.recurring_bills(next_run_date) WHERE is_active = true;
CREATE INDEX idx_recurring_bills_room ON public.recurring_bills(room_id);

ALTER TABLE public.recurring_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_bill_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_bill_runs ENABLE ROW LEVEL SECURITY;

-- recurring_bills policies
CREATE POLICY "Room members can view recurring bills"
ON public.recurring_bills FOR SELECT
USING (room_id IN (SELECT get_user_room_ids(auth.uid())));

CREATE POLICY "Room members can create recurring bills"
ON public.recurring_bills FOR INSERT
WITH CHECK (
  is_room_member(auth.uid(), room_id)
  AND created_by = auth.uid()
);

CREATE POLICY "Creators can update their recurring bills"
ON public.recurring_bills FOR UPDATE
USING (created_by = auth.uid());

CREATE POLICY "Creators can delete their recurring bills"
ON public.recurring_bills FOR DELETE
USING (created_by = auth.uid());

-- recurring_bill_splits policies
CREATE POLICY "Room members can view recurring splits"
ON public.recurring_bill_splits FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.recurring_bills rb
  WHERE rb.id = recurring_bill_splits.recurring_bill_id
    AND rb.room_id IN (SELECT get_user_room_ids(auth.uid()))
));

CREATE POLICY "Creators can manage recurring splits"
ON public.recurring_bill_splits FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.recurring_bills rb
  WHERE rb.id = recurring_bill_splits.recurring_bill_id
    AND rb.created_by = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.recurring_bills rb
  WHERE rb.id = recurring_bill_splits.recurring_bill_id
    AND rb.created_by = auth.uid()
));

-- recurring_bill_runs policies (read-only for members; writes via service role only)
CREATE POLICY "Room members can view recurring bill runs"
ON public.recurring_bill_runs FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.recurring_bills rb
  WHERE rb.id = recurring_bill_runs.recurring_bill_id
    AND rb.room_id IN (SELECT get_user_room_ids(auth.uid()))
));

-- Updated-at trigger
CREATE TRIGGER trg_recurring_bills_updated_at
BEFORE UPDATE ON public.recurring_bills
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();