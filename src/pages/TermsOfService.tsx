import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="px-4 pt-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-display text-xl font-bold text-foreground">Terms of Service</h1>
        </div>
      </header>

      <div className="p-4 max-w-2xl mx-auto prose prose-sm dark:prose-invert">
        <p className="text-muted-foreground text-sm">Last updated: March 16, 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By downloading, installing, or using the RoomMate application, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the application.
        </p>

        <h2>2. Description of Service</h2>
        <p>
          RoomMate is a shared living management application that provides tools for expense splitting, task management, shared alarms, music synchronization, mini games, cloud storage, and messaging for roommates and housemates.
        </p>

        <h2>3. User Accounts</h2>
        <ul>
          <li>You must provide accurate and complete information when creating an account.</li>
          <li>You are responsible for maintaining the security of your account credentials.</li>
          <li>You must be at least 13 years old to use this service.</li>
          <li>One person may not maintain more than one account.</li>
        </ul>

        <h2>4. User Conduct</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the service for any illegal purpose</li>
          <li>Upload malicious content or attempt to exploit security vulnerabilities</li>
          <li>Harass, abuse, or harm other users</li>
          <li>Attempt to access other users' data without authorization</li>
          <li>Use automated tools to scrape or collect data from the service</li>
        </ul>

        <h2>5. Financial Features</h2>
        <p>
          RoomMate provides expense tracking and split calculation tools for informational purposes only. We are not a financial institution and do not process payments. Any financial transactions between users are conducted independently. We are not responsible for disputes between users regarding payments or expenses.
        </p>

        <h2>6. Content</h2>
        <p>
          You retain ownership of content you upload to RoomMate (messages, photos, receipts, etc.). By uploading content, you grant us a limited license to store and display it to your room members as part of the service.
        </p>

        <h2>7. Termination</h2>
        <p>
          We reserve the right to suspend or terminate accounts that violate these terms. You may delete your account at any time.
        </p>

        <h2>8. Disclaimer of Warranties</h2>
        <p>
          The service is provided "as is" without warranties of any kind, either express or implied. We do not guarantee uninterrupted or error-free service.
        </p>

        <h2>9. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, RoomMate shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service.
        </p>

        <h2>10. Changes to Terms</h2>
        <p>
          We may modify these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms.
        </p>

        <h2>11. Contact</h2>
        <p>
          For questions about these Terms, contact us at <strong>support@roommate-app.com</strong>.
        </p>
      </div>
    </div>
  );
}