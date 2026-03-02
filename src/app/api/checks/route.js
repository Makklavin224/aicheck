import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getUserFromRequest } from "@/lib/auth";

// GET: список проверок
export async function GET(req) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const sb = getServiceSupabase();
  let query = sb.from("checks").select("*").order("created_at", { ascending: false });

  // Менеджеры видят только свои проверки
  if (user.role === "manager") {
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST: сохранить результат проверки
export async function POST(req) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const body = await req.json();
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("checks")
    .insert({
      user_id: user.id,
      user_name: user.name,
      file_name: body.fileName,
      file_type: body.fileType,
      extracted: body.extracted,
      checks: body.checks,
      score: body.score,
      decision: body.decision || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH: обновить решение
export async function PATCH(req) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { id, decision } = await req.json();
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("checks")
    .update({ decision })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
