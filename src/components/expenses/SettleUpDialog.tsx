import { useState } from 'react';
import { Check, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Balance {
  user_id: string;
  name: string;
  avatar: string;
  owes: number;
}

interface SettleUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  balances: Balance[];
  onComplete: () => void;
}

export const SettleUpDialog = ({ 
  open, 
  onOpenChange, 
  balances,
  onComplete 
}: SettleUpDialogProps) => {
  const { user, currentRoom } = useAuth();
  const { toast } = useToast();
  const [selectedPerson, setSelectedPerson] = useState<Balance | null>(null);
  const [amount, setAmount] = useState('');
  const [isSettling, setIsSettling] = useState(false);

  const handleSettle = async () => {
    if (!user || !currentRoom || !selectedPerson || !amount) return;

    const settleAmount = parseFloat(amount);
    if (settleAmount <= 0) return;

    setIsSettling(true);
    try {
      // Find all pending splits where this person owes the current user
      // or where current user owes this person
      const { data: expenses } = await supabase
        .from('expenses')
        .select(`
          id,
          created_by,
          expense_splits (
            id,
            user_id,
            amount,
            is_paid,
            status
          )
        `)
        .eq('room_id', currentRoom.id);

      let amountToSettle = settleAmount;

      for (const expense of expenses || []) {
        if (amountToSettle <= 0) break;

        for (const split of expense.expense_splits || []) {
          if (amountToSettle <= 0) break;

          // If they owe the current user
          if (expense.created_by === user.id && 
              split.user_id === selectedPerson.user_id && 
              !split.is_paid && 
              split.status === 'accepted') {
            
            if (split.amount <= amountToSettle) {
              // Fully settle this split
              await supabase
                .from('expense_splits')
                .update({ is_paid: true })
                .eq('id', split.id);
              amountToSettle -= split.amount;
            }
          }

          // If current user owes them
          if (expense.created_by === selectedPerson.user_id && 
              split.user_id === user.id && 
              !split.is_paid && 
              split.status === 'accepted') {
            
            if (split.amount <= amountToSettle) {
              // Fully settle this split
              await supabase
                .from('expense_splits')
                .update({ is_paid: true })
                .eq('id', split.id);
              amountToSettle -= split.amount;
            }
          }
        }
      }

      toast({
        title: 'Settled up! 🎉',
        description: `Marked ₹${settleAmount.toFixed(0)} as settled with ${selectedPerson.name}`,
      });

      setSelectedPerson(null);
      setAmount('');
      onComplete();
      onOpenChange(false);
    } catch (error) {
      console.error('Error settling up:', error);
      toast({
        title: 'Failed to settle',
        description: 'Could not record the settlement. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSettling(false);
    }
  };

  // Separate balances into "they owe you" and "you owe them"
  const theyOweYou = balances.filter(b => b.owes > 0);
  const youOweThem = balances.filter(b => b.owes < 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-3xl overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="text-xl font-bold">Settle Up</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-6 pb-4">
          {!selectedPerson ? (
            <>
              {/* They owe you */}
              {theyOweYou.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    They owe you
                  </h3>
                  <div className="space-y-2">
                    {theyOweYou.map(person => (
                      <button
                        key={person.user_id}
                        onClick={() => {
                          setSelectedPerson(person);
                          setAmount(Math.abs(person.owes).toFixed(0));
                        }}
                        className="w-full p-4 rounded-2xl border border-border hover:border-primary transition-all flex items-center gap-3"
                      >
                        <Avatar className="w-12 h-12">
                          <AvatarFallback className="bg-mint/20 text-xl">
                            {person.avatar}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left">
                          <p className="font-medium">{person.name}</p>
                          <p className="text-sm text-mint font-semibold">
                            Owes you ₹{person.owes.toFixed(0)}
                          </p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* You owe them */}
              {youOweThem.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">
                    You owe
                  </h3>
                  <div className="space-y-2">
                    {youOweThem.map(person => (
                      <button
                        key={person.user_id}
                        onClick={() => {
                          setSelectedPerson(person);
                          setAmount(Math.abs(person.owes).toFixed(0));
                        }}
                        className="w-full p-4 rounded-2xl border border-border hover:border-primary transition-all flex items-center gap-3"
                      >
                        <Avatar className="w-12 h-12">
                          <AvatarFallback className="bg-coral/20 text-xl">
                            {person.avatar}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left">
                          <p className="font-medium">{person.name}</p>
                          <p className="text-sm text-coral font-semibold">
                            You owe ₹{Math.abs(person.owes).toFixed(0)}
                          </p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {theyOweYou.length === 0 && youOweThem.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-4xl mb-4">✅</p>
                  <p className="font-medium text-foreground">All settled up!</p>
                  <p className="text-sm text-muted-foreground">No pending balances</p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-6">
              {/* Selected person header */}
              <div className="text-center">
                <Avatar className="w-20 h-20 mx-auto mb-3">
                  <AvatarFallback className={cn(
                    "text-3xl",
                    selectedPerson.owes > 0 ? "bg-mint/20" : "bg-coral/20"
                  )}>
                    {selectedPerson.avatar}
                  </AvatarFallback>
                </Avatar>
                <p className="font-semibold text-lg">{selectedPerson.name}</p>
                <p className={cn(
                  "text-sm font-medium",
                  selectedPerson.owes > 0 ? "text-mint" : "text-coral"
                )}>
                  {selectedPerson.owes > 0 
                    ? `Owes you ₹${selectedPerson.owes.toFixed(0)}`
                    : `You owe ₹${Math.abs(selectedPerson.owes).toFixed(0)}`
                  }
                </p>
              </div>

              {/* Amount input */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Settlement Amount
                </label>
                <div className="relative mt-2">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">₹</span>
                  <Input 
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="rounded-xl h-14 pl-8 text-xl font-semibold text-center"
                    placeholder="0"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  This will mark expenses as paid
                </p>
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(Math.abs(selectedPerson.owes).toFixed(0))}
                  className="rounded-xl"
                >
                  Full ₹{Math.abs(selectedPerson.owes).toFixed(0)}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount((Math.abs(selectedPerson.owes) / 2).toFixed(0))}
                  className="rounded-xl"
                >
                  Half ₹{(Math.abs(selectedPerson.owes) / 2).toFixed(0)}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0 pt-4 border-t space-y-2">
          {selectedPerson ? (
            <>
              <Button 
                className="w-full h-14 rounded-xl text-base gap-2 press-effect"
                onClick={handleSettle}
                disabled={isSettling || !amount || parseFloat(amount) <= 0}
              >
                {isSettling ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Settling...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Record Settlement
                  </>
                )}
              </Button>
              <Button 
                variant="outline"
                className="w-full h-12 rounded-xl"
                onClick={() => setSelectedPerson(null)}
              >
                Back
              </Button>
            </>
          ) : (
            <Button 
              variant="outline"
              className="w-full h-12 rounded-xl"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
