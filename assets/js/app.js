/* ===== WinAuto — фронтенд ===== */
document.addEventListener('DOMContentLoaded', () => {
  /* Год в подвале */
  const y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();

  /* Навигация */
  const toggle = document.querySelector('.nav-toggle');
  const mobile = document.getElementById('mobile-menu');
  if (toggle && mobile) {
    toggle.addEventListener('click', () => {
      const opened = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!opened));
      mobile.hidden = opened;
    });
  }

  /* Табы */
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.tab-panels [role="tabpanel"]');
  tabs.forEach(btn => btn.addEventListener('click', () => {
    tabs.forEach(b => b.setAttribute('aria-selected','false'));
    panels.forEach(p => p.hidden = true);
    btn.setAttribute('aria-selected','true');
    document.getElementById(btn.getAttribute('aria-controls')).hidden = false;
  }));

  /* FAQ */
  document.querySelectorAll('.acc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      document.getElementById(btn.getAttribute('aria-controls')).hidden = open;
    });
  });

  /* Модалки */
  document.querySelectorAll('[data-modal]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById(`modal-${link.dataset.modal}`)?.showModal();
    });
  });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog')?.close()));

  /* Плавное появление */
  const io = new IntersectionObserver((entries)=>entries.forEach(e=>{
    if (e.isIntersecting){ e.target.classList.add('visible'); io.unobserve(e.target); }
  }), {threshold:.15});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

  /* ===== Курсы ЦБ РФ ===== */
  const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
  // Резерв (RUB за 1 ед.)
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
  const elPriceCur  = document.getElementById('price-cur');  // если есть (JPY/KRW/CNY/USD)
  const elEngineCc  = document.getElementById('engine-cc');  // если есть (см³)
  const elEngineL   = document.getElementById('engine');     // если литры
  const elCalcBtn   = document.getElementById('calc-btn');
  const elResult    = document.getElementById('calc-result');

  // санкционный (USD) при >1800 см³
  function sanctionUSD(priceJPY){
    if (priceJPY <= 999_999)   return 2600;
    if (priceJPY <= 1_999_999) return 3000;
    if (priceJPY <= 2_999_999) return 3200;
    if (priceJPY <= 3_999_999) return 3400;
    if (priceJPY <= 9_999_999) return 3600;
    return priceJPY * 0.00003 + 3000;
  }

  // Пошлина (RUB)
  function customsDutyRub(ageCat, engineCc, priceJPY){
    const rubPerEUR = state.ratesRubPerUnit.EUR;
    const rubPerJPY = state.ratesRubPerUnit.JPY;
    if (!rubPerEUR || !rubPerJPY) return 0;

    const eurPrice = priceJPY * (rubPerJPY / rubPerEUR); // цена авто в EUR
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
    } else { // до 3
      const ceil = p => eurPrice * p;
      const byCc = coef => e * coef;
      if (eurPrice <= 8500)          dutyEUR = Math.max(ceil(0.54), byCc(2.5));
      else if (eurPrice <= 16700)    dutyEUR = Math.max(ceil(0.48), byCc(3.5));
      else if (eurPrice <= 42300)    dutyEUR = Math.max(ceil(0.48), byCc(5.5));
      else if (eurPrice <= 84500)    dutyEUR = Math.max(ceil(0.48), byCc(7.5));
      else if (eurPrice <= 169000)   dutyEUR = Math.max(ceil(0.48), byCc(15));
      else                           dutyEUR = Math.max(ceil(0.48), byCc(20));
    }
    return dutyEUR * rubPerEUR; // в рубли
  }

  // Утиль (RUB)
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

  const row = (title, jpy='', usd='', rub='') => {
    return `<tr><th scope="row">${title}</th>
      <td>${addCur(jpy,'JPY')}</td>
      <td>${addCur(usd,'USD')}</td>
      <td>${addCur(rub,'₽')}</td></tr>`;
  };

  function renderJP({ priceJPY, ageCat, engineCc }){
    const jpyToUSD = n => convert(n,'JPY','USD');
    const jpyToRUB = n => convert(n,'JPY','RUB');
    const usdToJPY = n => convert(n,'USD','JPY');
    const usdToRUB = n => convert(n,'USD','RUB');
    const rubToJPY = n => convert(n,'RUB','JPY');
    const rubToUSD = n => convert(n,'RUB','USD');

    // Расходы в Японии
    const insideJP = 140000; // внутр. доставка/сборы/агент
    const freight  = 70000;
    const insure   = 50000;
    const sanction = engineCc > 1800 ? sanctionUSD(priceJPY) : 0; // USD

    const A = insideJP;
    const B = priceJPY;
    const V = freight;
    const G = insure;
    const Zusd = sanction;
    const Zjpy = Zusd ? usdToJPY(Zusd) : 0;

    const sumJP_jpy = A + B + V + G + Zjpy;
    const sumJP_rub = jpyToRUB(sumJP_jpy);

    // Расходы в России
    const dutyR = customsDutyRub(ageCat, engineCc, priceJPY); // пошлина (RUB)
    const utilR = utilRub(ageCat, engineCc);                  // утиль (RUB)
    const svh   = 75000;  // СВХ/оформление/СБКТС/доставка (RUB)
    const lab   = 5000;   // лаборатория (RUB)
    const fee   = 50000;  // комиссия WinAuto (RUB)

    const sumRU_rub = dutyR + utilR + svh + lab + fee;

    // Итог
    const totalRub = sumJP_rub + sumRU_rub;

    // Рендер
    let html = `
      <div class="result-total" style="margin-bottom:8px">
        <strong>ИТОГО ЦЕНА В ГОР. Владивосток</strong> — <span style="color:var(--primary)">${fmtInt(totalRub)} ₽</span>
      </div>
      <div class="table-wrap">
      <table class="table-compare" role="table">
        <thead><tr>
          <th>Статья</th><th>JPY</th><th>USD</th><th>RUB</th>
        </tr></thead>
        <tbody>
          <tr><th colspan="4">Расходы в Японии</th></tr>
          ${row('Аукционная стоимость', B, jpyToUSD(B), jpyToRUB(B))}
          ${row('Доставка внутри Японии, аукционный сбор, агент', A, jpyToUSD(A), jpyToRUB(A))}
          ${row('Фрахт до Владивостока', V, jpyToUSD(V), jpyToRUB(V))}
          ${row('Гарантия от повреждений', G, jpyToUSD(G), jpyToRUB(G))}
          ${Zusd ? row('Санкционный платёж', Zjpy, Zusd, usdToRUB(Zusd)) : ''}
          ${row('<strong>Итого (Япония)</strong>', sumJP_jpy, jpyToUSD(sumJP_jpy), sumJP_rub)}

          <tr><th colspan="4">Расходы в России</th></tr>
          ${row('Таможенная пошлина', '', rubToUSD(dutyR), dutyR)}
          ${row('Утилизационный сбор', '', rubToUSD(utilR), utilR)}
          ${row('СВХ/оформление/СБКТС/доставка', '', rubToUSD(svh), svh)}
          ${row('Лаборатория', '', rubToUSD(lab), lab)}
          ${row('Комиссия WinAuto', '', rubToUSD(fee), fee)}
          ${row('<strong>Итого (Россия)</strong>', '', rubToUSD(sumRU_rub), sumRU_rub)}
        </tbody>
      </table></div>
    `;
    return html;
  }

  function buildResult(){
    if (!elResult) return;
    const country = (elCountry?.value || 'JP');
    const ageCat  = (elAge?.value || '3-5');

    // цена → JPY
    let priceJPY = 0;
    const priceVal = Number(elPrice?.value || 0);
    if (elPriceCur) {
      const cur = elPriceCur.value || 'JPY';
      priceJPY = convert(priceVal, cur, 'JPY');
    } else {
      // текущая разметка: price — USD
      priceJPY = convert(priceVal, 'USD', 'JPY');
    }

    // объём → см³
    let engineCc = 0;
    if (elEngineCc) engineCc = Number(elEngineCc.value || 0);
    else if (elEngineL) engineCc = Math.round(Number(elEngineL.value || 0) * 1000);

    if (!priceJPY || !engineCc){
      elResult.innerHTML = `<p class="muted">Введите цену и объём двигателя для расчёта.</p>`;
      return;
    }

    if (country === 'JP'){
      elResult.innerHTML = renderJP({ priceJPY, ageCat, engineCc });
    } else {
      elResult.innerHTML = `<p class="muted">Пока реализован расчёт для Японии. Для Кореи и Китая добавлю после того, как утвердим формулы.</p>`;
    }
  }

  elCalcBtn?.addEventListener('click', buildResult);
});

