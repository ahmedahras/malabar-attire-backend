export type EarningsSummary = {
  totalEarned: number;
  availableForPayout: number;
  inHold: number;
  alreadyPaid: number;
  rtoDeductions: number;
};

export type LedgerItem = {
  id: string;
  orderId: string;
  amount: number;
  type: "CREDIT" | "DEBIT";
  reason: string;
  createdAt: string;
  settledAt: string | null;
  payoutId: string | null;
};

export type PayoutItem = {
  payoutId: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
};

