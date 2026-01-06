import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface RejectCommentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (comment: string) => Promise<void>;
  title: string;
  description: string;
}

export const RejectCommentDialog = ({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
}: RejectCommentDialogProps) => {
  const [comment, setComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    if (!comment.trim()) {
      setError('Please provide a reason for rejection');
      return;
    }

    setIsLoading(true);
    setError('');
    
    try {
      await onConfirm(comment.trim());
      setComment('');
      onOpenChange(false);
    } catch (err) {
      setError('Failed to submit. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setComment('');
      setError('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="rejection-comment">
              Reason for rejection <span className="text-coral">*</span>
            </Label>
            <Textarea
              id="rejection-comment"
              placeholder="Please explain why you're rejecting this..."
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                if (error) setError('');
              }}
              className="min-h-[100px]"
              disabled={isLoading}
            />
            {error && (
              <p className="text-sm text-coral">{error}</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading || !comment.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Rejecting...
              </>
            ) : (
              'Confirm Rejection'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
