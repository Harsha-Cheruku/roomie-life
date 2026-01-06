-- Add rejection_comment columns to tasks and expense_splits tables
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS rejection_comment text DEFAULT NULL;

ALTER TABLE public.expense_splits 
ADD COLUMN IF NOT EXISTS rejection_comment text DEFAULT NULL;