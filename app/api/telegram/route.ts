import { NextResponse } from "next/server";
import { extractReceiptFromImage } from "@/lib/gemini";
import { formatRupiah, parseExpenseText } from "@/lib/parse-expense";
import { getSupabase } from "@/lib/supabase";
import {
  downloadTelegramFile,
  largestPhoto,
  sendTelegramMessage,
  type TelegramUpdate,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

const HELP_TEXT = [
  "<b>Pencatat Keuangan</b>",
  "",
  "Kirim teks, contoh:",
  "• <code>makan 25000 nasi padang</code>",
  "• <code>bensin 20k</code>",
  "",
  "Atau kirim foto struk belanja. Bot akan membaca nominal, toko, dan kategorinya.",
].join("\n");

export async function GET() {
  return NextResponse.json({ ok: true, message: "Telegram webhook siap." });
}

export async function POST(request: Request) {
  let update: TelegramUpdate;

  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "Payload tidak valid" }, { status: 400 });
  }

  const message = update.message;
  if (!message) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const chatId = message.chat.id;

  try {
    if (message.photo?.length) {
      await handlePhoto(chatId, message.photo, message.caption);
    } else if (message.text) {
      await handleText(chatId, message.text);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Terjadi kesalahan";
    console.error("Telegram webhook error:", error);
    try {
      await sendTelegramMessage(chatId, `❌ Gagal menyimpan.\n${detail}`);
    } catch {
      // ignore secondary send failure
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleText(chatId: number, text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("/start") || trimmed.startsWith("/help")) {
    await sendTelegramMessage(chatId, HELP_TEXT);
    return;
  }

  const parsed = parseExpenseText(trimmed);
  if (!parsed) {
    await sendTelegramMessage(
      chatId,
      "Format tidak dikenali. Contoh: <code>makan 25000 nasi padang</code> atau <code>bensin 20k</code>.",
    );
    return;
  }

  const { error } = await getSupabase().from("expenses").insert({
    amount: parsed.amount,
    category: parsed.category,
    description: parsed.description,
  });

  if (error) {
    throw new Error(error.message);
  }

  await sendTelegramMessage(
    chatId,
    [
      "✅ <b>Tercatat</b>",
      `Kategori: ${parsed.category}`,
      `Nominal: ${formatRupiah(parsed.amount)}`,
      `Keterangan: ${parsed.description}`,
    ].join("\n"),
  );
}

async function handlePhoto(
  chatId: number,
  photos: NonNullable<TelegramUpdate["message"]>["photo"],
  caption?: string,
) {
  if (!photos?.length) return;

  const photo = largestPhoto(photos);
  const file = await downloadTelegramFile(photo.file_id);
  const receipt = await extractReceiptFromImage(file.bytes, file.mimeType);

  const description = caption?.trim() || receipt.description;
  const createdAt = receipt.date ? `${receipt.date}T12:00:00+07:00` : undefined;

  const { error } = await getSupabase().from("expenses").insert({
    amount: receipt.total_amount,
    category: receipt.category,
    description,
    store_name: receipt.store_name,
    image_url: file.filePath,
    ...(createdAt ? { created_at: createdAt } : {}),
  });

  if (error) {
    throw new Error(error.message);
  }

  await sendTelegramMessage(
    chatId,
    [
      "✅ <b>Struk tercatat</b>",
      `Toko: ${receipt.store_name}`,
      `Kategori: ${receipt.category}`,
      `Nominal: ${formatRupiah(receipt.total_amount)}`,
      `Keterangan: ${description}`,
    ].join("\n"),
  );
}
