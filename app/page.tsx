import type { ReactNode } from "react";
import { formatRupiah } from "@/lib/parse-expense";
import { getSupabase } from "@/lib/supabase";
import type { Expense } from "@/lib/types";
import {
  Camera,
  Receipt,
  Send,
  TrendingDown,
  Wallet,
} from "lucide-react";

export const dynamic = "force-dynamic";

function jakartaMonthRange() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);

  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const start = `${year}-${month}-01T00:00:00+07:00`;
  const nextMonth = Number(month) === 12 ? 1 : Number(month) + 1;
  const nextYear = Number(month) === 12 ? Number(year) + 1 : Number(year);
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+07:00`;

  return { start, end, label: `${monthName(Number(month))} ${year}` };
}

function monthName(month: number): string {
  return [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ][month - 1];
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

const CATEGORY_STYLE: Record<string, string> = {
  Makanan: "bg-orange-100 text-orange-800",
  Transport: "bg-sky-100 text-sky-800",
  Belanja: "bg-violet-100 text-violet-800",
  Tagihan: "bg-amber-100 text-amber-800",
  Kesehatan: "bg-rose-100 text-rose-800",
  Hiburan: "bg-pink-100 text-pink-800",
  Pendidikan: "bg-indigo-100 text-indigo-800",
  Lainnya: "bg-stone-100 text-stone-700",
};

export default async function HomePage() {
  let expenses: Expense[] = [];
  let monthlyTotal = 0;
  let loadError: string | null = null;
  const { start, end, label } = jakartaMonthRange();

  try {
    const supabase = getSupabase();
    const [{ data: recent, error: recentError }, { data: monthRows, error: monthError }] =
      await Promise.all([
        supabase
          .from("expenses")
          .select("id, created_at, amount, category, description, store_name, image_url")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase.from("expenses").select("amount").gte("created_at", start).lt("created_at", end),
      ]);

    if (recentError || monthError) {
      loadError = recentError?.message ?? monthError?.message ?? "Gagal memuat data";
    } else {
      expenses = (recent ?? []) as Expense[];
      monthlyTotal = (monthRows ?? []).reduce(
        (sum, row) => sum + Number(row.amount ?? 0),
        0,
      );
    }
  } catch (error) {
    loadError =
      error instanceof Error ? error.message : "Supabase belum dikonfigurasi";
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-10 pt-6 sm:max-w-2xl">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-emerald-700">Pencatat Keuangan</p>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            Ringkasan pengeluaran
          </h1>
          <p className="mt-1 text-sm text-stone-500">{label}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-sm">
          <Wallet className="h-5 w-5" />
        </div>
      </header>

      <section className="rounded-3xl bg-gradient-to-br from-emerald-800 to-green-700 p-5 text-white shadow-lg shadow-emerald-900/10">
        <div className="flex items-center gap-2 text-emerald-100">
          <TrendingDown className="h-4 w-4" />
          <span className="text-sm">Total bulan ini</span>
        </div>
        <p className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {formatRupiah(monthlyTotal)}
        </p>
        <p className="mt-2 text-sm text-emerald-100/90">
          {expenses.length > 0
            ? `${expenses.length} transaksi terbaru ditampilkan`
            : "Belum ada transaksi"}
        </p>
      </section>

      <section className="mt-5 grid grid-cols-3 gap-2 text-center">
        <HintCard icon={<Send className="h-4 w-4" />} title="Teks" caption="makan 25k" />
        <HintCard icon={<Camera className="h-4 w-4" />} title="Struk" caption="foto OCR" />
        <HintCard icon={<Receipt className="h-4 w-4" />} title="Bot" caption="Telegram" />
      </section>

      {loadError ? (
        <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError}. Isi <code className="font-mono">.env.local</code> lalu jalankan{" "}
          <code className="font-mono">schema.sql</code> di Supabase.
        </p>
      ) : null}

      <section className="mt-6">
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-base font-semibold text-stone-900">Riwayat transaksi</h2>
          <span className="text-xs text-stone-500">Terbaru</span>
        </div>

        {expenses.length === 0 && !loadError ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-10 text-center">
            <p className="font-medium text-stone-800">Belum ada pengeluaran</p>
            <p className="mt-1 text-sm text-stone-500">
              Kirim pesan ke bot Telegram atau foto struk untuk mulai mencatat.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {expenses.map((expense) => (
              <li
                key={expense.id}
                className="rounded-2xl border border-stone-200/80 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-stone-900">
                      {expense.store_name || expense.description || "Pengeluaran"}
                    </p>
                    <p className="mt-0.5 truncate text-sm text-stone-500">
                      {expense.store_name && expense.description
                        ? expense.description
                        : formatDate(expense.created_at)}
                    </p>
                  </div>
                  <p className="shrink-0 text-right font-semibold text-stone-900">
                    {formatRupiah(Number(expense.amount))}
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      CATEGORY_STYLE[expense.category] ?? CATEGORY_STYLE.Lainnya
                    }`}
                  >
                    {expense.category}
                  </span>
                  <time className="text-xs text-stone-400">
                    {formatDate(expense.created_at)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function HintCard({
  icon,
  title,
  caption,
}: {
  icon: ReactNode;
  title: string;
  caption: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-2 py-3">
      <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        {icon}
      </div>
      <p className="text-xs font-semibold text-stone-800">{title}</p>
      <p className="text-[11px] text-stone-500">{caption}</p>
    </div>
  );
}
