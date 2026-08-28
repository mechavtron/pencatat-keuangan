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

  // Normalisasi spasi dan hapus header bot Telegram
  const clean = text
    .replace(/\u00A0/g, ' ')
    .replace(/Berhasil dicatat!/gi, '')
    .replace(/✨\s*\.\s*✨/g, '')

  // Ekstrak langsung pola: [Nama Transaksi] [Kategori Opsional] — Rp [Nominal]
  const pattern = /(.*?)(?:Lainnya|Belanja|Tagihan|Makanan|Pendidikan|Transportasi|Kesehatan|Rutin)?\s*[\—\-–]?\s*Rp\.?\s*([\d\.\,]+(?:\s*(?:k|rb|ribu|jt|juta))?)/gi

  let match: RegExpExecArray | null
  while ((match = pattern.exec(clean)) !== null) {
    const rawDesc = match[1] || ''
    const rawNum = match[2] || ''

    // Parse Angka Nominal
    const cleanNum = rawNum.replace(/\./g, '').replace(',', '.')
    let amount = 0

    if (/k|rb|ribu/i.test(cleanNum)) {
      amount = parseFloat(cleanNum.replace(/k|rb|ribu/gi, '')) * 1000
    } else if (/jt|juta/i.test(cleanNum)) {
      amount = parseFloat(cleanNum.replace(/jt|juta/gi, '')) * 1000000
    } else {
      amount = parseFloat(cleanNum)
    }

    if (isNaN(amount) || amount <= 0) continue

    // Bersihkan Deskripsi: Hapus nomor urut ganda & emoji
    let desc = rawDesc
      .replace(/[\d\.\)\s]+/g, ' ')
      .replace(/^[^\w\s\+\-\/]+/g, '')
      .replace(/[^\w\s\+\-\/]+$/g, '')
      .trim()

    if (!desc || desc.length < 2) {
      desc = `Pengeluaran ${items.length + 1}`
    }

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
    const body = await req.json()
    const text = body?.text || ''

    if (!text.trim()) {
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
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Terjadi kesalahan'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}