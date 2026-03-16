import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { buildPrompt } from "@/lib/prompt";
import {
  analyzePdfForensics,
  analyzeImageForensics,
  buildForensicContext,
} from "@/lib/forensics";

export async function POST(req) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  try {
    const { base64, fileType } = await req.json();
    if (!base64) return NextResponse.json({ error: "Нет файла" }, { status: 400 });

    const mt = fileType === "application/pdf" ? "application/pdf"
      : fileType?.startsWith("image/") ? fileType : "image/jpeg";
    const ct = mt === "application/pdf" ? "document" : "image";
    const isPdf = mt === "application/pdf";

    // Step 1: Run forensic analysis
    let forensicData = null;
    try {
      if (isPdf) {
        forensicData = await analyzePdfForensics(base64);
      } else {
        forensicData = analyzeImageForensics(base64);
      }
    } catch (e) {
      // Forensics failed — continue without it
      console.error("Forensic analysis error:", e);
    }

    // Step 2: Build enhanced prompt with forensic context
    const forensicContext = buildForensicContext(forensicData);
    const systemPrompt = buildPrompt(mt, forensicContext);

    // Step 3: Send to Claude with forensic-aware prompt
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 5000,
        messages: [{
          role: "user",
          content: [
            { type: ct, source: { type: "base64", media_type: mt, data: base64 } },
            { type: "text", text: "Проанализируй этот документ на подлинность. Особое внимание — признаки редактирования, замазывания, подмены цифр. Верни ТОЛЬКО JSON." },
          ],
        }],
        system: systemPrompt,
      }),
    });

    const data = await resp.json();
    if (data.error) {
      return NextResponse.json({ error: data.error.message || "Ошибка API" }, { status: 500 });
    }

    const txt = data.content?.map(b => b.text || "").join("") || "";

    // Parse JSON from Claude response (handle various formats)
    let parsed;
    try {
      const cleaned = txt
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      // Try to extract JSON from mixed content
      const jsonMatch = txt.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("AI вернул невалидный JSON: " + txt.substring(0, 200));
      }
    }

    // Step 4: Attach forensic data + token usage to response
    const usage = data.usage || null;
    return NextResponse.json({
      ...parsed,
      forensics: forensicData ? { ...forensicData, usage } : { usage },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Ошибка анализа" }, { status: 500 });
  }
}
