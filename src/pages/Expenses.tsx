import { useState } from "react";
import { Camera, Plus, TrendingUp, TrendingDown, Receipt, Users, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Expense {
  id: string;
  title: string;
  amount: number;
  paidBy: string;
  avatar: string;
  splitWith: string[];
  date: string;
  category: string;
}

const mockExpenses: Expense[] = [
  { id: "1", title: "Groceries", amount: 2400, paidBy: "Alex", avatar: "🎮", splitWith: ["You", "Sam", "Jordan"], date: "Today", category: "🛒" },
  { id: "2", title: "Netflix Subscription", amount: 649, paidBy: "You", avatar: "😎", splitWith: ["Alex", "Sam", "Jordan"], date: "Yesterday", category: "📺" },
  { id: "3", title: "Electricity Bill", amount: 1800, paidBy: "Sam", avatar: "🎵", splitWith: ["You", "Alex", "Jordan"], date: "Dec 5", category: "⚡" },
  { id: "4", title: "Internet Bill", amount: 999, paidBy: "Jordan", avatar: "📚", splitWith: ["You", "Alex", "Sam"], date: "Dec 3", category: "📶" },
  { id: "5", title: "Pizza Night", amount: 1200, paidBy: "You", avatar: "😎", splitWith: ["Alex", "Sam"], date: "Dec 1", category: "🍕" },
];

const balances = [
  { name: "Alex", avatar: "🎮", owes: 850, color: "text-coral" },
  { name: "Sam", avatar: "🎵", owes: -320, color: "text-mint" },
  { name: "Jordan", avatar: "📚", owes: 150, color: "text-coral" },
];

export const Expenses = () => {
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "settled">("all");

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Header */}
      <header className="px-4 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-2xl font-bold text-foreground">Expenses</h1>
          <Button variant="gradient" size="sm" className="gap-2">
            <Camera className="w-4 h-4" />
            Scan Bill
          </Button>
        </div>

        {/* Summary Card */}
        <div className="gradient-coral rounded-3xl p-5 shadow-coral">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-primary-foreground/70 text-sm">Total This Month</p>
              <p className="text-3xl font-bold text-primary-foreground font-display">₹12,450</p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-primary-foreground/20 flex items-center justify-center">
              <Receipt className="w-7 h-7 text-primary-foreground" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-primary-foreground/10 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-primary-foreground/70" />
                <span className="text-xs text-primary-foreground/70">You Paid</span>
              </div>
              <p className="text-lg font-bold text-primary-foreground">₹4,200</p>
            </div>
            <div className="bg-primary-foreground/10 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-primary-foreground/70" />
                <span className="text-xs text-primary-foreground/70">You Owe</span>
              </div>
              <p className="text-lg font-bold text-primary-foreground">₹680</p>
            </div>
          </div>
        </div>
      </header>

      {/* Balances */}
      <section className="px-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-semibold text-foreground">Balances</h2>
          <button className="text-sm text-primary font-medium">Settle Up</button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {balances.map((person, index) => (
            <div
              key={person.name}
              className="flex-shrink-0 bg-card rounded-2xl p-4 shadow-card min-w-[140px] animate-scale-in"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="text-3xl mb-2">{person.avatar}</div>
              <p className="text-sm font-medium text-foreground">{person.name}</p>
              <p className={cn("text-sm font-bold", person.color)}>
                {person.owes > 0 ? `Owes ₹${person.owes}` : `Gets ₹${Math.abs(person.owes)}`}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Tabs */}
      <div className="px-4 mb-4">
        <div className="flex gap-2">
          {(["all", "pending", "settled"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                activeTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Expense List */}
      <div className="px-4 space-y-3">
        {mockExpenses.map((expense, index) => (
          <div
            key={expense.id}
            className="bg-card rounded-2xl p-4 shadow-card flex items-center gap-3 animate-slide-up"
            style={{ animationDelay: `${index * 30}ms` }}
          >
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl">
              {expense.category}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{expense.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-lg">{expense.avatar}</span>
                <span className="text-xs text-muted-foreground">{expense.paidBy} paid</span>
                <Users className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{expense.splitWith.length + 1}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-foreground">₹{expense.amount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{expense.date}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        ))}

        <Button variant="outline" className="w-full mt-4">
          <Plus className="w-4 h-4 mr-2" />
          Add Expense
        </Button>
      </div>
    </div>
  );
};
