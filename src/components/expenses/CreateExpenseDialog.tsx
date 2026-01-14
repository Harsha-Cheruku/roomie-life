import { useState, useEffect } from 'react';
import { Save, Loader2, Users, Percent, Calculator, Equal, Bell, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCreateNotification } from '@/hooks/useCreateNotification';

interface RoomMember {
  user_id: string;
  profile: {
    display_name: string;
    avatar: string;
  };
}

interface MemberSplit {
  user_id: string;
  amount: number;
  percentage: number;
  selected: boolean;
}

interface CreateExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

const CATEGORIES = [
  { value: 'groceries', label: '🛒 Groceries', emoji: '🛒' },
  { value: 'food', label: '🍕 Food & Dining', emoji: '🍕' },
  { value: 'rent', label: '🏠 Rent', emoji: '🏠' },
  { value: 'utilities', label: '⚡ Utilities', emoji: '⚡' },
  { value: 'internet', label: '📶 Internet & WiFi', emoji: '📶' },
  { value: 'subscriptions', label: '📺 Subscriptions', emoji: '📺' },
  { value: 'transport', label: '🚗 Transport', emoji: '🚗' },
  { value: 'entertainment', label: '🎬 Entertainment', emoji: '🎬' },
  { value: 'shopping', label: '🛍️ Shopping', emoji: '🛍️' },
  { value: 'general', label: '📝 General', emoji: '📝' },
];

export const CreateExpenseDialog = ({ 
  open, 
  onOpenChange, 
  onComplete 
}: CreateExpenseDialogProps) => {
  const { user, currentRoom, isSoloMode } = useAuth();
  const { toast } = useToast();
  const { createExpenseNotification } = useCreateNotification();
  
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('general');
  const [paidBy, setPaidBy] = useState<string>('');
  const [splitType, setSplitType] = useState<'equal' | 'percentage' | 'custom'>('equal');
  const [notes, setNotes] = useState('');
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [memberSplits, setMemberSplits] = useState<MemberSplit[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Reminder fields
  const [enableReminder, setEnableReminder] = useState(false);
  const [reminderDate, setReminderDate] = useState('');

  useEffect(() => {
    if (currentRoom && open) {
      fetchRoomMembers();
    }
  }, [currentRoom, open]);

  useEffect(() => {
    if (user) {
      setPaidBy(user.id);
    }
  }, [user]);

  useEffect(() => {
    // Recalculate splits when amount or split type changes
    recalculateSplits();
  }, [amount, splitType, memberSplits.filter(m => m.selected).length]);

  const fetchRoomMembers = async () => {
    if (!currentRoom) return;

    // First get room member user_ids
    const { data: memberData, error: memberError } = await supabase
      .from('room_members')
      .select('user_id')
      .eq('room_id', currentRoom.id);

    if (memberError) {
      console.error('Error fetching room members:', memberError);
      return;
    }

    if (!memberData || memberData.length === 0) {
      setRoomMembers([]);
      setMemberSplits([]);
      return;
    }

    // Then fetch profiles for those users
    const userIds = memberData.map(m => m.user_id);
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar')
      .in('user_id', userIds);

    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      return;
    }

    const profileMap = new Map(profileData?.map(p => [p.user_id, p]) || []);

    const members = memberData.map(member => {
      const profile = profileMap.get(member.user_id);
      return {
        user_id: member.user_id,
        profile: {
          display_name: profile?.display_name || 'Unknown',
          avatar: profile?.avatar || '😊',
        },
      };
    });

    setRoomMembers(members);
    
    // Initialize member splits - all selected by default
    const initialSplits = members.map(m => ({
      user_id: m.user_id,
      amount: 0,
      percentage: 100 / members.length,
      selected: true,
    }));
    setMemberSplits(initialSplits);
  };

  const recalculateSplits = () => {
    const totalAmount = parseFloat(amount) || 0;
    const selectedMembers = memberSplits.filter(m => m.selected);
    
    if (selectedMembers.length === 0) return;

    setMemberSplits(prev => {
      const selected = prev.filter(m => m.selected);
      const selectedCount = selected.length;
      
      if (selectedCount === 0) return prev;
      
      // For equal split, distribute evenly with proper rounding
      if (splitType === 'equal') {
        const baseShare = Math.floor((totalAmount * 100) / selectedCount) / 100; // Truncate to 2 decimals
        const remainder = totalAmount - (baseShare * selectedCount);
        
        let index = 0;
        return prev.map(split => {
          if (!split.selected) {
            return { ...split, amount: 0, percentage: 0 };
          }
          
          // Give remainder cents to first person
          const share = index === 0 ? baseShare + remainder : baseShare;
          index++;
          
          return { 
            ...split, 
            amount: Math.round(share * 100) / 100, 
            percentage: 100 / selectedCount 
          };
        });
      }
      
      return prev.map(split => {
        if (!split.selected) {
          return { ...split, amount: 0, percentage: 0 };
        }
        
        // For percentage, recalculate amount
        if (splitType === 'percentage') {
          return { ...split, amount: Math.round((totalAmount * split.percentage) / 100 * 100) / 100 };
        }
        
        return split;
      });
    });
  };

  const toggleMemberSelection = (userId: string) => {
    setMemberSplits(prev => {
      const updated = prev.map(split => 
        split.user_id === userId 
          ? { ...split, selected: !split.selected }
          : split
      );
      return updated;
    });
    
    // Trigger recalculation after state update
    setTimeout(recalculateSplits, 0);
  };

  const updateMemberPercentage = (userId: string, percentage: number) => {
    const totalAmount = parseFloat(amount) || 0;
    setMemberSplits(prev => prev.map(split => 
      split.user_id === userId 
        ? { ...split, percentage, amount: (totalAmount * percentage) / 100 }
        : split
    ));
  };

  const updateMemberAmount = (userId: string, customAmount: number) => {
    const totalAmount = parseFloat(amount) || 0;
    setMemberSplits(prev => prev.map(split => 
      split.user_id === userId 
        ? { ...split, amount: customAmount, percentage: totalAmount > 0 ? (customAmount / totalAmount) * 100 : 0 }
        : split
    ));
  };

  const getTotalSplitAmount = () => {
    return memberSplits.filter(m => m.selected).reduce((sum, m) => sum + m.amount, 0);
  };

  const getTotalPercentage = () => {
    return memberSplits.filter(m => m.selected).reduce((sum, m) => sum + m.percentage, 0);
  };

  const isValidSplit = () => {
    const totalAmount = parseFloat(amount) || 0;
    if (totalAmount <= 0) return false;
    
    if (splitType === 'percentage') {
      return Math.abs(getTotalPercentage() - 100) < 0.01;
    }
    if (splitType === 'custom') {
      return Math.abs(getTotalSplitAmount() - totalAmount) < 0.01;
    }
    return true; // Equal split is always valid
  };

  const saveExpense = async () => {
    if (!user || !currentRoom || !title.trim() || !amount) {
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

    // In solo mode, the expense is just for the user (no split needed)
    let selectedSplits = memberSplits.filter(m => m.selected && m.amount > 0);

    // Solo mode: auto-select only user
    if (isSoloMode) {
      selectedSplits = [{
        user_id: user.id,
        amount: totalAmount,
        percentage: 100,
        selected: true,
      }];
    }

    if (selectedSplits.length === 0) {
      toast({
        title: 'No members selected',
        description: 'Please select at least one member to split with',
        variant: 'destructive',
      });
      return;
    }

    // Validate split totals (only in non-solo mode)
    if (!isSoloMode) {
      if (splitType === 'percentage' && Math.abs(getTotalPercentage() - 100) >= 0.01) {
        toast({
          title: 'Invalid percentages',
          description: 'Percentages must add up to 100%',
          variant: 'destructive',
        });
        return;
      }

      if (splitType === 'custom' && Math.abs(getTotalSplitAmount() - totalAmount) >= 0.01) {
        toast({
          title: 'Invalid split amounts',
          description: `Split amounts must total ₹${totalAmount.toFixed(0)}`,
          variant: 'destructive',
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      // Create the expense
      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          room_id: currentRoom.id,
          created_by: user.id,
          paid_by: isSoloMode ? user.id : paidBy,
          title: title.trim(),
          total_amount: totalAmount,
          category,
          split_type: isSoloMode ? 'equal' : splitType,
          notes: notes.trim() || null,
          status: isSoloMode ? 'settled' : 'pending', // Solo mode expenses are auto-settled
        })
        .select()
        .single();

      if (expenseError) throw expenseError;

      // Create splits for each selected member
      const splits = selectedSplits.map(split => ({
        expense_id: expense.id,
        user_id: split.user_id,
        amount: split.amount,
        is_paid: isSoloMode ? true : split.user_id === paidBy, // Solo mode: auto-paid
        status: isSoloMode ? 'accepted' : (split.user_id === paidBy ? 'accepted' : 'pending'),
      }));

      const { error: splitsError } = await supabase
        .from('expense_splits')
        .insert(splits);

      if (splitsError) throw splitsError;

      // Create notifications for assigned users (non-solo mode only)
      if (!isSoloMode) {
        await createExpenseNotification(
          { 
            id: expense.id, 
            title: title.trim(), 
            total_amount: totalAmount, 
            created_by: user.id 
          },
          selectedSplits.map(s => s.user_id)
        );
      }

      // Create reminder if enabled
      if (enableReminder && reminderDate) {
        const { error: reminderError } = await supabase
          .from('reminders')
          .insert({
            room_id: currentRoom.id,
            created_by: user.id,
            title: `Bill Reminder: ${title.trim()}`,
            description: `Reminder for expense of ₹${totalAmount.toFixed(0)}`,
            remind_at: new Date(reminderDate).toISOString(),
            condition_type: 'expense',
            condition_ref_id: expense.id,
            status: 'scheduled',
          });

        if (reminderError) {
          console.error('Error creating reminder:', reminderError);
          // Don't fail the expense creation if reminder fails
        }
      }

      toast({
        title: isSoloMode ? 'Expense recorded! 💰' : 'Expense created! 🎉',
        description: isSoloMode 
          ? `₹${totalAmount.toFixed(0)} expense saved`
          : `Split ₹${totalAmount.toFixed(0)} between ${selectedSplits.length} people`,
      });

      // Reset form
      setTitle('');
      setAmount('');
      setCategory('general');
      setNotes('');
      setSplitType('equal');
      setEnableReminder(false);
      setReminderDate('');
      
      onComplete();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving expense:', error);
      toast({
        title: 'Failed to save',
        description: 'Could not save the expense. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCategory = CATEGORIES.find(c => c.value === category);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] rounded-t-3xl overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="text-xl font-bold">Add Expense</SheetTitle>
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

          {/* Paid By - Hidden in Solo Mode */}
          {!isSoloMode && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Paid By</label>
              <Select value={paidBy} onValueChange={setPaidBy}>
                <SelectTrigger className="mt-1 rounded-xl h-12">
                  <SelectValue>
                    {roomMembers.find(m => m.user_id === paidBy)?.profile.display_name || 'Select payer'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {roomMembers.map(member => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      <div className="flex items-center gap-2">
                        <span>{member.profile.avatar}</span>
                        <span>{member.profile.display_name}</span>
                        {member.user_id === user?.id && <span className="text-xs text-primary">(You)</span>}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Split Type - Hidden in Solo Mode */}
          {!isSoloMode && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Split Type</label>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <button
                  onClick={() => setSplitType('equal')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    splitType === 'equal' ? 'border-primary bg-primary/10' : 'border-border'
                  }`}
                >
                  <Equal className="w-5 h-5" />
                  <span className="text-xs font-medium">Equal</span>
                </button>
                <button
                  onClick={() => setSplitType('percentage')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    splitType === 'percentage' ? 'border-primary bg-primary/10' : 'border-border'
                  }`}
                >
                  <Percent className="w-5 h-5" />
                  <span className="text-xs font-medium">Percentage</span>
                </button>
                <button
                  onClick={() => setSplitType('custom')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-1 transition-all ${
                    splitType === 'custom' ? 'border-primary bg-primary/10' : 'border-border'
                  }`}
                >
                  <Calculator className="w-5 h-5" />
                  <span className="text-xs font-medium">Custom</span>
                </button>
              </div>
            </div>
          )}

          {/* Assign To - Hidden in Solo Mode */}
          {!isSoloMode && (
            <div>
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              Split Between
            </label>
            <div className="space-y-2 mt-2">
              {roomMembers.map(member => {
                const split = memberSplits.find(s => s.user_id === member.user_id);
                const isSelected = split?.selected || false;
                
                return (
                  <div 
                    key={member.user_id}
                    className={`p-3 rounded-xl border transition-all ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleMemberSelection(member.user_id)}
                        className="flex items-center gap-2 flex-1"
                      >
                        <Avatar className="w-10 h-10">
                          <AvatarFallback className="bg-primary/20 text-lg">
                            {member.profile.avatar}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-left">
                          <p className="font-medium text-sm">{member.profile.display_name}</p>
                          {member.user_id === user?.id && (
                            <span className="text-xs text-primary">You</span>
                          )}
                        </div>
                      </button>
                      
                      {isSelected && splitType === 'equal' && (
                        <span className="font-semibold text-primary">
                          ₹{split?.amount.toFixed(0) || 0}
                        </span>
                      )}
                      
                      {isSelected && splitType === 'percentage' && (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={split?.percentage.toFixed(0) || 0}
                            onChange={(e) => updateMemberPercentage(member.user_id, parseFloat(e.target.value) || 0)}
                            className="w-16 h-8 text-center rounded-lg"
                            min="0"
                            max="100"
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>
                      )}
                      
                      {isSelected && splitType === 'custom' && (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">₹</span>
                          <Input
                            type="number"
                            value={split?.amount.toFixed(0) || 0}
                            onChange={(e) => updateMemberAmount(member.user_id, parseFloat(e.target.value) || 0)}
                            className="w-20 h-8 rounded-lg"
                            min="0"
                            step="1"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Split validation */}
            {splitType !== 'equal' && (
              <div className="mt-2 text-sm">
                {splitType === 'percentage' && (
                  <p className={getTotalPercentage() === 100 ? 'text-mint' : 'text-coral'}>
                    Total: {getTotalPercentage().toFixed(0)}% {getTotalPercentage() !== 100 && '(should be 100%)'}
                  </p>
                )}
                {splitType === 'custom' && amount && (
                  <p className={Math.abs(getTotalSplitAmount() - parseFloat(amount)) < 0.01 ? 'text-mint' : 'text-coral'}>
                    Total: ₹{getTotalSplitAmount().toFixed(0)} of ₹{parseFloat(amount).toFixed(0)}
                  </p>
                )}
              </div>
            )}
            </div>
          )}

          {/* Reminder Option */}
          <div className="bg-muted/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                <label className="text-sm font-medium">Set Reminder</label>
              </div>
              <Switch
                checked={enableReminder}
                onCheckedChange={setEnableReminder}
              />
            </div>
            
            {enableReminder && (
              <div>
                <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <Calendar className="w-3 h-3" />
                  Reminder Date & Time
                </label>
                <Input
                  type="datetime-local"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  className="rounded-xl"
                  min={new Date().toISOString().slice(0, 16)}
                />
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Notes (optional)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 rounded-xl resize-none"
              placeholder="Add any notes..."
              rows={2}
            />
          </div>
        </div>

        {/* Save button */}
        <div className="shrink-0 pt-4 border-t">
          <Button 
            className="w-full h-14 rounded-xl text-base gap-2 press-effect"
            onClick={saveExpense}
            disabled={isSaving || !title.trim() || !amount}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Create Expense
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
