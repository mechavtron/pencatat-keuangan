import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN

interface ParsedItem {
  description: string
  amount: number
  type: 'pemasukan' | 'pengeluaran'
  category: string
}

async function sendTelegramMessage(chatId: number | string, text: string) {
  if (!TELEGRAM_TOKEN) return
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    }),
  })
}

async function parseWithGeminiAI(text: string): Promise<ParsedItem[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY belum dikonfigurasi.')

  const cleanInput = text.replace(/^[\w\s]+:\s*/i, '').trim()

  const systemPrompt = `Anda adalah sistem parser pencatat keuangan Telegram.
Tugas Anda: Membaca teks mentah dari Telegram (baik 1 transaksi maupun banyak baris sekaligus) dan memecahnya menjadi daftar transaksi individual.

Aturan Output (JSON Array murni):
- "description": Nama transaksi murni tanpa nominal (contoh: "Bayar tour", "Kasih mamah + susu", "Spp hafsah").
- "amount": Nominal angka murni dalam Rupiah (integer positif tanpa titik/koma/Rp, contoh: 1400000, 2300000). Konversi 'k'/'rb' ke ribuan, 'jt' ke jutaan.
- "type": "pengeluaran" atau "pemasukan" (default "pengeluaran", kecuali ada kata seperti gaji, transfer masuk, bonus).
- "category": Kategori singkat (misal: "Belanja", "Tagihan", "Pendidikan", "Makanan", "Transportasi", "Umum").

Kembalikan HANYA array JSON murni tanpa markdown.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nTeks Input:\n"""\n${cleanInput}\n"""` }],
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

export async function POST(req: Request) {
  try {
    const update = await req.json()
    const message = update?.message
    const chatId = message?.chat?.id
    const text = message?.text || ''

    if (!chatId || !text) {
      return NextResponse.json({ ok: true })
    }

    const parsedItems = await parseWithGeminiAI(text)

    if (parsedItems.length === 0) {
      await sendTelegramMessage(chatId, '❌ Gagal membaca format transaksi.')
      return NextResponse.json({ ok: true })
    }

    const { data, error } = await supabase
      .from('expenses')
      .insert(parsedItems)
      .select()

    if (error) {
      await sendTelegramMessage(chatId, `❌ Gagal menyimpan: ${error.message}`)
      return NextResponse.json({ ok: true })
    }

    let replyText = `✅ <b>Berhasil mencatat ${data.length} transaksi!</b>\n\n`
    let totalNominal = 0

    data.forEach((item: any, idx: number) => {
      totalNominal += item.amount
      const formattedRp = new Intl.NumberFormat('id-ID').format(item.amount)
      replyText += `${idx + 1}. ${item.description} — <b>Rp ${formattedRp}</b>\n`
    })

    const totalRp = new Intl.NumberFormat('id-ID').format(totalNominal)
    replyText += `\n<b>Total: Rp ${totalRp}</b>`

    await sendTelegramMessage(chatId, replyText)
    return NextResponse.json({ ok: true })

  } catch (err: unknown) {
    console.error('Telegram webhook error:', err)
    return NextResponse.json({ ok: true })
  }
}