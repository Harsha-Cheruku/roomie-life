import { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface EditExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: {
    id: string;
    title: string;
    total_amount: number;
    category?: string;
    notes?: string;
  } | null;
  onComplete: () => void;
}

const CATEGORIES = [
  { value: 'groceries', label: '🛒 Groceries' },
  { value: 'food', label: '🍕 Food & Dining' },
  { value: 'rent', label: '🏠 Rent' },
  { value: 'utilities', label: '⚡ Utilities' },
  { value: 'internet', label: '📶 Internet & WiFi' },
  { value: 'subscriptions', label: '📺 Subscriptions' },
  { value: 'transport', label: '🚗 Transport' },
  { value: 'entertainment', label: '🎬 Entertainment' },
  { value: 'shopping', label: '🛍️ Shopping' },
  { value: 'general', label: '📝 General' },
];

export const EditExpenseDialog = ({ 
  open, 
  onOpenChange, 
  expense,
  onComplete 
}: EditExpenseDialogProps) => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('general');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (expense && open) {
      setTitle(expense.title);
      setAmount(expense.total_amount.toString());
      setCategory(expense.category || 'general');
      setNotes(expense.notes || '');
    }
  }, [expense, open]);

  const handleSave = async () => {
    if (!expense || !title.trim() || !amount) {
      toast({
        title: 'Missing information',
        description: 'Please fill in the title and amount',
        variant: 'destructive',
      });
      return;
    }

    const totalAmount = parseFloat(amount);
    if (totalAmount <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Amount must be greater than 0',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          title: title.trim(),
          total_amount: totalAmount,
          category,
          notes: notes.trim() || null,
        })
        .eq('id', expense.id);

      if (error) throw error;

      toast({ title: 'Expense updated! ✓' });
      onComplete();
      onOpenChange(false);
    } catch (error) {
      console.error('Error updating expense:', error);
      toast({
        title: 'Failed to update',
        description: 'Could not update the expense. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCategory = CATEGORIES.find(c => c.value === category);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="text-xl font-bold">Edit Expense</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-4 pb-4">
          {/* Title */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Title</label>
            <Input 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 rounded-xl h-12"
              placeholder="What's this expense for?"
            />
          </div>

          {/* Amount */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Amount</label>
            <div className="relative mt-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">₹</span>
              <Input 
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-xl h-12 pl-8 text-lg font-semibold"
                placeholder="0.00"
                step="0.01"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1 rounded-xl h-12">
                <SelectValue>
                  {selectedCategory?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Notes (optional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 rounded-xl resize-none"
              rows={3}
              placeholder="Add any extra details..."
            />
          </div>
        </div>

        {/* Submit button */}
        <div className="shrink-0 p-4 border-t">
          <Button
            className="w-full h-12 rounded-xl text-base gap-2 press-effect"
            onClick={handleSave}
            disabled={isSaving || !title.trim() || !amount}
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
