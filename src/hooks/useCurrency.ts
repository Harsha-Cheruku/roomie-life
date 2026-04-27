import { useAuth } from "@/contexts/AuthContext";

export const CURRENCY_OPTIONS = [
  { symbol: "₹", code: "INR", label: "Indian Rupee (₹)" },
  { symbol: "$", code: "USD", label: "US Dollar ($)" },
  { symbol: "€", code: "EUR", label: "Euro (€)" },
  { symbol: "£", code: "GBP", label: "British Pound (£)" },
  { symbol: "¥", code: "JPY", label: "Japanese Yen (¥)" },
  { symbol: "A$", code: "AUD", label: "Australian Dollar (A$)" },
  { symbol: "C$", code: "CAD", label: "Canadian Dollar (C$)" },
  { symbol: "د.إ", code: "AED", label: "UAE Dirham (د.إ)" },
  { symbol: "₽", code: "RUB", label: "Russian Ruble (₽)" },
  { symbol: "R", code: "ZAR", label: "South African Rand (R)" },
  { symbol: "kr", code: "SEK", label: "Swedish Krona (kr)" },
  { symbol: "Fr", code: "CHF", label: "Swiss Franc (Fr)" },
  { symbol: "₩", code: "KRW", label: "Korean Won (₩)" },
  { symbol: "₺", code: "TRY", label: "Turkish Lira (₺)" },
  { symbol: "R$", code: "BRL", label: "Brazilian Real (R$)" },
];

export const useCurrency = (): string => {
  const { currentRoom } = useAuth();
  return currentRoom?.currency || "₹";
};