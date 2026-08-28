import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

interface ParsedItem {
  description: string
  amount: number
  type: 'pemasukan' | 'pengeluaran'
  category: string
}

// ----------------------------------------------------
// 1. INTEGRASI GEMINI AI PARSER
// ----------------------------------------------------
async function parseWithGeminiAI(text: string): Promise<ParsedItem[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi.')
  }

  const systemPrompt = `Anda adalah sistem parser transaksi keuangan otomatis.
Tugas Anda: Membaca teks mentah/acak (1 baris panjang, daftar enter, atau salinan dari bot Telegram/WhatsApp) dan mengekstrak daftar transaksi keuangan.

Aturan Pemisahan:
1. Ekstrak setiap transaksi secara terpisah.
2. Format output berupa JSON Array murni dengan properti:
   - "description": Nama transaksi murni (tanpa nominal, contoh: "Bayar tour", "Kasih mamah + susu", "K3 2bln", "Prelek masjid").
   - "amount": Nominal angka murni dalam Rupiah (integer positif tanpa titik/koma/Rp, contoh: 1400000, 2300000, 50000). Konversi k/rb ke ribuan dan jt ke jutaan.
   - "type": "pengeluaran" atau "pemasukan" (default "pengeluaran", kecuali kata seperti gaji, transfer masuk, cashback, bonus).
   - "category": Kategori singkat (misal: "Belanja", "Tagihan", "Pendidikan", "Makanan", "Transportasi", "Umum").

Kembalikan HANYA array JSON murni tanpa markdown/penjelasan tambahan.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nTeks Input:\n"""\n${text}\n"""` }],
          },
        ],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1,
        },
      }),
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini Error: ${errText}`)
  }

  const resData = await response.json()
  const rawJson = resData.candidates?.[0]?.content?.parts?.[0]?.text
  if (!rawJson) return []

  const parsed = JSON.parse(rawJson)

  if (Array.isArray(parsed)) {
    return parsed
      .map((item: any) => ({
        description: String(item.description || 'Pengeluaran').trim(),
        amount: Math.abs(Number(item.amount) || 0),
        type: item.type === 'pemasukan' ? ('pemasukan' as const) : ('pengeluaran' as const),
        category: String(item.category || 'Umum'),
      }))
      .filter((item) => item.amount > 0 && item.description.length > 0)
  }

  return []
}

// ----------------------------------------------------
// 2. CADANGAN (FALLBACK REGEX PARSER)
// ----------------------------------------------------
function parseFallback(text: string): ParsedItem[] {
  let cleaned = text.replace(/\u00A0/g, ' ')
  cleaned = cleaned.replace(/✅?\s*Berhasil dicatat!\s*✨?/gi, '')

  cleaned = cleaned.replace(
    /(\b\d{4,}\b|\b\d+(?:\.\d{3})+\b|\b\d+\s*(?:k|rb|ribu|jt|juta)\b)\s+([a-zA-Z✨🛍️🏠])/gi,
    '$1\n$2'
  )

  const lines = cleaned.split('\n')
  const items: ParsedItem[] = []
  let currentDesc = ''

  for (let line of lines) {
    line = line.trim()
    if (!line) continue

    const allAmounts = line.match(/(?:Rp\.?\s*)?(?:\d+(?:\.\d{3})+|\b\d{4,}\b|\b\d+\s*(?:k|rb|ribu|jt|juta)\b)/gi)

    if (allAmounts && allAmounts.length > 0) {
      const rawAmtStr = allAmounts[allAmounts.length - 1]
      const descPart = line.replace(rawAmtStr, '')
      let fullDesc = (currentDesc + ' ' + descPart).trim()

      fullDesc = fullDesc.replace(/(?:Lainnya|Belanja|Tagihan|Makanan|Pendidikan|Transportasi|Kesehatan|Rutin)\s*[\—\-–]?\s*/gi, '')
      fullDesc = fullDesc.replace(/\bRp\.?\b/gi, '')
      fullDesc = fullDesc.replace(/^[\s\d\.\)\-\✨\🛍️\🏠]+/g, '')
      fullDesc = fullDesc.trim().replace(/^[\—\-–.,:;+]+|[\—\-–.,:;+]+$/g, '')

      const cleanNum = rawAmtStr.replace(/Rp/gi, '').replace(/\./g, '').replace(',', '.').trim()
      let amount = 0

      if (/k|rb|ribu/i.test(cleanNum)) {
        amount = parseFloat(cleanNum.replace(/k|rb|ribu/gi, '')) * 1000
      } else if (/jt|juta/i.test(cleanNum)) {
        amount = parseFloat(cleanNum.replace(/jt|juta/gi, '')) * 1000000
      } else {
        amount = parseFloat(cleanNum.replace(/[^\d\.]/g, ''))
      }

      if (!isNaN(amount) && amount > 0 && fullDesc.length > 0) {
        const isIncome = /\bgaji\b|pemasukan|bonus|cashback|transfer/i.test(fullDesc)
        items.push({
          description: fullDesc,
          amount: Math.round(amount),
          type: isIncome ? 'pemasukan' : 'pengeluaran',
          category: isIncome ? 'Pemasukan' : 'Umum',
        })
      }
      currentDesc = ''
    } else {
      const cleanedLine = line.replace(/^[\s\d\.\)\-\✨\🛍️\🏠]+/g, '').trim()
      if (cleanedLine) {
        currentDesc = (currentDesc + ' ' + cleanedLine).trim()
      }
    }
  }

  return items
}

// ----------------------------------------------------
// 3. HANDLER UTAMA API
// ----------------------------------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const text = body?.text || ''

    if (!text.trim()) {
      return NextResponse.json({ error: 'Teks input kosong' }, { status: 400 })
    }

    let parsedItems: ParsedItem[] = []

    try {
      parsedItems = await parseWithGeminiAI(text)
    } catch (aiErr) {
      console.warn('Menggunakan fallback parser:', aiErr)
      parsedItems = parseFallback(text)
    }

    if (parsedItems.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada transaksi valid yang dapat dibaca.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('expenses')
      .insert(parsedItems)
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      count: data.length,
      items: data,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan server'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}