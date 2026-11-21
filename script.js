(function () {
  'use strict';

  /* =========================================================
     ФРАЗЫ ОШИБОК (по ТЗ)
     ========================================================= */
  const ERROR_EMPTY =
    'Поле пустое, как склад перед сезоном. Впишите цифру — калькулятор не умеет гадать на кофейной гуще!';
  const ERROR_NOT_NUMBER =
    'Тут не чат с поддержкой Wildberries — буковки оставьте для апелляций, сюда нужны только цифры!';
  const ERROR_ZERO =
    'Ноль в закупочной цене? Бесплатно на маркетплейсе не работают даже менеджеры по счастью — впишите реальную цифру!';
  const ERROR_NEGATIVE =
    'Минус — это про температуру за окном, а не про вашу прибыль. В заказе нужен плюс, иначе это не бизнес, а благотворительность!';

  /* =========================================================
     СПИСОК ПОЛЕЙ, КОТОРЫЕ ВАЛИДИРУЕМ
     ========================================================= */
  const FIELD_IDS = [
    'purchasePrice',
    'logisticsCost',
    'packagingCost',
    'commissionPercent',
    'platformLogistics',
    'adCost',
    'taxRate',
    'salePrice',
    'discountPercent'
  ];

  const STORAGE_KEY = 'calc_margin_vat_journal_v1';

  /* =========================================================
     DOM
     ========================================================= */
  const form = document.getElementById('calcForm');
  const resultBlock = document.getElementById('result');
  const resFinalPrice = document.getElementById('resFinalPrice');
  const resCost = document.getElementById('resCost');
  const resTax = document.getElementById('resTax');
  const resProfit = document.getElementById('resProfit');
  const resMargin = document.getElementById('resMargin');
  const resMarkup = document.getElementById('resMarkup');
  const resVerdict = document.getElementById('resVerdict');

  const journalList = document.getElementById('journalList');
  const journalEmpty = document.getElementById('journalEmpty');
  const clearJournalBtn = document.getElementById('clearJournalBtn');

  /* =========================================================
     ХРАНИЛИЩЕ ЖУРНАЛА
     ========================================================= */
  let journal = loadJournal();

  function loadJournal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Не удалось прочитать журнал из localStorage:', e);
      return [];
    }
  }

  function saveJournal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(journal));
    } catch (e) {
      console.warn('Не удалось сохранить журнал в localStorage:', e);
    }
  }

  /* =========================================================
     ВАЛИДАЦИЯ ОДНОГО ПОЛЯ
     Возвращает { ok: boolean, value: number, error: string }
     ========================================================= */
  function validateField(rawValue) {
    // Нормализуем: убираем пробелы по краям
    const trimmed = String(rawValue).trim();

    // 1) Пустое поле
    if (trimmed === '') {
      return { ok: false, value: NaN, error: ERROR_EMPTY };
    }

    // 2) Должно быть числом (допускаем запятую как десятичный разделитель)
    const normalized = trimmed.replace(',', '.');
    // Строгий regex: необязательный минус, цифры, необязательная дробная часть
    const numberRegex = /^-?\d+(\.\d+)?$/;

    if (!numberRegex.test(normalized)) {
      return { ok: false, value: NaN, error: ERROR_NOT_NUMBER };
    }

    const num = parseFloat(normalized);

    if (!isFinite(num)) {
      return { ok: false, value: NaN, error: ERROR_NOT_NUMBER };
    }

    // 3) Ровно ноль
    if (num === 0) {
      return { ok: false, value: num, error: ERROR_ZERO };
    }

    // 4) Отрицательное
    if (num < 0) {
      return { ok: false, value: num, error: ERROR_NEGATIVE };
    }

    return { ok: true, value: num, error: '' };
  }

  /* =========================================================
     ВАЛИДАЦИЯ ВСЕЙ ФОРМЫ
     Возвращает { valid: boolean, values: {...}, errors: {...} }
     ========================================================= */
  function validateForm() {
    const values = {};
    const errors = {};
    let valid = true;

    FIELD_IDS.forEach(function (id) {
      const input = document.getElementById(id);
      const span = document.querySelector('.error-msg[data-for="' + id + '"]');
      const res = validateField(input.value);

      // сбрасываем предыдущее состояние
      input.classList.remove('invalid');
      if (span) span.textContent = '';

      if (!res.ok) {
        valid = false;
        errors[id] = res.error;
        input.classList.add('invalid');
        if (span) span.textContent = res.error;
      } else {
        values[id] = res.value;
      }
    });

    return { valid: valid, values: values, errors: errors };
  }

  /* =========================================================
     РАСЧЁТ
     ========================================================= */
  function calculate(v) {
    // Цена продажи с учётом скидки
    const finalPrice = v.salePrice * (1 - v.discountPercent / 100);

    // Переменные затраты на единицу (без цены продажи и налога)
    const commissionMoney = finalPrice * (v.commissionPercent / 100);
    const costBeforeTax =
      v.purchasePrice +
      v.logisticsCost +
      v.packagingCost +
      commissionMoney +
      v.platformLogistics +
      v.adCost;

    // Налог / НДС считаем от цены продажи (упрощённо для демо)
    const taxMoney = finalPrice * (v.taxRate / 100);

    // Чистая прибыль
    const profit = finalPrice - costBeforeTax - taxMoney;

    // Маржинальность = прибыль / цена продажи * 100
    const margin = finalPrice > 0 ? (profit / finalPrice) * 100 : 0;

    // Наценка = (цена продажи - себестоимость) / себестоимость * 100
    const fullCost = costBeforeTax + taxMoney;
    const markup = fullCost > 0 ? ((finalPrice - fullCost) / fullCost) * 100 : 0;

    return {
      finalPrice: finalPrice,
      cost: costBeforeTax,
      tax: taxMoney,
      profit: profit,
      margin: margin,
      markup: markup
    };
  }

  /* =========================================================
     ФОРМАТИРОВАНИЕ
     ========================================================= */
  function fmtMoney(n) {
    return n.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' ₽';
  }

  function fmtPercent(n) {
    return n.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' %';
  }

  /* =========================================================
     ВЫВОД РЕЗУЛЬТАТА
     ========================================================= */
  function renderResult(r) {
    resFinalPrice.textContent = fmtMoney(r.finalPrice);
    resCost.textContent = fmtMoney(r.cost);
    resTax.textContent = fmtMoney(r.tax);
    resProfit.textContent = fmtMoney(r.profit);
    resMargin.textContent = fmtPercent(r.margin);
    resMarkup.textContent = fmtPercent(r.markup);

    // Вердикт
    if (r.profit < 0) {
      resVerdict.textContent = '⚠️ Убыток! Товар продаётся ниже полной себестоимости.';
      resVerdict.style.color = 'var(--danger)';
      resProfit.style.color = 'var(--danger)';
    } else if (r.margin < 10) {
      resVerdict.textContent = '⚠️ Низкая маржа — менее 10%. Проверьте расходы и цену.';
      resVerdict.style.color = '#b45309';
      resProfit.style.color = '';
    } else {
      resVerdict.textContent = '✅ Расчёт прибыльный.';
      resVerdict.style.color = 'var(--success)';
      resProfit.style.color = '';
    }

    resultBlock.hidden = false;
  }

  /* =========================================================
     ЖУРНАЛ: добавление записи
     ========================================================= */
  function addJournalEntry(type, data, summary) {
    const now = new Date();
    const entry = {
      time: now.toLocaleString('ru-RU'),
      type: type, // 'ok' или 'error'
      data: data,
      summary: summary
    };
    journal.push(entry);
    saveJournal();
    renderJournal();
  }

  /* =========================================================
     ЖУРНАЛ: отрисовка
     ========================================================= */
  function renderJournal() {
    journalList.innerHTML = '';

    if (!journal.length) {
      journalEmpty.style.display = 'block';
      return;
    }
    journalEmpty.style.display = 'none';

    // Идём по порядку: старые записи сверху, новые снизу
    journal.forEach(function (entry) {
      const li = document.createElement('li');
      li.className = 'journal-item' + (entry.type === 'error' ? ' error-log' : '');

      const timeDiv = document.createElement('div');
      timeDiv.className = 'journal-time';
      timeDiv.textContent = entry.time;
      li.appendChild(timeDiv);

      if (entry.type === 'error') {
        const errLine = document.createElement('div');
        errLine.className = 'journal-line';
        errLine.innerHTML =
          '<strong>Ошибка ввода:</strong> ' + escapeHtml(entry.summary);
        li.appendChild(errLine);
      } else {
        const d = entry.data;
        const lines = [
          ['Закупка', fmtMoney(d.purchasePrice)],
          ['Логистика + упаковка', fmtMoney(d.logisticsCost + d.packagingCost)],
          ['Комиссия площадки', fmtMoney(d.commissionMoney)],
          ['Логистика площадки + реклама', fmtMoney(d.platformLogistics + d.adCost)],
          ['Цена продажи со скидкой', fmtMoney(d.finalPrice)],
          ['Налог / НДС', fmtMoney(d.tax)],
          ['Чистая прибыль', fmtMoney(d.profit)],
          ['Маржинальность', fmtPercent(d.margin)],
          ['Наценка', fmtPercent(d.markup)]
        ];

        lines.forEach(function (pair) {
          const div = document.createElement('div');
          div.className = 'journal-line';
          div.innerHTML =
            '<strong>' + escapeHtml(pair[0]) + ':</strong> ' + escapeHtml(pair[1]);
          li.appendChild(div);
        });
      }

      journalList.appendChild(li);
    });

    // Автоскролл вниз, чтобы видеть свежую запись
    journalList.scrollTop = journalList.scrollHeight;
  }

  /* =========================================================
     Экранирование HTML (защита от XSS в журнале)
     ========================================================= */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* =========================================================
     ОБРАБОТЧИК SUBMIT
     ========================================================= */
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const check = validateForm();

    if (!check.valid) {
      // Собираем первую ошибку для журнала
      const firstErrorId = Object.keys(check.errors)[0];
      const firstErrorMsg = check.errors[firstErrorId];
      addJournalEntry(
        'error',
        null,
        'Поле "' + firstErrorId + '" — ' + firstErrorMsg
      );
      // Прокрутка к первому невалидному полю
      const firstInput = document.getElementById(firstErrorId);
      if (firstInput) {
        firstInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstInput.focus();
      }
      // Скрываем старый результат, чтобы не путать
      resultBlock.hidden = true;
      return;
    }

    const v = check.values;
    const r = calculate(v);

    // Дополнительные данные для журнала
    const commissionMoney = r.finalPrice * (v.commissionPercent / 100);
    const journalData = {
      purchasePrice: v.purchasePrice,
      logisticsCost: v.logisticsCost,
      packagingCost: v.packagingCost,
      commissionMoney: commissionMoney,
      platformLogistics: v.platformLogistics,
      adCost: v.adCost,
      finalPrice: r.finalPrice,
      tax: r.tax,
      profit: r.profit,
      margin: r.margin,
      markup: r.markup
    };

    renderResult(r);
    addJournalEntry('ok', journalData, null);
  });

  /* =========================================================
     ОЧИСТКА ЖУРНАЛА
     ========================================================= */
  clearJournalBtn.addEventListener('click', function () {
    if (!journal.length) return;
    if (!confirm('Очистить весь журнал запросов?')) return;
    journal = [];
    saveJournal();
    renderJournal();
  });

  /* =========================================================
     RESET-КНОПКА: чистим ошибки, скрываем результат
     ========================================================= */
  document.getElementById('resetBtn').addEventListener('click', function () {
    FIELD_IDS.forEach(function (id) {
      const input = document.getElementById(id);
      const span = document.querySelector('.error-msg[data-for="' + id + '"]');
      input.classList.remove('invalid');
      if (span) span.textContent = '';
    });
    resultBlock.hidden = true;
  });

  /* =========================================================
     ИНИЦИАЛИЗАЦИЯ: восстановление журнала при загрузке
     ========================================================= */
  renderJournal();
})();
