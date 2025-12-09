import { useState, useEffect } from 'react';
import { Check, ChevronDown, Users, Minus, Plus, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ExtractedItem {
  name: string;
  price: number;
  quantity: number;
}

interface ScanResult {
  title: string;
  items: ExtractedItem[];
  total: number;
}

interface RoomMember {
  user_id: string;
  profile: {
    display_name: string;
    avatar: string;
  };
}

interface ItemAssignment {
  [itemIndex: number]: string[]; // Array of user_ids assigned to each item
}

interface ExpenseSplitterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scanResult: ScanResult | null;
  receiptImage: string | null;
  onComplete: () => void;
}

export const ExpenseSplitter = ({ 
  open, 
  onOpenChange, 
  scanResult, 
  receiptImage,
  onComplete 
}: ExpenseSplitterProps) => {
  const { user, currentRoom } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [title, setTitle] = useState('');
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [assignments, setAssignments] = useState<ItemAssignment>({});
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (scanResult) {
      setItems(scanResult.items);
      setTitle(scanResult.title || 'Scanned Receipt');
      // Default: assign all items to all members
      const defaultAssignments: ItemAssignment = {};
      scanResult.items.forEach((_, index) => {
        defaultAssignments[index] = [];
      });
      setAssignments(defaultAssignments);
    }
  }, [scanResult]);

  useEffect(() => {
    if (currentRoom && open) {
      fetchRoomMembers();
    }
  }, [currentRoom, open]);

  const fetchRoomMembers = async () => {
    if (!currentRoom) return;

    const { data, error } = await supabase
      .from('room_members')
      .select(`
        user_id,
        profiles:user_id (
          display_name,
          avatar
        )
      `)
      .eq('room_id', currentRoom.id);

    if (error) {
      console.error('Error fetching room members:', error);
      return;
    }

    const members = data?.map((member: any) => ({
      user_id: member.user_id,
      profile: {
        display_name: member.profiles?.display_name || 'Unknown',
        avatar: member.profiles?.avatar || '😊',
      },
    })) || [];

    setRoomMembers(members);

    // Default all items to split among all members
    if (scanResult) {
      const allMemberIds = members.map(m => m.user_id);
      const defaultAssignments: ItemAssignment = {};
      scanResult.items.forEach((_, index) => {
        defaultAssignments[index] = allMemberIds;
      });
      setAssignments(defaultAssignments);
    }
  };

  const toggleMemberAssignment = (itemIndex: number, userId: string) => {
    setAssignments(prev => {
      const current = prev[itemIndex] || [];
      const isAssigned = current.includes(userId);
      return {
        ...prev,
        [itemIndex]: isAssigned 
          ? current.filter(id => id !== userId)
          : [...current, userId],
      };
    });
  };

  const updateItemPrice = (index: number, price: number) => {
    setItems(prev => prev.map((item, i) => 
      i === index ? { ...item, price: Math.max(0, price) } : item
    ));
  };

  const updateItemQuantity = (index: number, delta: number) => {
    setItems(prev => prev.map((item, i) => 
      i === index ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
    ));
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    setAssignments(prev => {
      const newAssignments: ItemAssignment = {};
      Object.keys(prev).forEach(key => {
        const keyNum = parseInt(key);
        if (keyNum < index) {
          newAssignments[keyNum] = prev[keyNum];
        } else if (keyNum > index) {
          newAssignments[keyNum - 1] = prev[keyNum];
        }
      });
      return newAssignments;
    });
  };

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const calculateMemberOwes = (userId: string) => {
    let total = 0;
    items.forEach((item, index) => {
      const assignedMembers = assignments[index] || [];
      if (assignedMembers.includes(userId) && assignedMembers.length > 0) {
        total += (item.price * item.quantity) / assignedMembers.length;
      }
    });
    return total;
  };

  const saveExpense = async () => {
    if (!user || !currentRoom || items.length === 0) return;

    setIsSaving(true);
    try {
      // Create the expense
      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          room_id: currentRoom.id,
          created_by: user.id,
          title,
          total_amount: calculateTotal(),
          receipt_url: receiptImage,
          status: 'pending',
        })
        .select()
        .single();

      if (expenseError) throw expenseError;

      // Create expense items
      const expenseItems = items.map(item => ({
        expense_id: expense.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
      }));

      const { data: createdItems, error: itemsError } = await supabase
        .from('expense_items')
        .insert(expenseItems)
        .select();

      if (itemsError) throw itemsError;

      // Create splits for each item
      const splits: any[] = [];
      createdItems.forEach((createdItem, index) => {
        const assignedMembers = assignments[index] || [];
        if (assignedMembers.length > 0) {
          const itemTotal = items[index].price * items[index].quantity;
          const splitAmount = itemTotal / assignedMembers.length;

          assignedMembers.forEach(userId => {
            splits.push({
              expense_id: expense.id,
              expense_item_id: createdItem.id,
              user_id: userId,
              amount: splitAmount,
              is_paid: userId === user.id, // Creator already paid
            });
          });
        }
      });

      if (splits.length > 0) {
        const { error: splitsError } = await supabase
          .from('expense_splits')
          .insert(splits);

        if (splitsError) throw splitsError;
      }

      toast({
        title: 'Expense saved!',
        description: `Split between ${roomMembers.length} roommates`,
      });

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

  if (!scanResult) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] rounded-t-3xl overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="text-xl font-bold">Split Expense</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-4 pb-4">
          {/* Title input */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Title</label>
            <Input 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 rounded-xl"
              placeholder="Expense title"
            />
          </div>

          {/* Items list */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground">
              Items ({items.length})
            </label>
            
            {items.map((item, index) => (
              <div 
                key={index}
                className="bg-muted/50 rounded-2xl overflow-hidden"
              >
                <div 
                  className="p-4 flex items-center gap-3 cursor-pointer"
                  onClick={() => setExpandedItem(expandedItem === index ? null : index)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Qty: {item.quantity}</span>
                      <span>•</span>
                      <span className="text-primary font-semibold">
                        ₹{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-2">
                      {(assignments[index] || []).slice(0, 3).map(userId => {
                        const member = roomMembers.find(m => m.user_id === userId);
                        return (
                          <Avatar key={userId} className="w-6 h-6 border-2 border-background">
                            <AvatarFallback className="text-xs bg-primary/20">
                              {member?.profile.avatar || '😊'}
                            </AvatarFallback>
                          </Avatar>
                        );
                      })}
                      {(assignments[index] || []).length > 3 && (
                        <Avatar className="w-6 h-6 border-2 border-background">
                          <AvatarFallback className="text-xs bg-muted">
                            +{(assignments[index] || []).length - 3}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${expandedItem === index ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {expandedItem === index && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                    {/* Price and quantity controls */}
                    <div className="flex items-center gap-4 pt-3">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Price</label>
                        <Input
                          type="number"
                          value={item.price}
                          onChange={(e) => updateItemPrice(index, parseFloat(e.target.value) || 0)}
                          className="mt-1 h-10 rounded-lg"
                          step="0.01"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground">Qty</label>
                        <div className="flex items-center gap-1 mt-1">
                          <Button 
                            size="icon" 
                            variant="outline" 
                            className="h-8 w-8 rounded-lg"
                            onClick={() => updateItemQuantity(index, -1)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="w-8 text-center font-medium">{item.quantity}</span>
                          <Button 
                            size="icon" 
                            variant="outline" 
                            className="h-8 w-8 rounded-lg"
                            onClick={() => updateItemQuantity(index, 1)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Member assignment */}
                    <div>
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        Split between
                      </label>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {roomMembers.map(member => {
                          const isAssigned = (assignments[index] || []).includes(member.user_id);
                          return (
                            <button
                              key={member.user_id}
                              onClick={() => toggleMemberAssignment(index, member.user_id)}
                              className={`flex items-center gap-2 p-2 rounded-xl border transition-colors ${
                                isAssigned 
                                  ? 'border-primary bg-primary/10' 
                                  : 'border-border hover:border-primary/50'
                              }`}
                            >
                              <Avatar className="w-8 h-8">
                                <AvatarFallback className="bg-primary/20">
                                  {member.profile.avatar}
                                </AvatarFallback>
                              </Avatar>
                              <span className="flex-1 text-left text-sm truncate">
                                {member.profile.display_name}
                              </span>
                              {isAssigned && (
                                <Check className="w-4 h-4 text-primary shrink-0" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Remove button */}
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeItem(index)}
                    >
                      Remove item
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="bg-muted/50 rounded-2xl p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" />
              Split Summary
            </h3>
            {roomMembers.map(member => {
              const owes = calculateMemberOwes(member.user_id);
              return (
                <div key={member.user_id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-primary/20">
                        {member.profile.avatar}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{member.profile.display_name}</span>
                    {member.user_id === user?.id && (
                      <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                        You
                      </span>
                    )}
                  </div>
                  <span className={`font-semibold ${owes > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                    ₹{owes.toFixed(2)}
                  </span>
                </div>
              );
            })}
            <div className="border-t border-border pt-3 flex items-center justify-between">
              <span className="font-semibold">Total</span>
              <span className="text-lg font-bold text-primary">₹{calculateTotal().toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="shrink-0 pt-4 border-t">
          <Button 
            className="w-full h-14 rounded-xl text-base gap-2"
            onClick={saveExpense}
            disabled={isSaving || items.length === 0}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Expense
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
