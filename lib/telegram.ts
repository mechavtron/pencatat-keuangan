const TELEGRAM_API = "https://api.telegram.org";

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN wajib diisi di .env.local");
  }
  return token;
}

export type TelegramPhoto = {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
};

export type TelegramMessage = {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhoto[];
  chat: { id: number };
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

export async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gagal mengirim pesan Telegram: ${res.status} ${body}`);
  }
}

export async function downloadTelegramFile(
  fileId: string,
): Promise<{ bytes: Buffer; mimeType: string; filePath: string }> {
  const metaRes = await fetch(
    `${TELEGRAM_API}/bot${botToken()}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );
  const meta = (await metaRes.json()) as {
    ok: boolean;
    result?: { file_path?: string };
    description?: string;
  };

  if (!meta.ok || !meta.result?.file_path) {
    throw new Error(meta.description ?? "Gagal mengambil file dari Telegram");
  }

  const fileUrl = `${TELEGRAM_API}/file/bot${botToken()}/${meta.result.file_path}`;
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    throw new Error("Gagal mengunduh gambar dari Telegram");
  }

  const bytes = Buffer.from(await fileRes.arrayBuffer());
  const ext = meta.result.file_path.split(".").pop()?.toLowerCase();
  const mimeType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  return { bytes, mimeType, filePath: meta.result.file_path };
}

export function largestPhoto(photos: TelegramPhoto[]): TelegramPhoto {
  return photos.reduce((best, current) =>
    (current.file_size ?? 0) > (best.file_size ?? 0) ? current : best,
  );
}
