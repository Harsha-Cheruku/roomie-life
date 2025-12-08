import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpenseData {
  total: number;
  pending: number;
  settled: number;
  members: { name: string; avatar: string; amount: number; color: string }[];
}

const mockData: ExpenseData = {
  total: 12450,
  pending: 3200,
  settled: 9250,
  members: [
    { name: "You", avatar: "😎", amount: 4200, color: "bg-primary" },
    { name: "Alex", avatar: "🎮", amount: 3800, color: "bg-coral" },
    { name: "Sam", avatar: "🎵", amount: 2650, color: "bg-mint" },
    { name: "Jordan", avatar: "📚", amount: 1800, color: "bg-lavender" },
  ],
};

export const ExpenseOverview = () => {
  return (
    <section className="px-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg font-semibold text-foreground">
          Expenses
        </h2>
        <button className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
          View All
        </button>
      </div>

      {/* Main Card */}
      <div className="gradient-primary rounded-3xl p-5 shadow-glow mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-foreground/20 flex items-center justify-center">
            <Wallet className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <p className="text-primary-foreground/70 text-sm">Total This Month</p>
            <p className="text-2xl font-bold text-primary-foreground font-display">
              ₹{mockData.total.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-primary-foreground/10 rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-mint" />
              <span className="text-xs text-primary-foreground/70">Settled</span>
            </div>
            <p className="text-lg font-bold text-primary-foreground">
              ₹{mockData.settled.toLocaleString()}
            </p>
          </div>
          <div className="bg-primary-foreground/10 rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-coral" />
              <span className="text-xs text-primary-foreground/70">Pending</span>
            </div>
            <p className="text-lg font-bold text-primary-foreground">
              ₹{mockData.pending.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Per User Breakdown */}
      <div className="bg-card rounded-2xl p-4 shadow-card">
        <p className="text-sm font-medium text-muted-foreground mb-3">Per Roommate</p>
        <div className="space-y-3">
          {mockData.members.map((member, index) => (
            <div
              key={member.name}
              className="flex items-center gap-3 animate-slide-up"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="text-2xl">{member.avatar}</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{member.name}</p>
                <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", member.color)}
                    style={{ width: `${(member.amount / mockData.total) * 100}%` }}
                  />
                </div>
              </div>
              <p className="text-sm font-semibold text-foreground">
                ₹{member.amount.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
