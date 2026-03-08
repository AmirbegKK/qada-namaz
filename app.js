const STORAGE_KEY = "namazkeeper-state-v1";
const BACKUP_VERSION = 1;
const PRAYER_LABELS = {
  fajr: "Фаджр",
  dhuhr: "Зухр",
  asr: "Аср",
  maghrib: "Магриб",
  isha: "Иша",
  witr: "Витр"
};

const DEFAULT_STATE = {
  settings: {
    startDate: formatDateLocal(new Date()),
    endDate: formatDateLocal(new Date()),
    includeWitr: false,
    includeHayd: false,
    averageHaydDaysPerMonth: 0,
    manualAdjustment: 0
  },
  progressLog: [],
  plan: {
    mode: "deadline",
    deadline: formatDateLocal(addDays(new Date(), 180)),
    dailyLoad: 5
  },
  backupMeta: {
    lastExportAt: null
  },
  ui: {
    activeView: "home",
    theme: "light",
    minimalMode: false,
    showManualEntryForm: false,
    showFullHistory: false
  }
};

let state = loadState();
let pendingImportPayload = null;
let deferredInstallPrompt = null;

const elements = {
  installApp: document.getElementById("install-app"),
  toggleTheme: document.getElementById("toggle-theme"),
  toggleMinimal: document.getElementById("toggle-minimal"),
  viewButtons: Array.from(document.querySelectorAll("[data-view-target]")),
  viewTabs: Array.from(document.querySelectorAll("[data-view-tab]")),
  viewSections: Array.from(document.querySelectorAll("[data-view-section]")),
  statsGrid: document.getElementById("stats-grid"),
  dailyFocusCards: document.getElementById("daily-focus-cards"),
  dailyProgressPanel: document.getElementById("daily-progress-panel"),
  dailyProgressPercent: document.getElementById("daily-progress-percent"),
  dailyProgressBarFill: document.getElementById("daily-progress-bar-fill"),
  dailyQuote: document.getElementById("daily-quote"),
  onboardingPanel: document.getElementById("onboarding-panel"),
  quickActionsTop: document.getElementById("quick-actions-top"),
  toggleManualEntry: document.getElementById("toggle-manual-entry"),
  manualEntryPanel: document.getElementById("manual-entry-panel"),
  progressPercent: document.getElementById("progress-percent"),
  progressBarFill: document.getElementById("progress-bar-fill"),
  summaryMeta: document.getElementById("summary-meta"),
  settingsForm: document.getElementById("settings-form"),
  startDate: document.getElementById("start-date"),
  endDate: document.getElementById("end-date"),
  includeWitr: document.getElementById("include-witr"),
  includeHayd: document.getElementById("include-hayd"),
  haydFields: document.getElementById("hayd-fields"),
  averageHaydDays: document.getElementById("average-hayd-days"),
  manualAdjustment: document.getElementById("manual-adjustment"),
  calculationBreakdown: document.getElementById("calculation-breakdown"),
  progressForm: document.getElementById("progress-form"),
  progressDate: document.getElementById("progress-date"),
  progressPrayer: document.getElementById("progress-prayer"),
  progressCount: document.getElementById("progress-count"),
  historyList: document.getElementById("history-list"),
  toggleHistoryView: document.getElementById("toggle-history-view"),
  planForm: document.getElementById("plan-form"),
  planMode: document.getElementById("plan-mode"),
  deadlineFields: document.getElementById("deadline-fields"),
  dailyLoadFields: document.getElementById("daily-load-fields"),
  planDeadline: document.getElementById("plan-deadline"),
  planDailyLoad: document.getElementById("plan-daily-load"),
  planResults: document.getElementById("plan-results"),
  backupBanner: document.getElementById("backup-banner"),
  importPreview: document.getElementById("import-preview"),
  exportData: document.getElementById("export-data"),
  importFile: document.getElementById("import-file"),
  backupStatus: document.getElementById("backup-status"),
  statCardTemplate: document.getElementById("stat-card-template")
};

document.addEventListener("DOMContentLoaded", () => {
  hydrateForms();
  bindEvents();
  render();
  registerServiceWorker();
});

function bindEvents() {
  elements.settingsForm.addEventListener("submit", handleSettingsSubmit);
  elements.progressForm.addEventListener("submit", handleProgressSubmit);
  elements.planForm.addEventListener("submit", handlePlanSubmit);
  elements.exportData.addEventListener("click", exportData);
  elements.importFile.addEventListener("change", handleImportFile);
  elements.planMode.addEventListener("change", togglePlanFields);
  elements.includeHayd.addEventListener("change", toggleHaydFields);
  elements.installApp.addEventListener("click", promptInstall);
  elements.toggleTheme.addEventListener("click", toggleTheme);
  elements.toggleMinimal.addEventListener("click", toggleMinimalMode);
  elements.toggleManualEntry.addEventListener("click", toggleManualEntryForm);
  elements.toggleHistoryView.addEventListener("click", toggleHistoryView);
  elements.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveView(button.dataset.viewTarget);
    });
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installApp.hidden = false;
  });
}

function hydrateForms() {
  populatePrayerOptions();
  elements.startDate.value = state.settings.startDate;
  elements.endDate.value = state.settings.endDate;
  elements.includeWitr.checked = state.settings.includeWitr;
  elements.includeHayd.checked = state.settings.includeHayd;
  elements.averageHaydDays.value = state.settings.averageHaydDaysPerMonth;
  elements.manualAdjustment.value = state.settings.manualAdjustment;
  elements.progressDate.value = formatDateLocal(new Date());
  elements.planMode.value = state.plan.mode;
  elements.planDeadline.value = state.plan.deadline;
  elements.planDailyLoad.value = state.plan.dailyLoad;
  toggleHaydFields();
  togglePlanFields();
}

function populatePrayerOptions() {
  const prayerTypes = getEnabledPrayerTypes(state.settings.includeWitr);
  elements.progressPrayer.innerHTML = "";
  prayerTypes.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = PRAYER_LABELS[type];
    elements.progressPrayer.appendChild(option);
  });
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  state.settings = {
    startDate: elements.startDate.value,
    endDate: elements.endDate.value,
    includeWitr: elements.includeWitr.checked,
    includeHayd: elements.includeHayd.checked,
    averageHaydDaysPerMonth: Math.max(0, Number(elements.averageHaydDays.value) || 0),
    manualAdjustment: Number(elements.manualAdjustment.value) || 0
  };
  if (new Date(state.settings.startDate) > new Date(state.settings.endDate)) {
    state.settings.endDate = state.settings.startDate;
    elements.endDate.value = state.settings.endDate;
  }
  toggleHaydFields();
  populatePrayerOptions();
  persistAndRender();
}

function handleProgressSubmit(event) {
  event.preventDefault();
  const count = Math.max(1, Number(elements.progressCount.value) || 1);
  appendProgressEntry({
    date: elements.progressDate.value,
    prayerType: elements.progressPrayer.value,
    count
  });
  elements.progressCount.value = "1";
  persistAndRender();
}

function handlePlanSubmit(event) {
  event.preventDefault();
  state.plan.mode = elements.planMode.value;
  state.plan.deadline = elements.planDeadline.value || formatDateLocal(addDays(new Date(), 180));
  state.plan.dailyLoad = Math.max(1, Number(elements.planDailyLoad.value) || 1);
  persistAndRender();
}

function exportData() {
  const payload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `namazkeeper-backup-${formatDateLocal(new Date())}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  state.backupMeta.lastExportAt = new Date().toISOString();
  persistAndRender();
}

function handleImportFile(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result));
      const importedState = validateImportPayload(payload);
      pendingImportPayload = importedState;
      const info = [
        `Резервная копия от ${formatDateTime(payload.exportedAt)}.`,
        `Записей в журнале: ${importedState.progressLog.length}.`,
        `Дата начала долга: ${importedState.settings.startDate}.`,
        `Нажмите ещё раз "Импортировать JSON" и выберите тот же файл, если хотите заменить текущие данные.`
      ].join(" ");
      showNotice(elements.importPreview, info);
      if (window.confirm("Заменить текущие данные импортированной резервной копией?")) {
        state = importedState;
        pendingImportPayload = null;
        hydrateForms();
        persistAndRender();
      }
    } catch (error) {
      pendingImportPayload = null;
      showNotice(elements.importPreview, `Импорт не выполнен: ${error.message}`);
    } finally {
      elements.importFile.value = "";
    }
  };
  reader.readAsText(file);
}

function validateImportPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("неверный формат файла");
  }
  if (payload.version !== BACKUP_VERSION) {
    throw new Error("неподдерживаемая версия резервной копии");
  }
  if (!payload.state || typeof payload.state !== "object") {
    throw new Error("в файле нет состояния приложения");
  }
  const imported = normalizeState(payload.state);
  if (!imported.settings.startDate || !imported.settings.endDate) {
    throw new Error("отсутствуют обязательные даты расчёта");
  }
  return imported;
}

function render() {
  syncUiMode();
  syncActiveView();
  renderDailyFocus();
  renderSummary();
  renderCalculation();
  renderQuickActions();
  renderHistory();
  renderPlan();
  renderBackup();
  renderBanners();
}

function renderSummary() {
  const metrics = calculateMetrics(state);
  const cards = [
    {
      label: "Осталось",
      value: String(metrics.remainingTotal),
      hint: "По всем включённым намазам"
    },
    {
      label: "Норма на сегодня",
      value: String(metrics.dailyGoal),
      hint: "По текущему плану"
    }
  ];
  elements.statsGrid.innerHTML = "";
  cards.forEach((card) => {
    const node = elements.statCardTemplate.content.cloneNode(true);
    node.querySelector(".stat-card__label").textContent = card.label;
    node.querySelector(".stat-card__value").textContent = card.value;
    node.querySelector(".stat-card__hint").textContent = card.hint;
    elements.statsGrid.appendChild(node);
  });

  elements.progressPercent.textContent = `${metrics.progressPercent}%`;
  elements.progressBarFill.style.width = `${metrics.progressPercent}%`;
  elements.summaryMeta.textContent =
    metrics.remainingTotal === 0
      ? "Долг закрыт. Можно поддерживать дисциплину и архивировать журнал."
      : `Прогноз завершения: ${metrics.predictedCompletionLabel}. Недельная цель: ${metrics.weeklyGoal}.`;

}

function renderCalculation() {
  const metrics = calculateMetrics(state);
  const breakdown = Object.entries(metrics.perPrayer).map(([type, prayerMetrics]) => ({
    label: PRAYER_LABELS[type],
    value: String(prayerMetrics.remaining),
    hint: ""
  }));
  mountMiniCards(elements.calculationBreakdown, breakdown);
  if (metrics.haydDaysApplied > 0) {
    const note = document.createElement("div");
    note.className = "calculation-note";
    note.textContent = `Хайд учтён: примерно ${metrics.haydDaysApplied} ${pluralize(metrics.haydDaysApplied, ["день", "дня", "дней"])} за период.`;
    elements.calculationBreakdown.appendChild(note);
  }
}

function renderQuickActions() {
  const enabledTypes = getEnabledPrayerTypes(state.settings.includeWitr);
  elements.quickActionsTop.innerHTML = "";
  enabledTypes.forEach((type) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button--ghost";
    button.textContent = `+1 ${PRAYER_LABELS[type]}`;
    button.addEventListener("click", () => {
      appendProgressEntry({
        date: formatDateLocal(new Date()),
        prayerType: type,
        count: 1
      });
      persistAndRender();
    });
    elements.quickActionsTop.appendChild(button);
  });
}

function renderHistory() {
  const filteredItems = filterHistory(state.progressLog, "all");
  const visibleItems = state.ui.showFullHistory ? filteredItems : filteredItems.slice(0, 3);
  elements.historyList.innerHTML = "";
  if (visibleItems.length === 0) {
    elements.historyList.innerHTML = '<div class="notice">Пока нет записей для выбранного периода.</div>';
    elements.toggleHistoryView.hidden = true;
    return;
  }
  elements.toggleHistoryView.hidden = filteredItems.length <= 3;
  elements.toggleHistoryView.textContent = state.ui.showFullHistory ? "Скрыть" : "Показать всё";
  visibleItems.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "history-item";
    item.innerHTML = `
      <div>
        <strong>${PRAYER_LABELS[entry.prayerType]}</strong>
        <div class="history-item__meta">${formatDateLabel(entry.date)}</div>
      </div>
      <div class="history-item__side">
        <div>+${entry.count}</div>
        <div class="history-item__actions">
          <button class="button button--ghost history-action" type="button" data-action="edit">Изменить</button>
          <button class="button button--ghost history-action" type="button" data-action="delete">Удалить</button>
        </div>
      </div>
    `;
    item.querySelector('[data-action="edit"]').addEventListener("click", () => editHistoryEntry(entry.id));
    item.querySelector('[data-action="delete"]').addEventListener("click", () => deleteHistoryEntry(entry.id));
    elements.historyList.appendChild(item);
  });
}

function renderPlan() {
  const metrics = calculateMetrics(state);
  togglePlanFields();
  const planCards = state.plan.mode === "deadline"
    ? [
        {
          label: "Дней до дедлайна",
          value: String(metrics.plan.deadlineDaysLeft),
          hint: "Считая от сегодня"
        },
        {
          label: "Норма в день",
          value: String(metrics.plan.dailyGoal),
          hint: "Округление вверх"
        },
        {
          label: "Норма в неделю",
          value: String(metrics.plan.weeklyGoal),
          hint: "Для устойчивого темпа"
        },
        {
          label: "Прогноз",
          value: metrics.predictedCompletionLabel,
          hint: "Если соблюдать норму"
        }
      ]
    : [
        {
          label: "Нагрузка в день",
          value: String(metrics.plan.dailyLoad),
          hint: "Задано вручную"
        },
        {
          label: "Нужно дней",
          value: String(metrics.plan.daysNeeded),
          hint: "При текущем остатке"
        },
        {
          label: "Дата завершения",
          value: metrics.plan.completionDateLabel,
          hint: "При постоянном темпе"
        },
        {
          label: "Норма в неделю",
          value: String(metrics.plan.weeklyGoal),
          hint: "Ориентир на 7 дней"
        }
      ];
  mountMiniCards(elements.planResults, planCards);
}

function toggleHaydFields() {
  const enabled = elements.includeHayd.checked;
  elements.haydFields.hidden = !enabled;
}

function toggleManualEntryForm() {
  state.ui.showManualEntryForm = !state.ui.showManualEntryForm;
  persistAndRender();
}

function toggleHistoryView() {
  state.ui.showFullHistory = !state.ui.showFullHistory;
  persistAndRender();
}

function renderBackup() {
  const cards = [
    {
      label: "Последний экспорт",
      value: state.backupMeta.lastExportAt ? formatDateTime(state.backupMeta.lastExportAt) : "Ещё не делали",
      hint: "Можно обновлять время от времени"
    },
    {
      label: "Версия схемы",
      value: String(BACKUP_VERSION),
      hint: "Для спокойного импорта данных"
    }
  ];
  mountMiniCards(elements.backupStatus, cards);
}

function renderBanners() {
  const needsBackup = shouldSuggestBackup(state.backupMeta.lastExportAt);

  if (needsBackup) {
    showNotice(
      elements.backupBanner,
      "Давно не обновляли экспорт. Когда будет удобно, сохраните свежую JSON-копию, чтобы данные были под рукой."
    );
  } else {
    hideNotice(elements.backupBanner);
  }
}

function renderDailyFocus() {
  const metrics = calculateMetrics(state);
  const cards = [
    {
      label: "Сегодня выполнено",
      value: String(metrics.completedToday),
      hint: metrics.completedToday > 0 ? "Все записи за текущую дату" : "Пока без записей за сегодня"
    },
    {
      label: "Осталось до дневной нормы",
      value: String(metrics.remainingTodayGoal),
      hint: metrics.dailyGoal > 0 ? `Цель на день: ${metrics.dailyGoal}` : "Дневная цель пока не требуется"
    }
  ];
  mountMiniCards(elements.dailyFocusCards, cards);
  const dailyPercent = metrics.dailyGoal > 0
    ? Math.min(100, Math.round((metrics.completedToday / metrics.dailyGoal) * 100))
    : 100;
  elements.dailyProgressPercent.textContent = `${dailyPercent}%`;
  elements.dailyProgressBarFill.style.width = `${dailyPercent}%`;
  elements.dailyProgressPanel.hidden = metrics.dailyGoal === 0 && metrics.completedToday === 0;

  const quote = getQuoteOfDay();
  elements.dailyQuote.innerHTML = `
    <span class="quote-card__badge">Важность намаза</span>
    <strong class="quote-card__title">${quote.title}</strong>
    <p class="quote-card__body">${quote.body}</p>
    <p class="quote-card__source">${quote.author}</p>
  `;
  renderOnboarding(metrics);
}

function renderOnboarding(metrics) {
  if (!shouldShowOnboarding()) {
    elements.onboardingPanel.hidden = true;
    elements.onboardingPanel.innerHTML = "";
    return;
  }

  elements.onboardingPanel.hidden = false;
  const steps = [
    {
      title: "1. Выберите дату",
      text: state.settings.startDate && state.settings.endDate
        ? `Период уже выбран: ${formatDateLabel(state.settings.startDate)} - ${formatDateLabel(state.settings.endDate)}.`
        : "Укажите начало долга и дату, до которой хотите сделать расчёт.",
      done: Boolean(state.settings.startDate && state.settings.endDate)
    },
    {
      title: "2. Рассчитайте долг",
      text: metrics.totalDebt > 0
        ? `Сейчас в расчёте ${metrics.totalDebt} намазов. При необходимости можно уточнить сумму вручную.`
        : "После выбора дат приложение посчитает общий долг автоматически.",
      done: metrics.totalDebt > 0
    },
    {
      title: "3. Начните отмечать прогресс",
      text: state.progressLog.length > 0
        ? `В журнале уже ${state.progressLog.length} ${pluralize(state.progressLog.length, ["запись", "записи", "записей"])}.`
        : "Используйте быстрые кнопки выше или форму ниже, чтобы начать ежедневный ритм.",
      done: state.progressLog.length > 0
    }
  ];

  elements.onboardingPanel.innerHTML = `
    <div class="onboarding__intro">
      <strong>Первый запуск</strong>
      <span>Короткий маршрут без лишних шагов.</span>
    </div>
    <div class="onboarding__steps">
      ${steps.map((step) => `
        <article class="onboarding-step${step.done ? " is-done" : ""}">
          <strong>${step.title}</strong>
          <p>${step.text}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function togglePlanFields() {
  const isDeadline = elements.planMode.value === "deadline";
  elements.deadlineFields.hidden = !isDeadline;
  elements.dailyLoadFields.hidden = isDeadline;
}

function calculateMetrics(currentState) {
  const settings = currentState.settings;
  const enabledPrayerTypes = getEnabledPrayerTypes(settings.includeWitr);
  const daysCount = countInclusiveDays(settings.startDate, settings.endDate);
  const haydDaysApplied = calculateHaydDays(settings.startDate, settings.endDate, settings);
  const effectiveDaysCount = Math.max(daysCount - haydDaysApplied, 0);
  const automaticTotal = effectiveDaysCount * enabledPrayerTypes.length;
  const totalDebt = Math.max(0, automaticTotal + Number(settings.manualAdjustment || 0));
  const basePerPrayer = buildPerPrayerBase(effectiveDaysCount, enabledPrayerTypes, totalDebt);
  const progressByPrayer = sumProgressByPrayer(currentState.progressLog);

  const perPrayer = {};
  let completedApplied = 0;
  let remainingTotal = 0;

  enabledPrayerTypes.forEach((type) => {
    const total = basePerPrayer[type] || 0;
    const completedRaw = progressByPrayer[type] || 0;
    const completed = Math.min(total, completedRaw);
    const remaining = Math.max(total - completed, 0);
    completedApplied += completed;
    remainingTotal += remaining;
    perPrayer[type] = { total, completed, completedRaw, remaining };
  });

  const progressPercent = totalDebt > 0 ? Math.min(100, Math.round((completedApplied / totalDebt) * 100)) : 100;
  const plan = calculatePlan(currentState.plan, remainingTotal);
  const completedToday = sumCompletedForDate(currentState.progressLog, formatDateLocal(new Date()));
  const remainingTodayGoal = Math.max(plan.dailyGoal - completedToday, 0);

  return {
    totalDebt,
    completedApplied,
    remainingTotal,
    perPrayer,
    haydDaysApplied,
    effectiveDaysCount,
    progressPercent,
    completedToday,
    remainingTodayGoal,
    dailyGoal: plan.dailyGoal,
    weeklyGoal: plan.weeklyGoal,
    predictedCompletionLabel: plan.completionDateLabel,
    plan
  };
}

function buildPerPrayerBase(daysCount, enabledPrayerTypes, totalDebt) {
  const base = {};
  enabledPrayerTypes.forEach((type) => {
    base[type] = daysCount;
  });
  const automaticTotal = daysCount * enabledPrayerTypes.length;
  let adjustment = totalDebt - automaticTotal;
  const orderedTypes = [...enabledPrayerTypes];

  while (adjustment !== 0 && orderedTypes.length > 0) {
    for (const type of orderedTypes) {
      if (adjustment === 0) {
        break;
      }
      if (adjustment > 0) {
        base[type] += 1;
        adjustment -= 1;
      } else if (base[type] > 0) {
        base[type] -= 1;
        adjustment += 1;
      }
    }
    if (adjustment < 0 && orderedTypes.every((type) => base[type] === 0)) {
      adjustment = 0;
    }
  }

  return base;
}

function calculateHaydDays(startDate, endDate, settings) {
  if (!settings.includeHayd) {
    return 0;
  }
  const averageHaydDaysPerMonth = Math.max(0, Number(settings.averageHaydDaysPerMonth) || 0);
  if (averageHaydDaysPerMonth === 0) {
    return 0;
  }
  const daysCount = countInclusiveDays(startDate, endDate);
  const monthsInPeriod = daysCount / 30.4375;
  return Math.min(daysCount, Math.round(monthsInPeriod * averageHaydDaysPerMonth));
}

function calculatePlan(planState, remainingTotal) {
  if (remainingTotal === 0) {
    return {
      mode: planState.mode,
      dailyGoal: 0,
      weeklyGoal: 0,
      deadlineDaysLeft: 0,
      dailyLoad: planState.dailyLoad,
      daysNeeded: 0,
      completionDateLabel: "Уже закрыто"
    };
  }

  if (planState.mode === "daily_load") {
    const dailyLoad = Math.max(1, Number(planState.dailyLoad) || 1);
    const daysNeeded = Math.ceil(remainingTotal / dailyLoad);
    return {
      mode: "daily_load",
      dailyLoad,
      dailyGoal: dailyLoad,
      weeklyGoal: dailyLoad * 7,
      daysNeeded,
      deadlineDaysLeft: 0,
      completionDateLabel: formatDateLabel(formatDateLocal(addDays(new Date(), daysNeeded - 1)))
    };
  }

  const deadline = planState.deadline || formatDateLocal(addDays(new Date(), 180));
  const deadlineDaysLeft = Math.max(1, countInclusiveDays(formatDateLocal(new Date()), deadline));
  const dailyGoal = Math.max(1, Math.ceil(remainingTotal / deadlineDaysLeft));
  const daysNeeded = Math.ceil(remainingTotal / dailyGoal);

  return {
    mode: "deadline",
    deadlineDaysLeft,
    dailyGoal,
    weeklyGoal: dailyGoal * 7,
    dailyLoad: planState.dailyLoad,
    daysNeeded,
    completionDateLabel: formatDateLabel(formatDateLocal(addDays(new Date(), daysNeeded - 1)))
  };
}

function filterHistory(progressLog, filter) {
  const now = new Date();
  return progressLog.filter((entry) => {
    const entryDate = new Date(`${entry.date}T00:00:00`);
    if (filter === "today") {
      return entry.date === formatDateLocal(now);
    }
    if (filter === "week") {
      const diffDays = Math.floor((now - entryDate) / 86400000);
      return diffDays >= 0 && diffDays < 7;
    }
    return true;
  });
}

function sumProgressByPrayer(progressLog) {
  return progressLog.reduce((accumulator, entry) => {
    accumulator[entry.prayerType] = (accumulator[entry.prayerType] || 0) + Number(entry.count || 0);
    return accumulator;
  }, {});
}

function mountMiniCards(container, cards) {
  container.innerHTML = "";
  cards.forEach((card) => {
    const node = elements.statCardTemplate.content.cloneNode(true);
    node.querySelector(".stat-card__label").textContent = card.label;
    node.querySelector(".stat-card__value").textContent = card.value;
    node.querySelector(".stat-card__hint").textContent = card.hint;
    node.querySelector(".stat-card__hint").hidden = !card.hint;
    container.appendChild(node);
  });
}

function sumCompletedForDate(progressLog, targetDate) {
  return progressLog.reduce((total, entry) => {
    return entry.date === targetDate ? total + Number(entry.count || 0) : total;
  }, 0);
}

function appendProgressEntry({ date, prayerType, count }) {
  const existingEntry = state.progressLog.find((entry) => entry.date === date && entry.prayerType === prayerType);
  if (existingEntry) {
    existingEntry.count += count;
    existingEntry.createdAt = new Date().toISOString();
    state.progressLog = consolidateProgressLog(state.progressLog);
    return;
  }

  state.progressLog.unshift({
    id: createId(),
    date,
    prayerType,
    count,
    createdAt: new Date().toISOString()
  });
}

function editHistoryEntry(entryId) {
  const entry = state.progressLog.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }
  const nextDate = window.prompt("Введите дату в формате ГГГГ-ММ-ДД:", entry.date);
  if (!nextDate || Number.isNaN(new Date(`${nextDate}T00:00:00`).getTime())) {
    return;
  }
  const enabledPrayerTypes = getEnabledPrayerTypes(state.settings.includeWitr);
  const prayerChoices = enabledPrayerTypes.join(", ");
  const nextPrayerType = window.prompt(`Введите тип намаза: ${prayerChoices}`, entry.prayerType);
  if (!nextPrayerType || !enabledPrayerTypes.includes(nextPrayerType)) {
    return;
  }
  const nextCount = Number(window.prompt("Введите новое количество:", String(entry.count)));
  if (!Number.isFinite(nextCount) || nextCount < 1) {
    return;
  }
  entry.date = nextDate;
  entry.prayerType = nextPrayerType;
  entry.count = Math.max(1, Math.round(nextCount));
  state.progressLog = consolidateProgressLog(state.progressLog);
  persistAndRender();
}

function deleteHistoryEntry(entryId) {
  const entry = state.progressLog.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }
  if (!window.confirm(`Удалить запись ${PRAYER_LABELS[entry.prayerType]} за ${formatDateLabel(entry.date)}?`)) {
    return;
  }
  state.progressLog = state.progressLog.filter((item) => item.id !== entryId);
  persistAndRender();
}

function toggleMinimalMode() {
  state.ui.minimalMode = !state.ui.minimalMode;
  persistAndRender();
}

function toggleTheme() {
  state.ui.theme = state.ui.theme === "dark" ? "light" : "dark";
  persistAndRender();
}

function syncUiMode() {
  const minimalEnabled = Boolean(state.ui.minimalMode);
  document.body.classList.toggle("minimal-mode", minimalEnabled);
  const theme = state.ui.theme === "dark" ? "dark" : "light";
  document.body.dataset.theme = theme;
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", theme === "dark" ? "#0f231f" : "#1f4f46");
  }
  elements.toggleTheme.textContent = theme === "dark" ? "Светлая тема" : "Ночная тема";
  const label = state.ui.minimalMode ? "Полный режим" : "Минимальный режим";
  elements.toggleMinimal.textContent = label;
  elements.manualEntryPanel.hidden = !state.ui.showManualEntryForm;
  elements.toggleManualEntry.textContent = state.ui.showManualEntryForm ? "Скрыть форму" : "Добавить вручную";
}

function setActiveView(nextView) {
  state.ui.activeView = nextView === "planner" ? "planner" : "home";
  persistAndRender();
  const nextUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, "", nextUrl);
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function syncActiveView() {
  const activeView = state.ui.activeView === "planner" ? "planner" : "home";
  document.body.dataset.activeView = activeView;
  elements.viewButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewTarget === activeView);
  });
  elements.viewTabs.forEach((link) => {
    link.hidden = link.dataset.viewTab !== activeView;
  });
  elements.viewSections.forEach((section) => {
    section.hidden = section.dataset.viewSection !== activeView;
  });
}

function getEnabledPrayerTypes(includeWitr) {
  return includeWitr
    ? ["fajr", "dhuhr", "asr", "maghrib", "isha", "witr"]
    : ["fajr", "dhuhr", "asr", "maghrib", "isha"];
}

function getQuoteOfDay() {
  const quotes = window.NAMAZ_KEEPER_CONTENT.scholarQuotes;
  const dayIndex = Math.floor(new Date().setHours(0, 0, 0, 0) / 86400000);
  const quoteIndex = Math.floor(Math.abs(dayIndex) / 2) % quotes.length;
  return quotes[quoteIndex];
}

function shouldSuggestBackup(lastExportAt) {
  if (!lastExportAt) {
    return false;
  }
  return Date.now() - new Date(lastExportAt).getTime() > 30 * 86400000;
}

function showNotice(node, text) {
  node.hidden = false;
  node.textContent = text;
}

function hideNotice(node) {
  node.hidden = true;
  node.textContent = "";
}

function persistAndRender() {
  saveState(state);
  render();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : structuredClone(DEFAULT_STATE);
  } catch (error) {
    return structuredClone(DEFAULT_STATE);
  }
}

function normalizeState(input) {
  const nextUi = {
    ...DEFAULT_STATE.ui,
    ...(input.ui || {})
  };
  nextUi.theme = nextUi.theme === "dark" ? "dark" : "light";
  return {
    settings: {
      ...DEFAULT_STATE.settings,
      ...(input.settings || {})
    },
    progressLog: consolidateProgressLog(Array.isArray(input.progressLog) ? input.progressLog : []),
    plan: {
      ...DEFAULT_STATE.plan,
      ...(input.plan || {})
    },
    backupMeta: {
      ...DEFAULT_STATE.backupMeta,
      ...(input.backupMeta || {})
    },
    ui: nextUi
  };
}

function saveState(nextState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function countInclusiveDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const diff = Math.floor((end - start) / 86400000);
  return Math.max(diff + 1, 1);
}

function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function formatDateTime(isoString) {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function createId() {
  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function consolidateProgressLog(progressLog) {
  const grouped = new Map();

  progressLog.forEach((entry) => {
    if (!entry || !entry.date || !entry.prayerType) {
      return;
    }

    const key = `${entry.date}::${entry.prayerType}`;
    const count = Math.max(1, Number(entry.count || 0));
    const existing = grouped.get(key);

    if (existing) {
      existing.count += count;
      existing.createdAt = latestIso(existing.createdAt, entry.createdAt);
      return;
    }

    grouped.set(key, {
      id: entry.id || createId(),
      date: entry.date,
      prayerType: entry.prayerType,
      count,
      createdAt: entry.createdAt || new Date().toISOString()
    });
  });

  return Array.from(grouped.values()).sort(compareProgressEntries);
}

function compareProgressEntries(left, right) {
  const leftTime = new Date(left.createdAt || `${left.date}T00:00:00`).getTime();
  const rightTime = new Date(right.createdAt || `${right.date}T00:00:00`).getTime();
  return rightTime - leftTime;
}

function latestIso(left, right) {
  const leftTime = new Date(left || 0).getTime();
  const rightTime = new Date(right || 0).getTime();
  return rightTime >= leftTime ? right : left;
}

function pluralize(value, forms) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return forms[0];
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms[1];
  }
  return forms[2];
}

function shouldShowOnboarding() {
  const hasProgress = state.progressLog.length > 0;
  const hasCustomRange =
    state.settings.startDate !== DEFAULT_STATE.settings.startDate ||
    state.settings.endDate !== DEFAULT_STATE.settings.endDate ||
    Number(state.settings.manualAdjustment || 0) !== 0 ||
    state.settings.includeWitr !== DEFAULT_STATE.settings.includeWitr ||
    state.settings.includeHayd !== DEFAULT_STATE.settings.includeHayd ||
    Number(state.settings.averageHaydDaysPerMonth || 0) !== Number(DEFAULT_STATE.settings.averageHaydDaysPerMonth || 0);
  return !hasProgress && !hasCustomRange;
}

async function promptInstall() {
  if (!deferredInstallPrompt) {
    return;
  }
  await deferredInstallPrompt.prompt();
  deferredInstallPrompt = null;
  elements.installApp.hidden = true;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  navigator.serviceWorker.register("./service-worker.js").catch(() => {
    // Ignore registration errors for static fallback mode.
  });
}
