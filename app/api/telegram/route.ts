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

// Fungsi untuk mengunduh foto dari Telegram dan mengubahnya ke Base64
async function getTelegramImageBase64(fileId: string): Promise<string | null> {
  if (!TELEGRAM_TOKEN) return null
  try {
    const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`)
    const fileData = await fileRes.json()
    const filePath = fileData?.result?.file_path
    if (!filePath) return null

    const imageRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`)
    const arrayBuffer = await imageRes.arrayBuffer()
    return Buffer.from(arrayBuffer).toString('base64')
  } catch (err) {
    console.error('Gagal mengunduh gambar Telegram:', err)
    return null
  }
}

async function parseWithGeminiAI(
  text: string, 
  imageBase64: string | null, 
  detectedUser: string
): Promise<ParsedItem[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY belum terpasang di Vercel.')

  const cleanInput = text.replace(/^(jae:|miki:)\s*/gi, '').trim()

  const systemPrompt = `Anda adalah parser keuangan otomatis cerdas.
Tugas Anda: Membaca masukan pengguna (berupa teks mentah atau foto struk/nota/bukti transfer) dan mengekstrak transaksi keuangan ke dalam JSON Array murni.

Aturan Pemrosesan Gambar (Jika ada foto):
- Baca nama toko/merchant (contoh: "Alfamart", "Indomaret", "Tokopedia", "SPBU").
- Baca TOTAL AKHIR / Grand Total nominal pengeluaran (contoh: jika di struk tertera "Total Belanja 528.700", ambil 528700).
- Jika ada teks tambahan di caption foto, gunakan sebagai pelengkap deskripsi.

Aturan Output JSON Array:
[
  {
    "description": "Nama Toko atau Deskripsi Transaksi",
    "amount": 528700,
    "type": "pengeluaran",
    "category": "Belanja"
  }
]

Persyaratan:
- "amount": nominal integer murni Rupiah tanpa titik/koma/Rp.
- "type": "pengeluaran" atau "pemasukan" (default "pengeluaran").
- "category": Kategori singkat ("Belanja", "Tagihan", "Pendidikan", "Makanan", "Transportasi", "Umum").

Kembalikan HANYA array JSON murni tanpa markdown.`

  const parts: any[] = []

  // Jika ada foto, masukkan data image base64 ke Gemini Vision
  if (imageBase64) {
    parts.push({
      inline_data: {
        mime_type: 'image/jpeg',
        data: imageBase64,
      },
    })
  }

  parts.push({
    text: `${systemPrompt}\n\nTeks/Caption Input:\n"""\n${cleanInput || 'Tolong ekstrak total pengeluaran dari struk/foto ini.'}\n"""`,
  })

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
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

    if (!chatId || !message) {
      return NextResponse.json({ ok: true })
    }

    const text = message?.text || message?.caption || ''
    const photoArray = message?.photo
    const document = message?.document
    const senderFirstName = (message?.from?.first_name || '').toLowerCase()

    // 1. Ambil File ID jika pengguna mengirim foto / dokumen gambar
    let fileId: string | null = null
    if (photoArray && photoArray.length > 0) {
      // Ambil ukuran foto terbesar (elemen terakhir dalam array)
      fileId = photoArray[photoArray.length - 1].file_id
    } else if (document && document.mime_type?.startsWith('image/')) {
      fileId = document.file_id
    }

    if (!text && !fileId) {
      return NextResponse.json({ ok: true })
    }

    // 2. Deteksi Pengirim (Jae vs Miki)
    let detectedUser = 'Jae'
    const lowerText = text.toLowerCase()

    if (lowerText.startsWith('miki:') || senderFirstName.includes('miki')) {
      detectedUser = 'Miki'
    } else if (lowerText.startsWith('jae:') || senderFirstName.includes('jae')) {
      detectedUser = 'Jae'
    }

    // 3. Unduh foto jika ada
    let imageBase64: string | null = null
    if (fileId) {
      await sendTelegramMessage(chatId, '🔍 <i>Sedang membaca foto struk/nota...</i>')
      imageBase64 = await getTelegramImageBase64(fileId)
    }

    // 4. Proses dengan Gemini Vision / Text AI
    const parsedItems = await parseWithGeminiAI(text, imageBase64, detectedUser)

    if (parsedItems.length === 0) {
      await sendTelegramMessage(chatId, '❌ Tidak dapat membaca nominal transaksi dari foto/teks ini.')
      return NextResponse.json({ ok: true })
    }

    // 5. Simpan ke Supabase
    const { data, error } = await supabase
      .from('expenses')
      .insert(parsedItems)
      .select()

    if (error) {
      await sendTelegramMessage(chatId, `❌ Gagal menyimpan ke DB: ${error.message}`)
      return NextResponse.json({ ok: true })
    }

    // 6. Kirim Balasan Konfirmasi
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