import { GoogleGenAI } from "@google/genai";

export type ReceiptOcrResult = {
  store_name: string;
  total_amount: number;
  category: string;
  date: string | null;
  description: string;
};

const RECEIPT_PROMPT = `Kamu adalah asisten pembacaan struk belanja Indonesia.
Analisis gambar struk dan kembalikan HANYA JSON valid tanpa markdown, dengan kunci:
{
  "store_name": "nama toko/merchant",
  "total_amount": 0,
  "category": "Makanan | Transport | Belanja | Tagihan | Kesehatan | Hiburan | Pendidikan | Lainnya",
  "date": "YYYY-MM-DD atau null jika tidak terbaca",
  "description": "ringkasan singkat item atau keterangan"
}

Aturan:
- total_amount wajib angka (IDR), tanpa titik/koma pemisah ribuan.
- Pilih kategori yang paling masuk akal.
- Jika nama toko tidak terbaca, gunakan "Tidak diketahui".
- Jangan menambahkan teks di luar JSON.`;

export async function extractReceiptFromImage(
  imageBytes: Buffer,
  mimeType: string,
): Promise<ReceiptOcrResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY wajib diisi di .env.local");
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: RECEIPT_PROMPT },
          {
            inlineData: {
              mimeType,
              data: imageBytes.toString("base64"),
            },
          },
        ],
      },
    ],
  });

  const raw = response.text?.trim();
  if (!raw) {
    throw new Error("Gemini tidak mengembalikan hasil pembacaan struk");
  }

  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(jsonText) as Partial<ReceiptOcrResult>;

  const amount = Number(parsed.total_amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Nominal pada struk tidak terbaca");
  }

  return {
    store_name: parsed.store_name?.trim() || "Tidak diketahui",
    total_amount: Math.round(amount),
    category: parsed.category?.trim() || "Belanja",
    date: parsed.date ?? null,
    description: parsed.description?.trim() || "Pembelian dari struk",
  };
}
