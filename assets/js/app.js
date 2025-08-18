/* ===== базовые интерактивы: мобильное меню, табы, FAQ, модалки, год в подвале, анимация ===== */
document.addEventListener('DOMContentLoaded', () => {
  // Год в подвале
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Мобильное меню
  const toggle = document.querySelector('.nav-toggle');
  const mobile = document.getElementById('mobile-menu');
  if (toggle && mobile) {
    toggle.addEventListener('click', () => {
      const opened = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!opened));
      mobile.hidden = opened;
    });
  }

  // Табы (схема)
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panels [role="tabpanel"]');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.setAttribute('aria-selected', 'false'));
      panels.forEach(p => p.hidden = true);
      btn.setAttribute('aria-selected', 'true');
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (panel) panel.hidden = false;
    });
  });

  // FAQ
  document.querySelectorAll('.acc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (panel) panel.hidden = expanded;
    });
  });

  // Модалки
  document.querySelectorAll('[data-modal]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const id = link.dataset.modal;
      const dlg = document.getElementById(`modal-${id}`);
      if (dlg) dlg.showModal();
    });
  });
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('dialog')?.close());
  });

  // Появление блоков
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: .15 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // ===== КУРСЫ ЦБ для калькулятора и конвертации =====
  const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
  const state = { ratesRubPerUnit: {}, date: null };

  function perOne(v) { return v.Value / v.Nominal; }
  function to2(n) { return Number(n).toFixed(2); }
  function fmt(n, decimals = 0) {
    const s = Number(n).toFixed(decimals);
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  async function loadCbr() {
    try {
      const cached = localStorage.getItem('CBR_DAILY_JSON');
      if (cached) {
        const obj = JSON.parse(cached);
        const today = new Date().toISOString().slice(0,10);
        if (obj.Date && obj.Date.slice(0,10) === today) {
          fillRates(obj);
          return;
        }
      }
    } catch(_) {}
    const res = await fetch(CBR_URL, { cache: 'no-store' });
    const data = await res.json();
    try { localStorage.setItem('CBR_DAILY_JSON', JSON.stringify(data)); } catch(_) {}
    fillRates(data);
  }

  function fillRates(data) {
    state.date = new Date(data.Date).toLocaleDateString('ru-RU');
    const need = ['USD','EUR','JPY','CNY','KRW'];
    need.forEach(code => {
      const v = data.Valute[code];
      if (v) state.ratesRubPerUnit[code] = perOne(v); // RUB за 1 единицу
    });
    state.ratesRubPerUnit['RUB'] = 1;
  }

  function convert(amount, from, to) {
    if (from === to) return amount;
    const rFrom = state.ratesRubPerUnit[from];
    const rTo = state.ratesRubPerUnit[to];
    if (!rFrom || !rTo) return NaN;
    // через рубли
    return amount * rFrom / rTo;
  }

  // ===== КАЛЬКУЛЯТОР (ЯПОНИЯ) =====
  const elCountry = document.getElementById('country');
  const elAge = document.getElementById('car-age');
  const elPower = document.getElementById('powertrain');
  const elEngineCc = document.getElementById('engine-cc');
  const elCur = document.getElementById('price-cur');
  const elCurLabel = document.getElementById('cur-label');
  const elPrice = document.getElementById('price');
  const elCalcBtn = document.getElementById('calc-btn');
  const elResult = document.getElementById('calc-result');

  if (elCur && elCurLabel) {
    elCur.addEventListener('change', () => {
      elCurLabel.textContent = elCur.value;
      elPrice.placeholder = elCur.value === 'JPY' ? 'например, 1200000' : 'например, 12000';
    });
  }

  function sanctionUSD(priceJPY) {
    // Пункт «З. Санкционный»: пороговая логика из ТЗ (интерпретация — возвращает USD)
    if (priceJPY <= 999_999) return 2600;
    if (priceJPY <= 1_999_999) return 3000;
    if (priceJPY <= 2_999_999) return 3200;
    if (priceJPY <= 3_999_999) return 3400;
    if (priceJPY <= 9_999_999) return 3600;
    // fallback: 3% от цены в JPY, приведённые к USD-эквиваленту условно (коэф. 0.00001) + 3000
    // (из-за неоднозначности исходной формулы; при необходимости поправим)
    return priceJPY * 0.00001 + 3000;
  }

  function dutyAndUtilRub(ageCat, engineCc, priceJPY) {
    // F2 — курс JPY->EUR:  (RUB за 1 JPY) / (RUB за 1 EUR)
    const rubPerJPY = state.ratesRubPerUnit['JPY'];
    const rubPerEUR = state.ratesRubPerUnit['EUR'];
    const rubPerUSD = state.ratesRubPerUnit['USD'];
    if (!rubPerJPY || !rubPerEUR || !rubPerUSD) return { dutyRub: 0, utilRub: 0 };

    const jpyToEur = rubPerJPY / rubPerEUR; // 1 JPY в EUR
    const eurPrice = priceJPY * jpyToEur;

    let dutyEURorRub = 0; // сначала считаем в EUR (по ТЗ), позже переведём в RUB
    const e = engineCc;

    if (ageCat === '5plus') {
      if (e <= 1000) dutyEURorRub = 3 * e;
      else if (e <= 1500) dutyEURorRub = 3.2 * e;
      else if (e <= 1800) dutyEURorRub = 3.5 * e;
      else if (e <= 2300) dutyEURorRub = 4.8 * e;
      else if (e <= 3000) dutyEURorRub = 5.0 * e;
      else dutyEURorRub = 5.7 * e;
      // dutyEURorRub сейчас в EUR (€/см³)
      dutyEURorRub = dutyEURorRub / 1000; // перевод из €/см3 в €/л (нормировка). Если не требуется — убери.
    } else if (ageCat === '3-5') {
      if (e <= 1000) dutyEURorRub = 1.5 * e;
      else if (e <= 1500) dutyEURorRub = 1.7 * e;
      else if (e <= 1800) dutyEURorRub = 2.5 * e;
      else if (e <= 2300) dutyEURorRub = 2.7 * e;
      else if (e <= 3000) dutyEURorRub = 3.0 * e;
      else dutyEURorRub = 3.6 * e;
      dutyEURorRub = dutyEURorRub / 1000;
    } else { // 0-3
      // берём максимум: процент от цены VS ставка €/см³, по диапазонам цены в EUR
      const ceil = (pct) => eurPrice * pct;
      const byCc = (coef) => (e * coef); // €/см³ (коэффициенты в ТЗ)
      if (eurPrice <= 8500)  dutyEURorRub = Math.max(ceil(0.54), byCc(2.5));
      else if (eurPrice <= 16700) dutyEURorRub = Math.max(ceil(0.48), byCc(3.5));
      else if (eurPrice <= 42300) dutyEURorRub = Math.max(ceil(0.48), byCc(5.5));
      else if (eurPrice <= 84500) dutyEURorRub = Math.max(ceil(0.48), byCc(7.5));
      else if (eurPrice <= 169000) dutyEURorRub = Math.max(ceil(0.48), byCc(15));
      else dutyEURorRub = Math.max(ceil(0.48), byCc(20));
      // здесь коэффициенты по см³ уже в €/см³ — не делим на 1000
    }

    // Перевод пошлины в RUB
    let dutyRub = dutyEURorRub * rubPerEUR + 11746; // + сбор оформления (из ТЗ)

    // Утильсбор (в RUB): 20000 * коэффициент (по ТЗ)
    let utilCoef = 0.17;
    if (ageCat === '0-3') {
      if (e <= 3000) utilCoef = 0.17;
      else if (e <= 3500) utilCoef = 107.67;
      else utilCoef = 137.11;
    } else if (ageCat === '3-5') {
      if (e <= 3000) utilCoef = 0.26;
      else if (e <= 3500) utilCoef = 164.84;
      else utilCoef = 180.24;
    } else { // 5plus
      if (e <= 3000) utilCoef = 0.26;
      else if (e <= 3500) utilCoef = 164.84;
      else utilCoef = 180.24;
    }
    const utilRub = 20000 * utilCoef;

    return { dutyRub, utilRub };
  }

  function buildRow(title, jpy = '', usd = '', rub = '') {
    const td = (v, cls='') => `<td class="${cls}">${v === '' ? '—' : v}</td>`;
    return `<tr>
      <th scope="row">${title}</th>
      ${td(jpy, 't-jpy')}
      ${td(usd, 't-usd')}
      ${td(rub, 't-rub')}
    </tr>`;
  }

  function renderTableJP({priceJPY, ageCat, engineCc}) {
    // Постоянные значения (А, В, Г)
    const A_inJP = 140000; // доставка внутри Японии + сборы
    const V_inJP = 70000;  // фрахт до Владивостока
    const G_inJP = 50000;  // гарантия от повреждений

    // B — аукционная стоимость
    const B_inJP = priceJPY;

    // Z — «санкционный», если > 1800 см³
    let Z_usd = 0;
    if (engineCc > 1800) {
      Z_usd = sanctionUSD(priceJPY);
    }

    // Конвертации
    const jpyToUSD = (n) => convert(n, 'JPY', 'USD');
    const jpyToRUB = (n) => convert(n, 'JPY', 'RUB');
    const usdToJPY = (n) => convert(n, 'USD', 'JPY');
    const usdToRUB = (n) => convert(n, 'USD', 'RUB');

    const Z_inJP = usdToJPY(Z_usd);
    const rows = [];

    // Заголовок "Расходы в Японии"
    let jSumJP = A_inJP + B_inJP + V_inJP + G_inJP + (Z_inJP || 0);
    let jSumUSD = jpyToUSD(jSumJP);
    let jSumRUB = jpyToRUB(jSumJP);

    // Расходы в России
    const { dutyRub, utilRub } = dutyAndUtilRub(ageCat, engineCc, priceJPY);
    const E_rub = 75000;
    const Yo_rub = 5000;
    const Zh_rub = 50000;
    const ySumRUB = dutyRub + utilRub + E_rub + Yo_rub + Zh_rub;
    const ySumUSD = convert(ySumRUB, 'RUB', 'USD');

    // СВОДНАЯ ТАБЛИЦА
    const totalRUB = jSumRUB + ySumRUB;

    // Шапка итога
    const title = `
      <div style="font-weight:700;font-size:18px;margin-bottom:8px">
        ИТОГО ЦЕНА В ГОР. Владивосток — 
        <span class="muted">(Я)</span> ${fmt(jSumRUB,0)} ₽ + 
        <span class="muted">(Ю)</span> ${fmt(ySumRUB,0)} ₽ =
        <span style="color:#00d2ff">${fmt(totalRUB,0)} ₽</span>
      </div>`;

    const tableHead = `
      <div class="table-wrap">
        <table class="table-compare" role="table">
          <thead>
            <tr>
              <th>Статья</th>
              <th>JPY</th>
              <th>USD</th>
              <th>RUB</th>
            </tr>
          </thead>
          <tbody>
    `;

    rows.push(buildRow('Расходы в Японии', '','',''));
    rows.push(buildRow('А. Доставка по Японии + сборы агента', fmt(A_inJP), fmt(jpyToUSD(A_inJP),0), fmt(jpyToRUB(A_inJP),0)));
    if (engineCc > 1800) {
      rows.push(buildRow('З. Санкционный', fmt(Z_inJP), fmt(Z_usd,0), fmt(usdToRUB(Z_usd),0)));
    }
    rows.push(buildRow('Б. Аукционная стоимость', fmt(B_inJP), fmt(jpyToUSD(B_inJP),0), fmt(jpyToRUB(B_inJP),0)));
    rows.push(buildRow('В. Фрахт до Владивостока', fmt(V_inJP), fmt(jpyToUSD(V_inJP),0), fmt(jpyToRUB(V_inJP),0)));
    rows.push(buildRow('Г. Гарантия от повреждений', fmt(G_inJP), fmt(jpyToUSD(G_inJP),0), fmt(jpyToRUB(G_inJP),0)));
    rows.push(buildRow('(Я) Итого', `<b>${fmt(jSumJP)}</b>`, `<b>${fmt(jSumUSD,0)}</b>`, `<b>${fmt(jSumRUB,0)}</b>`));

    rows.push(buildRow('Расходы в России', '','',''));
    rows.push(buildRow('Д. Пошлина + утилизац. сбор', '—', fmt(convert(dutyRub+utilRub,'RUB','USD'),0), fmt(dutyRub+utilRub,0)));
    rows.push(buildRow('Е. СВХ/оформление/СБКТС/доставка', '—', fmt(convert(E_rub,'RUB','USD'),0), fmt(E_rub,0)));
    rows.push(buildRow('Ё. Лаборатория', '—', fmt(convert(Yo_rub,'RUB','USD'),0), fmt(Yo_rub,0)));
    rows.push(buildRow('Ж. Комиссия WinAuto', '—', fmt(convert(Zh_rub,'RUB','USD'),0), fmt(Zh_rub,0)));
    rows.push(buildRow('(Ю) Итого', '—', `<b>${fmt(ySumUSD,0)}</b>`, `<b>${fmt(ySumRUB,0)}</b>`));

    const tableFoot = `
          </tbody>
        </table>
      </div>
    `;

    return title + tableHead + rows.join('') + tableFoot;
  }

  elCalcBtn?.addEventListener('click', async () => {
    await loadCbr(); // гарантируем наличие курсов
    const country = elCountry.value;
    const ageCat = elAge.value;     // 0-3, 3-5, 5plus
    const engineCc = Number(elEngineCc.value || 0);
    const cur = elCur.value;        // JPY/KRW/CNY
    const priceInput = Number(elPrice.value || 0);

    if (!priceInput || !engineCc) {
      elResult.innerHTML = `<p class="muted">Введите цену и объём двигателя.</p>`;
      return;
    }

    // Приводим цену к JPY для унифицированного расчёта (Япония)
    const priceJPY = convert(priceInput, cur, 'JPY');

    if (country === 'JP') {
      elResult.innerHTML = renderTableJP({ priceJPY, ageCat, engineCc });
    } else {
      elResult.innerHTML = `
        <div class="calc-result">
          <p><b>Расчёт для выбранной страны появится позже.</b> Сейчас реализована полная логика для <b>Японии</b> (А–Ж, санкционный, пошлина+утиль).</p>
          <p class="muted">Дай формулы/правила для ${country === 'KR' ? 'Кореи' : 'Китая'} — добавлю.</p>
        </div>
      `;
    }
  });

  // обновление подписи валюты у цены
  elCur?.dispatchEvent(new Event('change'));
});

