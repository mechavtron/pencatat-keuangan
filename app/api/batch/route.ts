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

  // 1. Bersihkan spasi khusus Telegram & header bot
  let cleaned = text
    .replace(/\u00A0/g, ' ')
    .replace(/✅?\s*Berhasil dicatat!\s*✨?/gi, '')
    .replace(/✨\s*\.\s*✨/g, '')

  // 2. Jika teks tertempel menyatu 1 baris, selipkan Enter (\n) di setiap akhir nominal angka
  cleaned = cleaned.replace(/((?:Rp\.?\s*)?\d+(?:[\.\,]\d+)*(?:\s*(?:k|rb|ribu|jt|juta))?)\s+([a-zA-Z✨🛍️🏠\d]{2,})/gi, '$1\n$2')

  // Selipkan Enter jika ada penomoran urut ganda (1., 2., 10.)
  cleaned = cleaned.replace(/(\s\d{1,2}[\.\)]\s*)/g, '\n$1')

  // 3. Pecah teks menjadi per baris
  const lines = cleaned.split('\n')

  for (let line of lines) {
    line = line.trim()
    if (!line) continue

    // Cari semua pola angka dalam 1 baris (termasuk Rp 1.400.000, 1400000, 50k, 1.5jt)
    const amountRegex = /(?:Rp\.?\s*)?(\d+(?:[\.\,]\d+)*(?:\s*(?:k|rb|ribu|jt|juta))?)/gi
    const matches = Array.from(line.matchAll(amountRegex))

    if (matches.length === 0) continue

    // Ambil nominal utama (angka terbesar / angka valid paling belakang dalam baris)
    let selectedMatch = null

    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i]
      const rawMatchStr = m[0]
      const numPart = m[1] || rawMatchStr

      let cleanNum = numPart.replace(/Rp\.?\s*/gi, '').replace(/\./g, '').replace(',', '.')
      let amount = 0

      if (/k|rb|ribu/i.test(cleanNum)) {
        amount = parseFloat(cleanNum.replace(/k|rb|ribu/gi, '')) * 1000
      } else if (/jt|juta/i.test(cleanNum)) {
        amount = parseFloat(cleanNum.replace(/jt|juta/gi, '')) * 1000000
      } else {
        amount = parseFloat(cleanNum)
      }

      // Nominal valid minimal 100 rupiah (menghindari angka keterangan seperti 2bln atau 2x)
      if (!isNaN(amount) && amount >= 100) {
        selectedMatch = { rawStr: rawMatchStr, amount: amount }
        break
      }
    }

    if (!selectedMatch) continue

    // 4. Bersihkan Deskripsi Transaksi
    let desc = line.replace(selectedMatch.rawStr, '')

    // Hapus nama kategori bawaan Telegram jika ada
    desc = desc.replace(/(?:Lainnya|Belanja|Tagihan|Makanan|Pendidikan|Transportasi|Kesehatan|Rutin)\s*[\—\-–]?\s*/gi, '')

    // Hapus nomor urut di awal (1., 2.) & emoji
    desc = desc
      .replace(/^[\s\d\.\)\-]+/g, '')
      .replace(/^[^\w\s\+\-\/]+/g, '')
      .replace(/^[\s\d\.\)\-]+/g, '')
      .replace(/^[\s\—\-–\.\,\:\;\+]+/g, '')
      .replace(/[\s\—\-–\.\,\:\;]+$/g, '')
      .trim()

    if (!desc || desc.length < 2) {
      desc = `Pengeluaran ${items.length + 1}`
    }

    const isIncome = /gaji|pemasukan|bonus|cashback|transfer/i.test(desc)

    items.push({
      description: desc,
      amount: selectedMatch.amount,
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