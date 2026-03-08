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
    manualAdjustment: 0
  },
  progressLog: [],
  plan: {
    mode: "deadline",
    deadline: formatDateLocal(addDays(new Date(), 180)),
    dailyLoad: 5
  },
  reminderSettings: {
    enabled: false,
    time: "20:30",
    messageIndex: 0,
    notificationsPermission: typeof Notification === "undefined" ? "unsupported" : Notification.permission
  },
  backupMeta: {
    lastExportAt: null
  }
};

let state = loadState();
let currentHistoryFilter = "today";
let pendingImportPayload = null;
let deferredInstallPrompt = null;

const elements = {
  installApp: document.getElementById("install-app"),
  quoteChip: document.getElementById("quote-chip"),
  statsGrid: document.getElementById("stats-grid"),
  progressPercent: document.getElementById("progress-percent"),
  progressBarFill: document.getElementById("progress-bar-fill"),
  summaryMeta: document.getElementById("summary-meta"),
  settingsForm: document.getElementById("settings-form"),
  startDate: document.getElementById("start-date"),
  endDate: document.getElementById("end-date"),
  includeWitr: document.getElementById("include-witr"),
  manualAdjustment: document.getElementById("manual-adjustment"),
  calculationBreakdown: document.getElementById("calculation-breakdown"),
  progressForm: document.getElementById("progress-form"),
  progressDate: document.getElementById("progress-date"),
  progressPrayer: document.getElementById("progress-prayer"),
  progressCount: document.getElementById("progress-count"),
  quickActions: document.getElementById("quick-actions"),
  historyList: document.getElementById("history-list"),
  historyFilters: Array.from(document.querySelectorAll("[data-history-filter]")),
  planForm: document.getElementById("plan-form"),
  planMode: document.getElementById("plan-mode"),
  deadlineFields: document.getElementById("deadline-fields"),
  dailyLoadFields: document.getElementById("daily-load-fields"),
  planDeadline: document.getElementById("plan-deadline"),
  planDailyLoad: document.getElementById("plan-daily-load"),
  planResults: document.getElementById("plan-results"),
  remindersForm: document.getElementById("reminders-form"),
  reminderEnabled: document.getElementById("reminder-enabled"),
  reminderTime: document.getElementById("reminder-time"),
  reminderMessage: document.getElementById("reminder-message"),
  reminderStatus: document.getElementById("reminder-status"),
  requestNotifications: document.getElementById("request-notifications"),
  libraryList: document.getElementById("library-list"),
  backupBanner: document.getElementById("backup-banner"),
  reminderBanner: document.getElementById("reminder-banner"),
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
  elements.remindersForm.addEventListener("submit", handleReminderSubmit);
  elements.exportData.addEventListener("click", exportData);
  elements.importFile.addEventListener("change", handleImportFile);
  elements.requestNotifications.addEventListener("click", requestNotificationsPermission);
  elements.planMode.addEventListener("change", togglePlanFields);
  elements.installApp.addEventListener("click", promptInstall);

  elements.historyFilters.forEach((button) => {
    button.addEventListener("click", () => {
      currentHistoryFilter = button.dataset.historyFilter;
      elements.historyFilters.forEach((item) => item.classList.toggle("is-active", item === button));
      renderHistory();
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
  populateReminderMessages();
  elements.startDate.value = state.settings.startDate;
  elements.endDate.value = state.settings.endDate;
  elements.includeWitr.checked = state.settings.includeWitr;
  elements.manualAdjustment.value = state.settings.manualAdjustment;
  elements.progressDate.value = formatDateLocal(new Date());
  elements.planMode.value = state.plan.mode;
  elements.planDeadline.value = state.plan.deadline;
  elements.planDailyLoad.value = state.plan.dailyLoad;
  elements.reminderEnabled.checked = state.reminderSettings.enabled;
  elements.reminderTime.value = state.reminderSettings.time;
  elements.reminderMessage.value = String(state.reminderSettings.messageIndex);
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

function populateReminderMessages() {
  elements.reminderMessage.innerHTML = "";
  window.NAMAZ_KEEPER_CONTENT.reminderMessages.forEach((message, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = message;
    elements.reminderMessage.appendChild(option);
  });
}

function handleSettingsSubmit(event) {
  event.preventDefault();
  state.settings = {
    startDate: elements.startDate.value,
    endDate: elements.endDate.value,
    includeWitr: elements.includeWitr.checked,
    manualAdjustment: Number(elements.manualAdjustment.value) || 0
  };
  if (new Date(state.settings.startDate) > new Date(state.settings.endDate)) {
    state.settings.endDate = state.settings.startDate;
    elements.endDate.value = state.settings.endDate;
  }
  populatePrayerOptions();
  persistAndRender();
}

function handleProgressSubmit(event) {
  event.preventDefault();
  const count = Math.max(1, Number(elements.progressCount.value) || 1);
  state.progressLog.unshift({
    id: createId(),
    date: elements.progressDate.value,
    prayerType: elements.progressPrayer.value,
    count,
    createdAt: new Date().toISOString()
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

function handleReminderSubmit(event) {
  event.preventDefault();
  state.reminderSettings.enabled = elements.reminderEnabled.checked;
  state.reminderSettings.time = elements.reminderTime.value || "20:30";
  state.reminderSettings.messageIndex = Number(elements.reminderMessage.value) || 0;
  state.reminderSettings.notificationsPermission =
    typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  persistAndRender();
}

function requestNotificationsPermission() {
  if (typeof Notification === "undefined") {
    alert("Этот браузер не поддерживает системные уведомления.");
    return;
  }
  Notification.requestPermission().then((permission) => {
    state.reminderSettings.notificationsPermission = permission;
    persistAndRender();
    if (permission === "granted") {
      new Notification("NamazKeeper", {
        body: getReminderMessage()
      });
    }
  });
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
  renderSummary();
  renderCalculation();
  renderQuickActions();
  renderHistory();
  renderPlan();
  renderReminders();
  renderLibrary();
  renderBackup();
  renderBanners();
}

function renderSummary() {
  const metrics = calculateMetrics(state);
  const cards = [
    {
      label: "Общий долг",
      value: String(metrics.totalDebt),
      hint: "Расчёт от выбранной даты"
    },
    {
      label: "Выполнено",
      value: String(metrics.completedApplied),
      hint: "Учтено в остатке"
    },
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

  const quote = getQuoteOfDay();
  elements.quoteChip.innerHTML = `<strong>${quote.author}</strong><br />${quote.body}`;
}

function renderCalculation() {
  const metrics = calculateMetrics(state);
  const breakdown = Object.entries(metrics.perPrayer).map(([type, prayerMetrics]) => ({
    label: PRAYER_LABELS[type],
    value: `${prayerMetrics.remaining}/${prayerMetrics.total}`,
    hint: "Осталось / всего"
  }));
  mountMiniCards(elements.calculationBreakdown, breakdown);
}

function renderQuickActions() {
  const enabledTypes = getEnabledPrayerTypes(state.settings.includeWitr);
  elements.quickActions.innerHTML = "";
  enabledTypes.forEach((type) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button--ghost";
    button.textContent = `+1 ${PRAYER_LABELS[type]}`;
    button.addEventListener("click", () => {
      state.progressLog.unshift({
        id: createId(),
        date: formatDateLocal(new Date()),
        prayerType: type,
        count: 1,
        createdAt: new Date().toISOString()
      });
      persistAndRender();
    });
    elements.quickActions.appendChild(button);
  });
}

function renderHistory() {
  const filteredItems = filterHistory(state.progressLog, currentHistoryFilter);
  elements.historyList.innerHTML = "";
  if (filteredItems.length === 0) {
    elements.historyList.innerHTML = '<div class="notice">Пока нет записей для выбранного периода.</div>';
    return;
  }
  filteredItems.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "history-item";
    item.innerHTML = `
      <div>
        <strong>${PRAYER_LABELS[entry.prayerType]}</strong>
        <div class="history-item__meta">${formatDateLabel(entry.date)}</div>
      </div>
      <div>+${entry.count}</div>
    `;
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

function renderReminders() {
  const reminderCards = [
    {
      label: "Статус",
      value: state.reminderSettings.enabled ? "Включено" : "Выключено",
      hint: "Внутренний баннер и уведомления"
    },
    {
      label: "Время",
      value: state.reminderSettings.time,
      hint: "Ежедневный ориентир"
    },
    {
      label: "Уведомления",
      value: readablePermission(state.reminderSettings.notificationsPermission),
      hint: "Поддержка браузера"
    }
  ];
  mountMiniCards(elements.reminderStatus, reminderCards);
}

function renderLibrary() {
  elements.libraryList.innerHTML = "";
  window.NAMAZ_KEEPER_CONTENT.scholarQuotes.forEach((quote) => {
    const card = document.createElement("article");
    card.className = "quote-card";
    card.innerHTML = `
      <strong class="quote-card__title">${quote.title}</strong>
      <p class="quote-card__body">${quote.body}</p>
      <p class="quote-card__source">${quote.author} · ${quote.tradition}</p>
      <p class="quote-card__source">${quote.source}</p>
    `;
    elements.libraryList.appendChild(card);
  });
}

function renderBackup() {
  const cards = [
    {
      label: "Последний экспорт",
      value: state.backupMeta.lastExportAt ? formatDateTime(state.backupMeta.lastExportAt) : "Ещё не делали",
      hint: "JSON-резервная копия"
    },
    {
      label: "Версия схемы",
      value: String(BACKUP_VERSION),
      hint: "Для совместимости импорта"
    }
  ];
  mountMiniCards(elements.backupStatus, cards);
}

function renderBanners() {
  const metrics = calculateMetrics(state);
  const reminderDue = isReminderDue(state.reminderSettings);
  const needsBackup = shouldSuggestBackup(state.backupMeta.lastExportAt);

  if (needsBackup) {
    showNotice(
      elements.backupBanner,
      "Прошло больше 30 дней с последнего экспорта. Создайте свежую резервную копию JSON, чтобы не потерять данные."
    );
  } else {
    hideNotice(elements.backupBanner);
  }

  if (state.reminderSettings.enabled && reminderDue && metrics.remainingTotal > 0) {
    showNotice(
      elements.reminderBanner,
      `${getReminderMessage()} Сегодняшняя ориентировочная норма: ${metrics.dailyGoal}.`
    );
  } else {
    hideNotice(elements.reminderBanner);
  }
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
  const automaticTotal = daysCount * enabledPrayerTypes.length;
  const totalDebt = Math.max(0, automaticTotal + Number(settings.manualAdjustment || 0));
  const basePerPrayer = buildPerPrayerBase(daysCount, enabledPrayerTypes, totalDebt);
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

  return {
    totalDebt,
    completedApplied,
    remainingTotal,
    perPrayer,
    progressPercent,
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
    container.appendChild(node);
  });
}

function readablePermission(permission) {
  if (permission === "granted") {
    return "Разрешены";
  }
  if (permission === "denied") {
    return "Запрещены";
  }
  if (permission === "unsupported") {
    return "Не поддерживаются";
  }
  return "Не запрошены";
}

function getEnabledPrayerTypes(includeWitr) {
  return includeWitr
    ? ["fajr", "dhuhr", "asr", "maghrib", "isha", "witr"]
    : ["fajr", "dhuhr", "asr", "maghrib", "isha"];
}

function getReminderMessage() {
  const index = state.reminderSettings.messageIndex || 0;
  return window.NAMAZ_KEEPER_CONTENT.reminderMessages[index] || window.NAMAZ_KEEPER_CONTENT.reminderMessages[0];
}

function getQuoteOfDay() {
  const quotes = window.NAMAZ_KEEPER_CONTENT.scholarQuotes;
  const dayIndex = Math.floor(new Date().setHours(0, 0, 0, 0) / 86400000);
  return quotes[Math.abs(dayIndex) % quotes.length];
}

function shouldSuggestBackup(lastExportAt) {
  if (!lastExportAt) {
    return false;
  }
  return Date.now() - new Date(lastExportAt).getTime() > 30 * 86400000;
}

function isReminderDue(reminderSettings) {
  if (!reminderSettings.enabled) {
    return false;
  }
  const [hours, minutes] = (reminderSettings.time || "20:30").split(":").map(Number);
  const now = new Date();
  const scheduled = new Date();
  scheduled.setHours(hours || 0, minutes || 0, 0, 0);
  return now >= scheduled;
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
  return {
    settings: {
      ...DEFAULT_STATE.settings,
      ...(input.settings || {})
    },
    progressLog: Array.isArray(input.progressLog) ? input.progressLog : [],
    plan: {
      ...DEFAULT_STATE.plan,
      ...(input.plan || {})
    },
    reminderSettings: {
      ...DEFAULT_STATE.reminderSettings,
      ...(input.reminderSettings || {})
    },
    backupMeta: {
      ...DEFAULT_STATE.backupMeta,
      ...(input.backupMeta || {})
    }
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
