// Чеклист проверки
export const CHECKLIST = [
  { id:"1.1", cat:"Математические ошибки", name:"Сумма цифрами ≠ прописью", w:10 },
  { id:"1.2", cat:"Математические ошибки", name:"Ошибка в подсчёте итоговой суммы", w:10 },
  { id:"1.3", cat:"Математические ошибки", name:"Неверный расчёт НДС (22%)", w:10 },
  { id:"1.4", cat:"Математические ошибки", name:"Ошибка в количестве × цену", w:10 },
  { id:"1.5", cat:"Математические ошибки", name:"Несоответствие скидки", w:5 },
  { id:"1.6", cat:"Математические ошибки", name:"Округление с большой погрешностью", w:5 },
  { id:"2.1", cat:"Реквизиты и оформление", name:"Неверный формат ИНН/КПП", w:10 },
  { id:"2.2", cat:"Реквизиты и оформление", name:"QR-код: сумма отличается от счёта", w:10 },
  { id:"2.3", cat:"Реквизиты и оформление", name:"QR-код не считывается", w:10 },
  { id:"3.1", cat:"Технические несоответствия", name:"Нереалистичные сроки поставки", w:10 },
  { id:"3.3", cat:"Технические несоответствия", name:"Нереальная скидка (>30–40%)", w:10 },
  { id:"3.5", cat:"Технические несоответствия", name:"Неверные тех. характеристики", w:5 },
  { id:"4.1", cat:"Качество оформления", name:"Грамматические ошибки", w:2 },
  { id:"4.4", cat:"Качество оформления", name:"Признаки редактирования (Photoshop)", w:10 },
  { id:"4.6", cat:"Качество оформления", name:"Разные версии документа", w:10 },
  { id:"5.1", cat:"Проверка компании", name:"Компания не найдена в ЕГРЮЛ", w:10 },
  { id:"5.2", cat:"Проверка компании", name:"Компания ликвидирована", w:10 },
];

// Парсинг числа из строки
function parseNum(s) {
  if (!s && s !== 0) return null;
  const str = String(s).replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function fmtNum(n) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Клиентская проверка математики (JS считает без ошибок)
export function verifyMath(extracted, checks) {
  if (!extracted?.items?.length) return checks;
  const updated = [...checks];

  function setCheck(id, status, comment) {
    const idx = updated.findIndex(c => c.id === id);
    if (idx >= 0) updated[idx] = { ...updated[idx], id, status, comment };
  }

  const items = extracted.items.map((it, i) => ({
    idx: i + 1, name: it.name,
    qty: parseNum(it.qty), price: parseNum(it.price), sum: parseNum(it.sum),
  }));

  const totalDoc = parseNum(extracted.total_sum);
  const ndsDoc = parseNum(extracted.nds_sum);

  // 1.4: qty × price = sum
  const lineErrors = [], lineDetails = [];
  items.forEach(it => {
    if (it.qty !== null && it.price !== null && it.sum !== null) {
      const calc = Math.round(it.qty * it.price * 100) / 100;
      const diff = Math.abs(calc - it.sum);
      const ok = diff <= 5;
      lineDetails.push(`${it.idx}) ${it.qty}×${it.price}=${fmtNum(calc)}${ok ? "✓" : ` (указано ${fmtNum(it.sum)}, Δ${fmtNum(diff)})✗`}`);
      if (!ok) lineErrors.push(it.idx);
    }
  });
  if (lineDetails.length > 0) {
    setCheck("1.4", lineErrors.length > 0 ? "fail" : "ok",
      lineDetails.join("; ") + (lineErrors.length > 0 ? `. Ошибки в строках: ${lineErrors.join(", ")}` : ". Все строки верны."));
  }

  // 1.2: sum of line sums = total
  const lineSums = items.filter(it => it.sum !== null).map(it => it.sum);
  if (lineSums.length > 0 && totalDoc !== null) {
    const calcTotal = Math.round(lineSums.reduce((a, b) => a + b, 0) * 100) / 100;
    const diff = Math.abs(calcTotal - totalDoc);
    setCheck("1.2", diff <= 1 ? "ok" : "fail",
      `${lineSums.map(s => fmtNum(s)).join(" + ")} = ${fmtNum(calcTotal)}. В документе: ${fmtNum(totalDoc)}. Разница: ${fmtNum(diff)}`);
  }

  // 1.3: VAT = total × 22 / 122
  if (totalDoc !== null && ndsDoc !== null) {
    const calcNds = Math.round(totalDoc * 22 / 122 * 100) / 100;
    const diff = Math.abs(calcNds - ndsDoc);
    setCheck("1.3", diff <= 1 ? "ok" : "fail",
      `${fmtNum(totalDoc)} × 22 ÷ 122 = ${fmtNum(calcNds)}. В документе: ${fmtNum(ndsDoc)}. Разница: ${fmtNum(diff)}`);
  } else if (!ndsDoc) {
    setCheck("1.3", "skip", "НДС не указан.");
  }

  // 1.6: rounding > 10₽
  const bigRound = items.filter(it => {
    if (it.qty !== null && it.price !== null && it.sum !== null) {
      return Math.abs(Math.round(it.qty * it.price * 100) / 100 - it.sum) > 10;
    }
    return false;
  });
  if (items.filter(it => it.qty !== null).length > 0) {
    setCheck("1.6", bigRound.length > 0 ? "warn" : "ok",
      bigRound.length > 0 ? `Округление >10₽ в строках: ${bigRound.map(it => it.idx).join(", ")}` : "Все округления в норме.");
  }

  return updated;
}

// Расчёт итогового балла
export function calcScore(checks) {
  let mx = 0, earn = 0;
  checks.forEach(c => {
    const d = CHECKLIST.find(x => x.id === c.id);
    if (!d || c.status === "skip") return;
    mx += d.w;
    if (c.status === "ok") earn += d.w;
    else if (c.status === "warn") earn += d.w * 0.5;
  });
  return mx > 0 ? Math.round(earn / mx * 100) : 50;
}
