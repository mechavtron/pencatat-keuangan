import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();

  if (!id || !UUID_PATTERN.test(id)) {
    return NextResponse.json({ ok: false, error: "id tidak valid" }, { status: 400 });
  }

  try {
    const { data, error } = await getSupabase()
      .from("expenses")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data?.length) {
      return NextResponse.json({ ok: false, error: "Transaksi tidak ditemukan" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gagal menghapus transaksi";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
