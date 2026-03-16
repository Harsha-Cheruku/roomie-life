import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="px-4 pt-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-display text-xl font-bold text-foreground">Privacy Policy</h1>
        </div>
      </header>

      <div className="p-4 max-w-2xl mx-auto prose prose-sm dark:prose-invert">
        <p className="text-muted-foreground text-sm">Last updated: March 16, 2026</p>

        <h2>1. Information We Collect</h2>
        <p>
          RoomMate collects the following information to provide our services:
        </p>
        <ul>
          <li><strong>Account Information:</strong> Email address, display name, and profile avatar when you create an account.</li>
          <li><strong>Room Data:</strong> Room names, invite codes, and membership information for shared living groups you create or join.</li>
          <li><strong>Expense Data:</strong> Expense titles, amounts, categories, split details, and receipt images you upload.</li>
          <li><strong>Task Data:</strong> Task titles, descriptions, assignments, due dates, and status updates.</li>
          <li><strong>Chat Messages:</strong> Text messages and attachments shared within your rooms.</li>
          <li><strong>Device Information:</strong> Device identifiers for push notifications and alarm functionality.</li>
        </ul>

        <h2>2. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul>
          <li>Provide, maintain, and improve our services</li>
          <li>Send push notifications for alarms, reminders, and messages</li>
          <li>Synchronize data across your devices and room members</li>
          <li>Process expense splits and track payments</li>
        </ul>

        <h2>3. Data Sharing</h2>
        <p>
          Your data is shared only with members of rooms you've voluntarily joined. We do not sell, rent, or share your personal information with third parties for marketing purposes.
        </p>

        <h2>4. Data Storage & Security</h2>
        <p>
          Your data is stored securely using industry-standard encryption. We use Row-Level Security (RLS) policies to ensure users can only access data within their own rooms. All API communications use HTTPS encryption.
        </p>

        <h2>5. Data Retention</h2>
        <p>
          Your data is retained as long as your account is active. You can request deletion of your account and associated data at any time by contacting us.
        </p>

        <h2>6. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Export your data</li>
        </ul>

        <h2>7. Permissions</h2>
        <p>RoomMate may request the following device permissions:</p>
        <ul>
          <li><strong>Notifications:</strong> To send alarm alerts, reminders, and chat notifications</li>
          <li><strong>Camera:</strong> To scan receipts for expense splitting</li>
          <li><strong>Microphone:</strong> For voice recording in chat</li>
          <li><strong>Storage:</strong> To upload and download shared files</li>
        </ul>
        <p>All permissions are optional. The app will function with reduced features if permissions are denied.</p>

        <h2>8. Children's Privacy</h2>
        <p>
          RoomMate is not intended for children under 13. We do not knowingly collect personal information from children under 13.
        </p>

        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.
        </p>

        <h2>10. Contact Us</h2>
        <p>
          If you have questions about this Privacy Policy, please contact us at <strong>support@roommate-app.com</strong>.
        </p>
      </div>
    </div>
  );
}