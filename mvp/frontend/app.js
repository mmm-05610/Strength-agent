const API_BASE = "http://127.0.0.1:8000";
const PAGE_META = {
  home: {
    title: "总览首页",
    subtitle: "查看训练趋势、目标达成反馈、训练日历和核心建议。",
  },
  plan: {
    title: "训练计划",
    subtitle: "设置周期天模板（支持 7/14/21/28 天）。",
  },
  workout: { title: "训练记录", subtitle: "记录动作、组次、重量与 RPE。" },
  readiness: { title: "恢复体征", subtitle: "跟踪睡眠、疲劳、疼痛和压力。" },
  nutrition: { title: "饮食记录", subtitle: "更新热量与三大营养素摄入。" },
  knowledge: {
    title: "体测记录库",
    subtitle: "管理体测单、OCR结果与相关资料。",
  },
  consent: { title: "提议与同意", subtitle: "AI 提议需要用户同意后才会写入。" },
};

const state = {
  today: null,
  plan: null,
  workouts: [],
  readiness: [],
  nutrition: [],
  bodyMetrics: [],
  knowledge: [],
  proposals: [],
  audits: [],
  goalConfig: null,
  goalProgress: null,
  editableCyclePlan: [],
  showTrainingOnly: false,
  calendarInstance: null,
  networkNow: null,
  lastDateSyncAt: null,
  calendarViewYear: null,
  calendarViewMonth: null,
  dateSource: "local",
};

const TRAINING_FOCUS_OPTIONS = [
  { value: "upper", label: "上肢" },
  { value: "lower", label: "下肢" },
  { value: "push", label: "推" },
  { value: "pull", label: "拉" },
  { value: "legs", label: "腿部" },
  { value: "chest", label: "胸" },
  { value: "back", label: "背" },
  { value: "shoulders", label: "肩" },
  { value: "arms", label: "手臂" },
  { value: "core", label: "核心" },
  { value: "full_body", label: "全身" },
  { value: "cardio", label: "有氧" },
  { value: "conditioning", label: "体能" },
  { value: "strength", label: "力量" },
  { value: "hypertrophy", label: "增肌" },
  { value: "mobility", label: "灵活性" },
];

const FOCUS_LABEL_MAP = Object.fromEntries(
  TRAINING_FOCUS_OPTIONS.map((item) => [item.value, item.label]),
);

function qs(id) {
  return document.getElementById(id);
}

function setBadge(id, text, level = "default") {
  const el = qs(id);
  if (!el) return;
  el.textContent = text;
  el.classList.remove("status-ok", "status-warn", "status-error");
  if (level === "ok") el.classList.add("status-ok");
  if (level === "warn") el.classList.add("status-warn");
  if (level === "error") el.classList.add("status-error");
}

function setText(id, value) {
  const el = qs(id);
  if (el) el.textContent = value;
}

function getErrorMessage(err) {
  if (err instanceof Error) return err.message;
  return String(err);
}

function getSubmitButton(form) {
  return form?.querySelector("button[type='submit']");
}

function setSubmitButtonLoading(button, isLoading, loadingText = "提交中...") {
  if (!button) return;

  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent || "提交";
  }

  if (isLoading) {
    button.disabled = true;
    button.classList.add("is-loading");
    button.textContent = loadingText;
    return;
  }

  button.disabled = false;
  button.classList.remove("is-loading");
  button.textContent = button.dataset.defaultText;
}

function showToast(message, tone = "info") {
  const toast = qs("global-toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove(
    "show",
    "toast-success",
    "toast-info",
    "toast-warn",
    "toast-error",
  );
  toast.classList.add(`toast-${tone}`);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  const oldTimer = Number(toast.dataset.timer || 0);
  if (oldTimer) {
    window.clearTimeout(oldTimer);
  }

  const timerId = window.setTimeout(() => {
    toast.classList.remove("show");
    toast.dataset.timer = "";
  }, 2600);

  toast.dataset.timer = String(timerId);
}

async function runFormTask(e, options, task) {
  e.preventDefault();

  const form = e.target;
  const submitButton = getSubmitButton(form);
  setSubmitButtonLoading(
    submitButton,
    true,
    options.loadingText || "提交中...",
  );

  try {
    await task(new FormData(form), form);
    if (options.successText) {
      showToast(options.successText, "success");
    }
  } catch (err) {
    const msg = getErrorMessage(err);
    showToast(`${options.errorText || "操作失败"}: ${msg}`, "error");
    console.error(err);
  } finally {
    setSubmitButtonLoading(submitButton, false);
  }
}

function prettyValue(value) {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function mapGoalType(type) {
  if (type === "muscle_gain") return "增肌";
  if (type === "fat_loss") return "减脂";
  if (type === "maintenance") return "维持";
  return type || "--";
}

function formatFocusLabel(value) {
  return FOCUS_LABEL_MAP[value] || value || "训练";
}

function activatePage(page) {
  document.querySelectorAll(".menu-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === page);
  });

  document.querySelectorAll(".page").forEach((view) => {
    view.classList.toggle("active", view.id === `page-${page}`);
  });

  const meta = PAGE_META[page] || PAGE_META.home;
  setText("page-title", meta.title);
  setText("page-subtitle", meta.subtitle);
}

function initPageMenu() {
  document.querySelectorAll(".menu-item").forEach((btn) => {
    btn.addEventListener("click", () => activatePage(btn.dataset.page));
  });
}

function jumpToGoalForm() {
  activatePage("plan");
  const panel = qs("panel-goal-settings");
  const firstField = qs("goal-form")?.querySelector("input,select");
  if (panel) {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (firstField) {
    window.setTimeout(() => firstField.focus(), 180);
  }
}

function normalizeCyclePlan(cycleLengthDays, cycleDayPlan) {
  const length = Math.max(7, Math.min(28, Number(cycleLengthDays || 7)));
  const existing = new Map(
    (Array.isArray(cycleDayPlan) ? cycleDayPlan : [])
      .filter((d) => Number.isFinite(Number(d.day_index)))
      .map((d) => [Number(d.day_index), d]),
  );

  const plan = [];
  for (let i = 1; i <= length; i += 1) {
    const item = existing.get(i);
    plan.push({
      day_index: i,
      label: item?.label || `D${i}`,
      is_training: Boolean(item?.is_training),
      focus_area: item?.focus_area || "rest",
    });
  }
  return plan;
}

function toLocalIsoDate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toDatetimeLocalValue(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (text.includes("T")) return text.slice(0, 16);
  return text.replace(" ", "T").slice(0, 16);
}

function fromDatetimeLocalValue(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  return text.replace("T", " ");
}

function toTimeLabel(dateObj) {
  const hh = String(dateObj.getHours()).padStart(2, "0");
  const mm = String(dateObj.getMinutes()).padStart(2, "0");
  const ss = String(dateObj.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function initCalendarYearOptions() {
  const yearSelect = qs("calendar-year-select");
  if (!yearSelect) return;

  const base = getCurrentDateBase();
  const nowYear = base.getFullYear();
  const startYear = nowYear - 3;
  const endYear = nowYear + 3;

  yearSelect.innerHTML = "";
  for (let y = startYear; y <= endYear; y += 1) {
    const opt = document.createElement("option");
    opt.value = String(y);
    opt.textContent = `${y}年`;
    yearSelect.appendChild(opt);
  }
}

function syncCalendarJumpSelectors() {
  const yearSelect = qs("calendar-year-select");
  const monthSelect = qs("calendar-month-select");
  if (!yearSelect || !monthSelect) return;
  if (state.calendarViewYear === null || state.calendarViewMonth === null)
    return;

  const hasYear = Array.from(yearSelect.options).some(
    (opt) => Number(opt.value) === state.calendarViewYear,
  );
  if (!hasYear) {
    const opt = document.createElement("option");
    opt.value = String(state.calendarViewYear);
    opt.textContent = `${state.calendarViewYear}年`;
    yearSelect.appendChild(opt);
  }

  yearSelect.value = String(state.calendarViewYear);
  monthSelect.value = String(state.calendarViewMonth);
}

function jumpCalendarToSelection() {
  const yearSelect = qs("calendar-year-select");
  const monthSelect = qs("calendar-month-select");
  if (!yearSelect || !monthSelect) return;

  const y = Number(yearSelect.value);
  const m = Number(monthSelect.value);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return;

  state.calendarViewYear = y;
  state.calendarViewMonth = m;
  renderTrainingCalendar();
}

async function fetchNetworkDateInfo() {
  const providers = [
    {
      label: "timeapi.io",
      url: "https://timeapi.io/api/Time/current/zone?timeZone=Asia/Shanghai",
      parse: (data) => new Date(data.dateTime),
    },
    {
      label: "worldtimeapi",
      url: "https://worldtimeapi.org/api/timezone/Asia/Shanghai",
      parse: (data) => new Date(data.datetime || data.utc_datetime),
    },
  ];

  for (const provider of providers) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(provider.url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`network date status=${res.status}`);
      }

      const data = await res.json();
      const remoteNow = provider.parse(data);
      if (Number.isNaN(remoteNow.getTime())) {
        throw new Error("network date parse failed");
      }

      state.networkNow = remoteNow;
      state.dateSource = `network:${provider.label}`;
      state.lastDateSyncAt = new Date();
      window.clearTimeout(timeoutId);
      return;
    } catch (_err) {
      window.clearTimeout(timeoutId);
    }
  }

  state.networkNow = new Date();
  state.dateSource = "local";
  state.lastDateSyncAt = new Date();
}

function getCurrentDateBase() {
  return state.networkNow ? new Date(state.networkNow) : new Date();
}

function setCalendarViewToCurrentMonth() {
  const now = getCurrentDateBase();
  state.calendarViewYear = now.getFullYear();
  state.calendarViewMonth = now.getMonth();

  if (state.calendarInstance) {
    state.calendarInstance.gotoDate(
      new Date(state.calendarViewYear, state.calendarViewMonth, 1),
    );
  }
}

function shiftCalendarMonth(delta) {
  if (!state.calendarInstance && !mountTrainingCalendar()) {
    return;
  }

  state.calendarInstance.incrementDate({ months: delta });
}

function updateCalendarHeader() {
  const monthTitle = qs("calendar-month-title");
  if (
    monthTitle &&
    state.calendarViewYear !== null &&
    state.calendarViewMonth !== null
  ) {
    monthTitle.textContent = `${state.calendarViewYear}年${state.calendarViewMonth + 1}月`;
  }

  const sourceBadge = qs("calendar-date-source-badge");
  if (sourceBadge) {
    const sourceLabel = state.dateSource.startsWith("network")
      ? `联网:${state.dateSource.split(":")[1] || "api"}`
      : "本地";
    sourceBadge.textContent = sourceLabel;
    sourceBadge.classList.remove("date-source-network", "date-source-local");
    sourceBadge.classList.add(
      state.dateSource.startsWith("network")
        ? "date-source-network"
        : "date-source-local",
    );
  }

  const syncText = qs("calendar-last-sync");
  if (syncText) {
    syncText.textContent = `更新时间 ${toTimeLabel(state.lastDateSyncAt || new Date())}`;
  }
}

function getDayStatus(dateObj, doneSet, now) {
  const plan = getPlanForDate(dateObj);
  const iso = toLocalIsoDate(dateObj);
  const isDone = doneSet.has(iso);
  const isPast = dateObj < now;

  if (isDone) return "done";
  if (plan.is_training && isPast) return "missed";
  if (plan.is_training) return "planned";
  return "rest";
}

function getWorkoutFocusByDateMap() {
  const map = new Map();
  (state.workouts || []).forEach((item) => {
    const key = String(item.training_date || "");
    if (!key) return;
    const label = formatFocusLabel(String(item.focus_area || "training"));
    if (!map.has(key)) {
      map.set(key, new Set());
    }
    map.get(key).add(label);
  });

  const result = new Map();
  map.forEach((focusSet, key) => {
    result.set(key, Array.from(focusSet));
  });
  return result;
}

function getBodyMetricsByDateMap() {
  const map = new Map();
  (state.bodyMetrics || []).forEach((item) => {
    const key = String(item.log_date || "");
    if (!key || map.has(key)) return;
    map.set(key, item);
  });
  return map;
}

function toMetricNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

function formatBodyMetricLine(record, goalType) {
  if (!record) return "";

  const weight = toMetricNumber(record.body_weight_kg);
  const bodyFat = toMetricNumber(record.body_fat_rate_pct);
  const muscle = toMetricNumber(record.muscle_weight_kg);
  const parts = [];

  if (goalType === "muscle_gain") {
    if (weight !== null) parts.push(`体重${weight.toFixed(1)}kg`);
    if (bodyFat !== null) parts.push(`体脂${bodyFat.toFixed(1)}%`);
  } else if (goalType === "fat_loss") {
    if (weight !== null) parts.push(`体重${weight.toFixed(1)}kg`);
    if (muscle !== null) parts.push(`肌肉${muscle.toFixed(1)}kg`);
  } else {
    if (weight !== null) parts.push(`体重${weight.toFixed(1)}kg`);
    if (bodyFat !== null) parts.push(`体脂${bodyFat.toFixed(1)}%`);
    else if (muscle !== null) parts.push(`肌肉${muscle.toFixed(1)}kg`);
  }

  return parts.join(" / ");
}

function applyCalendarDayStyles() {
  const host = qs("training-calendar");
  if (!host) return;

  const now = getCurrentDateBase();
  now.setHours(0, 0, 0, 0);
  const doneSet = new Set(
    (state.workouts || []).map((w) => String(w.training_date)),
  );
  const workoutFocusByDate = getWorkoutFocusByDateMap();
  const bodyMetricsByDate = getBodyMetricsByDateMap();
  const goalType = String(
    state.goalConfig?.goal_type || state.goalProgress?.goal_type || "",
  );

  const cells = host.querySelectorAll(".fc-daygrid-day");
  cells.forEach((cell) => {
    const dateStr = cell.getAttribute("data-date");
    if (!dateStr) return;

    const dateObj = new Date(`${dateStr}T00:00:00`);
    dateObj.setHours(0, 0, 0, 0);

    const status = getDayStatus(dateObj, doneSet, now);
    const plan = getPlanForDate(dateObj);

    cell.classList.remove(
      "fc-day-status-done",
      "fc-day-status-planned",
      "fc-day-status-missed",
      "fc-day-status-rest",
    );
    cell.classList.add(`fc-day-status-${status}`);

    const frame = cell.querySelector(".fc-daygrid-day-frame");
    if (frame) {
      const oldNotes = frame.querySelector(".calendar-day-notes");
      if (oldNotes) oldNotes.remove();

      let trainingLabel = "休息";
      if (plan.is_training) {
        const doneFocus = workoutFocusByDate.get(dateStr) || [];
        if (doneFocus.length) {
          trainingLabel = `训练:${doneFocus.join("/")}`;
        } else {
          trainingLabel = `计划:${formatFocusLabel(String(plan.focus_area || "training"))}`;
        }
      }

      const metricLabel = formatBodyMetricLine(
        bodyMetricsByDate.get(dateStr),
        goalType,
      );
      frame.title = metricLabel
        ? `${trainingLabel} | ${metricLabel}`
        : trainingLabel;

      const notes = document.createElement("div");
      notes.className = "calendar-day-notes";

      const trainEl = document.createElement("span");
      trainEl.className = "calendar-day-train";
      trainEl.textContent = trainingLabel;
      notes.appendChild(trainEl);

      if (metricLabel) {
        const metricEl = document.createElement("span");
        metricEl.className = "calendar-day-metric";
        metricEl.textContent = metricLabel;
        notes.appendChild(metricEl);
      }

      frame.appendChild(notes);
    }
  });
}

function mountTrainingCalendar() {
  const host = qs("training-calendar");
  if (!host) return false;

  if (state.calendarInstance) {
    return true;
  }

  if (!window.FullCalendar || !window.FullCalendar.Calendar) {
    host.innerHTML =
      "<p class='muted'>日历组件加载失败，请检查网络后刷新页面。</p>";
    return false;
  }

  const initialDate = getCurrentDateBase();
  state.calendarViewYear = initialDate.getFullYear();
  state.calendarViewMonth = initialDate.getMonth();

  const calendar = new window.FullCalendar.Calendar(host, {
    initialView: "dayGridMonth",
    initialDate,
    locale: "zh-cn",
    firstDay: 1,
    fixedWeekCount: true,
    headerToolbar: false,
    height: "auto",
    now: () => getCurrentDateBase(),
    datesSet: (info) => {
      state.calendarViewYear = info.view.currentStart.getFullYear();
      state.calendarViewMonth = info.view.currentStart.getMonth();
      updateCalendarHeader();
      syncCalendarJumpSelectors();
      applyCalendarDayStyles();
    },
  });

  calendar.render();
  state.calendarInstance = calendar;
  updateCalendarHeader();
  syncCalendarJumpSelectors();
  applyCalendarDayStyles();
  return true;
}

function deriveWeeklyPlan(cyclePlan) {
  const keys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const firstSeven = (cyclePlan || []).slice(0, 7);
  const fallback = ["upper", "rest", "lower", "rest", "upper", "rest", "rest"];

  const weekly = {};
  keys.forEach((k, idx) => {
    const day = firstSeven[idx];
    if (!day) {
      weekly[k] = fallback[idx];
      return;
    }
    weekly[k] = day.is_training ? String(day.focus_area || "training") : "rest";
  });
  return weekly;
}

function renderCycleEditor() {
  const host = qs("cycle-editor");
  if (!host) return;
  host.innerHTML = "";

  const totalDays = state.editableCyclePlan.length;
  const trainingDays = state.editableCyclePlan.filter(
    (day) => day.is_training,
  ).length;
  const restDays = totalDays - trainingDays;
  const summary = qs("cycle-summary");
  if (summary) {
    summary.textContent = `训练日 ${trainingDays} | 休息日 ${restDays} | 总计 ${totalDays}`;
  }

  const visibleDays = state.showTrainingOnly
    ? state.editableCyclePlan.filter((day) => day.is_training)
    : state.editableCyclePlan;
  if (!visibleDays.length) {
    host.innerHTML =
      "<p class='muted'>当前筛选无训练日，请关闭“仅显示训练日”。</p>";
    return;
  }

  visibleDays.forEach((day) => {
    const card = document.createElement("div");
    card.className = `cycle-day-card ${day.is_training ? "train" : "rest"}`;

    const head = document.createElement("div");
    head.className = "cycle-day-head";

    const title = document.createElement("strong");
    title.className = "cycle-day-title";
    title.textContent = `第 ${day.day_index} 天`;

    const statePill = document.createElement("span");
    statePill.className = "cycle-day-state";
    statePill.textContent = day.is_training ? "训练" : "休息";

    const titleWrap = document.createElement("div");
    titleWrap.appendChild(title);
    titleWrap.appendChild(statePill);

    const checkLabel = document.createElement("label");
    checkLabel.className = "cycle-check";
    checkLabel.textContent = "训练";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = day.is_training;
    check.addEventListener("change", () => {
      day.is_training = check.checked;
      if (!day.is_training) day.focus_area = "rest";
      if (day.is_training && (!day.focus_area || day.focus_area === "rest"))
        day.focus_area = TRAINING_FOCUS_OPTIONS[0].value;
      renderCycleEditor();
      renderTrainingCalendar();
    });

    checkLabel.prepend(check);
    head.appendChild(titleWrap);
    head.appendChild(checkLabel);

    const focusLabel = document.createElement("label");
    focusLabel.className = "cycle-focus-label";
    focusLabel.textContent = "训练部位";

    const focusSelect = document.createElement("select");
    focusSelect.className = "cycle-focus-select";

    if (day.is_training) {
      const focusValues = new Set(
        TRAINING_FOCUS_OPTIONS.map((item) => item.value),
      );
      if (
        !focusValues.has(day.focus_area) &&
        day.focus_area &&
        day.focus_area !== "rest"
      ) {
        const extra = document.createElement("option");
        extra.value = day.focus_area;
        extra.textContent = day.focus_area;
        focusSelect.appendChild(extra);
      }

      TRAINING_FOCUS_OPTIONS.forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.value;
        opt.textContent = item.label;
        focusSelect.appendChild(opt);
      });

      focusSelect.value =
        day.focus_area && day.focus_area !== "rest"
          ? day.focus_area
          : TRAINING_FOCUS_OPTIONS[0].value;
    } else {
      const restOpt = document.createElement("option");
      restOpt.value = "rest";
      restOpt.textContent = "休息日";
      focusSelect.appendChild(restOpt);
      focusSelect.value = "rest";
    }

    focusSelect.disabled = !day.is_training;
    focusSelect.addEventListener("change", () => {
      day.focus_area = focusSelect.value;
      renderTrainingCalendar();
      renderCycleEditor();
    });

    focusLabel.appendChild(focusSelect);

    const hint = document.createElement("p");
    hint.className = "cycle-day-hint";
    hint.textContent = day.is_training
      ? `当前：${formatFocusLabel(day.focus_area)}`
      : "休息日";

    card.appendChild(head);
    card.appendChild(focusLabel);
    card.appendChild(hint);
    host.appendChild(card);
  });
}

function regenerateCycleByLength() {
  const form = qs("plan-form");
  const length = Number(new FormData(form).get("cycle_length_days") || 7);
  state.editableCyclePlan = normalizeCyclePlan(length, state.editableCyclePlan);
  renderCycleEditor();
  renderTrainingCalendar();
}

function applyTwoWeekPreset() {
  const form = qs("plan-form");
  form.cycle_length_days.value = 14;
  const trainSet = new Set([1, 3, 5, 7, 9, 11, 13]);
  const presetFocus = [
    "upper",
    "lower",
    "push",
    "pull",
    "legs",
    "core",
    "conditioning",
  ];
  let trainIndex = 0;

  state.editableCyclePlan = Array.from({ length: 14 }, (_, idx) => {
    const dayIndex = idx + 1;
    const isTraining = trainSet.has(dayIndex);
    const focus = presetFocus[trainIndex % presetFocus.length];
    if (isTraining) {
      trainIndex += 1;
    }
    return {
      day_index: dayIndex,
      label: `D${dayIndex}`,
      is_training: isTraining,
      focus_area: isTraining ? focus : "rest",
    };
  });

  renderCycleEditor();
  renderTrainingCalendar();
}

function getPlanForDate(dateObj) {
  if (
    !state.plan ||
    !Array.isArray(state.plan.cycle_day_plan) ||
    !state.plan.cycle_day_plan.length
  ) {
    return { is_training: false, focus_area: "rest" };
  }

  const cycleLength = Number(
    state.plan.cycle_length_days || state.plan.cycle_day_plan.length || 7,
  );
  const start = new Date(state.plan.cycle_start_date);
  start.setHours(0, 0, 0, 0);

  const target = new Date(dateObj);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.floor((target.getTime() - start.getTime()) / 86400000);
  const cycleDayIndex = ((diffDays % cycleLength) + cycleLength) % cycleLength;
  const dayNum = cycleDayIndex + 1;

  return (
    state.plan.cycle_day_plan.find((d) => Number(d.day_index) === dayNum) || {
      is_training: false,
      focus_area: "rest",
    }
  );
}

function renderTrainingCalendar() {
  if (!mountTrainingCalendar()) return;

  if (state.calendarViewYear === null || state.calendarViewMonth === null) {
    setCalendarViewToCurrentMonth();
    return;
  }

  const target = new Date(state.calendarViewYear, state.calendarViewMonth, 1);
  const current = state.calendarInstance.getDate();

  if (
    current.getFullYear() !== target.getFullYear() ||
    current.getMonth() !== target.getMonth()
  ) {
    state.calendarInstance.gotoDate(target);
    return;
  }

  updateCalendarHeader();
  applyCalendarDayStyles();
}

function li(items) {
  if (!items || items.length === 0) {
    return "<p class='muted'>暂无数据</p>";
  }
  return items.join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

async function postJson(path, payload, method = "POST") {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} -> ${res.status} ${text}`);
  }
  return res.json();
}

async function postFormData(path, formData, method = "POST") {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} -> ${res.status} ${text}`);
  }
  return res.json();
}

async function deleteJson(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} -> ${res.status} ${text}`);
  }
  return res.json();
}

async function loadToday() {
  const data = await getJson("/api/v1/dashboard/today");
  state.today = data;
  const ratio = Number(data.budget_status.ratio ?? 0);
  const budgetLevel = ratio >= 1 ? "error" : ratio >= 0.7 ? "warn" : "ok";

  setBadge("badge-connection", "API Online", "ok");
  setBadge(
    "badge-budget",
    `预算 ${(ratio * 100).toFixed(1)}% (${data.budget_status.spent_rmb}/${data.budget_status.monthly_budget_rmb})`,
    budgetLevel,
  );

  qs("today-content").innerHTML = `
    <p><strong>下次训练:</strong> ${escapeHtml(data.next_training_time)}</p>
    <p><strong>动作:</strong> ${escapeHtml(data.today_recommendation.action)}</p>
    <p><strong>主项:</strong> ${escapeHtml(data.today_recommendation.main_lift)}</p>
    <p><strong>目标:</strong> ${escapeHtml(data.today_recommendation.target_sets)} @ ${escapeHtml(data.today_recommendation.target_weight_kg)}kg</p>
    <p><strong>原因:</strong> ${escapeHtml(data.today_recommendation.reason)}</p>
    <p><strong>预算:</strong> ${escapeHtml(data.budget_status.spent_rmb)}/${escapeHtml(data.budget_status.monthly_budget_rmb)} RMB</p>
  `;

  renderOverview();
  return data;
}

async function loadPlan() {
  const data = await getJson("/api/v1/plan");
  state.plan = data;
  state.editableCyclePlan = normalizeCyclePlan(
    data.cycle_length_days,
    data.cycle_day_plan,
  );

  const form = qs("plan-form");
  if (form) {
    form.cycle_week.value = data.cycle_week ?? 1;
    form.next_training_time.value = toDatetimeLocalValue(
      data.next_training_time ?? "",
    );
    form.cycle_start_date.value = data.cycle_start_date ?? "";
    form.cycle_length_days.value = data.cycle_length_days ?? 7;
  }

  qs("plan-content").innerHTML = `
    <p><strong>周期周次:</strong> ${data.cycle_week}</p>
    <p><strong>周期设置:</strong> ${data.cycle_length_days} 天一周期（起始日 ${data.cycle_start_date}）</p>
    <p><strong>下次训练:</strong> ${data.next_training_time}</p>
    <p><strong>本周期训练日:</strong> ${
      (data.cycle_day_plan || [])
        .filter((d) => d.is_training)
        .map((d) => `D${d.day_index}:${formatFocusLabel(d.focus_area)}`)
        .join(" | ") || "暂无"
    }</p>
  `;

  renderCycleEditor();
  renderTrainingCalendar();
  return data;
}

async function loadWorkouts() {
  const data = await getJson("/api/v1/workouts?days=14");
  state.workouts = data;
  qs("workout-content").innerHTML = li(
    data.map((x) => {
      const s = x.exercise_sets?.[0];
      if (!s)
        return `<p>${escapeHtml(x.training_date)} ${escapeHtml(x.focus_area)}</p>`;
      return `<p>${escapeHtml(x.training_date)} ${escapeHtml(x.focus_area)} | ${escapeHtml(s.exercise_name)} ${escapeHtml(s.sets)}x${escapeHtml(s.reps)}@${escapeHtml(s.weight_kg)}kg rpe=${escapeHtml(s.rpe ?? "-")}</p>`;
    }),
  );
  renderOverview();
  renderTrainingCalendar();
  return data;
}

async function loadReadiness() {
  const data = await getJson("/api/v1/readiness?days=14");
  state.readiness = data;
  qs("readiness-content").innerHTML = li(
    data.map(
      (x) =>
        `<p>${escapeHtml(x.log_date)} sleep=${escapeHtml(x.sleep_hours)} fatigue=${escapeHtml(x.fatigue_score)} pain=${escapeHtml(x.pain_score)} stress=${escapeHtml(x.stress_score)}</p>`,
    ),
  );
  renderOverview();
  return data;
}

async function loadNutrition() {
  const data = await getJson("/api/v1/nutrition?days=14");
  state.nutrition = data;
  qs("nutrition-content").innerHTML = li(
    data.map(
      (x) =>
        `<p>${escapeHtml(x.log_date)} kcal=${escapeHtml(x.calories_kcal)} P=${escapeHtml(x.protein_g)} C=${escapeHtml(x.carbs_g)} F=${escapeHtml(x.fat_g)} water=${escapeHtml(x.water_liters)}L weight=${escapeHtml(x.body_weight_kg ?? "-")}kg bodyfat=${escapeHtml(x.body_fat_rate_pct ?? "-")}% muscle=${escapeHtml(x.muscle_weight_kg ?? "-")}kg</p>`,
    ),
  );
  return data;
}

function getBodySecondaryMetricSpec(goalType) {
  if (goalType === "muscle_gain") {
    return { key: "body_fat_rate_pct", title: "体脂率趋势", unit: "%" };
  }
  if (goalType === "fat_loss") {
    return { key: "muscle_weight_kg", title: "肌肉重量趋势", unit: "kg" };
  }
  return { key: null, title: "体脂/肌肉趋势", unit: "" };
}

function renderBodyMetricCharts() {
  const weightCanvas = qs("chart-body-weight");
  const secondaryCanvas = qs("chart-body-secondary");
  if (!weightCanvas && !secondaryCanvas) return;

  const goalType = String(
    state.goalConfig?.goal_type || state.goalProgress?.goal_type || "",
  );
  const spec = getBodySecondaryMetricSpec(goalType);

  const titleEl = qs("chart-body-secondary-title");
  if (titleEl) {
    titleEl.textContent = spec.title;
  }

  const data = Array.isArray(state.bodyMetrics) ? state.bodyMetrics : [];

  const weightPoints = data
    .filter(
      (x) => x && x.body_weight_kg !== null && x.body_weight_kg !== undefined,
    )
    .map((x) => ({
      label: String(x.log_date).slice(5),
      value: Number(x.body_weight_kg),
    }))
    .filter((p) => Number.isFinite(p.value));

  if (weightCanvas) {
    if (!weightPoints.length) {
      drawNoData("chart-body-weight", "暂无体重数据");
    } else {
      drawLineChart(
        "chart-body-weight",
        weightPoints.map((p) => p.label),
        weightPoints.map((p) => p.value),
      );
    }
  }

  if (secondaryCanvas) {
    let secondaryKey = spec.key;

    if (!secondaryKey) {
      const hasFat = data.some(
        (x) =>
          x &&
          x.body_fat_rate_pct !== null &&
          x.body_fat_rate_pct !== undefined,
      );
      const hasMuscle = data.some(
        (x) =>
          x && x.muscle_weight_kg !== null && x.muscle_weight_kg !== undefined,
      );
      secondaryKey = hasFat
        ? "body_fat_rate_pct"
        : hasMuscle
          ? "muscle_weight_kg"
          : "body_fat_rate_pct";
    }

    const secondaryPoints = data
      .filter(
        (x) => x && x[secondaryKey] !== null && x[secondaryKey] !== undefined,
      )
      .map((x) => ({
        label: String(x.log_date).slice(5),
        value: Number(x[secondaryKey]),
      }))
      .filter((p) => Number.isFinite(p.value));

    if (!secondaryPoints.length) {
      drawNoData("chart-body-secondary", "暂无体测数据");
    } else {
      drawLineChart(
        "chart-body-secondary",
        secondaryPoints.map((p) => p.label),
        secondaryPoints.map((p) => p.value),
      );
    }
  }
}

function renderBodyMetricsList() {
  const host = qs("body-metrics-content");
  if (!host) return;

  const data = Array.isArray(state.bodyMetrics) ? state.bodyMetrics : [];
  host.innerHTML = "";

  if (!data.length) {
    host.innerHTML = "<p class='muted'>暂无数据</p>";
    return;
  }

  const goalType = String(
    state.goalConfig?.goal_type || state.goalProgress?.goal_type || "",
  );

  const sorted = [...data].sort((a, b) =>
    String(b.log_date).localeCompare(String(a.log_date)),
  );
  const frag = document.createDocumentFragment();

  sorted.slice(0, 20).forEach((x) => {
    const p = document.createElement("p");

    const dateStrong = document.createElement("strong");
    dateStrong.textContent = String(x.log_date);
    p.appendChild(dateStrong);

    const summary = document.createElement("span");
    summary.textContent = `  ${formatBodyMetricLine(x, goalType) || "(无指标)"}`;
    p.appendChild(summary);

    if (x.image_url) {
      const a = document.createElement("a");
      a.href = `${API_BASE}${x.image_url}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "  查看图片";
      p.appendChild(a);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-link";
    btn.textContent = "  填入表单";
    btn.addEventListener("click", () => {
      const form = qs("body-metric-form");
      if (!form) return;
      form.log_date.value = String(x.log_date || "");
      form.body_weight_kg.value = x.body_weight_kg ?? "";
      form.body_fat_rate_pct.value = x.body_fat_rate_pct ?? "";
      form.muscle_weight_kg.value = x.muscle_weight_kg ?? "";
      form.source_asset_id.value = x.source_asset_id ?? "";

      const preview = qs("inbody-preview");
      if (preview && x.image_url) {
        const oldUrl = preview.dataset.objectUrl;
        if (oldUrl) {
          URL.revokeObjectURL(oldUrl);
          preview.dataset.objectUrl = "";
        }
        preview.src = `${API_BASE}${x.image_url}`;
        preview.classList.add("show");
      }
    });
    p.appendChild(btn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-link";
    delBtn.textContent = "  删除";
    delBtn.addEventListener("click", async () => {
      const ok = window.confirm(`确认删除 ${String(x.log_date)} 的体测记录？`);
      if (!ok) return;
      try {
        await deleteJson(`/api/v1/body-metrics/${x.id}?delete_asset=true`);
        await Promise.all([
          loadBodyMetrics(),
          loadKnowledge(),
          loadGoalProgress(),
        ]);
        showToast("体测记录已删除", "success");
      } catch (err) {
        showToast(`删除失败: ${getErrorMessage(err)}`, "error");
      }
    });
    p.appendChild(delBtn);

    frag.appendChild(p);
  });

  host.appendChild(frag);
}

async function loadBodyMetrics() {
  const data = await getJson("/api/v1/body-metrics?days=90");
  state.bodyMetrics = data;
  renderBodyMetricsList();
  renderBodyMetricCharts();
  renderTrainingCalendar();
  return data;
}

async function loadOcrStatus() {
  const statusEl = qs("inbody-ocr-status");
  if (!statusEl) return null;

  try {
    const data = await getJson("/api/v1/ocr/status");
    const configured = Boolean(data.configured);
    statusEl.textContent = configured
      ? `OCR 可用（model=${String(data.model || "-")})`
      : "OCR 未配置（缺少 DEEPSEEK_API_KEY，将走手工校对）";
    return data;
  } catch (err) {
    statusEl.textContent = "OCR 状态获取失败（API 可能未启动）";
    return null;
  }
}

async function loadKnowledge() {
  const data = await getJson("/api/v1/knowledge-assets");
  state.knowledge = data;

  const host = qs("kb-content");
  if (!host) return data;

  host.innerHTML = "";
  if (!data.length) {
    host.innerHTML = "<p class='muted'>暂无数据</p>";
    return data;
  }

  const frag = document.createDocumentFragment();
  data.forEach((x) => {
    const p = document.createElement("p");
    p.textContent = `${x.asset_type} | ${x.title} | ${x.source_path} | tags=${(x.tags || []).join(",")}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-link";
    btn.textContent = "  删除";
    btn.addEventListener("click", async () => {
      const ok = window.confirm(`确认删除上传内容「${x.title}」？`);
      if (!ok) return;
      try {
        await deleteJson(`/api/v1/knowledge-assets/${x.id}`);
        await Promise.all([
          loadKnowledge(),
          loadBodyMetrics(),
          loadGoalProgress(),
        ]);
        showToast("上传内容已删除", "success");
      } catch (err) {
        showToast(`删除失败: ${getErrorMessage(err)}`, "error");
      }
    });
    p.appendChild(btn);

    frag.appendChild(p);
  });

  host.appendChild(frag);
  return data;
}

async function loadProposals() {
  const data = await getJson("/api/v1/change-proposals");
  state.proposals = data;
  qs("proposal-content").innerHTML = li(
    data.map(
      (x) => `
      <div class="proposal-item">
        <p><strong>#${escapeHtml(x.id)}</strong> ${escapeHtml(x.field_path)}: ${escapeHtml(prettyValue(x.old_value))} -> ${escapeHtml(prettyValue(x.new_value))}</p>
        <p>${escapeHtml(x.reason)} | status=${escapeHtml(x.status)}</p>
        ${x.status === "pending" ? `<button onclick="approveProposal(${x.id})">同意并写入</button>` : ""}
      </div>
    `,
    ),
  );
  return data;
}

async function loadGoalConfig() {
  const data = await getJson("/api/v1/goals");
  state.goalConfig = data;

  const form = qs("goal-form");
  if (form) {
    form.goal_type.value = data.goal_type || "muscle_gain";
    form.start_date.value = data.start_date || "";
    form.target_date.value = data.target_date || "";
    form.start_weight_kg.value = data.start_weight_kg ?? "";
    form.target_weight_kg.value = data.target_weight_kg ?? "";
    form.start_muscle_kg.value = data.start_muscle_kg ?? "";
    form.target_muscle_kg.value = data.target_muscle_kg ?? "";
    form.latest_muscle_kg.value = data.latest_muscle_kg ?? "";
  }

  setText("metric-goal-type", mapGoalType(data.goal_type));
  renderBodyMetricsList();
  renderBodyMetricCharts();
  renderTrainingCalendar();
  return data;
}

function goalStatusClass(label) {
  if (label === "健康") return "healthy";
  if (label === "过慢") return "slow";
  if (label === "超额") return "excess";
  return "pending";
}

async function loadGoalProgress() {
  const data = await getJson("/api/v1/goals/progress");
  state.goalProgress = data;

  setText("metric-goal-type", mapGoalType(data.goal_type));
  setText(
    "metric-weight-gap",
    `${Math.abs(Number(data.weight_gap_kg || 0)).toFixed(1)}kg`,
  );
  setText(
    "metric-muscle-gap",
    data.muscle_gap_kg === null || data.muscle_gap_kg === undefined
      ? "--"
      : `${Math.abs(Number(data.muscle_gap_kg)).toFixed(1)}kg`,
  );
  setText("metric-progress-label", data.progress_label || "--");

  const statusClass = goalStatusClass(data.progress_label);
  qs("goal-progress-content").innerHTML = `
    <p><strong>目标:</strong> ${escapeHtml(mapGoalType(data.goal_type))} | <strong>剩余天数:</strong> ${escapeHtml(data.days_remaining)} 天</p>
    <p><strong>体重:</strong> 当前 ${escapeHtml(data.current_weight_kg)}kg / 目标 ${escapeHtml(data.target_weight_kg)}kg / 还差 ${escapeHtml(Math.abs(Number(data.weight_gap_kg || 0)).toFixed(2))}kg</p>
    <p><strong>肌肉:</strong> 当前 ${escapeHtml(data.current_muscle_kg ?? "--")}kg / 目标 ${escapeHtml(data.target_muscle_kg ?? "--")}kg / 还差 ${escapeHtml(data.muscle_gap_kg == null ? "--" : Math.abs(Number(data.muscle_gap_kg)).toFixed(2) + "kg")}</p>
    <p><strong>速率:</strong> 需 ${escapeHtml(data.required_weekly_weight_change_kg ?? "--")}kg/周 | 实际 ${escapeHtml(data.actual_weekly_weight_change_kg ?? "--")}kg/周</p>
    <p><span class="goal-status ${escapeHtml(statusClass)}">${escapeHtml(data.progress_label)}</span> ${escapeHtml(data.summary)}</p>
  `;
  renderBodyMetricsList();
  renderBodyMetricCharts();
  renderTrainingCalendar();
  return data;
}

async function loadAuditLogs() {
  const data = await getJson("/api/v1/audit-logs");
  state.audits = data;
  qs("audit-content").innerHTML = li(
    data.map(
      (x) =>
        `<p>${escapeHtml(x.created_at)} | ${escapeHtml(x.actor)} | ${escapeHtml(x.action)} | ${escapeHtml(x.field_path)}: ${escapeHtml(prettyValue(x.old_value))} -> ${escapeHtml(prettyValue(x.new_value))}</p>`,
    ),
  );
  return data;
}

function calcReadinessScore(item) {
  const sleep = Number(item.sleep_hours || 0);
  const fatigue = Number(item.fatigue_score || 10);
  const pain = Number(item.pain_score || 10);
  const stress = Number(item.stress_score || 10);
  return Math.max(
    0,
    Math.round(sleep * 2 + (11 - fatigue) + (11 - pain) + (11 - stress)),
  );
}

function drawChartBase(canvasId) {
  const canvas = qs(canvasId);
  if (!canvas) return null;

  const width = canvas.clientWidth || 320;
  const height = canvas.height || 210;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);

  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  return { ctx, width, height };
}

function drawNoData(canvasId, text) {
  const base = drawChartBase(canvasId);
  if (!base) return;
  const { ctx, width, height } = base;
  ctx.fillStyle = "#5d6d87";
  ctx.font = "13px Chivo";
  ctx.textAlign = "center";
  ctx.fillText(text, width / 2, height / 2);
}

function drawLineChart(canvasId, labels, values) {
  if (!values.length) {
    drawNoData(canvasId, "暂无恢复数据");
    return;
  }

  const base = drawChartBase(canvasId);
  if (!base) return;
  const { ctx, width, height } = base;
  const pad = { top: 20, right: 18, bottom: 28, left: 26 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);

  ctx.strokeStyle = "#d5dfef";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = pad.top + (h / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#0ea5e9";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  values.forEach((v, idx) => {
    const x = pad.left + (w * idx) / Math.max(values.length - 1, 1);
    const y = pad.top + h - ((v - min) / range) * h;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#0ea5e9";
  values.forEach((v, idx) => {
    const x = pad.left + (w * idx) / Math.max(values.length - 1, 1);
    const y = pad.top + h - ((v - min) / range) * h;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#5d6d87";
  ctx.font = "11px Chivo";
  ctx.textAlign = "center";
  labels.forEach((label, idx) => {
    const x = pad.left + (w * idx) / Math.max(labels.length - 1, 1);
    ctx.fillText(label, x, height - 8);
  });
}

function drawBarChart(canvasId, labels, values) {
  if (!values.length) {
    drawNoData(canvasId, "暂无训练负荷数据");
    return;
  }

  const base = drawChartBase(canvasId);
  if (!base) return;
  const { ctx, width, height } = base;
  const pad = { top: 20, right: 16, bottom: 30, left: 30 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const max = Math.max(...values, 1);
  const barW = w / values.length - 8;

  ctx.strokeStyle = "#d5dfef";
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + h);
  ctx.lineTo(width - pad.right, pad.top + h);
  ctx.stroke();

  values.forEach((v, idx) => {
    const x = pad.left + idx * (barW + 8);
    const barH = (v / max) * h;
    const y = pad.top + h - barH;

    ctx.fillStyle = "#7dd3fc";
    ctx.fillRect(x, y, barW, barH);

    ctx.fillStyle = "#5d6d87";
    ctx.font = "11px Chivo";
    ctx.textAlign = "center";
    ctx.fillText(labels[idx], x + barW / 2, height - 8);
  });
}

function renderOverview() {
  if (!state.today) return;

  setText("metric-next-training", state.today.next_training_time || "--");
  setText("metric-action", state.today.today_recommendation?.action || "--");
  setText("metric-workout-count", String(state.workouts.length));

  const ratio = Number(state.today.budget_status?.ratio || 0);
  setText("metric-budget-ratio", `${(ratio * 100).toFixed(1)}%`);

  if (state.goalProgress) {
    setText("metric-goal-type", mapGoalType(state.goalProgress.goal_type));
    setText(
      "metric-weight-gap",
      `${Math.abs(Number(state.goalProgress.weight_gap_kg || 0)).toFixed(1)}kg`,
    );
    setText(
      "metric-muscle-gap",
      state.goalProgress.muscle_gap_kg == null
        ? "--"
        : `${Math.abs(Number(state.goalProgress.muscle_gap_kg)).toFixed(1)}kg`,
    );
    setText("metric-progress-label", state.goalProgress.progress_label || "--");
  }

  const readinessData = [...state.readiness].slice(0, 7).reverse();
  const readinessLabels = readinessData.map((x) => String(x.log_date).slice(5));
  const readinessValues = readinessData.map(calcReadinessScore);
  drawLineChart("chart-readiness", readinessLabels, readinessValues);

  const workoutData = [...state.workouts].slice(0, 7).reverse();
  const workoutLabels = workoutData.map((x) =>
    String(x.training_date).slice(5),
  );
  const workoutValues = workoutData.map((session) =>
    (session.exercise_sets || []).reduce(
      (sum, s) =>
        sum +
        Number(s.sets || 0) * Number(s.reps || 0) * Number(s.weight_kg || 0),
      0,
    ),
  );
  drawBarChart("chart-workload", workoutLabels, workoutValues);
}

async function loadAll() {
  try {
    await Promise.all([
      loadToday(),
      loadPlan(),
      loadWorkouts(),
      loadReadiness(),
      loadNutrition(),
      loadBodyMetrics(),
      loadOcrStatus(),
      loadKnowledge(),
      loadProposals(),
      loadAuditLogs(),
      loadGoalConfig(),
      loadGoalProgress(),
    ]);
  } catch (err) {
    setBadge("badge-connection", "API Offline", "error");
    throw err;
  }
}

async function approveProposal(id) {
  try {
    await postJson(`/api/v1/change-proposals/${id}/approve`, {
      approved_by: "user",
      confirm_token: "web-confirm",
    });
    await Promise.all([loadProposals(), loadAuditLogs(), loadToday()]);
    showToast(`提议 #${id} 已同意并写入`, "success");
  } catch (err) {
    const msg = getErrorMessage(err);
    showToast(`同意提议失败: ${msg}`, "error");
    console.error(err);
  }
}

async function onPlanSubmit(e) {
  await runFormTask(
    e,
    {
      loadingText: "保存计划中...",
      successText: "训练计划已保存",
      errorText: "训练计划保存失败",
    },
    async (fd) => {
      const cycleLengthDays = Number(fd.get("cycle_length_days") || 7);
      const normalizedPlan = normalizeCyclePlan(
        cycleLengthDays,
        state.editableCyclePlan,
      );

      await postJson(
        "/api/v1/plan",
        {
          cycle_week: Number(fd.get("cycle_week")),
          next_training_time: fromDatetimeLocalValue(
            fd.get("next_training_time"),
          ),
          cycle_length_days: cycleLengthDays,
          cycle_start_date: String(fd.get("cycle_start_date")),
          cycle_day_plan: normalizedPlan,
          weekly_plan: deriveWeeklyPlan(normalizedPlan),
        },
        "PUT",
      );
      await Promise.all([loadPlan(), loadToday()]);
    },
  );
}

async function onWorkoutSubmit(e) {
  await runFormTask(
    e,
    {
      loadingText: "保存训练中...",
      successText: "训练记录已保存",
      errorText: "训练记录保存失败",
    },
    async (fd, form) => {
      await postJson("/api/v1/workouts", {
        training_date: fd.get("training_date"),
        focus_area: fd.get("focus_area"),
        notes: "",
        exercise_sets: [
          {
            exercise_name: fd.get("exercise_name"),
            equipment: fd.get("equipment"),
            sets: Number(fd.get("sets")),
            reps: Number(fd.get("reps")),
            weight_kg: Number(fd.get("weight_kg")),
            rpe: Number(fd.get("rpe")),
          },
        ],
      });
      form.reset();
      await Promise.all([loadWorkouts(), loadToday()]);
    },
  );
}

async function onReadinessSubmit(e) {
  await runFormTask(
    e,
    {
      loadingText: "保存恢复数据中...",
      successText: "恢复记录已保存",
      errorText: "恢复记录保存失败",
    },
    async (fd, form) => {
      await postJson("/api/v1/readiness", {
        log_date: fd.get("log_date"),
        sleep_hours: Number(fd.get("sleep_hours")),
        fatigue_score: Number(fd.get("fatigue_score")),
        pain_score: Number(fd.get("pain_score")),
        stress_score: Number(fd.get("stress_score")),
      });
      form.reset();
      await Promise.all([loadReadiness(), loadToday()]);
    },
  );
}

async function onNutritionSubmit(e) {
  await runFormTask(
    e,
    {
      loadingText: "保存饮食中...",
      successText: "饮食记录已保存",
      errorText: "饮食记录保存失败",
    },
    async (fd, form) => {
      await postJson("/api/v1/nutrition", {
        log_date: fd.get("log_date"),
        calories_kcal: Number(fd.get("calories_kcal")),
        protein_g: Number(fd.get("protein_g")),
        carbs_g: Number(fd.get("carbs_g")),
        fat_g: Number(fd.get("fat_g")),
        water_liters: Number(fd.get("water_liters")),
        body_weight_kg: fd.get("body_weight_kg")
          ? Number(fd.get("body_weight_kg"))
          : null,
        body_fat_rate_pct: fd.get("body_fat_rate_pct")
          ? Number(fd.get("body_fat_rate_pct"))
          : null,
        muscle_weight_kg: fd.get("muscle_weight_kg")
          ? Number(fd.get("muscle_weight_kg"))
          : null,
        waist_cm: fd.get("waist_cm") ? Number(fd.get("waist_cm")) : null,
        notes: "",
      });
      form.reset();
      await Promise.all([loadNutrition(), loadGoalProgress()]);
    },
  );
}

const MAX_INBODY_UPLOAD_BYTES = 8 * 1024 * 1024;

function setInbodyStatus(text) {
  const el = qs("inbody-ocr-status");
  if (!el) return;
  el.textContent = text;
}

function setInbodyPreviewFromFile(file) {
  const img = qs("inbody-preview");
  if (!img) return;

  const oldUrl = img.dataset.objectUrl;
  if (oldUrl) {
    URL.revokeObjectURL(oldUrl);
  }

  const url = URL.createObjectURL(file);
  img.src = url;
  img.dataset.objectUrl = url;
  img.classList.add("show");
}

function setInbodyFileName(name) {
  const el = qs("inbody-file-name");
  if (!el) return;
  el.textContent = name ? String(name) : "未选择文件";
}

async function runInbodyOcrUpload(file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith("image/")) {
    showToast("仅支持图片文件（jpeg/png/webp 等）", "warn");
    return;
  }
  if (file.size > MAX_INBODY_UPLOAD_BYTES) {
    showToast("图片过大（建议小于 8MB）", "warn");
    return;
  }

  const form = qs("body-metric-form");
  const capturedOn = form?.log_date?.value ? String(form.log_date.value) : "";

  setInbodyPreviewFromFile(file);
  setInbodyFileName(file.name);
  setInbodyStatus("上传并识别中...");

  try {
    const fd = new FormData();
    fd.append("file", file, file.name);
    if (capturedOn) fd.append("captured_on", capturedOn);
    fd.append("title", `InBody ${capturedOn || toLocalIsoDate(new Date())}`);
    fd.append("tags", "inbody,ocr");

    const data = await postFormData("/api/v1/body-metrics/ocr", fd);

    const status = String(data.status || "");
    const message = String(data.message || "");
    if (status === "ok") setInbodyStatus("OCR 成功：已回写到体测记录");
    else if (status === "needs_review")
      setInbodyStatus(`OCR 需要校对：${message || "请检查表单"}`);
    else if (status === "not_configured")
      setInbodyStatus("OCR 未配置：将走手工校对");
    else if (status === "not_supported")
      setInbodyStatus("OCR 不支持：该模型/端点可能不支持图片");
    else setInbodyStatus(`OCR 失败：${message || "未知错误"}`);

    if (form && data.metric) {
      form.log_date.value = String(data.metric.log_date || capturedOn || "");
      form.body_weight_kg.value = data.metric.body_weight_kg ?? "";
      form.body_fat_rate_pct.value = data.metric.body_fat_rate_pct ?? "";
      form.muscle_weight_kg.value = data.metric.muscle_weight_kg ?? "";
      form.source_asset_id.value =
        data.asset?.id ?? data.metric.source_asset_id ?? "";
    }

    await Promise.all([loadBodyMetrics(), loadKnowledge(), loadGoalProgress()]);
  } catch (err) {
    setInbodyStatus(`上传或识别失败：${getErrorMessage(err)}`);
    showToast(`上传或识别失败: ${getErrorMessage(err)}`, "error");
    console.error(err);
  }
}

async function onBodyMetricSubmit(e) {
  await runFormTask(
    e,
    {
      loadingText: "保存体测中...",
      successText: "体测记录已保存",
      errorText: "体测记录保存失败",
    },
    async (fd) => {
      await postJson("/api/v1/body-metrics", {
        log_date: String(fd.get("log_date")),
        body_weight_kg: fd.get("body_weight_kg")
          ? Number(fd.get("body_weight_kg"))
          : null,
        body_fat_rate_pct: fd.get("body_fat_rate_pct")
          ? Number(fd.get("body_fat_rate_pct"))
          : null,
        muscle_weight_kg: fd.get("muscle_weight_kg")
          ? Number(fd.get("muscle_weight_kg"))
          : null,
        source_asset_id: fd.get("source_asset_id")
          ? Number(fd.get("source_asset_id"))
          : null,
      });
      await Promise.all([loadBodyMetrics(), loadGoalProgress()]);
    },
  );
}

function bindBodyMetricUi() {
  const pickBtn = qs("inbody-pick-btn");
  const fileInput = qs("inbody-file-input");
  const dropzone = qs("inbody-dropzone");
  const form = qs("body-metric-form");

  if (pickBtn && fileInput) {
    pickBtn.addEventListener("click", () => {
      fileInput.value = "";
      fileInput.click();
    });
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) {
        runInbodyOcrUpload(file);
      }
    });
  }

  if (dropzone && fileInput) {
    const stop = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    };

    dropzone.addEventListener("click", () => {
      fileInput.value = "";
      fileInput.click();
    });
    dropzone.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        fileInput.value = "";
        fileInput.click();
      }
    });

    ["dragenter", "dragover"].forEach((name) => {
      dropzone.addEventListener(name, (ev) => {
        stop(ev);
        dropzone.classList.add("is-dragover");
      });
    });
    ["dragleave", "drop"].forEach((name) => {
      dropzone.addEventListener(name, (ev) => {
        stop(ev);
        dropzone.classList.remove("is-dragover");
      });
    });

    dropzone.addEventListener("drop", (ev) => {
      stop(ev);
      const dt = ev.dataTransfer;
      const file = dt && dt.files && dt.files[0];
      if (file) {
        fileInput.value = "";
        runInbodyOcrUpload(file);
      }
    });
  }

  if (form) {
    if (!form.log_date.value) {
      form.log_date.value = toLocalIsoDate(new Date());
    }
    form.addEventListener("submit", onBodyMetricSubmit);
  }
}

async function onKnowledgeSubmit(e) {
  await runFormTask(
    e,
    {
      loadingText: "保存知识条目中...",
      successText: "知识条目已保存",
      errorText: "知识条目保存失败",
    },
    async (fd, form) => {
      await postJson("/api/v1/knowledge-assets", {
        asset_type: fd.get("asset_type"),
        title: fd.get("title"),
        source_path: fd.get("source_path"),
        tags: String(fd.get("tags") || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        captured_on: fd.get("captured_on") || null,
      });
      form.reset();
      await loadKnowledge();
    },
  );
}

async function onProposalSubmit(e) {
  await runFormTask(
    e,
    {
      loadingText: "创建提议中...",
      successText: "提议已创建",
      errorText: "提议创建失败",
    },
    async (fd) => {
      await postJson("/api/v1/change-proposals", {
        field_path: fd.get("field_path"),
        new_value: fd.get("new_value"),
        reason: fd.get("reason"),
        initiator: "ai",
      });
      await loadProposals();
    },
  );
}

async function onAiSubmit(e) {
  await runFormTask(
    e,
    {
      loadingText: "获取建议中...",
      successText: "AI 建议已更新",
      errorText: "获取 AI 建议失败",
    },
    async (fd) => {
      const data = await postJson("/api/v1/ai/recommendation", {
        user_query: fd.get("user_query"),
        route_preference: fd.get("route_preference"),
      });
      const routeLevel =
        data.route_tier === "l2"
          ? "warn"
          : data.route_tier === "l1"
            ? "ok"
            : "default";
      setBadge(
        "badge-route",
        `路由 ${String(data.route_tier).toUpperCase()}`,
        routeLevel,
      );
      qs("ai-response").textContent = JSON.stringify(data, null, 2);
      await loadToday();
    },
  );
}

async function onGoalSubmit(e) {
  await runFormTask(
    e,
    {
      loadingText: "保存目标中...",
      successText: "目标配置已保存",
      errorText: "目标配置保存失败",
    },
    async (fd) => {
      await postJson(
        "/api/v1/goals",
        {
          goal_type: String(fd.get("goal_type")),
          start_date: String(fd.get("start_date")),
          target_date: String(fd.get("target_date")),
          start_weight_kg: Number(fd.get("start_weight_kg")),
          target_weight_kg: Number(fd.get("target_weight_kg")),
          start_muscle_kg: fd.get("start_muscle_kg")
            ? Number(fd.get("start_muscle_kg"))
            : null,
          target_muscle_kg: fd.get("target_muscle_kg")
            ? Number(fd.get("target_muscle_kg"))
            : null,
          latest_muscle_kg: fd.get("latest_muscle_kg")
            ? Number(fd.get("latest_muscle_kg"))
            : null,
        },
        "PUT",
      );

      await Promise.all([loadGoalConfig(), loadGoalProgress()]);
    },
  );
}

window.addEventListener("DOMContentLoaded", async () => {
  initPageMenu();

  await fetchNetworkDateInfo();
  initCalendarYearOptions();
  setCalendarViewToCurrentMonth();

  qs("plan-form").addEventListener("submit", onPlanSubmit);
  qs("workout-form").addEventListener("submit", onWorkoutSubmit);
  qs("readiness-form").addEventListener("submit", onReadinessSubmit);
  qs("nutrition-form").addEventListener("submit", onNutritionSubmit);
  qs("proposal-form").addEventListener("submit", onProposalSubmit);
  qs("ai-form").addEventListener("submit", onAiSubmit);
  qs("goal-form").addEventListener("submit", onGoalSubmit);
  qs("goal-edit-btn").addEventListener("click", jumpToGoalForm);
  qs("regen-cycle-btn").addEventListener("click", regenerateCycleByLength);
  qs("preset-2week-btn").addEventListener("click", applyTwoWeekPreset);
  qs("cycle-training-only").addEventListener("change", (e) => {
    state.showTrainingOnly = Boolean(e.target.checked);
    renderCycleEditor();
  });
  qs("calendar-prev-btn").addEventListener("click", () =>
    shiftCalendarMonth(-1),
  );
  qs("calendar-next-btn").addEventListener("click", () =>
    shiftCalendarMonth(1),
  );
  qs("calendar-month-title").addEventListener("click", () => {
    setCalendarViewToCurrentMonth();
    renderTrainingCalendar();
  });
  qs("calendar-jump-btn").addEventListener("click", jumpCalendarToSelection);
  qs("calendar-year-select").addEventListener(
    "change",
    jumpCalendarToSelection,
  );
  qs("calendar-month-select").addEventListener(
    "change",
    jumpCalendarToSelection,
  );

  bindBodyMetricUi();

  try {
    await loadAll();
  } catch (err) {
    qs("today-content").innerHTML =
      `<p class='muted'>加载失败: ${getErrorMessage(err)}</p>`;
    showToast(`初始化加载失败: ${getErrorMessage(err)}`, "error");
  }

  window.addEventListener("resize", () => {
    renderOverview();
    renderTrainingCalendar();
    renderBodyMetricCharts();
  });

  window.setInterval(
    async () => {
      await fetchNetworkDateInfo();
      if (state.calendarInstance) {
        state.calendarInstance.setOption("now", getCurrentDateBase());
      }
      renderTrainingCalendar();
    },
    10 * 60 * 1000,
  );
});

window.approveProposal = approveProposal;
