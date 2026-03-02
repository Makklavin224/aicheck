import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { getUserFromRequest, hashPassword } from "@/lib/auth";

// GET: список пользователей
export async function GET(req) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "head") {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("users")
    .select("id, login, name, role, active, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST: создать пользователя
export async function POST(req) {
  const user = getUserFromRequest(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Только администратор" }, { status: 403 });
  }

  const { login, password, name, role } = await req.json();
  if (!login || !password || !name) {
    return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
  }

  const sb = getServiceSupabase();
  const hash = await hashPassword(password);
  const { data, error } = await sb
    .from("users")
    .insert({ login, password_hash: hash, name, role: role || "manager" })
    .select("id, login, name, role, active, created_at")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Логин уже занят" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

// PATCH: обновить пользователя
export async function PATCH(req) {
  const user = getUserFromRequest(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Только администратор" }, { status: 403 });
  }

  const { id, name, role, active, password } = await req.json();
  if (!id) return NextResponse.json({ error: "ID обязателен" }, { status: 400 });

  const sb = getServiceSupabase();
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (role !== undefined) updates.role = role;
  if (active !== undefined) updates.active = active;
  if (password) updates.password_hash = await hashPassword(password);

  const { data, error } = await sb
    .from("users")
    .update(updates)
    .eq("id", id)
    .select("id, login, name, role, active, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
