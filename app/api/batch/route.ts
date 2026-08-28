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

function parseBatchText(text: string): ParsedItem[] {
  const items: ParsedItem[] = []

  // 1. Normalisasi teks (hapus spasi non-breaking Telegram & header bot)
  let cleaned = text
    .replace(/\u00A0/g, ' ')
    .replace(/Berhasil dicatat!/gi, '')
    .replace(/✨\s*\.\s*✨/g, '')

  // 2. Cari semua posisi Nominal / Angka Rp (baik terpisah baris maupun 1 baris panjang)
  const amountRegex = /(?:Rp\.?\s*)(\d+(?:[\.\,]\d+)*(?:\s*(?:k|rb|ribu|jt|juta))?)/gi

  let match: RegExpExecArray | null
  const matches: { index: number; length: number; rawAmount: string; numStr: string }[] = []

  while ((match = amountRegex.exec(cleaned)) !== null) {
    matches.push({
      index: match.index,
      length: match[0].length,
      rawAmount: match[0],
      numStr: match[1]
    })
  }

  if (matches.length === 0) return items

  // 3. Ekstrak transaksi berdasarkan jangkar posisi Nominal
  let lastIndex = 0

  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i]

    // Potong teks dari akhir nominal sebelumnya sampai sebelum nominal saat ini
    const segment = cleaned.substring(lastIndex, currentMatch.index)
    lastIndex = currentMatch.index + currentMatch.length

    // Parse Angka Nominal
    let amount = 0
    let cleanNum = currentMatch.numStr.replace(/\./g, '').replace(',', '.')

    if (/k|rb|ribu/i.test(cleanNum)) {
      amount = parseFloat(cleanNum.replace(/k|rb|ribu/gi, '')) * 1000
    } else if (/jt|juta/i.test(cleanNum)) {
      amount = parseFloat(cleanNum.replace(/jt|juta/gi, '')) * 1000000
    } else {
      amount = parseFloat(cleanNum)
    }

    if (isNaN(amount) || amount <= 0) continue

    // Bersihkan Deskripsi Transaksi
    let desc = segment

    // Hapus nama kategori bawaan Telegram
    desc = desc.replace(/(?:Lainnya|Belanja|Tagihan|Makanan|Pendidikan|Transportasi|Kesehatan|Rutin)\s*[\—\-–]?\s*/gi, '')

    // Hapus simbol, emoji, dan penomoran ganda di awal secara bertahap
    for (let r = 0; r < 3; r++) {
      desc = desc.replace(/^[^\w\s\+\-\/]+/gi, '').trim()
      desc = desc.replace(/^[\d\.\)\-]+/g, '').trim()
    }

    // Hapus sisa karakter pemisah/angka liar di akhir
    desc = desc.replace(/[\s\—\-–\.\,\:\;\d]+$/g, '').trim()

    if (!desc) desc = `Pengeluaran ${i + 1}`

    const isIncome = /gaji|pemasukan|bonus|cashback|transfer/i.test(desc)

    items.push({
      description: desc,
      amount: amount,
      type: isIncome ? 'pemasukan' : 'pengeluaran',
      category: isIncome ? 'Pemasukan' : 'Umum'
    })
  }

  return items
}

export async function POST(req: Request) {
  try {
    const { text } = await req.json()
    if (!text) {
      return NextResponse.json({ error: 'Teks kosong' }, { status: 400 })
    }

    const parsedItems = parseBatchText(text)

    if (parsedItems.length === 0) {
      return NextResponse.json({ error: 'Tidak ada transaksi valid yang ditemukan.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('expenses')
      .insert(parsedItems)
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: data.length, items: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}