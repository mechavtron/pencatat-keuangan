const CATEGORY_MAP: Record<string, string> = {
  makan: "Makanan",
  makanan: "Makanan",
  minum: "Makanan",
  minuman: "Makanan",
  jajan: "Makanan",
  kopi: "Makanan",
  sarapan: "Makanan",
  lunch: "Makanan",
  dinner: "Makanan",
  bensin: "Transport",
  parkir: "Transport",
  transport: "Transport",
  transportasi: "Transport",
  ojek: "Transport",
  grab: "Transport",
  gojek: "Transport",
  tol: "Transport",
  belanja: "Belanja",
  shop: "Belanja",
  supermarket: "Belanja",
  indomaret: "Belanja",
  alfamart: "Belanja",
  listrik: "Tagihan",
  wifi: "Tagihan",
  internet: "Tagihan",
  pulsa: "Tagihan",
  tagihan: "Tagihan",
  sewa: "Tagihan",
  kos: "Tagihan",
  obat: "Kesehatan",
  dokter: "Kesehatan",
  kesehatan: "Kesehatan",
  hiburan: "Hiburan",
  nonton: "Hiburan",
  game: "Hiburan",
  pendidikan: "Pendidikan",
  sekolah: "Pendidikan",
  kuliah: "Pendidikan",
  gaji: "Gaji",
  pemasukan: "Pemasukan",
  bonus: "Pemasukan",
  cashback: "Pemasukan",
  transfer: "Pemasukan",
};

const AMOUNT_PATTERN =
  /(?:rp\.?\s*)?(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)(\s*(?:rb|ribu|juta|jt|k))?/i;

export type TransactionKind = "pemasukan" | "pengeluaran";

export type ParsedExpense = {
  amount: number;
  category: string;
  description: string;
  type: TransactionKind;
};

function parseNumericToken(rawDigits: string, suffix?: string): number | null {
  const compact = rawDigits.replace(/\s/g, "");
  const thousandSeparated = /^\d{1,3}([.\s]\d{3})+$/.test(rawDigits.trim());

  let value: number;
  if (thousandSeparated) {
    value = Number(compact.replace(/\./g, ""));
  } else if (compact.includes(",") && compact.includes(".")) {
    value = Number(compact.replace(/\./g, "").replace(",", "."));
  } else if (compact.includes(",")) {
    const [, fraction] = compact.split(",");
    value =
      fraction && fraction.length === 3
        ? Number(compact.replace(/,/g, ""))
        : Number(compact.replace(",", "."));
  } else {
    value = Number(compact);
  }

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const mul = (suffix ?? "").trim().toLowerCase();
  if (mul === "k" || mul === "rb" || mul === "ribu") {
    value *= 1000;
  } else if (mul === "jt" || mul === "juta") {
    value *= 1_000_000;
  }

  return Math.round(value);
}

function normalizeCategory(word: string): string {
  const key = word.toLowerCase().replace(/[^a-z0-9]/g, "");
  return CATEGORY_MAP[key] ?? capitalize(word);
}

function capitalize(value: string): string {
  if (!value) return "Lainnya";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function detectIncomePrefix(text: string): {
  type: TransactionKind;
  remainder: string;
  incomeKeyword: "gaji" | "pemasukan" | "+" | null;
} {
  const plusMatch = text.match(/^\+\s*/);
  if (plusMatch) {
    return {
      type: "pemasukan",
      remainder: text.slice(plusMatch[0].length).trim(),
      incomeKeyword: "+",
    };
  }

  const wordMatch = text.match(/^(gaji|pemasukan)\b[:,-]?\s*/i);
  if (wordMatch) {
    const keyword = wordMatch[1].toLowerCase() as "gaji" | "pemasukan";
    return {
      type: "pemasukan",
      remainder: text.slice(wordMatch[0].length).trim(),
      incomeKeyword: keyword,
    };
  }

  return { type: "pengeluaran", remainder: text, incomeKeyword: null };
}

export function parseExpenseText(text: string): ParsedExpense | null {
  const cleaned = text.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;

  const detected = detectIncomePrefix(cleaned);
  const source = detected.remainder || cleaned;

  const match = source.match(AMOUNT_PATTERN);
  if (!match || match.index === undefined) return null;

  const amount = parseNumericToken(match[1], match[2]);
  if (!amount) return null;

  const remainder = `${source.slice(0, match.index)} ${source.slice(match.index + match[0].length)}`
    .replace(/\s+/g, " ")
    .trim();

  if (detected.type === "pemasukan") {
    const defaultCategory = detected.incomeKeyword === "gaji" ? "Gaji" : "Pemasukan";
    if (!remainder) {
      return {
        amount,
        category: defaultCategory,
        description: defaultCategory,
        type: "pemasukan",
      };
    }
    const [first, ...rest] = remainder.split(" ");
    const category = normalizeCategory(first);
    const description = rest.length > 0 ? rest.join(" ") : remainder;
    return { amount, category, description, type: "pemasukan" };
  }

  if (!remainder) {
    return {
      amount,
      category: "Lainnya",
      description: "Pengeluaran",
      type: "pengeluaran",
    };
  }

  const [first, ...rest] = remainder.split(" ");
  const category = normalizeCategory(first);
  const description = rest.length > 0 ? rest.join(" ") : remainder;

  return { amount, category, description, type: "pengeluaran" };
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}
