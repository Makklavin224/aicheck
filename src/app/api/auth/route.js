import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { createToken, checkPassword } from "@/lib/auth";

export async function POST(req) {
  try {
    const { login, password } = await req.json();
    if (!login || !password) {
      return NextResponse.json({ error: "Логин и пароль обязательны" }, { status: 400 });
    }

    const sb = getServiceSupabase();
    const { data: user, error } = await sb
      .from("users")
      .select("*")
      .eq("login", login)
      .eq("active", true)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
    }

    const valid = await checkPassword(password, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
    }

    const token = createToken(user);
    return NextResponse.json({
      token,
      user: { id: user.id, login: user.login, name: user.name, role: user.role },
    });
  } catch (e) {
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
