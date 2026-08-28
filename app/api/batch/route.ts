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

  // 1. Bersihkan pembuka/salam bot
  let cleanText = text
    .replace(/Berhasil dicatat!/gi, '')
    .replace(/✨\s*\.\s*✨/g, '')

  // 2. Potong otomatis teks 1 baris panjang menjadi per baris berdasarkan nomor urut (1., 2., 10., dst.)
  cleanText = cleanText.replace(/(\s\d{1,2}[\.\)])/g, '\n$1')

  const lines = cleanText.split('\n')

  for (let line of lines) {
    line = line.trim()
    if (!line) continue

    // 3. Cari nominal angka (contoh: Rp 1.400.000, Rp 200.000, 250k, 1.5jt)
    const amountMatch = line.match(/(?:Rp\.?\s*)(\d+(?:[\.\,]\d+)*(?:\s*(?:k|rb|ribu|jt|juta))?)|(\b\d+(?:[\.\,]\d+)*(?:\s*(?:k|rb|ribu|jt|juta))\b)/i)
    
    if (!amountMatch) continue

    const rawAmountStr = amountMatch[0]
    let numStr = rawAmountStr.replace(/Rp\.?\s*/gi, '').trim()

    let amount = 0
    let cleanNum = numStr.replace(/\./g, '').replace(',', '.')

    if (/k|rb|ribu/i.test(cleanNum)) {
      amount = parseFloat(cleanNum.replace(/k|rb|ribu/gi, '')) * 1000
    } else if (/jt|juta/i.test(cleanNum)) {
      amount = parseFloat(cleanNum.replace(/jt|juta/gi, '')) * 1000000
    } else {
      amount = parseFloat(cleanNum)
    }

    if (isNaN(amount) || amount <= 0) continue

    // 4. Pembersihan Deskripsi:
    let desc = line.replace(rawAmountStr, '')

    // Hapus penomoran berulang, emoji, dan simbol di awal
    desc = desc.replace(/^[\s\d\.\)\✨\🛍️\🏠\•\-–—\:\;]+/g, '')
    desc = desc.replace(/^[\s\d\.\)\✨\🛍️\🏠\•\-–—\:\;]+/g, '')

    // Hapus kata kategori bawaan (Lainnya, Belanja, Tagihan, dll)
    desc = desc.replace(/(?:Lainnya|Belanja|Tagihan|Makanan|Pendidikan|Transportasi|Kesehatan|Rutin)\s*[\—\-–]?\s*/gi, '')

    // Trim sisa karakter pemisah
    desc = desc.replace(/^[\s\—\-–\.\,\:\;]+/, '').replace(/[\s\—\-–\.\,\:\;]+$/, '').trim()

    if (!desc) desc = 'Pengeluaran'

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