/* ===== WinAuto — фронтенд (с расчётом JP/KR/CN) ===== */
document.addEventListener('DOMContentLoaded', () => {
  /* --- стандартные хелперы/навигация/FAQ/модалки/анимации --- */
  const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();

  const toggle = document.querySelector('.nav-toggle');
  const mobile = document.getElementById('mobile-menu');
  if (toggle && mobile) {
    toggle.addEventListener('click', () => {
      const opened = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!opened));
      mobile.hidden = opened;
    });
  }

  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panels [role="tabpanel"]');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.setAttribute('aria-selected','false'));
    panels.forEach(p => p.hidden = true);
    btn.setAttribute('aria-selected','true');
    document.getElementById(btn.getAttribute('aria-controls')).hidden = false;
  }));

  document.querySelectorAll('.acc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      document.getElementById(btn.getAttribute('aria-controls')).hidden = open;
    });
  });

  document.querySelectorAll('[data-modal]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById(`modal-${link.dataset.modal}`)?.showModal();
    });
  });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog')?.close()));

  const io = new IntersectionObserver((entries)=>entries.forEach(e=>{
    if (e.isIntersecting){ e.target.classList.add('visible'); io.unobserve(e.target); }
  }), {threshold:.15});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

  /* ===== Курсы ЦБ РФ ===== */
  const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
  const FALLBACK = { USD: 90, EUR: 98, JPY: 0.55, CNY: 12.0, KRW: 0.07, RUB: 1 };
  const state = { ratesRubPerUnit: { ...FALLBACK }, date: null };

  const perOne = v => v.Value / v.Nominal;
  const to2 = n => Number(n).toFixed(2).replace('.', ',');
  const fmtInt = n => Number(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const addCur = (n, cur) => n === '' ? '—' : `${fmtInt(n)} ${cur}`;
  const convert = (amount, from, to) => {
    if (from === to) return amount;
    const rFrom = state.ratesRubPerUnit[from], rTo = state.ratesRubPerUnit[to];
    if (!rFrom || !rTo) return NaN;
    return amount * rFrom / rTo; // через RUB
  };

  async function fetchWithTimeout(url, ms=8000){
    return await Promise.race([
      fetch(url, {cache:'no-store'}),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')), ms))
    ]);
  }

  async function loadCbrSafe(){
    try {
      const cached = localStorage.getItem('CBR_DAILY_JSON');
      if (cached){
        const obj = JSON.parse(cached);
        const today = new Date().toISOString().slice(0,10);
        if (obj?.Date?.slice(0,10) === today){ applyRates(obj); return; }
      }
      const res = await fetchWithTimeout(CBR_URL);
      const data = await res.json();
      try{ localStorage.setItem('CBR_DAILY_JSON', JSON.stringify(data)); }catch(_){}
      applyRates(data);
    } catch (e) {
      console.warn('CBR load failed, using fallback', e);
      state.date = new Date().toLocaleDateString('ru-RU');
      paintInline();
    }
  }

  function applyRates(data){
    state.date = new Date(data.Date).toLocaleDateString('ru-RU');
    ['USD','EUR','JPY','CNY','KRW'].forEach(code=>{
      const v = data.Valute?.[code];
      if (v) state.ratesRubPerUnit[code] = perOne(v);
    });
    state.ratesRubPerUnit.RUB = 1;
    paintInline();
  }

  function paintInline(){
    const title = document.getElementById('rates-title');
    const line  = document.getElementById('rates-inline');
    if (title) title.textContent = 'Курсы ЦБ РФ на ' + state.date;
    if (line){
      const order = ['JPY','KRW','CNY','USD','EUR'];
      line.textContent = order.map(c=>`${c} ${to2(state.ratesRubPerUnit[c])} Р`).join(' • ');
    }
    const rateInput = document.getElementById('rate');
    const note = document.getElementById('rate-note');
    if (rateInput && state.ratesRubPerUnit.USD){
      rateInput.value = Number(state.ratesRubPerUnit.USD).toFixed(2);
      if (note) note.textContent = `Курс ЦБ на ${state.date} (1 USD = ${to2(state.ratesRubPerUnit.USD)} Р)`;
    }
  }
  loadCbrSafe();

  /* ===== Калькулятор ===== */
  const elCountry   = document.getElementById('country');
  const elAge       = document.getElementById('car-age');
  const elPrice     = document.getElementById('price');
  const elPriceCur  = document.getElementById('price-cur');  // JPY/KRW/CNY
  const elEngineCc  = document.getElementById('engine-cc');
  const elEngineL   = document.getElementById('engine');
  const elCalcBtn   = document.getElementById('calc-btn');
  const elResult    = document.getElementById('calc-result');

  /* --- санкционный фрахт (только Япония) в USD --- */
  function sanctionUSD(priceJPY){
    if (priceJPY <= 999_999)   return 2600;
    if (priceJPY <= 1_999_999) return 3000;
    if (priceJPY <= 2_999_999) return 3200;
    if (priceJPY <= 3_999_999) return 3400;
    if (priceJPY <= 9_999_999) return 3600;
    return priceJPY * 0.00003 + 3000;
  }

  /* --- Пошлина (руб) по вашей формуле, цена в произвольной валюте --- */
  function customsDutyRub(ageCat, engineCc, price, priceCur){
    const rubPerEUR = state.ratesRubPerUnit.EUR;
    const rubPerFrom = state.ratesRubPerUnit[priceCur];
    if (!rubPerEUR || !rubPerFrom) return 0;

    const eurPrice = price * (rubPerFrom / rubPerEUR); // цена авто в EUR
    const e = engineCc;
    let dutyEUR = 0;

    if (ageCat === '5plus'){ // старше 5
      if (e <= 1000) dutyEUR = 3.0*e;
      else if (e <= 1500) dutyEUR = 3.2*e;
      else if (e <= 1800) dutyEUR = 3.5*e;
      else if (e <= 2300) dutyEUR = 4.8*e;
      else if (e <= 3000) dutyEUR = 5.0*e;
      else dutyEUR = 5.7*e;
    } else if (ageCat === '3-5'){ // 3–5
      if (e <= 1000) dutyEUR = 1.5*e;
      else if (e <= 1500) dutyEUR = 1.7*e;
      else if (e <= 1800) dutyEUR = 2.5*e;
      else if (e <= 2300) dutyEUR = 2.7*e;
      else if (e <= 3000) dutyEUR = 3.0*e;
      else dutyEUR = 3.6*e;
    } else { // до 3 лет
      const ceil = p => eurPrice * p;
      const byCc = coef => e * coef;
      if (eurPrice <= 8500)          dutyEUR = Math.max(ceil(0.54), byCc(2.5));
      else if (eurPrice <= 16700)    dutyEUR = Math.max(ceil(0.48), byCc(3.5));
      else if (eurPrice <= 42300)    dutyEUR = Math.max(ceil(0.48), byCc(5.5));
      else if (eurPrice <= 84500)    dutyEUR = Math.max(ceil(0.48), byCc(7.5));
      else if (eurPrice <= 169000)   dutyEUR = Math.max(ceil(0.48), byCc(15));
      else                           dutyEUR = Math.max(ceil(0.48), byCc(20));
    }
    return dutyEUR * rubPerEUR; // в рублях
  }

  /* --- Утилизационный сбор (руб) --- */
  function utilRub(ageCat, engineCc){
    let coef = 0.17;
    if (ageCat === '0-3'){
      if (engineCc <= 3000) coef = 0.17;
      else if (engineCc <= 3500) coef = 107.67;
      else coef = 137.11;
    } else if (ageCat === '3-5'){
      if (engineCc <= 3000) coef = 0.26;
      else if (engineCc <= 3500) coef = 164.84;
      else coef = 180.24;
    } else { // 5+
      if (engineCc <= 3000) coef = 0.26;
      else if (engineCc <= 3500) coef = 164.84;
      else coef = 180.24;
    }
    return 20000 * coef;
  }

  /* --- генераторы строк/таблиц --- */
  const row = (title, a='', b='', c='') =>
    `<tr><th scope="row">${title}</th><td>${a || '—'}</td><td>${b || '—'}</td><td>${c || '—'}</td></tr>`;

  const amountCells = (sum, cur) => [
    addCur(sum, cur),
    addCur(convert(sum, cur, 'USD'), 'USD'),
    addCur(convert(sum, cur, 'RUB'), '₽'),
  ];

  /* ====== Страны ====== */

  // Япония (без изменений по структуре)
  function renderJP({ priceJPY, ageCat, engineCc }){
    const cur = 'JPY';
    const inside = 140000;
    const freight = 70000;
    const insure  = 50000;
    const sancUSD = engineCc > 1800 ? sanctionUSD(priceJPY) : 0;
    const sancJPY = sancUSD ? convert(sancUSD,'USD','JPY') : 0;

    const sumCountry = priceJPY + inside + freight + insure + sancJPY;

    const dutyR = customsDutyRub(ageCat, engineCc, priceJPY, 'JPY');
    const utilR = utilRub(ageCat, engineCc);
    const svh = 75000, lab=5000, fee=50000;
    const sumRU = dutyR + utilR + svh + lab + fee;
    const totalRub = convert(sumCountry,'JPY','RUB') + sumRU;

    let html = `
      <div class="result-total" style="margin-bottom:8px">
        <strong>ИТОГО ЦЕНА В ГОР. Владивосток</strong> — <span style="color:var(--primary)">${fmtInt(totalRub)} ₽</span>
      </div>
      <div class="table-wrap"><table class="table-compare">
        <thead><tr><th>Статья</th><th>JPY</th><th>USD</th><th>RUB</th></tr></thead>
        <tbody>
          <tr><th colspan="4">Расходы в Японии</th></tr>
          ${row('Аукционная стоимость', ...amountCells(priceJPY,cur))}
          ${row('Доставка внутри Японии, аукционный сбор, агент', ...amountCells(inside,cur))}
          ${row('Фрахт до Владивостока', ...amountCells(freight,cur))}
          ${row('Гарантия от повреждений', ...amountCells(insure,cur))}
          ${sancUSD ? row('Доставка санкционного авто', ...amountCells(sancJPY,cur)) : ''}
          ${row('<strong>Итого (Япония)</strong>', ...amountCells(sumCountry,cur))}

          <tr><th colspan="4">Расходы в России</th></tr>
          ${row('Таможенная пошлина', '', addCur(convert(dutyR,'RUB','USD'),'USD'), addCur(dutyR,'₽'))}
          ${row('Утилизационный сбор', '', addCur(convert(utilR,'RUB','USD'),'USD'), addCur(utilR,'₽'))}
          ${row('СВХ/оформление/СБКТС/доставка', '', addCur(convert(svh,'RUB','USD'),'USD'), addCur(svh,'₽'))}
          ${row('Лаборатория', '', addCur(convert(lab,'RUB','USD'),'USD'), addCur(lab,'₽'))}
          ${row('Комиссия WinAuto', '', addCur(convert(fee,'RUB','USD'),'USD'), addCur(fee,'₽'))}
          ${row('<strong>Итого (Россия)</strong>', '', addCur(convert(sumRU,'RUB','USD'),'USD'), addCur(sumRU,'₽'))}
        </tbody></table></div>`;
    return html;
  }

  // Общий рендер для KR и CN
  function renderGenericCountry({ country, cur, labels, price, ageCat, engineCc, inside, freight, insure }){
    const sumCountry = price + inside + (freight||0) + insure;

    const dutyR = customsDutyRub(ageCat, engineCc, price, cur);
    const utilR = utilRub(ageCat, engineCc);
    const svh = 100000, lab = 5000, fee = 50000; // как вы просили
    const sumRU = dutyR + utilR + svh + lab + fee;

    const totalRub = convert(sumCountry, cur, 'RUB') + sumRU;

    let html = `
      <div class="result-total" style="margin-bottom:8px">
        <strong>ИТОГО ЦЕНА В ГОР. Владивосток</strong> — <span style="color:var(--primary)">${fmtInt(totalRub)} ₽</span>
      </div>
      <div class="table-wrap"><table class="table-compare">
        <thead><tr><th>Статья</th><th>${cur}</th><th>USD</th><th>RUB</th></tr></thead>
        <tbody>
          <tr><th colspan="4">${labels.countryBlock}</th></tr>
          ${row(labels.priceRow, ...amountCells(price,cur))}
          ${row(labels.insideRow, ...amountCells(inside,cur))}
          ${freight ? row(labels.freightRow, ...amountCells(freight,cur)) : ''}
          ${row(labels.damageRow, ...amountCells(insure,cur))}
          ${row('<strong>Итого ('+labels.countryShort+')</strong>', ...amountCells(sumCountry,cur))}

          <tr><th colspan="4">Расходы в России</th></tr>
          ${row('Таможенная пошлина', '', addCur(convert(dutyR,'RUB','USD'),'USD'), addCur(dutyR,'₽'))}
          ${row('Утилизационный сбор', '', addCur(convert(utilR,'RUB','USD'),'USD'), addCur(utilR,'₽'))}
          ${row('Выгрузка/СВХ/оформление/СБКТС/доставка', '', addCur(convert(svh,'RUB','USD'),'USD'), addCur(svh,'₽'))}
          ${row('Расходы лаборатории', '', addCur(convert(lab,'RUB','USD'),'USD'), addCur(lab,'₽'))}
          ${row('Комиссия WinAuto', '', addCur(convert(fee,'RUB','USD'),'USD'), addCur(fee,'₽'))}
          ${row('<strong>Итого (Россия)</strong>', '', addCur(convert(sumRU,'RUB','USD'),'USD'), addCur(sumRU,'₽'))}
        </tbody></table></div>`;
    return html;
  }

  function renderKR({ priceKRW, ageCat, engineCc }){
    return renderGenericCountry({
      country: 'KR',
      cur: 'KRW',
      labels: {
        countryBlock: 'Расходы в Корее',
        countryShort: 'Корея',
        priceRow: 'Стоимость авто в Корее',
        insideRow: 'Расходы по доставке внутри Кореи, дилерская комиссия',
        freightRow: 'Фрахт до Владивостока',
        damageRow: 'Гарантия от повреждений авто',
      },
      price: priceKRW,
      ageCat, engineCc,
      inside: 1_500_000,
      freight: 1_000_000,
      insure: 150_000
    });
  }

  function renderCN({ priceCNY, ageCat, engineCc }){
    return renderGenericCountry({
      country: 'CN',
      cur: 'CNY',
      labels: {
        countryBlock: 'Расходы в Китае',
        countryShort: 'Китай',
        priceRow: 'Стоимость авто в Китае',
        insideRow: 'Расходы по доставке внутри Китая',
        // по ТЗ фрахт отсутствует
        damageRow: 'Гарантия от повреждений авто',
      },
      price: priceCNY,
      ageCat, engineCc,
      inside: 20_000,
      freight: 0,             // нет фрахта
      insure: 5_000
    });
  }

  /* === сводка/рендер по кнопке === */
  function buildResult(){
    if (!elResult) return;

    const country = (elCountry?.value || 'JP');   // JP / KR / CN
    const ageCat  = (elAge?.value || '3-5');

    let engineCc = 0;
    if (elEngineCc) engineCc = Number(elEngineCc.value || 0);
    else if (elEngineL) engineCc = Math.round(Number(elEngineL.value || 0) * 1000);

    const priceVal = Number(elPrice?.value || 0);
    const cur = elPriceCur?.value || 'JPY';

    if (!priceVal || !engineCc){
      elResult.innerHTML = `<p class="muted">Введите цену и объём двигателя для расчёта.</p>`;
      return;
    }

    if (country === 'JP'){
      const priceJPY = convert(priceVal, cur, 'JPY');
      elResult.innerHTML = renderJP({ priceJPY, ageCat, engineCc });
    } else if (country === 'KR'){
      const priceKRW = convert(priceVal, cur, 'KRW');
      elResult.innerHTML = renderKR({ priceKRW, ageCat, engineCc });
    } else if (country === 'CN'){
      const priceCNY = convert(priceVal, cur, 'CNY');
      elResult.innerHTML = renderCN({ priceCNY, ageCat, engineCc });
    }
  }

  elCalcBtn?.addEventListener('click', buildResult);
});

});

