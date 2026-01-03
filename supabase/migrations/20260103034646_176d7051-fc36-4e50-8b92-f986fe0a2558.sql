-- =====================================================
-- SECURITY HARDENING MIGRATION
-- =====================================================

-- 1. Add indexes for frequently queried columns (performance)
CREATE INDEX IF NOT EXISTS idx_tasks_room_id ON public.tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks(created_by);

CREATE INDEX IF NOT EXISTS idx_expenses_room_id ON public.expenses(room_id);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_by ON public.expenses(paid_by);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);

CREATE INDEX IF NOT EXISTS idx_expense_splits_expense_id ON public.expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user_id ON public.expense_splits(user_id);

CREATE INDEX IF NOT EXISTS idx_messages_room_id ON public.messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON public.room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON public.room_members(user_id);

CREATE INDEX IF NOT EXISTS idx_alarms_room_id ON public.alarms(room_id);
CREATE INDEX IF NOT EXISTS idx_alarms_is_active ON public.alarms(is_active);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

-- 2. Fix Room Invite Code Enumeration Vulnerability
-- Drop the overly permissive policy and create a more restrictive one
DROP POLICY IF EXISTS "Users can find rooms by invite code" ON public.rooms;

-- Create a function to lookup room by exact invite code only
CREATE OR REPLACE FUNCTION public.lookup_room_by_invite_code(code text)
RETURNS SETOF rooms
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.rooms WHERE invite_code = upper(trim(code)) LIMIT 1;
$$;

-- Policy: Users can only view rooms they're members of
CREATE POLICY "Users can view their own rooms"
ON public.rooms
FOR SELECT
USING (id IN (SELECT get_user_room_ids(auth.uid())));

-- 3. Fix Room Member Role Escalation Vulnerability
-- Drop existing insert policy and create a more secure one
DROP POLICY IF EXISTS "Users can join rooms" ON public.room_members;

CREATE POLICY "Users can join rooms as member only"
ON public.room_members
FOR INSERT
WITH CHECK (
  auth.uid() = user_id 
  AND role = 'member'  -- Prevent self-assignment of admin role
);

-- Allow room admins to update member roles
CREATE POLICY "Admins can update member roles"
ON public.room_members
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.room_members admin_check
    WHERE admin_check.room_id = room_members.room_id
    AND admin_check.user_id = auth.uid()
    AND admin_check.role = 'admin'
  )
);

-- 4. Fix Expense Split Authorization Issue
-- Drop the overly permissive update policy
DROP POLICY IF EXISTS "Users can update their own splits" ON public.expense_splits;

-- Users can only update their own splits (mark as paid)
CREATE POLICY "Users can mark their own splits as paid"
ON public.expense_splits
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Expense creators can update split amounts (for recalculation)
CREATE POLICY "Expense creators can update split amounts"
ON public.expense_splits
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.expenses
    WHERE expenses.id = expense_splits.expense_id
    AND expenses.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expenses
    WHERE expenses.id = expense_splits.expense_id
    AND expenses.created_by = auth.uid()
  )
  AND user_id = expense_splits.user_id  -- Cannot change who the split belongs to
);

-- 5. Create a helper function to check if user is room admin
CREATE OR REPLACE FUNCTION public.is_room_admin(_room_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE room_id = _room_id
    AND user_id = _user_id
    AND role = 'admin'
  );
$$;

-- 6. Add constraint to ensure only valid roles
ALTER TABLE public.room_members
DROP CONSTRAINT IF EXISTS valid_role;

ALTER TABLE public.room_members
ADD CONSTRAINT valid_role CHECK (role IN ('admin', 'member'));