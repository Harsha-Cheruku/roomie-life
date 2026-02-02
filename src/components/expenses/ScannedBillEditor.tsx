import { useState } from 'react';
import { Plus, Trash2, Edit3, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ExtractedItem {
  name: string;
  price: number;
  quantity: number;
}

interface ScannedBillEditorProps {
  items: ExtractedItem[];
  title: string;
  onItemsChange: (items: ExtractedItem[]) => void;
  onTitleChange: (title: string) => void;
  isLocked: boolean;
}

export const ScannedBillEditor = ({
  items,
  title,
  onItemsChange,
  onTitleChange,
  isLocked,
}: ScannedBillEditorProps) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const updateItem = (index: number, field: keyof ExtractedItem, value: string | number) => {
    if (isLocked) return;
    
    const newItems = [...items];
    if (field === 'name') {
      newItems[index] = { ...newItems[index], name: value as string };
    } else if (field === 'price') {
      newItems[index] = { ...newItems[index], price: Math.max(0, parseFloat(value as string) || 0) };
    } else if (field === 'quantity') {
      newItems[index] = { ...newItems[index], quantity: Math.max(1, parseInt(value as string) || 1) };
    }
    onItemsChange(newItems);
  };

  const removeItem = (index: number) => {
    if (isLocked) return;
    onItemsChange(items.filter((_, i) => i !== index));
  };

  const addItem = () => {
    if (isLocked) return;
    onItemsChange([...items, { name: 'New Item', price: 0, quantity: 1 }]);
    setEditingIndex(items.length);
  };

  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  return (
    <div className="space-y-4">
      {/* Title input */}
      <div>
        <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          Bill Title
          {isLocked && <Lock className="w-3 h-3" />}
        </label>
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="mt-1 rounded-xl"
          placeholder="Bill title"
          disabled={isLocked}
        />
      </div>

      {/* Items list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            Items ({items.length})
            {isLocked && <Lock className="w-3 h-3" />}
          </label>
          {!isLocked && (
            <Button
              size="sm"
              variant="ghost"
              onClick={addItem}
              className="text-primary h-8"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </Button>
          )}
        </div>

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {items.map((item, index) => (
            <div
              key={index}
              className={cn(
                "bg-muted/50 rounded-xl p-3",
                editingIndex === index && "ring-2 ring-primary",
                isLocked && "opacity-80"
              )}
            >
              {editingIndex === index && !isLocked ? (
                // Edit mode
                <div className="space-y-2">
                  <Input
                    value={item.name}
                    onChange={(e) => updateItem(index, 'name', e.target.value)}
                    placeholder="Item name"
                    className="h-9"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground">Price (₹)</label>
                      <Input
                        type="number"
                        value={item.price}
                        onChange={(e) => updateItem(index, 'price', e.target.value)}
                        step="0.01"
                        min="0"
                        className="h-9"
                      />
                    </div>
                    <div className="w-20">
                      <label className="text-xs text-muted-foreground">Qty</label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                        min="1"
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => setEditingIndex(null)}
                      className="flex-1"
                    >
                      Done
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        removeItem(index);
                        setEditingIndex(null);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                // View mode
                <div
                  className={cn(
                    "flex items-center gap-3",
                    !isLocked && "cursor-pointer"
                  )}
                  onClick={() => !isLocked && setEditingIndex(index)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      ₹{item.price.toFixed(2)} × {item.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-primary">
                      ₹{(item.price * item.quantity).toFixed(2)}
                    </span>
                    {!isLocked && (
                      <Edit3 className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Total */}
      <div className="bg-primary/10 rounded-xl p-4 flex items-center justify-between">
        <span className="font-semibold">Total</span>
        <span className="text-xl font-bold text-primary">₹{total.toFixed(2)}</span>
      </div>
    </div>
  );
};
