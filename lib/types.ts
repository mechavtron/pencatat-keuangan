export type TransactionKind = "pemasukan" | "pengeluaran";

export type Expense = {
  id: string;
  created_at: string;
  amount: number;
  category: string;
  description: string | null;
  store_name: string | null;
  image_url: string | null;
  type: TransactionKind;
};
