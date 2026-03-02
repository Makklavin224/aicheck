import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { buildPrompt } from "@/lib/prompt";

export async function POST(req) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  try {
    const { base64, fileType } = await req.json();
    if (!base64) return NextResponse.json({ error: "Нет файла" }, { status: 400 });

    const mt = fileType === "application/pdf" ? "application/pdf"
      : fileType?.startsWith("image/") ? fileType : "image/jpeg";
    const ct = mt === "application/pdf" ? "document" : "image";

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4000,
        messages: [{
          role: "user",
          content: [
            { type: ct, source: { type: "base64", media_type: mt, data: base64 } },
            { type: "text", text: "Проанализируй этот документ. Верни ТОЛЬКО JSON." },
          ],
        }],
        system: buildPrompt(mt),
      }),
    });

    const data = await resp.json();
    if (data.error) {
      return NextResponse.json({ error: data.error.message || "Ошибка API" }, { status: 500 });
    }

    const txt = data.content?.map(b => b.text || "").join("") || "";
    const parsed = JSON.parse(txt.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());

    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json({ error: e.message || "Ошибка анализа" }, { status: 500 });
  }
}
