// Forensic analysis module — detects document tampering
// PDF metadata extraction + raw byte analysis + revision detection

// Software known for document editing (suspicious when found as PDF creator)
const SUSPICIOUS_SOFTWARE = [
  { pattern: "photoshop", label: "Adobe Photoshop" },
  { pattern: "gimp", label: "GIMP" },
  { pattern: "paint.net", label: "Paint.NET" },
  { pattern: "paintshop", label: "PaintShop Pro" },
  { pattern: "pixlr", label: "Pixlr" },
  { pattern: "inkscape", label: "Inkscape" },
  { pattern: "corel", label: "CorelDRAW" },
  { pattern: "affinity", label: "Affinity" },
  { pattern: "canva", label: "Canva" },
  { pattern: "foxit phantom", label: "Foxit PhantomPDF" },
  { pattern: "pdffiller", label: "PDFFiller" },
  { pattern: "smallpdf", label: "SmallPDF" },
  { pattern: "ilovepdf", label: "iLovePDF" },
  { pattern: "sejda", label: "Sejda" },
  { pattern: "pdf-xchange editor", label: "PDF-XChange Editor" },
  { pattern: "nitro pro", label: "Nitro Pro" },
  { pattern: "master pdf", label: "Master PDF Editor" },
  { pattern: "wondershare", label: "Wondershare PDFelement" },
  { pattern: "soda pdf", label: "Soda PDF" },
  { pattern: "able2extract", label: "Able2Extract" },
  { pattern: "pdf architect", label: "PDF Architect" },
  { pattern: "kofax", label: "Kofax Power PDF" },
  { pattern: "nuance", label: "Nuance Power PDF" },
  { pattern: "bluebeam", label: "Bluebeam Revu" },
];

// Normal document creation software
const NORMAL_SOFTWARE = [
  "microsoft", "word", "excel", "powerpoint",
  "libreoffice", "openoffice",
  "google docs", "google sheets",
  "1c", "1с", "sap",
  "crystal reports",
  "wkhtmltopdf", "chrome", "firefox", "safari",
  "reportlab", "fpdf", "tcpdf", "dompdf", "prince",
  "qt", "pdfkit", "jspdf", "itext",
  "scansnap", "epson", "canon", "hp",
];

/**
 * Analyze PDF forensics from base64 data.
 * Uses raw byte analysis (no heavy dependencies).
 */
export async function analyzePdfForensics(base64Data) {
  const result = {
    creator: null,
    producer: null,
    creationDate: null,
    modDate: null,
    author: null,
    revisionCount: 1,
    suspiciousSoftware: false,
    suspiciousSoftwareName: null,
    dateMismatch: false,
    dateMismatchDays: 0,
    multipleRevisions: false,
    embeddedImageCount: 0,
    hasFormFields: false,
    hasJavaScript: false,
    hasEncryption: false,
    flags: [],
  };

  try {
    const bytes = Buffer.from(base64Data, "base64");
    const raw = bytes.toString("latin1");

    // 1. Count %%EOF markers → number of revisions/saves
    const eofMatches = raw.match(/%%EOF/g) || [];
    result.revisionCount = eofMatches.length;
    result.multipleRevisions = eofMatches.length > 1;
    if (eofMatches.length > 1) {
      result.flags.push(
        `PDF сохранён ${eofMatches.length} раз → ${eofMatches.length - 1} редактирование(й) после создания`
      );
    }
    if (eofMatches.length > 3) {
      result.flags.push("Многократные правки — высокая вероятность изменения содержимого");
    }

    // 2. Extract metadata from PDF dictionaries
    result.creator = extractPdfField(raw, "Creator");
    result.producer = extractPdfField(raw, "Producer");
    result.author = extractPdfField(raw, "Author");
    result.creationDate = extractPdfDate(raw, "CreationDate");
    result.modDate = extractPdfDate(raw, "ModDate");

    // 3. Check creator/producer for suspicious software
    const allSoftware = [result.creator, result.producer]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    for (const sus of SUSPICIOUS_SOFTWARE) {
      if (allSoftware.includes(sus.pattern)) {
        result.suspiciousSoftware = true;
        result.suspiciousSoftwareName = sus.label;
        result.flags.push(
          `Создано/обработано в ${sus.label} — это графический/PDF-редактор, не учётная система`
        );
        break;
      }
    }

    // If not suspicious, check if it's a normal creator
    if (!result.suspiciousSoftware && allSoftware) {
      const isNormal = NORMAL_SOFTWARE.some((n) => allSoftware.includes(n));
      if (!isNormal && allSoftware.length > 2) {
        result.flags.push(
          `Нестандартное ПО для создания: "${result.creator || result.producer}" — требует внимания`
        );
      }
    }

    // 4. Check date mismatch
    if (result.creationDate && result.modDate) {
      const created = new Date(result.creationDate);
      const modified = new Date(result.modDate);
      if (!isNaN(created) && !isNaN(modified)) {
        const diffMs = Math.abs(modified - created);
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        result.dateMismatchDays = Math.round(diffDays * 10) / 10;
        if (diffDays > 1) {
          result.dateMismatch = true;
          result.flags.push(
            `Создан: ${formatDate(created)}, изменён: ${formatDate(modified)} — разница ${Math.round(diffDays)} дн.`
          );
        }
      }
    }

    // 5. Count embedded images
    const imageMatches = raw.match(/\/Subtype\s*\/Image/g) || [];
    result.embeddedImageCount = imageMatches.length;
    // Count pages roughly
    const pageCount = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length || 1;
    if (imageMatches.length > pageCount * 4) {
      result.flags.push(
        `${imageMatches.length} встроенных изображений на ${pageCount} стр. — возможны вставленные фрагменты`
      );
    }

    // 6. Check for form fields (can hide edits)
    if (raw.includes("/AcroForm") || raw.includes("/Widget")) {
      result.hasFormFields = true;
      result.flags.push("Документ содержит поля формы — значения могут быть отредактированы");
    }

    // 7. Check for JavaScript (can manipulate display)
    if (raw.includes("/JavaScript") || raw.includes("/JS ")) {
      result.hasJavaScript = true;
      result.flags.push("Документ содержит JavaScript — возможна манипуляция отображением");
    }

    // 8. Check for encryption markers
    if (raw.includes("/Encrypt")) {
      result.hasEncryption = true;
    }

    // 9. Look for editing tool markers in raw content
    const editMarkers = [
      { re: /\/LastModified/g, label: "Метка последнего изменения объекта" },
      { re: /\/Annots\s*\[/g, label: "Аннотации (могут скрывать оригинальный текст)" },
      { re: /\/Redact/gi, label: "Следы редактирования (Redaction)" },
    ];
    for (const m of editMarkers) {
      if (m.re.test(raw)) {
        result.flags.push(m.label);
      }
    }

    // 10. Check for incremental update structure (xref after first %%EOF)
    const firstEof = raw.indexOf("%%EOF");
    if (firstEof > 0 && firstEof < raw.length - 10) {
      const afterFirst = raw.substring(firstEof + 5);
      if (afterFirst.includes("xref") || afterFirst.includes("/XRef")) {
        result.flags.push("Обнаружено инкрементальное обновление PDF — файл дописывался после создания");
      }
    }
  } catch (e) {
    result.flags.push(`Ошибка анализа PDF: ${e.message}`);
  }

  return result;
}

/**
 * Analyze image EXIF-like metadata from raw bytes.
 * Looks for editing software signatures in the image data.
 */
export function analyzeImageForensics(base64Data) {
  const result = {
    flags: [],
    editingSoftwareDetected: false,
    editingSoftwareName: null,
  };

  try {
    const bytes = Buffer.from(base64Data, "base64");
    const raw = bytes.toString("latin1").toLowerCase();

    // Check EXIF/metadata for editing software
    const imageEditors = [
      { pattern: "photoshop", label: "Adobe Photoshop" },
      { pattern: "gimp", label: "GIMP" },
      { pattern: "paint.net", label: "Paint.NET" },
      { pattern: "pixlr", label: "Pixlr" },
      { pattern: "snapseed", label: "Snapseed" },
      { pattern: "lightroom", label: "Adobe Lightroom" },
      { pattern: "affinity photo", label: "Affinity Photo" },
    ];

    for (const editor of imageEditors) {
      if (raw.includes(editor.pattern)) {
        result.editingSoftwareDetected = true;
        result.editingSoftwareName = editor.label;
        result.flags.push(`В метаданных изображения обнаружен ${editor.label}`);
        break;
      }
    }

    // Check for JPEG quality markers suggesting re-save
    // Multiple quantization tables can indicate editing
    const dqtCount = countOccurrences(raw, "\xff\xdb");
    if (dqtCount > 2) {
      result.flags.push(
        `Обнаружено ${dqtCount} таблиц квантования JPEG — возможна многократная пересохранение`
      );
    }
  } catch (e) {
    result.flags.push(`Ошибка анализа изображения: ${e.message}`);
  }

  return result;
}

// --- Helper functions ---

function extractPdfField(raw, fieldName) {
  // Match /FieldName (value) or /FieldName <hex>
  const parenRegex = new RegExp(`/${fieldName}\\s*\\(([^)]{0,200})\\)`, "i");
  const match = raw.match(parenRegex);
  if (match) {
    let val = match[1];
    // Detect UTF-16BE BOM (FE FF) — Word/Office encode metadata as UTF-16BE
    if (val.charCodeAt(0) === 0xFE && val.charCodeAt(1) === 0xFF) {
      try {
        const bytes = Buffer.from(val, "latin1");
        // Swap bytes: UTF-16BE → UTF-16LE (Node has no native utf16be)
        for (let i = 2; i < bytes.length - 1; i += 2) {
          const tmp = bytes[i];
          bytes[i] = bytes[i + 1];
          bytes[i + 1] = tmp;
        }
        return bytes.toString("utf16le", 2).replace(/\0/g, "").trim();
      } catch {
        return val.replace(/[\0\xFE\xFF]/g, "").trim();
      }
    }
    return decodePdfString(val);
  }

  // Try hex string
  const hexRegex = new RegExp(`/${fieldName}\\s*<([0-9a-fA-F]+)>`, "i");
  const hexMatch = raw.match(hexRegex);
  if (hexMatch) {
    try {
      return Buffer.from(hexMatch[1], "hex").toString("utf16le").replace(/\0/g, "");
    } catch {
      return hexMatch[1];
    }
  }
  return null;
}

function extractPdfDate(raw, fieldName) {
  const val = extractPdfField(raw, fieldName);
  if (!val) return null;
  // PDF date format: D:YYYYMMDDHHmmSS+HH'mm'
  const m = val.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/);
  if (!m) return val;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function decodePdfString(s) {
  // Handle PDF escape sequences
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function formatDate(d) {
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function countOccurrences(str, sub) {
  let count = 0, pos = 0;
  while ((pos = str.indexOf(sub, pos)) !== -1) { count++; pos += sub.length; }
  return count;
}

/**
 * Build forensic summary text to include in AI prompt.
 */
export function buildForensicContext(forensicData) {
  if (!forensicData) return "";

  const lines = ["РЕЗУЛЬТАТЫ ПРОГРАММНОГО АНАЛИЗА ДОКУМЕНТА:"];

  if (forensicData.creator) lines.push(`• Создатель: ${forensicData.creator}`);
  if (forensicData.producer) lines.push(`• PDF-движок: ${forensicData.producer}`);
  if (forensicData.author) lines.push(`• Автор: ${forensicData.author}`);
  if (forensicData.creationDate) lines.push(`• Дата создания: ${forensicData.creationDate}`);
  if (forensicData.modDate) lines.push(`• Дата изменения: ${forensicData.modDate}`);
  if (forensicData.revisionCount > 1) {
    lines.push(`• Количество ревизий PDF: ${forensicData.revisionCount} (файл редактировался)`);
  }
  if (forensicData.suspiciousSoftware) {
    lines.push(`• ⚠️ ПОДОЗРИТЕЛЬНОЕ ПО: ${forensicData.suspiciousSoftwareName}`);
  }
  if (forensicData.hasFormFields) lines.push("• Документ содержит редактируемые поля формы");
  if (forensicData.hasJavaScript) lines.push("• Документ содержит JavaScript");
  if (forensicData.embeddedImageCount > 0) {
    lines.push(`• Встроенных изображений: ${forensicData.embeddedImageCount}`);
  }

  if (forensicData.flags?.length > 0) {
    lines.push("\nВЫЯВЛЕННЫЕ ФЛАГИ:");
    forensicData.flags.forEach((f) => lines.push(`  🔴 ${f}`));
  }

  lines.push("\nУЧИТЫВАЙ эти данные при визуальном анализе. Если ПО подозрительное или есть ревизии — будь ОСОБЕННО внимателен к признакам редактирования.");

  return lines.join("\n");
}
