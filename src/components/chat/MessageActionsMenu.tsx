import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Copy, Edit2, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";

interface MessageActionsMenuProps {
  isOwnMessage: boolean;
  messageContent: string;
  messageType: string;
  onEdit: () => void;
  onDelete: () => void;
  onViewSeen: () => void;
  children: React.ReactNode;
}

export const MessageActionsMenu = ({
  isOwnMessage, messageContent, messageType, onEdit, onDelete, onViewSeen, children,
}: MessageActionsMenuProps) => {
  const handleCopy = () => {
    if (messageType === "text") {
      navigator.clipboard.writeText(messageContent);
      toast.success("Copied to clipboard");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="cursor-pointer">{children}</div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isOwnMessage ? "end" : "start"} className="w-40">
        {messageType === "text" && (
          <DropdownMenuItem onClick={handleCopy}>
            <Copy className="w-4 h-4 mr-2" /> Copy
          </DropdownMenuItem>
        )}
        {isOwnMessage && (
          <DropdownMenuItem onClick={onViewSeen}>
            <Eye className="w-4 h-4 mr-2" /> Seen by
          </DropdownMenuItem>
        )}
        {isOwnMessage && messageType === "text" && (
          <DropdownMenuItem onClick={onEdit}>
            <Edit2 className="w-4 h-4 mr-2" /> Edit
          </DropdownMenuItem>
        )}
        {isOwnMessage && (
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="w-4 h-4 mr-2" /> Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
