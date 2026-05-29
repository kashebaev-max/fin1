// ═══════════════════════════════════════════
// Шаблоны документов РК 2026
// По требованиям НК РК и законодательства
// ═══════════════════════════════════════════

import { TAX, fmtMoney } from "./tax2026";

interface DocData {
  doc_type: string;
  doc_number: string;
  doc_date: string;
  counterparty_name: string;
  counterparty_bin?: string;
  counterparty_address?: string;
  counterparty_iik?: string;
  counterparty_bank?: string;
  items: { name: string; unit: string; quantity: number; price: number; sum: number }[];
  total_sum: number;
  nds_sum: number;
  nds_rate: number;
  total_with_nds: number;
  extra_data?: any;
  company?: {
    name: string; bin: string; address: string; director: string;
    accountant: string; bank: string; iik: string; bik: string; kbe: string; phone: string;
  };
}

const numToWordsKZ = (n: number): string => {
  const ones = ["","один","два","три","четыре","пять","шесть","семь","восемь","девять",
    "десять","одиннадцать","двенадцать","тринадцать","четырнадцать","пятнадцать",
    "шестнадцать","семнадцать","восемнадцать","девятнадцать"];
  const tens = ["","","двадцать","тридцать","сорок","пятьдесят","шестьдесят","семьдесят","восемьдесят","девяносто"];
  const hundreds = ["","сто","двести","триста","четыреста","пятьсот","шестьсот","семьсот","восемьсот","девятьсот"];
  if (n === 0) return "ноль";
  let r = "";
  if (n >= 1000000) { const m = Math.floor(n/1000000); r += ones[m]+" миллион "; n %= 1000000; }
  if (n >= 1000) {
    const th = Math.floor(n/1000);
    if (th >= 100) r += hundreds[Math.floor(th/100)]+" ";
    const rem = th % 100;
    if (rem >= 20) { r += tens[Math.floor(rem/10)]+" "; if (rem%10) r += ones[rem%10]+" "; }
    else if (rem > 0) r += ones[rem]+" ";
    r += "тысяч "; n %= 1000;
  }
  if (n >= 100) { r += hundreds[Math.floor(n/100)]+" "; n %= 100; }
  if (n >= 20) { r += tens[Math.floor(n/10)]+" "; n %= 10; }
  if (n > 0) r += ones[n]+" ";
  return r.trim();
};

const css = `<style>
body{font-family:'Times New Roman',serif;padding:40px 50px;color:#111;font-size:13px;line-height:1.7;max-width:800px;margin:0 auto}
h2{text-align:center;margin:0 0 20px;font-size:16px}
h3{text-align:center;margin:0 0 10px;font-size:14px}
table{width:100%;border-collapse:collapse;margin:12px 0}
th,td{border:1px solid #333;padding:5px 8px;text-align:left;font-size:12px}
th{background:#f0f0f0;font-weight:700}
.r{text-align:right}.c{text-align:center}
.noborder,.noborder td,.noborder th{border:none}
.sig{margin-top:40px;display:flex;justify-content:space-between}
.sig div{width:45%}
.header-right{text-align:right;font-size:11px;color:#555;margin-bottom:15px}
.small{font-size:10px;color:#666}
.line{border-bottom:1px solid #000;min-width:180px;display:inline-block}
.stamp-area{margin-top:20px;font-size:10px;color:#999}
hr{border:none;border-top:1px solid #ccc;margin:15px 0}
@media print{body{padding:20px}@page{margin:15mm}}
</style>`;

function header(d: DocData): string {
  const c = d.company;
  if (!c) return "";
  return `<div class="header-right">${c.name}<br>${c.address}<br>БИН: ${c.bin}<br>Тел.: ${c.phone}<br>ИИК: ${c.iik}, ${c.bank}, БИК: ${c.bik}</div>`;
}

function itemsTable(d: DocData, showNDS = true): string {
  const rows = d.items.map((it, i) =>
    `<tr><td class="c">${i+1}</td><td>${it.name}</td><td class="c">${it.unit}</td><td class="r">${fmtMoney(it.quantity)}</td><td class="r">${fmtMoney(it.price)}</td><td class="r">${fmtMoney(it.sum)}</td></tr>`
  ).join("");
  return `<table>
<thead><tr><th class="c" style="width:30px">№</th><th>Наименование товаров (работ, услуг)</th><th class="c" style="width:50px">Ед. изм.</th><th class="r" style="width:70px">Кол-во</th><th class="r" style="width:90px">Цена, ₸</th><th class="r" style="width:100px">Сумма, ₸</th></tr></thead>
<tbody>${rows}
<tr><td colspan="5" class="r"><b>Итого:</b></td><td class="r"><b>${fmtMoney(d.total_sum)}</b></td></tr>
${showNDS ? `<tr><td colspan="5" class="r"><b>НДС (${Math.round(d.nds_rate*100)}%):</b></td><td class="r">${fmtMoney(d.nds_sum)}</td></tr>
<tr><td colspan="5" class="r"><b>Всего с НДС:</b></td><td class="r"><b>${fmtMoney(d.total_with_nds)}</b></td></tr>` : ""}
</tbody></table>
<p><b>Всего наименований ${d.items.length}, на сумму ${fmtMoney(d.total_with_nds)} тенге</b></p>
<p><i>${numToWordsKZ(Math.floor(d.total_with_nds))} тенге 00 тиын</i></p>`;
}

function signatures(d: DocData): string {
  const c = d.company;
  return `<div class="sig">
<div><p><b>Руководитель</b></p><p style="margin-top:30px">________________ / ${c?.director || "___________"} /</p><div class="stamp-area">М.П.</div></div>
<div><p><b>Гл. бухгалтер</b></p><p style="margin-top:30px">________________ / ${c?.accountant || "___________"} /</p></div>
</div>`;
}

function parties(d: DocData, sellerLabel: string, buyerLabel: string): string {
  const c = d.company;
  return `<table class="noborder" style="margin-bottom:15px">
<tr><td style="width:120px;color:#555;vertical-align:top;padding:4px 0"><b>${sellerLabel}:</b></td>
<td style="padding:4px 0"><b>${c?.name || "—"}</b>, БИН ${c?.bin || "—"}, ${c?.address || "—"}<br>ИИК: ${c?.iik || "—"}, ${c?.bank || "—"}, БИК: ${c?.bik || "—"}</td></tr>
<tr><td style="color:#555;vertical-align:top;padding:4px 0"><b>${buyerLabel}:</b></td>
<td style="padding:4px 0"><b>${d.counterparty_name || "—"}</b>${d.counterparty_bin ? `, БИН ${d.counterparty_bin}` : ""}${d.counterparty_address ? `, ${d.counterparty_address}` : ""}${d.counterparty_iik ? `<br>ИИК: ${d.counterparty_iik}` : ""}</td></tr>
</table>`;
}

// ═══════════════════════════════════════
// ШАБЛОНЫ ДОКУМЕНТОВ
// ═══════════════════════════════════════

function invoiceTemplate(d: DocData): string {
  return `${header(d)}
<h2>СЧЁТ НА ОПЛАТУ № ${d.doc_number}</h2>
<h3>от ${d.doc_date} г.</h3>
${parties(d, "Поставщик", "Покупатель")}
<p>Просим оплатить следующие товары (работы, услуги):</p>
${itemsTable(d)}
<hr>
<p class="small">Оплату произвести на расчётный счёт Поставщика. Счёт действителен в течение 5 (пяти) банковских дней с даты выписки.<br>
НДС исчислен по ставке ${Math.round(d.nds_rate*100)}% согласно Налоговому кодексу РК 2026 (ЗРК 214-VIII от 18.07.2025).</p>
${signatures(d)}`;
}

function sfTemplate(d: DocData): string {
  return `${header(d)}
<h2>СЧЁТ-ФАКТУРА № ${d.doc_number}</h2>
<h3>Дата выписки: ${d.doc_date} г.</h3>
<table class="noborder">
<tr><td style="width:160px;color:#555;padding:3px 0">Поставщик:</td><td><b>${d.company?.name || "—"}</b></td></tr>
<tr><td style="color:#555;padding:3px 0">БИН поставщика:</td><td>${d.company?.bin || "—"}</td></tr>
<tr><td style="color:#555;padding:3px 0">Покупатель:</td><td><b>${d.counterparty_name || "—"}</b></td></tr>
<tr><td style="color:#555;padding:3px 0">БИН покупателя:</td><td>${d.counterparty_bin || "—"}</td></tr>
<tr><td style="color:#555;padding:3px 0">Дата оборота:</td><td>${d.doc_date}</td></tr>
<tr><td style="color:#555;padding:3px 0">Условие оплаты:</td><td>${d.extra_data?.payment_terms || "По договору"}</td></tr>
</table>
<table>
<thead><tr><th class="c">№</th><th>Наименование товаров (работ, услуг)</th><th class="c">Ед.</th><th class="r">Кол-во</th><th class="r">Цена без НДС</th><th class="r">Стоимость без НДС</th><th class="r">НДС ${Math.round(d.nds_rate*100)}%</th><th class="r">Стоимость с НДС</th></tr></thead>
<tbody>${d.items.map((it, i) => {
  const nds = Math.round(it.sum * d.nds_rate);
  return `<tr><td class="c">${i+1}</td><td>${it.name}</td><td class="c">${it.unit}</td><td class="r">${fmtMoney(it.quantity)}</td><td class="r">${fmtMoney(it.price)}</td><td class="r">${fmtMoney(it.sum)}</td><td class="r">${fmtMoney(nds)}</td><td class="r">${fmtMoney(it.sum + nds)}</td></tr>`;
}).join("")}
<tr><td colspan="5" class="r"><b>Итого:</b></td><td class="r"><b>${fmtMoney(d.total_sum)}</b></td><td class="r"><b>${fmtMoney(d.nds_sum)}</b></td><td class="r"><b>${fmtMoney(d.total_with_nds)}</b></td></tr>
</tbody></table>
<p><i>Всего на сумму: ${numToWordsKZ(Math.floor(d.total_with_nds))} тенге 00 тиын</i></p>
<p class="small">Счёт-фактура выписана в соответствии со ст. 412 Налогового кодекса РК 2026. Ставка НДС ${Math.round(d.nds_rate*100)}%.</p>
${signatures(d)}`;
}

function waybillTemplate(d: DocData): string {
  return `${header(d)}
<h2>НАКЛАДНАЯ НА ОТПУСК ЗАПАСОВ НА СТОРОНУ</h2>
<h3>№ ${d.doc_number} от ${d.doc_date} г.</h3>
<table class="noborder">
<tr><td style="width:150px;color:#555;padding:3px 0">Организация:</td><td><b>${d.company?.name || "—"}</b>, БИН ${d.company?.bin || "—"}</td></tr>
<tr><td style="color:#555;padding:3px 0">Получатель:</td><td><b>${d.counterparty_name || "—"}</b>${d.counterparty_bin ? `, БИН ${d.counterparty_bin}` : ""}</td></tr>
<tr><td style="color:#555;padding:3px 0">Основание:</td><td>${d.extra_data?.basis || "Договор поставки"}</td></tr>
<tr><td style="color:#555;padding:3px 0">Склад:</td><td>${d.extra_data?.warehouse || "Основной склад"}</td></tr>
</table>
${itemsTable(d)}
<div class="sig">
<div><p><b>Отпустил</b></p><p style="margin-top:25px">________________ / ${d.company?.director || "___"} /</p><p class="small">должность, подпись, расшифровка</p></div>
<div><p><b>Получил</b></p><p style="margin-top:25px">________________ / ________________ /</p><p class="small">должность, подпись, расшифровка</p><p class="small" style="margin-top:10px">По доверенности № _______ от ____________</p></div>
</div>`;
}

function actTemplate(d: DocData): string {
  return `${header(d)}
<h2>АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ)</h2>
<h3>№ ${d.doc_number} от ${d.doc_date} г.</h3>
<p>г. Астана</p>
<p>Мы, нижеподписавшиеся:</p>
<p><b>Исполнитель</b> — ${d.company?.name || "—"} (БИН ${d.company?.bin || "—"}), в лице директора ${d.company?.director || "—"},</p>
<p><b>Заказчик</b> — ${d.counterparty_name || "—"}${d.counterparty_bin ? ` (БИН ${d.counterparty_bin})` : ""},</p>
<p>составили настоящий Акт о том, что Исполнителем выполнены следующие работы (оказаны услуги):</p>
${itemsTable(d)}
<p>Вышеперечисленные работы (услуги) выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам не имеет.</p>
<p>Настоящий Акт составлен в двух экземплярах, имеющих одинаковую юридическую силу, по одному для каждой из сторон.</p>
<div class="sig">
<div><p><b>ИСПОЛНИТЕЛЬ</b></p><p>${d.company?.name || "—"}</p><p style="margin-top:25px">________________ / ${d.company?.director || "___"} /</p><div class="stamp-area">М.П.</div></div>
<div><p><b>ЗАКАЗЧИК</b></p><p>${d.counterparty_name || "—"}</p><p style="margin-top:25px">________________ / ________________ /</p><div class="stamp-area">М.П.</div></div>
</div>`;
}

function pkoTemplate(d: DocData): string {
  const sumWords = numToWordsKZ(Math.floor(d.total_with_nds)) + " тенге 00 тиын";
  return `${header(d)}
<table style="border:2px solid #000;margin-bottom:20px"><tr>
<td style="width:60%;padding:20px;vertical-align:top;border-right:2px dashed #000">
<h2 style="text-align:left;margin-bottom:15px">ПРИХОДНЫЙ КАССОВЫЙ ОРДЕР</h2>
<table class="noborder">
<tr><td style="padding:3px 0">Номер документа:</td><td><b>${d.doc_number}</b></td></tr>
<tr><td style="padding:3px 0">Дата составления:</td><td><b>${d.doc_date}</b></td></tr>
<tr><td style="padding:3px 0">Организация:</td><td>${d.company?.name || "—"}</td></tr>
<tr><td style="padding:3px 0;color:#555">Дебет:</td><td>1010 «Денежные средства в кассе»</td></tr>
<tr><td style="padding:3px 0;color:#555">Кредит:</td><td>1210 «Задолженность покупателей»</td></tr>
</table>
<table style="margin-top:10px">
<tr><th>Принято от:</th><td>${d.counterparty_name || "—"}</td></tr>
<tr><th>Основание:</th><td>${d.extra_data?.basis || "Оплата по счёту"}</td></tr>
<tr><th>Сумма:</th><td><b>${fmtMoney(d.total_with_nds)} тенге</b></td></tr>
<tr><th>В т.ч. НДС ${Math.round(d.nds_rate*100)}%:</th><td>${fmtMoney(d.nds_sum)} тенге</td></tr>
<tr><th>Сумма прописью:</th><td><i>${sumWords}</i></td></tr>
<tr><th>Приложение:</th><td>${d.extra_data?.attachment || "—"}</td></tr>
</table>
<div style="margin-top:20px">
<p>Гл. бухгалтер _____________ / ${d.company?.accountant || "___"} /</p>
<p>Кассир _____________ / _____________ /</p>
</div>
</td>
<td style="width:40%;padding:20px;vertical-align:top">
<h3>КВИТАНЦИЯ</h3>
<h3>к приходному кассовому ордеру</h3>
<p>№ <b>${d.doc_number}</b> от <b>${d.doc_date}</b></p>
<p>Принято от: <b>${d.counterparty_name || "—"}</b></p>
<p>Основание: ${d.extra_data?.basis || "Оплата"}</p>
<p>Сумма: <b>${fmtMoney(d.total_with_nds)} тенге</b></p>
<p>В т.ч. НДС: ${fmtMoney(d.nds_sum)} тенге</p>
<p><i>${sumWords}</i></p>
<p style="margin-top:15px">Гл. бухгалтер _____________</p>
<p>Кассир _____________</p>
<div class="stamp-area">М.П.</div>
</td></tr></table>`;
}

function rkoTemplate(d: DocData): string {
  const sumWords = numToWordsKZ(Math.floor(d.total_with_nds)) + " тенге 00 тиын";
  return `${header(d)}
<h2>РАСХОДНЫЙ КАССОВЫЙ ОРДЕР</h2>
<h3>№ ${d.doc_number} от ${d.doc_date} г.</h3>
<table class="noborder" style="margin-bottom:15px">
<tr><td style="width:160px;padding:3px 0">Организация:</td><td><b>${d.company?.name || "—"}</b></td></tr>
<tr><td style="padding:3px 0;color:#555">Дебет:</td><td>${d.extra_data?.debit_account || "7210 «Административные расходы»"}</td></tr>
<tr><td style="padding:3px 0;color:#555">Кредит:</td><td>1010 «Денежные средства в кассе»</td></tr>
</table>
<table>
<tr><th>Выдать:</th><td>${d.counterparty_name || "—"}</td></tr>
<tr><th>Основание:</th><td>${d.extra_data?.basis || "—"}</td></tr>
<tr><th>Сумма:</th><td><b>${fmtMoney(d.total_with_nds)} тенге</b></td></tr>
<tr><th>Сумма прописью:</th><td><i>${sumWords}</i></td></tr>
<tr><th>Приложение:</th><td>${d.extra_data?.attachment || "—"}</td></tr>
</table>
<div style="margin-top:25px">
<p>Руководитель _____________ / ${d.company?.director || "___"} /</p>
<p>Гл. бухгалтер _____________ / ${d.company?.accountant || "___"} /</p>
</div>
<hr>
<p><b>Получил:</b> ${fmtMoney(d.total_with_nds)} тенге (<i>${sumWords}</i>)</p>
<p>Дата: «____» _____________ 20____ г.</p>
<p>Подпись получателя: _____________</p>
<p>Документ, удостоверяющий личность: _____________</p>
<p style="margin-top:15px">Выдал кассир: _____________ / _____________ /</p>`;
}

function ppTemplate(d: DocData): string {
  return `${header(d)}
<h2>ПЛАТЁЖНОЕ ПОРУЧЕНИЕ № ${d.doc_number}</h2>
<h3>от ${d.doc_date} г.</h3>
<table>
<tr><td colspan="2" style="background:#f5f5f5;font-weight:700">ПЛАТЕЛЬЩИК</td></tr>
<tr><td style="width:140px;color:#555">Наименование:</td><td><b>${d.company?.name || "—"}</b></td></tr>
<tr><td style="color:#555">БИН:</td><td>${d.company?.bin || "—"}</td></tr>
<tr><td style="color:#555">ИИК:</td><td>${d.company?.iik || "—"}</td></tr>
<tr><td style="color:#555">Банк:</td><td>${d.company?.bank || "—"}</td></tr>
<tr><td style="color:#555">БИК:</td><td>${d.company?.bik || "—"}</td></tr>
<tr><td style="color:#555">Кбе:</td><td>${d.company?.kbe || "17"}</td></tr>
<tr><td colspan="2" style="background:#f5f5f5;font-weight:700">ПОЛУЧАТЕЛЬ</td></tr>
<tr><td style="color:#555">Наименование:</td><td><b>${d.counterparty_name || "—"}</b></td></tr>
<tr><td style="color:#555">БИН:</td><td>${d.counterparty_bin || "—"}</td></tr>
<tr><td style="color:#555">ИИК:</td><td>${d.counterparty_iik || "—"}</td></tr>
<tr><td colspan="2" style="background:#f5f5f5;font-weight:700">ДЕТАЛИ ПЛАТЕЖА</td></tr>
<tr><td style="color:#555">Сумма:</td><td><b>${fmtMoney(d.total_with_nds)} тенге</b></td></tr>
<tr><td style="color:#555">Назначение:</td><td>${d.extra_data?.purpose || "Оплата по договору"} ${d.nds_sum > 0 ? `В т.ч. НДС ${Math.round(d.nds_rate*100)}%: ${fmtMoney(d.nds_sum)} тенге` : "Без НДС"}</td></tr>
<tr><td style="color:#555">КНП:</td><td>${d.extra_data?.knp || "859"}</td></tr>
<tr><td style="color:#555">Код назначения:</td><td>${d.extra_data?.purpose_code || "00"}</td></tr>
</table>
<p><i>Сумма прописью: ${numToWordsKZ(Math.floor(d.total_with_nds))} тенге 00 тиын</i></p>
${signatures(d)}`;
}

function contractTemplate(d: DocData): string {
  return `${header(d)}
<h2>ДОГОВОР № ${d.doc_number}</h2>
<h3>на поставку товаров / выполнение работ / оказание услуг</h3>
<p class="c"><b>${d.doc_date} г., г. Астана</b></p>
<p><b>${d.company?.name || "—"}</b>, БИН ${d.company?.bin || "—"}, в лице директора ${d.company?.director || "—"}, действующего на основании Устава, именуемое в дальнейшем «<b>Исполнитель</b>», с одной стороны, и</p>
<p><b>${d.counterparty_name || "—"}</b>${d.counterparty_bin ? `, БИН ${d.counterparty_bin}` : ""}, именуемое в дальнейшем «<b>Заказчик</b>», с другой стороны, совместно именуемые «Стороны», заключили настоящий Договор о нижеследующем:</p>

<p><b>1. ПРЕДМЕТ ДОГОВОРА</b></p>
<p>1.1. Исполнитель обязуется выполнить, а Заказчик — принять и оплатить следующие товары (работы, услуги):</p>
${itemsTable(d)}

<p><b>2. СУММА ДОГОВОРА И ПОРЯДОК РАСЧЁТОВ</b></p>
<p>2.1. Общая сумма Договора составляет <b>${fmtMoney(d.total_with_nds)} (${numToWordsKZ(Math.floor(d.total_with_nds))}) тенге</b>, включая НДС ${Math.round(d.nds_rate*100)}% — ${fmtMoney(d.nds_sum)} тенге.</p>
<p>2.2. Оплата производится путём перечисления на расчётный счёт Исполнителя в течение ${d.extra_data?.payment_days || "5 (пяти)"} банковских дней с момента подписания Акта выполненных работ.</p>

<p><b>3. СРОКИ ВЫПОЛНЕНИЯ</b></p>
<p>3.1. Срок выполнения обязательств: ${d.extra_data?.deadline || "30 (тридцать) календарных дней"} с момента подписания настоящего Договора.</p>

<p><b>4. ОТВЕТСТВЕННОСТЬ СТОРОН</b></p>
<p>4.1. За неисполнение или ненадлежащее исполнение обязательств по настоящему Договору Стороны несут ответственность в соответствии с законодательством Республики Казахстан.</p>

<p><b>5. ФОРС-МАЖОР</b></p>
<p>5.1. Стороны освобождаются от ответственности в случае наступления обстоятельств непреодолимой силы.</p>

<p><b>6. ПРОЧИЕ УСЛОВИЯ</b></p>
<p>6.1. Настоящий Договор вступает в силу с момента подписания и действует до полного исполнения обязательств.</p>
<p>6.2. Договор составлен в двух экземплярах, имеющих одинаковую юридическую силу.</p>
<p>6.3. Споры разрешаются путём переговоров, а при недостижении согласия — в судебном порядке в соответствии с законодательством РК.</p>

<div class="sig" style="margin-top:40px">
<div><p><b>ИСПОЛНИТЕЛЬ</b></p><p>${d.company?.name || "—"}</p><p>БИН: ${d.company?.bin || "—"}</p><p>ИИК: ${d.company?.iik || "—"}</p><p>${d.company?.bank || "—"}, БИК: ${d.company?.bik || "—"}</p><p style="margin-top:25px">Директор _____________ / ${d.company?.director || "___"} /</p><div class="stamp-area">М.П.</div></div>
<div><p><b>ЗАКАЗЧИК</b></p><p>${d.counterparty_name || "—"}</p>${d.counterparty_bin ? `<p>БИН: ${d.counterparty_bin}</p>` : ""}${d.counterparty_iik ? `<p>ИИК: ${d.counterparty_iik}</p>` : ""}<p style="margin-top:25px">Директор _____________ / _____________ /</p><div class="stamp-area">М.П.</div></div>
</div>`;
}

function ttnTemplate(d: DocData): string {
  return `${header(d)}
<h2>ТОВАРНО-ТРАНСПОРТНАЯ НАКЛАДНАЯ</h2>
<h3>№ ${d.doc_number} от ${d.doc_date} г.</h3>
<table class="noborder">
<tr><td style="width:160px;color:#555;padding:3px 0">Грузоотправитель:</td><td><b>${d.company?.name || "—"}</b>, ${d.company?.address || "—"}</td></tr>
<tr><td style="color:#555;padding:3px 0">Грузополучатель:</td><td><b>${d.counterparty_name || "—"}</b>${d.counterparty_address ? `, ${d.counterparty_address}` : ""}</td></tr>
<tr><td style="color:#555;padding:3px 0">Пункт погрузки:</td><td>${d.extra_data?.load_point || d.company?.address || "—"}</td></tr>
<tr><td style="color:#555;padding:3px 0">Пункт разгрузки:</td><td>${d.extra_data?.unload_point || d.counterparty_address || "—"}</td></tr>
<tr><td style="color:#555;padding:3px 0">Автомобиль:</td><td>${d.extra_data?.vehicle || "—"}</td></tr>
<tr><td style="color:#555;padding:3px 0">Водитель:</td><td>${d.extra_data?.driver || "—"}</td></tr>
<tr><td style="color:#555;padding:3px 0">Путевой лист №:</td><td>${d.extra_data?.waybill_number || "—"}</td></tr>
</table>
${itemsTable(d)}
<div class="sig">
<div><p><b>Сдал грузоотправитель</b></p><p style="margin-top:25px">_____________ / ${d.company?.director || "___"} /</p></div>
<div><p><b>Принял грузополучатель</b></p><p style="margin-top:25px">_____________ / _____________ /</p></div>
</div>
<p style="margin-top:20px"><b>Водитель:</b> _____________ / ${d.extra_data?.driver || "___"} /</p>`;
}

function dovTemplate(d: DocData): string {
  return `${header(d)}
<h2>ДОВЕРЕННОСТЬ № ${d.doc_number}</h2>
<p><b>Дата выдачи:</b> ${d.doc_date} г. &nbsp;&nbsp; <b>Действительна до:</b> ${d.extra_data?.valid_until || "____________"}</p>
<p><b>${d.company?.name || "—"}</b> (БИН ${d.company?.bin || "—"}) настоящей доверенностью уполномочивает:</p>
<p><b>${d.extra_data?.employee || "—"}</b>${d.extra_data?.employee_iin ? ` (ИИН: ${d.extra_data.employee_iin})` : ""}</p>
<p>получить от <b>${d.counterparty_name || "—"}</b> следующие товарно-материальные ценности:</p>
${itemsTable(d, false)}
<p style="margin-top:20px">Подпись лица, получившего доверенность: _____________ удостоверяем.</p>
${signatures(d)}`;
}

function avrTemplate(d: DocData): string {
  const advance = d.extra_data?.advance || 0;
  const diff = advance - d.total_with_nds;
  return `${header(d)}
<h2>АВАНСОВЫЙ ОТЧЁТ № ${d.doc_number}</h2>
<h3>от ${d.doc_date} г.</h3>
<table class="noborder">
<tr><td style="width:180px;color:#555;padding:3px 0">Подотчётное лицо:</td><td><b>${d.extra_data?.employee || "—"}</b></td></tr>
<tr><td style="color:#555;padding:3px 0">Должность:</td><td>${d.extra_data?.employee_position || "—"}</td></tr>
<tr><td style="color:#555;padding:3px 0">Назначение аванса:</td><td>${d.extra_data?.purpose || "—"}</td></tr>
</table>
${itemsTable(d)}
<table>
<tr><td style="width:50%">Аванс получен:</td><td><b>${fmtMoney(advance)} тенге</b></td></tr>
<tr><td>Израсходовано:</td><td><b>${fmtMoney(d.total_with_nds)} тенге</b></td></tr>
<tr><td>${diff >= 0 ? "Остаток:" : "Перерасход:"}</td><td><b>${fmtMoney(Math.abs(diff))} тенге</b></td></tr>
</table>
${signatures(d)}`;
}

function payrollTemplate(d: DocData): string {
  return `${header(d)}
<h2>РАСЧЁТНАЯ ВЕДОМОСТЬ ПО ЗАРАБОТНОЙ ПЛАТЕ</h2>
<h3>за ${d.extra_data?.period || "____________"}</h3>
<p class="small">Расчёт произведён в соответствии с НК РК 2026 (ЗРК 214-VIII). МРП = ${fmtMoney(TAX.MRP)} ₸, МЗП = ${fmtMoney(TAX.MZP)} ₸, базовый вычет = 30 МРП (${fmtMoney(TAX.BASE_DEDUCTION_MRP * TAX.MRP)} ₸).</p>
<p class="small">Удержания: ИПН 10%, ОПВ 10%, ВОСМС 2%. За счёт работодателя: ОПВР 3.5%, СО 5%, ООСМС 3%, СН 6%.</p>
${itemsTable(d, false)}
${signatures(d)}`;
}

// ═══════════════════════════════════════
// ГЛАВНАЯ ФУНКЦИЯ
// ═══════════════════════════════════════

export function generateDocumentHTML(d: DocData): string {
  let body = "";
  switch (d.doc_type) {
    case "invoice": body = invoiceTemplate(d); break;
    case "sf": body = sfTemplate(d); break;
    case "waybill": body = waybillTemplate(d); break;
    case "act": body = actTemplate(d); break;
    case "pko": body = pkoTemplate(d); break;
    case "rko": body = rkoTemplate(d); break;
    case "pp": body = ppTemplate(d); break;
    case "contract": body = contractTemplate(d); break;
    case "ttn": body = ttnTemplate(d); break;
    case "dov": body = dovTemplate(d); break;
    case "avr": body = avrTemplate(d); break;
    case "payroll": body = payrollTemplate(d); break;
    default: body = `<h2>Документ № ${d.doc_number}</h2><p>Дата: ${d.doc_date}</p>${itemsTable(d)}${signatures(d)}`;
  }
  return body;
}

export function getFullDocumentHTML(d: DocData): string {
  const title = getDocTitle(d.doc_type);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} № ${d.doc_number}</title>${css}</head><body>${generateDocumentHTML(d)}</body></html>`;
}

export function getDocTitle(docType: string): string {
  const titles: Record<string, string> = {
    invoice: "Счёт на оплату",
    sf: "Счёт-фактура",
    waybill: "Накладная",
    act: "Акт выполненных работ",
    pko: "Приходный кассовый ордер",
    rko: "Расходный кассовый ордер",
    pp: "Платёжное поручение",
    contract: "Договор",
    ttn: "Товарно-транспортная накладная",
    dov: "Доверенность",
    avr: "Авансовый отчёт",
    payroll: "Расчётная ведомость",
  };
  return titles[docType] || "Документ";
}
