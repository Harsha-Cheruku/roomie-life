-- Create expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create expense_items table for individual line items
CREATE TABLE public.expense_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create expense_splits table for tracking who owes what
CREATE TABLE public.expense_splits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  expense_item_id UUID REFERENCES public.expense_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

-- Expenses policies
CREATE POLICY "Users can view expenses in their rooms"
ON public.expenses FOR SELECT
USING (EXISTS (
  SELECT 1 FROM room_members
  WHERE room_members.room_id = expenses.room_id
  AND room_members.user_id = auth.uid()
));

CREATE POLICY "Users can create expenses in their rooms"
ON public.expenses FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM room_members
  WHERE room_members.room_id = expenses.room_id
  AND room_members.user_id = auth.uid()
));

CREATE POLICY "Users can update expenses they created"
ON public.expenses FOR UPDATE
USING (created_by = auth.uid());

CREATE POLICY "Users can delete expenses they created"
ON public.expenses FOR DELETE
USING (created_by = auth.uid());

-- Expense items policies
CREATE POLICY "Users can view expense items in their rooms"
ON public.expense_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM expenses
  JOIN room_members ON room_members.room_id = expenses.room_id
  WHERE expenses.id = expense_items.expense_id
  AND room_members.user_id = auth.uid()
));

CREATE POLICY "Users can create expense items"
ON public.expense_items FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM expenses
  JOIN room_members ON room_members.room_id = expenses.room_id
  WHERE expenses.id = expense_items.expense_id
  AND room_members.user_id = auth.uid()
));

CREATE POLICY "Users can update expense items"
ON public.expense_items FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM expenses
  WHERE expenses.id = expense_items.expense_id
  AND expenses.created_by = auth.uid()
));

CREATE POLICY "Users can delete expense items"
ON public.expense_items FOR DELETE
USING (EXISTS (
  SELECT 1 FROM expenses
  WHERE expenses.id = expense_items.expense_id
  AND expenses.created_by = auth.uid()
));

-- Expense splits policies
CREATE POLICY "Users can view splits in their rooms"
ON public.expense_splits FOR SELECT
USING (EXISTS (
  SELECT 1 FROM expenses
  JOIN room_members ON room_members.room_id = expenses.room_id
  WHERE expenses.id = expense_splits.expense_id
  AND room_members.user_id = auth.uid()
));

CREATE POLICY "Users can create splits"
ON public.expense_splits FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM expenses
  JOIN room_members ON room_members.room_id = expenses.room_id
  WHERE expenses.id = expense_splits.expense_id
  AND room_members.user_id = auth.uid()
));

CREATE POLICY "Users can update their own splits"
ON public.expense_splits FOR UPDATE
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM expenses
  WHERE expenses.id = expense_splits.expense_id
  AND expenses.created_by = auth.uid()
));

CREATE POLICY "Expense creators can delete splits"
ON public.expense_splits FOR DELETE
USING (EXISTS (
  SELECT 1 FROM expenses
  WHERE expenses.id = expense_splits.expense_id
  AND expenses.created_by = auth.uid()
));

-- Add trigger for updated_at
CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();