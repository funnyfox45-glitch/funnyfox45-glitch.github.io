/* ===== WinAuto — фронтенд (с расчётом JP/KR/CN) — визуальные правки итогов ===== */
document.addEventListener('DOMContentLoaded', function () {
  // Год
  var y = document.getElementById('year'); if (y) y.textContent = new Date().getFullYear();

  // Мобильное меню
  var toggle = document.querySelector('.nav-toggle');
  var mobile = document.getElementById('mobile-menu');
  if (toggle && mobile) {
    toggle.addEventListener('click', function () {
      var opened = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!opened));
      mobile.hidden = opened;
    });
  }

  // Табы
  var tabs = document.querySelectorAll('.tab');
  var panels = document.querySelectorAll('.tab-panels [role="tabpanel"]');
  tabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabs.forEach(function (b) { b.setAttribute('aria-selected','false'); });
      panels.forEach(function (p) { p.hidden = true; });
      btn.setAttribute('aria-selected','true');
      var pan = document.getElementById(btn.getAttribute('aria-controls'));
      if (pan) pan.hidden = false;
    });
  });

  // FAQ
  Array.prototype.forEach.call(document.querySelectorAll('.acc-btn'), function (btn) {
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      var panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (panel) panel.hidden = open;
    });
  });

  // Модалки
  Array.prototype.forEach.call(document.querySelectorAll('[data-modal]'), function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var dlg = document.getElementById('modal-' + link.dataset.modal);
      if (dlg && dlg.showModal) dlg.showModal();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', function () {
      var d = b.closest('dialog');
      if (d && d.close) d.close();
    });
  });

  /* ===== Анимации появления ===== */
try {
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.15 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    // нет IO — просто показываем
    reveals.forEach(function (el) { el.classList.add('visible'); });
  }
} catch (e) {
  // если где-то выше в коде что-то упало — всё равно показываем элементы
  console.warn('reveal fallback due to error:', e);
  document.querySelectorAll('.reveal').forEach(function (el) {
    el.classList.add('visible');
  });
}

  /* ===== Курсы ЦБ РФ ===== */
  var CBR_URL = 'https://www.cbr-xml-daily.ru/daily_json.js';
  var FALLBACK = { USD: 90, EUR: 98, JPY: 0.55, CNY: 12.0, KRW: 0.07, RUB: 1 };
  var state = { ratesRubPerUnit: Object.assign({}, FALLBACK), date: null };

  function perOne(v){ return v.Value / v.Nominal; }
  function to2(n){ return Number(n).toFixed(2).replace('.', ','); }
  function fmtInt(n){ return Number(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function addCur(n, cur){ return n === '' ? '—' : (fmtInt(n) + ' ' + cur); }
  function convert(amount, from, to){
    if (from === to) return amount;
    var rFrom = state.ratesRubPerUnit[from];
    var rTo   = state.ratesRubPerUnit[to];
    if (!rFrom || !rTo) return NaN;
    return amount * rFrom / rTo; // через RUB
  }

  function fetchWithTimeout(url, ms){
    if (ms === void 0) ms = 8000;
    return Promise.race([
      fetch(url, {cache:'no-store'}),
      new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('timeout')); }, ms); })
    ]);
  }

  function loadCbrSafe(){
    (async function(){
      try {
        var cached = localStorage.getItem('CBR_DAILY_JSON');
        if (cached){
          var obj = JSON.parse(cached);
          var today = new Date().toISOString().slice(0,10);
          if (obj && obj.Date && obj.Date.slice(0,10) === today){ applyRates(obj); return; }
        }
        var res = await fetchWithTimeout(CBR_URL);
        var data = await res.json();
        try{ localStorage.setItem('CBR_DAILY_JSON', JSON.stringify(data)); }catch(_){}
        applyRates(data);
      } catch (e) {
        console.warn('CBR load failed, using fallback', e);
        state.date = new Date().toLocaleDateString('ru-RU');
        paintInline();
      }
    })();
  }

  function applyRates(data){
    state.date = new Date(data.Date).toLocaleDateString('ru-RU');
    ['USD','EUR','JPY','CNY','KRW'].forEach(function(code){
      var v = data && data.Valute ? data.Valute[code] : null;
      if (v) state.ratesRubPerUnit[code] = perOne(v);
    });
    state.ratesRubPerUnit.RUB = 1;
    paintInline();
  }

  function paintInline(){
    var title = document.getElementById('rates-title');
    var line  = document.getElementById('rates-inline');
    if (title) title.textContent = 'Курсы ЦБ РФ на ' + state.date;
    if (line){
      var order = ['JPY','KRW','CNY','USD','EUR'];
      line.textContent = order.map(function(c){ return c + ' ' + to2(state.ratesRubPerUnit[c]) + ' Р'; }).join(' • ');
    }
    var rateInput = document.getElementById('rate');
    var note = document.getElementById('rate-note');
    if (rateInput && state.ratesRubPerUnit.USD){
      rateInput.value = Number(state.ratesRubPerUnit.USD).toFixed(2);
      if (note) note.textContent = 'Курс ЦБ на ' + state.date + ' (1 USD = ' + to2(state.ratesRubPerUnit.USD) + ' Р)';
    }
  }
  loadCbrSafe();

  /* ===== Калькулятор ===== */
  var elCountry  = document.getElementById('country');
  var elAge      = document.getElementById('car-age');
  var elPrice    = document.getElementById('price');
  var elPriceCur = document.getElementById('price-cur');  // JPY/KRW/CNY
  var elEngineCc = document.getElementById('engine-cc');
  var elEngineL  = document.getElementById('engine');
  var elCalcBtn  = document.getElementById('calc-btn');
  var elResult   = document.getElementById('calc-result');

  // санкционный сбор (USD) для JP
  function sanctionUSD(priceJPY){
    if (priceJPY <= 999999)   return 2600;
    if (priceJPY <= 1999999)  return 3000;
    if (priceJPY <= 2999999)  return 3200;
    if (priceJPY <= 3999999)  return 3400;
    if (priceJPY <= 9999999)  return 3600;
    return priceJPY * 0.00003 + 3000;
  }

  // растаможка (руб)
  function customsDutyRub(ageCat, engineCc, price, priceCur){
    var rubPerEUR = state.ratesRubPerUnit.EUR;
    var rubPerFrom = state.ratesRubPerUnit[priceCur];
    if (!rubPerEUR || !rubPerFrom) return 0;

    var eurPrice = price * (rubPerFrom / rubPerEUR);
    var e = engineCc;
    var dutyEUR = 0;

    if (ageCat === '5plus'){
      if (e <= 1000) dutyEUR = 3.0*e;
      else if (e <= 1500) dutyEUR = 3.2*e;
      else if (e <= 1800) dutyEUR = 3.5*e;
      else if (e <= 2300) dutyEUR = 4.8*e;
      else if (e <= 3000) dutyEUR = 5.0*e;
      else dutyEUR = 5.7*e;
    } else if (ageCat === '3-5'){
      if (e <= 1000) dutyEUR = 1.5*e;
      else if (e <= 1500) dutyEUR = 1.7*e;
      else if (e <= 1800) dutyEUR = 2.5*e;
      else if (e <= 2300) dutyEUR = 2.7*e;
      else if (e <= 3000) dutyEUR = 3.0*e;
      else dutyEUR = 3.6*e;
    } else { // '0-3'
      var ceil = function(p){ return eurPrice * p; };
      var byCc = function(coef){ return e * coef; };
      if (eurPrice <= 8500)          dutyEUR = Math.max(ceil(0.54), byCc(2.5));
      else if (eurPrice <= 16700)    dutyEUR = Math.max(ceil(0.48), byCc(3.5));
      else if (eurPrice <= 42300)    dutyEUR = Math.max(ceil(0.48), byCc(5.5));
      else if (eurPrice <= 84500)    dutyEUR = Math.max(ceil(0.48), byCc(7.5));
      else if (eurPrice <= 169000)   dutyEUR = Math.max(ceil(0.48), byCc(15));
      else                           dutyEUR = Math.max(ceil(0.48), byCc(20));
    }
    return dutyEUR * rubPerEUR;
  }

  // утиль (руб)
  function utilRub(ageCat, engineCc){
    var coef = 0.17;
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

  // формат сумм (три колонки)
  function fmtAmountCells(sum, cur){
    return [
      addCur(sum, cur),
      addCur(convert(sum, cur, 'USD'), 'USD'),
      addCur(convert(sum, cur, 'RUB'), '₽')
    ];
  }

  // универсальный вывод строки
  function row(title, a, b, c, trStyle, thStyle){
    return '<tr ' + (trStyle||'') + '>'
      + '<th scope="row" ' + (thStyle||'') + '>' + title + '</th>'
      + '<td>' + (a || '—') + '</td>'
      + '<td>' + (b || '—') + '</td>'
      + '<td>' + (c || '—') + '</td>'
      + '</tr>';
  }

  // --- Инлайн-стили для результата ---
  // Раздел «ИТОГО ЦЕНА …»
  var STYLE_GRAND = 'style="margin:10px 0 14px;padding:12px 14px;border-radius:14px;border:1px solid rgba(0,210,255,.35);background:rgba(0,210,255,.10);box-shadow:0 8px 24px rgba(0,210,255,.15) inset, 0 10px 30px rgba(0,210,255,.10);"';
  var STYLE_GRAND_TEXT = 'style="color:var(--primary);font-weight:700;letter-spacing:.2px"';

  // Строка-разделитель «Расходы в …»
  var STYLE_SECTION_TR = 'style="background:rgba(255,255,255,.075);color:#fff;border-bottom:1px solid rgba(255,255,255,.28);"';

  // «Итого (страна)» и «Итого (Россия)» — вся строка
  var STYLE_TOTAL_TR = 'style="background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.30);"';
  var STYLE_TOTAL_TH = 'style="font-weight:800;text-decoration:underline;font-size:16px"';

  function renderJP(args){
    var priceJPY = args.priceJPY, ageCat = args.ageCat, engineCc = args.engineCc;
    var cur = 'JPY';
    var inside = 140000;
    var freight = 70000;
    var insure  = 50000;
    var sancUSD = engineCc > 1800 ? sanctionUSD(priceJPY) : 0;
    var sancJPY = sancUSD ? convert(sancUSD,'USD','JPY') : 0;
    var sumCountry = priceJPY + inside + freight + insure + sancJPY;

    var dutyR = customsDutyRub(ageCat, engineCc, priceJPY, 'JPY');
    var utilR = utilRub(ageCat, engineCc);
    var svh = 75000, lab=5000, fee=50000;
    var sumRU = dutyR + utilR + svh + lab + fee;
    var totalRub = convert(sumCountry,'JPY','RUB') + sumRU;

    var html = ''
      + '<div class="result-grand" ' + STYLE_GRAND + '>'
      + '<div><span ' + STYLE_GRAND_TEXT + '>ИТОГО ЦЕНА В ГОР. Владивосток — ' + fmtInt(totalRub) + ' ₽</span></div>'
      + '</div>'

      + '<div class="table-wrap"><table class="table-compare">'
      + '<thead><tr><th>Статья</th><th>JPY</th><th>USD</th><th>RUB</th></tr></thead>'
      + '<tbody>'
      + '<tr ' + STYLE_SECTION_TR + '><th colspan="4">Расходы в Японии</th></tr>'
      + row('Аукционная стоимость',            fmtAmountCells(priceJPY,cur)[0], fmtAmountCells(priceJPY,cur)[1], fmtAmountCells(priceJPY,cur)[2])
      + row('Доставка внутри Японии, аукционный сбор, агент', fmtAmountCells(inside,cur)[0], fmtAmountCells(inside,cur)[1], fmtAmountCells(inside,cur)[2])
      + row('Фрахт до Владивостока',          fmtAmountCells(freight,cur)[0], fmtAmountCells(freight,cur)[1], fmtAmountCells(freight,cur)[2])
      + row('Гарантия от повреждений',        fmtAmountCells(insure,cur)[0], fmtAmountCells(insure,cur)[1], fmtAmountCells(insure,cur)[2])
      + (sancJPY ? row('Доставка санкционного авто', fmtAmountCells(sancJPY,cur)[0], fmtAmountCells(sancJPY,cur)[1], fmtAmountCells(sancJPY,cur)[2]) : '')
      + row('Итого (Япония)', fmtAmountCells(sumCountry,cur)[0], fmtAmountCells(sumCountry,cur)[1], fmtAmountCells(sumCountry,cur)[2], STYLE_TOTAL_TR, STYLE_TOTAL_TH)

      + '<tr ' + STYLE_SECTION_TR + '><th colspan="4">Расходы в России</th></tr>'
      + row('Таможенная пошлина', '', addCur(convert(dutyR,'RUB','USD'),'USD'), addCur(dutyR,'₽'))
      + row('Утилизационный сбор','', addCur(convert(utilR,'RUB','USD'),'USD'), addCur(utilR,'₽'))
      + row('СВХ/оформление/СБКТС/доставка','', addCur(convert(svh,'RUB','USD'),'USD'), addCur(svh,'₽'))
      + row('Лаборатория','', addCur(convert(lab,'RUB','USD'),'USD'), addCur(lab,'₽'))
      + row('Комиссия WinAuto','', addCur(convert(fee,'RUB','USD'),'USD'), addCur(fee,'₽'))
      + row('Итого (Россия)', '', addCur(convert(sumRU,'RUB','USD'),'USD'), addCur(sumRU,'₽'), STYLE_TOTAL_TR, STYLE_TOTAL_TH)
      + '</tbody></table></div>';
    return html;
  }

  function renderGenericCountry(cfg){
    var cur = cfg.cur;
    var price = cfg.price;
    var ageCat = cfg.ageCat;
    var engineCc = cfg.engineCc;
    var inside = cfg.inside;
    var freight = cfg.freight || 0;
    var insure = cfg.insure;

    var sumCountry = price + inside + freight + insure;

    var dutyR = customsDutyRub(ageCat, engineCc, price, cur);
    var utilR = utilRub(ageCat, engineCc);
    var svh = 100000, lab = 5000, fee = 50000;
    var sumRU = dutyR + utilR + svh + lab + fee;

    var totalRub = convert(sumCountry, cur, 'RUB') + sumRU;

    var cellsPrice   = fmtAmountCells(price,cur);
    var cellsInside  = fmtAmountCells(inside,cur);
    var cellsInsure  = fmtAmountCells(insure,cur);
    var cellsFreight = freight ? fmtAmountCells(freight,cur) : null;
    var cellsSumCtry = fmtAmountCells(sumCountry,cur);

    var html = ''
      + '<div class="result-grand" ' + STYLE_GRAND + '>'
      + '<div><span ' + STYLE_GRAND_TEXT + '>ИТОГО ЦЕНА В ГОР. Владивосток — ' + fmtInt(totalRub) + ' ₽</span></div>'
      + '</div>'

      + '<div class="table-wrap"><table class="table-compare">'
      + '<thead><tr><th>Статья</th><th>' + cur + '</th><th>USD</th><th>RUB</th></tr></thead>'
      + '<tbody>'
      + '<tr ' + STYLE_SECTION_TR + '><th colspan="4">' + cfg.labels.countryBlock + '</th></tr>'
      + row(cfg.labels.priceRow,  cellsPrice[0],  cellsPrice[1],  cellsPrice[2])
      + row(cfg.labels.insideRow, cellsInside[0], cellsInside[1], cellsInside[2])
      + (cellsFreight ? row(cfg.labels.freightRow, cellsFreight[0], cellsFreight[1], cellsFreight[2]) : '')
      + row(cfg.labels.damageRow, cellsInsure[0], cellsInsure[1], cellsInsure[2])
      + row('Итого (' + cfg.labels.countryShort + ')', cellsSumCtry[0], cellsSumCtry[1], cellsSumCtry[2], STYLE_TOTAL_TR, STYLE_TOTAL_TH)

      + '<tr ' + STYLE_SECTION_TR + '><th colspan="4">Расходы в России</th></tr>'
      + row('Таможенная пошлина', '', addCur(convert(dutyR,'RUB','USD'),'USD'), addCur(dutyR,'₽'))
      + row('Утилизационный сбор','', addCur(convert(utilR,'RUB','USD'),'USD'), addCur(utilR,'₽'))
      + row('Выгрузка/СВХ/оформление/СБКТС/доставка','', addCur(convert(svh,'RUB','USD'),'USD'), addCur(svh,'₽'))
      + row('Расходы лаборатории','', addCur(convert(lab,'RUB','USD'),'USD'), addCur(lab,'₽'))
      + row('Комиссия WinAuto','', addCur(convert(fee,'RUB','USD'),'USD'), addCur(fee,'₽'))
      + row('Итого (Россия)', '', addCur(convert(sumRU,'RUB','USD'),'USD'), addCur(sumRU,'₽'), STYLE_TOTAL_TR, STYLE_TOTAL_TH)
      + '</tbody></table></div>';

    return html;
  }

  function renderKR(args){
    return renderGenericCountry({
      cur: 'KRW',
      labels: {
        countryBlock: 'Расходы в Корее',
        countryShort: 'Корея',
        priceRow:  'Стоимость авто в Корее',
        insideRow: 'Расходы по доставке внутри Кореи, дилерская комиссия',
        freightRow:'Фрахт до Владивостока',
        damageRow: 'Гарантия от повреждений авто'
      },
      price: args.priceKRW,
      ageCat: args.ageCat,
      engineCc: args.engineCc,
      inside: 1500000,
      freight: 1000000,
      insure: 150000
    });
  }

  function renderCN(args){
    return renderGenericCountry({
      cur: 'CNY',
      labels: {
        countryBlock: 'Расходы в Китае',
        countryShort: 'Китай',
        priceRow:  'Стоимость авто в Китае',
        insideRow: 'Расходы по доставке внутри Китая',
        damageRow: 'Гарантия от повреждений авто'
      },
      price: args.priceCNY,
      ageCat: args.ageCat,
      engineCc: args.engineCc,
      inside: 20000,
      freight: 0,
      insure: 5000
    });
  }

  function buildResult(){
    if (!elResult) return;

    var country = (elCountry && elCountry.value) ? elCountry.value : 'JP'; // JP/KR/CN
    var ageCat  = (elAge && elAge.value) ? elAge.value : '3-5';

    var engineCc = 0;
    if (elEngineCc) engineCc = Number(elEngineCc.value || 0);
    else if (elEngineL) engineCc = Math.round(Number(elEngineL.value || 0) * 1000);

    var priceVal = Number((elPrice && elPrice.value) || 0);
    var cur = (elPriceCur && elPriceCur.value) ? elPriceCur.value : 'JPY';

    if (!priceVal || !engineCc){
      elResult.innerHTML = '<p class="muted">Введите цену и объём двигателя для расчёта.</p>';
      return;
    }

    if (country === 'JP'){
      var priceJPY = convert(priceVal, cur, 'JPY');
      elResult.innerHTML = renderJP({ priceJPY: priceJPY, ageCat: ageCat, engineCc: engineCc });
    } else if (country === 'KR'){
      var priceKRW = convert(priceVal, cur, 'KRW');
      elResult.innerHTML = renderKR({ priceKRW: priceKRW, ageCat: ageCat, engineCc: engineCc });
    } else if (country === 'CN'){
      var priceCNY = convert(priceVal, cur, 'CNY');
      elResult.innerHTML = renderCN({ priceCNY: priceCNY, ageCat: ageCat, engineCc: engineCc });
    }
  }

  if (elCalcBtn) elCalcBtn.addEventListener('click', buildResult);
});

  if (elCalcBtn) elCalcBtn.addEventListener('click', buildResult);
});

