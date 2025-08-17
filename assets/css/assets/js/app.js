// Helpers
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

// Mobile nav
const navToggle = $('.nav-toggle');
const mobileMenu = $('#mobile-menu');
if (navToggle && mobileMenu) {
  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    if (expanded) {
      mobileMenu.hidden = true;
    } else {
      mobileMenu.hidden = false;
    }
  });
  // Close after click
  $$('#mobile-menu a').forEach(a => a.addEventListener('click', () => {
    mobileMenu.hidden = true; navToggle.setAttribute('aria-expanded','false');
  }));
}

// Current year
$('#year').textContent = new Date().getFullYear();

// Reveal on scroll
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add('visible'); io.unobserve(e.target);
    }
  }
}, { threshold: .2 });
$$('.reveal').forEach(el => io.observe(el));

// Tabs (process)
const tabs = $$('.tabs [role="tab"]');
const panels = $$('.tab-panels [role="tabpanel"]');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.setAttribute('aria-selected', 'false'));
    panels.forEach(p => p.hidden = true);
    tab.setAttribute('aria-selected', 'true');
    const id = tab.getAttribute('aria-controls');
    const panel = document.getElementById(id);
    panel.hidden = false; panel.focus();
  });
  tab.addEventListener('keydown', (e) => {
    const idx = tabs.indexOf ? tabs.indexOf(tab) : tabs.findIndex(t => t===tab);
    if (['ArrowRight','ArrowLeft'].includes(e.key)) {
      e.preventDefault();
      const next = e.key === 'ArrowRight' ? (idx+1)%tabs.length : (idx-1+tabs.length)%tabs.length;
      tabs[next].click();
      tabs[next].focus();
    }
  });
});

// FAQ accordion
$$('.acc-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
  });
});

// Modal windows
const openModal = (id) => { const d = document.getElementById(id); if (d && !d.open) d.showModal(); }
const closeModal = (dlg) => { if (dlg && dlg.open) dlg.close(); }
$$('[data-modal]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const key = link.dataset.modal;
    openModal(`modal-${key}`);
  });
});
$$('dialog [data-close], dialog .modal-close').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.closest('dialog')));
});

// Lead form -> mailto
const leadForm = $('#lead-form');
if (leadForm) {
  leadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(leadForm);
    const name = data.get('name') || '';
    const phone = data.get('phone') || '';
    const type = data.get('type') || '';
    const comment = data.get('comment') || '';
    const subject = encodeURIComponent('Заявка с сайта — WinAuto');
    const body = encodeURIComponent(
      `Имя: ${name}\nТелефон: ${phone}\nСтрана/тип авто: ${type}\nКомментарий: ${comment}\n\nИсточник: сайт GitHub Pages`
    );
    window.location.href = `mailto:{{email}}?subject=${subject}&body=${body}`;
  });
}

// Calculator (client-side approximate)
const calcBtn = $('#calc-btn');
const resultBox = $('#calc-result');

function formatUSD(n){ return new Intl.NumberFormat('ru-RU', { style:'currency', currency:'USD', maximumFractionDigits:0 }).format(n); }
function formatRUB(n){ return new Intl.NumberFormat('ru-RU', { style:'currency', currency:'RUB', maximumFractionDigits:0 }).format(n); }

function compute() {
  const country = $('#country').value;
  const year = parseInt($('#year').value,10);
  const power = $('#powertrain').value;
  const engineL = parseFloat($('#engine').value || '0');
  const price = Math.max(0, parseFloat($('#price').value || '0'));
  const rate = Math.max(1, parseFloat($('#rate').value || '90'));

  // Country presets
  const presets = {
    JP: { commissionRate: 0.07, logistics: 1800 },
    KR: { commissionRate: 0.06, logistics: 1500 },
    CN: { commissionRate: 0.05, logistics: 1400 }
  };
  const { commissionRate, logistics } = presets[country] || presets.JP;

  // Customs (very approximate! Not a public offer)
  let customsRate = 0.20; // base
  if (power === 'ev') customsRate = 0.05;
  if (power === 'hybrid') customsRate = 0.10;
  // age factor
  const currentYear = new Date().getFullYear();
  const age = Math.max(0, currentYear - year);
  const ageFactor = age > 3 ? 1.2 : 1.0;
  // engine factor (only for ICE/hybrid)
  const engineFactor = (power === 'ice' || power === 'hybrid') ? (1 + Math.min(engineL, 3) * 0.03) : 1;

  const commission = price * commissionRate;
  const customs = price * customsRate * ageFactor * engineFactor;
  const insurance = Math.max(200, price * 0.01);
  const portFees = 450;
  const certification = 220;

  const subtotal = price + commission + logistics + customs + insurance + portFees + certification;

  const html = `
    <div class="result-grid">
      <div><span>Цена лота</span><strong>${formatUSD(price)}</strong></div>
      <div><span>Комиссия (${Math.round(commissionRate*100)}%)</span><strong>${formatUSD(commission)}</strong></div>
      <div><span>Логистика</span><strong>${formatUSD(logistics)}</strong></div>
      <div><span>Таможенные платежи*</span><strong>${formatUSD(customs)}</strong></div>
      <div><span>Страхование</span><strong>${formatUSD(insurance)}</strong></div>
      <div><span>Портовые сборы</span><strong>${formatUSD(portFees)}</strong></div>
      <div><span>Сертификация</span><strong>${formatUSD(certification)}</strong></div>
      <div class="result-total"><span>Итого «под ключ» (≈)</span><strong>${formatUSD(subtotal)} / ${formatRUB(subtotal*rate)}</strong></div>
    </div>
    <p class="muted" style="margin-top:8px">* Расчёт примерный. Точные ставки зависят от характеристик авто, законодательства и курса валют. Финальные цифры фиксируются в договоре.</p>
    <div class="calc-actions">
      <a class="btn btn-primary" href="https://wa.me/79520821396" target="_blank" rel="noopener">Получить точный расчёт</a>
      <a class="btn btn-outline" href="tel:+79502944467">Обсудить по телефону</a>
    </div>
  `;
  resultBox.innerHTML = html;
}

if (calcBtn && resultBox) {
  calcBtn.addEventListener('click', compute);
}

// Improve in-page anchor focus for accessibility
$$('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const id = link.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (target) {
      target.setAttribute('tabindex','-1');
      target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once:true });
      target.focus({ preventScroll:true });
    }
  });
});
