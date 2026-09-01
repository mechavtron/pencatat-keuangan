import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN

interface ParsedItem {
  description: string
  amount: number
  type: 'pemasukan' | 'pengeluaran'
  category: string
  user_name: string
}

async function sendTelegramMessage(chatId: number | string, text: string) {
  if (!TELEGRAM_TOKEN) return
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
      }),
    })
  } catch (err) {
    console.error('Gagal kirim pesan ke Telegram:', err)
  }
}

async function parseWithGeminiAI(text: string, detectedUser: string): Promise<ParsedItem[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY belum terpasang di Vercel.')

  const cleanInput = text.replace(/^(jae:|miki:)\s*/gi, '').trim()

  const systemPrompt = `Anda adalah parser pencatat keuangan Telegram.
Tugas Anda: Membaca teks mentah transaksi dan memecahnya menjadi array JSON murni.

Aturan Output:
- "description": Nama transaksi murni (tanpa nominal, contoh: "Bayar tour", "Kasih mamah + susu").
- "amount": Nominal angka murni Rupiah (integer tanpa titik/koma/Rp). Konversi k/rb ke ribuan, jt ke jutaan.
- "type": "pengeluaran" atau "pemasukan" (default "pengeluaran").
- "category": Kategori singkat ("Belanja", "Tagihan", "Pendidikan", "Makanan", "Transportasi", "Umum").

Kembalikan HANYA array JSON murni tanpa markdown.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
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
    throw new Error(`Gemini API Error: ${errText}`)
  }

  const resData = await response.json()
  const rawJson = resData.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
  const cleanJsonStr = rawJson.replace(/```json/gi, '').replace(/```/g, '').trim()
  const parsed = JSON.parse(cleanJsonStr)

  if (Array.isArray(parsed)) {
    return parsed
      .map((item: any) => ({
        description: String(item.description || 'Pengeluaran').trim(),
        amount: Math.abs(Number(item.amount) || 0),
        type: item.type === 'pemasukan' ? ('pemasukan' as const) : ('pengeluaran' as const),
        category: String(item.category || 'Umum'),
        user_name: detectedUser,
      }))
      .filter((item) => item.amount > 0 && item.description.length > 0)
  }

  return []
}

export async function POST(req: Request) {
  let chatId: number | string | null = null

  try {
    const update = await req.json()
    const message = update?.message
    chatId = message?.chat?.id || null
    const text = message?.text || ''
    const senderFirstName = (message?.from?.first_name || '').toLowerCase()

    if (!chatId || !text) {
      return NextResponse.json({ ok: true })
    }

    // Deteksi Pengirim: dari nama akun Telegram atau awalan teks ("miki:" / "jae:")
    let detectedUser = 'Jae'
    const lowerText = text.toLowerCase()

    if (lowerText.startsWith('miki:') || senderFirstName.includes('miki')) {
      detectedUser = 'Miki'
    } else if (lowerText.startsWith('jae:') || senderFirstName.includes('jae')) {
      detectedUser = 'Jae'
    }

    const parsedItems = await parseWithGeminiAI(text, detectedUser)

    if (parsedItems.length === 0) {
      await sendTelegramMessage(chatId, '❌ Format transaksi tidak terbaca.')
      return NextResponse.json({ ok: true })
    }

    const { data, error } = await supabase
      .from('expenses')
      .insert(parsedItems)
      .select()

    if (error) {
      await sendTelegramMessage(chatId, `❌ Gagal simpan DB: ${error.message}`)
      return NextResponse.json({ ok: true })
    }

    const iconUser = detectedUser === 'Miki' ? '👩 Miki' : '👨‍🦱 Jae'
    let replyText = `✅ <b>Berhasil mencatat ${data.length} transaksi (${iconUser})!</b>\n\n`
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

  } catch (err: any) {
    if (chatId) {
      await sendTelegramMessage(chatId, `⚠️ Terjadi kesalahan: ${err?.message || 'Server error'}`)
    }
    return NextResponse.json({ ok: true })
  }
}