
-- Fix 1: Expense creators can't reassign user_id on splits
DROP POLICY IF EXISTS "Expense creators can update split amounts" ON public.expense_splits;
CREATE POLICY "Expense creators can update split amounts"
ON public.expense_splits FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM expenses
    WHERE expenses.id = expense_splits.expense_id
    AND expenses.created_by = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM expenses
    WHERE expenses.id = expense_splits.expense_id
    AND expenses.created_by = auth.uid()
  )
);

-- Fix 2: Notifications can only target actual room members
DROP POLICY IF EXISTS "Users can create notifications for room members" ON public.notifications;
CREATE POLICY "Users can create notifications for room members"
ON public.notifications FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND is_room_member(auth.uid(), room_id)
  AND is_room_member(user_id, room_id)
);
