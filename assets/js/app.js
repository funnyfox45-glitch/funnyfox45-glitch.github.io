/* ===== БАЗОВЫЕ UI ===== */
document.addEventListener('DOMContentLoaded', () => {
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
    tabs.forEach(b => b.setAttribute('aria-selected', 'false'));
    panels.forEach(p => p.hidden = true);
    btn.setAttribute('aria-selected', 'true');
    const p = document.getElementById(btn.getAttribute('aria-controls'));
    if (p) p.hidden = false;
  }));

  document.querySelectorAll('.acc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const x = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!x));
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (panel) panel.hidden = x;
    });
  });

  document.querySelectorAll('[data-modal]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById(`modal-${link.dataset.modal}`)?.showModal();
    });
  });
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog')?.close()));

  const io = new IntersectionObserver((es)=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target);}}),{threshold:.15});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

  /* ===== КУРСЫ ЦБ ===== */
  const CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';

  // РЕЗЕРВ (если ЦБ недоступен): RUB за 1 единицу
  const FALLBACK = { USD: 90, EUR: 98, JPY: 0.55, CNY: 12.0, KRW: 0.07, RUB: 1 };

  const state = { ratesRubPerUnit: { ...FALLBACK }, date: null };

  const perOne = v => v.Value / v.Nominal;
  const to2 = n => Number(n).toFixed(2).replace('.', ',');
  const fmt = (n, d=0) => Number(n).toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
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
      // кэш на день
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
      // оставляем FALLBACK
    }
  }

  function applyRates(data){
    state.date = new Date(data.Date).toLocaleDateString('ru-RU');
    const need = ['USD','EUR','JPY','CNY','KRW'];
    need.forEach(code=>{
      const v = data.Valute?.[code];
      if (v) state.ratesRubPerUnit[code] = perOne(v);
    });
    state.ratesRubPerUnit.RUB = 1;
    // отрисуем строку курсов под кнопкой (если есть контейнеры)
    const title = document.getElementById('rates-title');
    const line  = document.getElementById('rates-inline');
    if (title) title.textContent = 'Курсы ЦБ РФ на ' + state.date;
    if (line){
      const order = ['JPY','KRW','CNY','USD','EUR'];
      line.textContent = order.map(c=>`${c} ${to2(state.ratesRubPerUnit[c])} Р`).join(' • ');
    }
  }

  // стартуем загрузку курсов (без ожидания клика)
  loadCbrSafe();

  /* ===== КАЛЬКУЛЯТОР (Япония реализована полностью) ===== */
  const elCountry   = document.getElementById('country');
  const elAge       = document.getElementById('car-age');
  const elPower     = document.getElementById('powertrain'); // резерв на будущее
  const elEngineCc  = document.getElementById('engine-cc');
  const elCur       = document.getElementById('price-cur');
  const elCurLabel  = document.getElementById('cur-label');
  const elPrice     = document.getElementById('price');
  const elCalcBtn   = document.getElementById('calc-btn');
  const elResult    = document.getElementById('calc-result');

  elCur?.addEventListener('change', () => {
    if (elCurLabel) elCurLabel.textContent = elCur.value;
    elPrice.placeholder = elCur.value === 'JPY' ? 'например, 1200000' : 'например, 12000';
  });
  elCur?.dispatchEvent(new Event('change'));

  // «З. Санкционный» (возвращает USD)
  function sanctionUSD(priceJPY){
    if (priceJPY <= 999_999)   return 2600;
    if (priceJPY <= 1_999_999) return 3000;
    if (priceJPY <= 2_999_999) return 3200;
    if (priceJPY <= 3_999_999) return 3400;
    if (priceJPY <= 9_999_999) return 3600;
    return priceJPY * 0.00003 + 3000; // мягкий хвост
  }

  // Пошлина + утиль (в RUB), по формулам из ТЗ
  function dutyAndUtilRub(ageCat, engineCc, priceJPY){
    const rubPerJPY = state.ratesRubPerUnit.JPY, rubPerEUR = state.ratesRubPerUnit.EUR;
    if (!rubPerJPY || !rubPerEUR) return { dutyRub: 0, utilRub: 0 };

    const jpyToEur = rubPerJPY / rubPerEUR;
    const eurPrice = priceJPY * jpyToEur; // цена в EUR
    const e = engineCc;

    let dutyEUR = 0;

    if (ageCat === '5plus'){
      if (e <= 1000) dutyEUR = 3*e;
      else if (e <= 1500) dutyEUR = 3.2*e;
      else if (e <= 1800) dutyEUR = 3.5*e;
      else if (e <= 2300) dutyEUR = 4.8*e;
      else if (e <= 3000) dutyEUR = 5.0*e;
      else dutyEUR = 5.7*e;
      // €/см³ — оставляем как есть (как в ТЗ)
    } else if (ageCat === '3-5'){
      if (e <= 1000) dutyEUR = 1.5*e;
      else if (e <= 1500) dutyEUR = 1.7*e;
      else if (e <= 1800) dutyEUR = 2.5*e;
      else if (e <= 2300) dutyEUR = 2.7*e;
      else if (e <= 3000) dutyEUR = 3.0*e;
      else dutyEUR = 3.6*e;
    } else { // 0-3
      const ceil = p => eurPrice * p;
      const byCc = coef => e * coef;
      if (eurPrice <= 8500)   dutyEUR = Math.max(ceil(0.54), byCc(2.5));
      else if (eurPrice <= 16700) dutyEUR = Math.max(ceil(0.48), byCc(3.5));
      else if (eurPrice <= 42300) dutyEUR = Math.max(ceil(0.48), byCc(5.5));
      else if (eurPrice <= 84500) dutyEUR = Math.max(ceil(0.48), byCc(7.5));
      else if (eurPrice <= 169000) dutyEUR = Math.max(ceil(0.48), byCc(15));
      else dutyEUR = Math.max(ceil(0.48), byCc(20));
    }

    const dutyRub = dutyEUR * rubPerEUR + 11746;

    let utilCoef = 0.17;
    if (ageCat === '0-3'){
      if (e <= 3000) utilCoef = 0.17;
      else if (e <= 3500) utilCoef = 107.67;
      else utilCoef = 137.11;
    } else if (ageCat === '3-5'){
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

  function row(title, jpy='', usd='', rub=''){
    const td = (v)=>`<td>${v===''?'—':v}</td>`;
    return `<tr><th scope="row">${title}</th>${td(jpy)}${td(usd)}${td(rub)}</tr>`;
  }

  function renderJP({ priceJPY, ageCat, engineCc }){
    const jpyToUSD = n => convert(n,'JPY','USD');
    const jpyToRUB = n => convert(n,'JPY','RUB');
    const usdToJPY = n => convert(n,'USD','JPY');
    const usdToRUB = n => convert(n,'USD','RUB');

    // А, В, Г, Б
    const A = 140000; // по Японии+сборы
    const V = 70000;  // фрахт
    const G = 50000;  // гарантия
    const B = priceJPY;

    let Z_usd = 0, Z_jpy = 0, Z_rub = 0;
    if (engineCc > 1800){
      Z_usd = sanctionUSD(priceJPY);
      Z_jpy = usdToJPY(Z_usd);
      Z_rub = usdToRUB(Z_usd);
    }

    const sumJP = A + B + V + G + (Z_jpy || 0);
    const sumJP_USD = jpyToUSD(sumJP);
    const sumJP_RUB = jpyToRUB(sumJP);

    const { dutyRub, utilRub } = dutyAndUtilRub(ageCat, engineCc, priceJPY);
    const E = 75000, Yo = 5000, Zh = 50000;
    const sumRU_RUB = dutyRub + utilRub + E + Yo + Zh;
    const sumRU_USD = convert(sumRU_RUB,'RUB','USD');

    const totalRUB = sumJP_RUB + sumRU_RUB;

    let html = `
      <div style="font-weight:700;font-size:18px;margin-bottom:8px">
        ИТОГО ЦЕНА В ГОР. Владивосток —
        <span class="muted">(Я)</span> ${fmt(sumJP_RUB,0)} ₽ +
        <span class="muted">(Ю)</span> ${fmt(sumRU_RUB,0)} ₽ =
        <span style="color:#00d2ff">${fmt(totalRUB,0)} ₽</span>
      </div>
      <div class="table-wrap">
      <table class="table-compare"><thead>
        <tr><th>Статья</th><th>JPY</th><th>USD</th><th>RUB</th></tr>
      </thead><tbody>
    `;
    html += row('Расходы в Японии');
    html += row('А. Доставка по Японии + сборы', fmt(A), fmt(jpyToUSD(A),0), fmt(jpyToRUB(A),0));
    if (engineCc > 1800) html += row('З. Санкционный', fmt(Z_jpy), fmt(Z_usd,0), fmt(Z_rub,0));
    html += row('Б. Аукционная стоимость', fmt(B), fmt(jpyToUSD(B),0), fmt(jpyToRUB(B),0));
    html += row('В. Фрахт до Владивостока', fmt(V), fmt(jpyToUSD(V),0), fmt(jpyToRUB(V),0));
    html += row('Г. Гарантия от повреждений', fmt(G), fmt(jpyToUSD(G),0), fmt(jpyToRUB(G),0));
    html += row('(Я) Итого', `<b>${fmt(sumJP)}</b>`, `<b>${fmt(sumJP_USD,0)}</b>`, `<b>${fmt(sumJP_RUB,0)}</b>`);

    html += row('Расходы в России');
    html += row('Д. Пошлина + утилизационный сбор', '—', fmt(convert(dutyRub+utilRub,'RUB','USD'),0), fmt(dutyRub+utilRub,0));
    html += row('Е. СВХ/оформление/СБКТС/доставка', '—', fmt(convert(E,'RUB','USD'),0), fmt(E,0));
    html += row('Ё. Лаборатория', '—', fmt(convert(Yo,'RUB','USD'),0), fmt(Yo,0));
    html += row('Ж. Комиссия WinAuto', '—', fmt(convert(Zh,'RUB','USD'),0), fmt(Zh,0));
    html += row('(Ю) Итого', '—', `<b>${fmt(sumRU_USD,0)}</b>`, `<b>${fmt(sumRU_RUB,0)}</b>`);
    html += '</tbody></table></div>';

    return html;
  }

  document.getElementById('calc-btn')?.addEventListener('click', async () => {
    try{
      // гарантируем наличие курсов (но без падения при ошибке)
      await loadCbrSafe();

      const country  = elCountry?.value || 'JP';
      const ageCat   = elAge?.value || '3-5';
      const engineCc = Number(elEngineCc?.value || 0);
      const cur      = elCur?.value || 'JPY';
      const priceInp = Number(elPrice?.value || 0);

      if (!priceInp || !engineCc){
        elResult.innerHTML = `<div class="calc-result"><p class="muted">Введите цену и объём двигателя.</p></div>`;
        return;
      }

      // приводим к JPY (для логики Японии)
      const priceJPY = convert(priceInp, cur, 'JPY');

      if (country === 'JP'){
        elResult.innerHTML = renderJP({ priceJPY, ageCat, engineCc });
      } else {
        elResult.innerHTML = `<div class="calc-result"><p><b>Пока реализована страна: Япония.</b><br>Для ${country==='KR'?'Кореи':'Китая'} добавлю формулы — пришли правила.</p></div>`;
      }
      elResult.scrollIntoView({behavior:'smooth', block:'start'});
    } catch (err){
      console.error(err);
      elResult.innerHTML = `<div class="calc-result"><p>Не удалось выполнить расчёт. Обновите страницу и попробуйте ещё раз.</p></div>`;
    }
  });
});
