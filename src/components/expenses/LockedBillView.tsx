import { Check, Lock, Users, Calendar, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface ExtractedItem {
  name: string;
  price: number;
  quantity: number;
}

interface MemberSplit {
  userId: string;
  name: string;
  avatar: string;
  amount: number;
}

interface LockedBillViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: ExtractedItem[];
  total: number;
  paidBy: {
    name: string;
    avatar: string;
  };
  splits: MemberSplit[];
  category: string;
  createdAt: Date;
  onConfirm: () => void;
  isConfirming?: boolean;
}

export const LockedBillView = ({
  open,
  onOpenChange,
  title,
  items,
  total,
  paidBy,
  splits,
  category,
  createdAt,
  onConfirm,
  isConfirming = false,
}: LockedBillViewProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[95vh] rounded-t-3xl overflow-hidden flex flex-col">
        <SheetHeader className="shrink-0">
          <SheetTitle className="text-xl font-bold flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            Final Bill Review
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-4 pb-4">
          {/* Bill Header */}
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-2xl">
                <Receipt className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{title}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary" className="text-xs">{category}</Badge>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {createdAt.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Paid by</span>
              <div className="flex items-center gap-2">
                <span className="text-xl">{paidBy.avatar}</span>
                <span className="font-medium">{paidBy.name}</span>
              </div>
            </div>
          </div>

          {/* Items List - Read Only */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
              <Lock className="w-3 h-3" />
              Bill Items (Locked)
            </h4>
            <div className="bg-muted/50 rounded-2xl overflow-hidden">
              {items.map((item, index) => (
                <div 
                  key={index} 
                  className="p-3 flex items-center justify-between border-b border-border/50 last:border-0"
                >
                  <div className="flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                  </div>
                  <span className="font-semibold text-primary">
                    ₹{(item.price * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="p-3 bg-primary/5 flex items-center justify-between">
                <span className="font-semibold">Total</span>
                <span className="text-xl font-bold text-primary">₹{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Split Summary - Read Only */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
              <Users className="w-3 h-3" />
              Split Summary (Locked)
            </h4>
            <div className="space-y-2">
              {splits.map((split, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-xl"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{split.avatar}</span>
                    <span className="font-medium">{split.name}</span>
                  </div>
                  <span className="font-semibold text-primary">
                    ₹{split.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Notice */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Note:</strong> Once confirmed, this bill cannot be edited. 
              All assigned members will be notified of their split amounts.
            </p>
          </div>
        </div>

        {/* Confirm Button */}
        <div className="shrink-0 pt-4 border-t">
          <Button 
            className="w-full h-14 rounded-xl text-base gap-2 press-effect"
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? (
              <>
                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Confirming...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Confirm & Create Bill
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
