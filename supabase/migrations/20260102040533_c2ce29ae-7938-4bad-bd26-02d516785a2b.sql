-- Add category, split_type, and paid_by to expenses table
ALTER TABLE public.expenses 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'general',
ADD COLUMN IF NOT EXISTS split_type text DEFAULT 'equal',
ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id);

-- Update existing expenses to set paid_by from created_by
UPDATE public.expenses SET paid_by = created_by WHERE paid_by IS NULL;

-- Make paid_by NOT NULL after setting values
ALTER TABLE public.expenses ALTER COLUMN paid_by SET NOT NULL;

-- Add notes column
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS notes text;