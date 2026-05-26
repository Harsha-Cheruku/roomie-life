import { useState, useEffect, useRef } from 'react';
import { Check, ChevronDown, Users, Minus, Plus, Save, Loader2, PlusCircle, Lock, Edit3, Tag, X, Receipt, Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { useCreateNotification } from '@/hooks/useCreateNotification';
import { LockedBillView } from './LockedBillView';

interface ExtractedItem {
  name: string;
  price: number;
  quantity: number;
  isManual?: boolean; // Track manually added items
}

type AdjustmentType = 'tax' | 'fee' | 'discount';
interface Adjustment {
  label: string;
  amount: number;
  type: AdjustmentType;
}

interface ScanResult {
  title: string;
  items: ExtractedItem[];
  total: number;
  discount?: number;
  adjustments?: Adjustment[];
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
  const { user, currentRoom, profile } = useAuth();
  const { toast } = useToast();
  const { createExpenseNotification } = useCreateNotification();
  
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [title, setTitle] = useState('');
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [assignments, setAssignments] = useState<ItemAssignment>({});
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Who actually paid for this scanned bill. Defaults to current user but
  // can be changed to any roommate before the bill is locked.
  const [paidBy, setPaidBy] = useState<string>('');

  useEffect(() => {
    if (user && !paidBy) setPaidBy(user.id);
  }, [user, paidBy]);
  
  // New: Lock flow states
  const [isLocked, setIsLocked] = useState(false);
  const [showLockedView, setShowLockedView] = useState(false);
  
  // Track if items were loaded from OCR to prevent overwrites
  const initialLoadRef = useRef(false);

  useEffect(() => {
    if (scanResult && !initialLoadRef.current) {
      // Only set items on first load, preserve manual edits
      setItems(scanResult.items.map(item => ({ ...item, isManual: false })));
      setTitle(scanResult.title || 'Scanned Receipt');
      const initialAdj: Adjustment[] = Array.isArray(scanResult.adjustments)
        ? scanResult.adjustments
            .filter(a => a && Number(a.amount) > 0)
            .map(a => ({
              label: String(a.label || 'Charge'),
              amount: Math.abs(Number(a.amount) || 0),
              type: (a.type === 'tax' || a.type === 'fee' || a.type === 'discount') ? a.type : 'fee',
            }))
        : [];
      // Backward-compat: if only legacy discount field came back
      if (initialAdj.length === 0 && Number(scanResult.discount) > 0) {
        initialAdj.push({ label: 'Discount', amount: Number(scanResult.discount), type: 'discount' });
      }
      setAdjustments(initialAdj);
      // Default: assign all items to all members
      const defaultAssignments: ItemAssignment = {};
      scanResult.items.forEach((_, index) => {
        defaultAssignments[index] = [];
      });
      setAssignments(defaultAssignments);
      initialLoadRef.current = true;
    }
  }, [scanResult]);
  
  // Reset on close
  useEffect(() => {
    if (!open) {
      initialLoadRef.current = false;
      setIsLocked(false);
      setShowLockedView(false);
      setPaidBy(user?.id || '');
    }
  }, [open, user?.id]);

  useEffect(() => {
    if (currentRoom && open) {
      fetchRoomMembers();
    }
  }, [currentRoom, open]);

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

  const updateItemQuantityValue = (index: number, quantity: number) => {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, quantity: Math.max(1, Math.round(quantity || 1)) } : item
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

  // Add manual item
  const addManualItem = () => {
    const newItem: ExtractedItem = {
      name: 'New Item',
      price: 0,
      quantity: 1,
      isManual: true,
    };
    setItems(prev => [...prev, newItem]);
    // Assign to all members by default
    const allMemberIds = roomMembers.map(m => m.user_id);
    setAssignments(prev => ({
      ...prev,
      [items.length]: allMemberIds,
    }));
    // Expand the new item for editing
    setExpandedItem(items.length);
  };

  // Update item name
  const updateItemName = (index: number, name: string) => {
    setItems(prev => prev.map((item, i) => 
      i === index ? { ...item, name } : item
    ));
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const adjustmentsSum = (type: AdjustmentType) =>
    adjustments.filter(a => a.type === type).reduce((s, a) => s + (Number(a.amount) || 0), 0);

  const calculateTotal = () => {
    const sub = calculateSubtotal();
    const taxes = adjustmentsSum('tax');
    const fees = adjustmentsSum('fee');
    const disc = Math.min(adjustmentsSum('discount'), sub + taxes + fees);
    return Math.max(0, Math.round((sub + taxes + fees - disc) * 100) / 100);
  };

  // Per-item scale so member shares reflect taxes/fees/discounts proportionally.
  const totalFactor = () => {
    const sub = calculateSubtotal();
    if (sub <= 0) return 1;
    return calculateTotal() / sub;
  };

  const updateAdjustment = (index: number, patch: Partial<Adjustment>) => {
    setAdjustments(prev => prev.map((a, i) => i === index ? { ...a, ...patch } : a));
  };
  const removeAdjustment = (index: number) => {
    setAdjustments(prev => prev.filter((_, i) => i !== index));
  };
  const addAdjustment = (type: AdjustmentType) => {
    const defaults: Record<AdjustmentType, string> = { tax: 'Tax', fee: 'Service Charge', discount: 'Discount' };
    setAdjustments(prev => [...prev, { label: defaults[type], amount: 0, type }]);
  };

  const updateFinalTotal = (nextTotal: number) => {
    const desired = Math.max(0, Math.round((nextTotal || 0) * 100) / 100);
    const baseAdjustments = adjustments.filter(a => a.label !== 'Total correction');
    const baseSubtotal = calculateSubtotal();
    const baseTaxes = baseAdjustments.filter(a => a.type === 'tax').reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const baseFees = baseAdjustments.filter(a => a.type === 'fee').reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const baseDiscounts = baseAdjustments.filter(a => a.type === 'discount').reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const baseTotal = Math.max(0, Math.round((baseSubtotal + baseTaxes + baseFees - baseDiscounts) * 100) / 100);
    const diff = Math.round((desired - baseTotal) * 100) / 100;

    if (Math.abs(diff) < 0.01) {
      setAdjustments(baseAdjustments);
      return;
    }
    setAdjustments([
      ...baseAdjustments,
      { label: 'Total correction', amount: Math.abs(diff), type: diff > 0 ? 'fee' : 'discount' },
    ]);
  };

  const calculateMemberOwes = (userId: string) => {
    let total = 0;
    const factor = totalFactor();
    items.forEach((item, index) => {
      const assignedMembers = assignments[index] || [];
      if (assignedMembers.includes(userId) && assignedMembers.length > 0) {
        const itemTotal = Math.round((item.price * item.quantity) * factor * 100) / 100;
        const baseShare = Math.floor((itemTotal / assignedMembers.length) * 100) / 100;
        const remainder = Math.round((itemTotal - baseShare * assignedMembers.length) * 100) / 100;
        const memberIndex = assignedMembers.indexOf(userId);
        // First member gets the remainder to keep total accurate
        total += memberIndex === 0 ? baseShare + remainder : baseShare;
      }
    });
    return Math.round(total * 100) / 100;
  };

  // Get splits for locked view
  const getSplits = () => {
    return roomMembers.map(member => ({
      userId: member.user_id,
      name: member.profile.display_name,
      avatar: member.profile.avatar,
      amount: calculateMemberOwes(member.user_id),
    })).filter(s => s.amount > 0);
  };

  // Handle lock/complete bill
  const handleCompleteBill = () => {
    if (items.length === 0) {
      toast({
        title: 'No items',
        description: 'Please add at least one item to the bill',
        variant: 'destructive',
      });
      return;
    }
    
    const total = calculateTotal();
    if (total <= 0) {
      toast({
        title: 'Invalid total',
        description: 'Bill total must be greater than 0',
        variant: 'destructive',
      });
      return;
    }
    
    setIsLocked(true);
    setShowLockedView(true);
  };

  const saveExpense = async () => {
    if (!user || !currentRoom || items.length === 0) return;

    setIsSaving(true);
    try {
      // If we have a scanned receipt image (data URL from camera/upload),
      // upload it to storage so the original bill photo travels with the
      // expense (and stays small in the DB row).
      let receiptPath: string | null = null;
      if (receiptImage && receiptImage.startsWith('data:')) {
        try {
          const blob = await (await fetch(receiptImage)).blob();
          const ext = (blob.type.split('/')[1] || 'jpg').toLowerCase();
          const path = `${user.id}/receipts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('chat-attachments')
            .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
          if (!upErr) receiptPath = path;
          else console.warn('Receipt upload failed:', upErr);
        } catch (e) {
          console.warn('Receipt upload error:', e);
        }
      }

      // Create the expense
      const { data: expense, error: expenseError } = await supabase
        .from('expenses')
        .insert({
          room_id: currentRoom.id,
          created_by: user.id,
          paid_by: paidBy || user.id,
          title,
          total_amount: calculateTotal(),
          receipt_url: receiptPath || (receiptImage && !receiptImage.startsWith('data:') ? receiptImage : null),
          status: 'pending',
          category: 'general',
          split_type: 'custom',
          notes: null,
          notes_image_url: null,
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

      // Create splits for each item (apply taxes/fees/discounts proportionally)
      const splits: any[] = [];
      const factor = totalFactor();
      createdItems.forEach((createdItem, index) => {
        const assignedMembers = assignments[index] || [];
        if (assignedMembers.length > 0) {
          const itemTotal = Math.round((items[index].price * items[index].quantity) * factor * 100) / 100;
          const baseShare = Math.floor((itemTotal / assignedMembers.length) * 100) / 100;
          const remainder = Math.round((itemTotal - baseShare * assignedMembers.length) * 100) / 100;

          assignedMembers.forEach((userId, i) => {
            splits.push({
              expense_id: expense.id,
              expense_item_id: createdItem.id,
              user_id: userId,
              amount: i === 0 ? baseShare + remainder : baseShare,
              // The actual payer's own share is auto-marked paid; the
              // creator's share is auto-accepted (no Accept/Reject loop
              // back to themselves) but only paid if they ARE the payer.
              is_paid: userId === (paidBy || user.id),
              status: (userId === (paidBy || user.id) || userId === user.id) ? 'accepted' : 'pending',
            });
          });
        }
      });

      if (splits.length > 0) {
        const { error: splitsError } = await supabase
          .from('expense_splits')
          .insert(splits);
        
        if (splitsError) throw splitsError;
        
        // Create notifications for assigned users
        const assignedUserIds = [...new Set(splits.map(s => s.user_id))];
        const shareMap: Record<string, number> = {};
        splits.forEach((s) => { shareMap[s.user_id] = (shareMap[s.user_id] || 0) + Number(s.amount); });
        await createExpenseNotification(
          { id: expense.id, title, total_amount: calculateTotal(), created_by: user.id },
          assignedUserIds,
          shareMap
        );

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
                          <ProfileAvatar key={userId} avatar={member?.profile.avatar} size="xs" className="border-2 border-background" />
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
                    {/* Item Name (editable) */}
                    <div className="pt-3">
                      <label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Edit3 className="w-3 h-3" />
                        Item Name
                      </label>
                      <Input
                        value={item.name}
                        onChange={(e) => updateItemName(index, e.target.value)}
                        className="mt-1 h-10 rounded-lg"
                        placeholder="Item name"
                      />
                    </div>
                    
                    {/* Price and quantity controls */}
                    <div className="flex items-center gap-4">
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
                      <div className="w-32">
                        <label className="text-xs text-muted-foreground">Qty</label>
                        <div className="grid grid-cols-[32px_1fr_32px] items-center gap-1 mt-1">
                          <Button 
                            size="icon" 
                            variant="outline" 
                            className="h-8 w-8 rounded-lg"
                            onClick={() => updateItemQuantity(index, -1)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity}
                            onChange={(e) => updateItemQuantityValue(index, parseInt(e.target.value, 10) || 1)}
                            className="h-8 rounded-lg text-center px-1"
                          />
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
                              <ProfileAvatar avatar={member.profile.avatar} size="sm" />
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
            
            {/* Add Manual Item Button */}
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl gap-2 border-dashed"
              onClick={addManualItem}
            >
              <PlusCircle className="w-4 h-4" />
              Add Item Manually
            </Button>
          </div>

          {/* Adjustments — taxes / fees / discounts (editable & deletable) */}
          <div className="bg-muted/50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5" />
                Taxes, fees & discounts
              </label>
              {adjustments.length > 0 && (
                <span className="text-xs text-muted-foreground">{adjustments.length} item{adjustments.length === 1 ? '' : 's'}</span>
              )}
            </div>

            {adjustments.length === 0 && (
              <p className="text-xs text-muted-foreground">No taxes or discounts detected. Add one if needed.</p>
            )}

            <p className="text-[11px] text-muted-foreground leading-snug">
              Taxes & fees are <span className="font-medium text-foreground">added to each share</span>. Only discounts <span className="font-medium text-emerald-600 dark:text-emerald-400">reduce the split</span>.
            </p>

            <div className="space-y-2">
              {adjustments.map((adj, idx) => {
                const isDiscount = adj.type === 'discount';
                return (
                  <div key={idx} className="bg-background rounded-xl p-2.5 space-y-2 border border-border/50">
                    <div className="flex items-center gap-2">
                      <Input
                        value={adj.label}
                        onChange={(e) => updateAdjustment(idx, { label: e.target.value })}
                        className="h-9 rounded-lg flex-1 text-sm"
                        placeholder="Label (e.g. GST, Service Charge)"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => removeAdjustment(idx)}
                        title="Remove"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={adj.type}
                        onChange={(e) => updateAdjustment(idx, { type: e.target.value as AdjustmentType })}
                        className="h-9 rounded-lg border border-input bg-background px-2 text-xs flex-1"
                      >
                        <option value="tax">Tax (+)</option>
                        <option value="fee">Fee (+)</option>
                        <option value="discount">Discount (−)</option>
                      </select>
                      <div className="flex items-center gap-1 flex-1">
                        <span className={`text-sm font-medium ${isDiscount ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                          {isDiscount ? '−₹' : '+₹'}
                        </span>
                        <Input
                          type="number"
                          value={adj.amount}
                          onChange={(e) => updateAdjustment(idx, { amount: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="h-9 rounded-lg text-sm"
                          step="0.01"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" className="h-9 rounded-lg gap-1 text-xs" onClick={() => addAdjustment('tax')}>
                <Percent className="w-3 h-3" /> Tax
              </Button>
              <Button variant="outline" size="sm" className="h-9 rounded-lg gap-1 text-xs" onClick={() => addAdjustment('fee')}>
                <Plus className="w-3 h-3" /> Fee
              </Button>
              <Button variant="outline" size="sm" className="h-9 rounded-lg gap-1 text-xs" onClick={() => addAdjustment('discount')}>
                <Tag className="w-3 h-3" /> Discount
              </Button>
            </div>
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
                    <ProfileAvatar avatar={member.profile.avatar} size="sm" />
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
            <div className="border-t border-border pt-3 space-y-1.5">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>₹{calculateSubtotal().toFixed(2)}</span>
              </div>
              {adjustments.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between text-sm ${a.type === 'discount' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}
                >
                  <span className="truncate pr-2">{a.label || (a.type === 'discount' ? 'Discount' : a.type === 'tax' ? 'Tax' : 'Fee')}</span>
                  <span>{a.type === 'discount' ? '− ' : '+ '}₹{Number(a.amount || 0).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1">
                <span className="font-semibold">Total</span>
                <div className="flex items-center gap-1">
                  <span className="text-lg font-bold text-primary">₹</span>
                  <Input
                    type="number"
                    value={calculateTotal()}
                    onChange={(e) => updateFinalTotal(parseFloat(e.target.value) || 0)}
                    className="h-9 w-28 rounded-lg text-right font-bold text-primary"
                    step="0.01"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Complete Bill button - triggers lock flow */}
        <div className="shrink-0 pt-4 border-t flex gap-2">
          <Button 
            variant="outline"
            className="flex-1 h-14 rounded-xl text-base gap-2"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button 
            className="flex-1 h-14 rounded-xl text-base gap-2 press-effect"
            onClick={handleCompleteBill}
            disabled={items.length === 0}
          >
            <Lock className="w-5 h-5" />
            Complete Bill
          </Button>
        </div>
      </SheetContent>
      
      {/* Locked Bill View */}
      <LockedBillView
        open={showLockedView}
        onOpenChange={(open) => {
          setShowLockedView(open);
          if (!open) setIsLocked(false);
        }}
        title={title}
        items={items}
        total={calculateTotal()}
        subtotal={calculateSubtotal()}
        adjustments={adjustments}
        paidBy={{
          name: profile?.display_name || 'You',
          avatar: profile?.avatar || '😊',
        }}
        splits={getSplits()}
        category="general"
        createdAt={new Date()}
        onConfirm={saveExpense}
        isConfirming={isSaving}
      />
    </Sheet>
  );
};
