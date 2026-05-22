import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Plus, Trash2, Tag, X } from "lucide-react";

const STORAGE_KEY = "weekly-schedule-app-data-v3";
const priorityWeight = { S: 4, A: 3, B: 2, C: 1 };
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(iso) {
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function daysBetween(startISO, endISO) {
  const start = parseDate(startISO);
  const end = parseDate(endISO);
  if (!start || !end) return 0;
  return Math.round((end - start) / 86400000);
}

function formatDate(iso) {
  const date = parseDate(iso);
  if (!date) return "未设置";
  return `${date.getMonth() + 1}/${date.getDate()} ${weekdays[date.getDay()]}`;
}

function buildDateRange(startISO, endISO) {
  const start = parseDate(startISO);
  const end = parseDate(endISO);
  if (!start || !end || end < start) return [];

  const result = [];
  let current = start;
  while (current <= end && result.length < 60) {
    result.push(toISODate(current));
    current = addDays(current, 1);
  }
  return result;
}

const today = new Date();
const defaultStart = toISODate(today);
const defaultEnd = toISODate(addDays(today, 6));

function makeDefaultAvailability(days) {
  return Object.fromEntries(days.map((day) => [day, 4]));
}

function loadSavedData() {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return {
      planningStart: data.planningStart || defaultStart,
      planningEnd: data.planningEnd || defaultEnd,
      selectedDate: data.selectedDate || defaultStart,
      tasks: Array.isArray(data.tasks) ? data.tasks : [],
      availability: data.availability && typeof data.availability === "object" ? data.availability : {},
    };
  } catch (error) {
    console.warn("读取本地保存数据失败：", error);
    return null;
  }
}

function saveData(data) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("保存本地数据失败：", error);
  }
}

function isVisibleOnDate(task, dateISO) {
  if (!task.deadline) return true;
  return dateISO <= task.deadline;
}

function deadlineText(task, dateISO) {
  if (!task.deadline) return "无截止日";
  const daysLeft = daysBetween(dateISO, task.deadline);
  if (daysLeft < 0) return "已过截止日";
  if (daysLeft === 0) return "今天截止";
  if (daysLeft === 1) return "明天截止";
  return `距截止 ${daysLeft} 天`;
}

function getTaskQuadrant(task, dateISO) {
  const daysLeft = Math.max(0, daysBetween(dateISO, task.deadline));
  const isImportant = priorityWeight[task.priority] >= 3;
  const isUrgent = task.daily || daysLeft <= 1;

  if (isImportant && isUrgent) return "importantUrgent";
  if (isImportant && !isUrgent) return "importantNotUrgent";
  if (!isImportant && isUrgent) return "notImportantUrgent";
  return "notImportantNotUrgent";
}

function isDailyDoneOnDate(task, dateISO) {
  return (task.completedDates || []).includes(dateISO);
}

function isTaskDoneForDate(task, dateISO) {
  if (task.daily) return isDailyDoneOnDate(task, dateISO);
  return Boolean(task.done);
}

function getAllActiveTasksForDate(tasks, dateISO) {
  return tasks.filter((task) => {
    if (!isVisibleOnDate(task, dateISO)) return false;
    return !isTaskDoneForDate(task, dateISO);
  });
}

function buildSuggestedSchedule(tasks, availability, days) {
  const schedule = Object.fromEntries(days.map((day) => [day, []]));
  const overflow = [];

  tasks.forEach((task) => {
    if (!task.daily && task.done) return;

    const validDays = days.filter((day) => isVisibleOnDate(task, day));
    if (validDays.length === 0) return;

    if (task.daily) {
      validDays.forEach((day) => {
        if (!isDailyDoneOnDate(task, day)) {
          schedule[day].push({ ...task, instanceDate: day, note: "每日任务" });
        }
      });
      return;
    }

    let placed = false;
    for (const day of validDays) {
      const used = schedule[day].reduce((sum, item) => sum + Number(item.estimate || 0), 0);
      const limit = Number(availability[day] || 0);

      if (used + Number(task.estimate || 0) <= limit) {
        schedule[day].push({ ...task, instanceDate: day, note: `建议 ${formatDate(day)} 做` });
        placed = true;
        break;
      }
    }

    if (!placed) {
      const fallback = validDays[validDays.length - 1];
      schedule[fallback].push({ ...task, instanceDate: fallback, note: "超出可用时间，需调整" });
      overflow.push(task);
    }
  });

  days.forEach((day) => {
    schedule[day].sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);
  });

  return { schedule, overflow };
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f6f7fb",
    color: "#172033",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
    padding: 32,
  },
  shell: { maxWidth: 1280, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, marginBottom: 24 },
  card: { background: "#fff", borderRadius: 24, padding: 20, marginBottom: 20, boxShadow: "0 8px 28px rgba(15,23,42,.07)" },
  badge: { display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 999, background: "#fff", color: "#475569", fontSize: 14, boxShadow: "0 1px 8px rgba(15,23,42,.06)" },
  title: { fontSize: 38, margin: "12px 0 8px", letterSpacing: "-.04em" },
  subtitle: { margin: 0, color: "#64748b" },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 16 },
  sectionTitle: { margin: 0, fontSize: 20, fontWeight: 700 },
  sectionText: { margin: "4px 0 0", color: "#64748b", fontSize: 14 },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #dbe3ef", borderRadius: 14, padding: "11px 12px", fontSize: 14, outline: "none", background: "#fff", color: "#172033" },
  textarea: { width: "100%", boxSizing: "border-box", border: "1px solid #dbe3ef", borderRadius: 14, padding: "11px 12px", fontSize: 14, outline: "none", minHeight: 96, resize: "vertical", lineHeight: 1.5 },
  labelBox: { border: "1px solid #e2e8f0", borderRadius: 16, padding: 12, background: "#fbfdff" },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 12, alignItems: "end" },
  gridAuto: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 12 },
  formGrid: { display: "grid", gridTemplateColumns: "2fr 1fr .7fr 1.1fr .8fr 1fr auto", gap: 10, alignItems: "center" },
  primary: { border: "none", borderRadius: 14, background: "#172033", color: "#fff", padding: "11px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center" },
  smallButton: { border: "none", borderRadius: 12, background: "#f1f5f9", color: "#475569", padding: "8px 10px", fontSize: 13, cursor: "pointer" },
  dayButtons: { display: "flex", flexWrap: "wrap", gap: 8 },
  dayButton: { border: "none", borderRadius: 14, padding: "10px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  quadrantGrid: { display: "grid", gridTemplateColumns: "80px 1fr 1fr", gridTemplateRows: "auto 1fr 1fr auto", gap: 10 },
  quadrantCell: { minHeight: 260, border: "1px solid #e2e8f0", borderRadius: 24, padding: 16 },
  taskCard: { border: "1px solid #e2e8f0", background: "#fff", borderRadius: 18, padding: 12, marginBottom: 10, boxShadow: "0 4px 14px rgba(15,23,42,.05)" },
  taskMeta: { display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 12 },
  priority: { borderRadius: 999, background: "#172033", color: "#fff", padding: "3px 8px", fontSize: 12, fontWeight: 800 },
  iconButton: { border: "none", background: "#f1f5f9", color: "#334155", borderRadius: 10, padding: 6, cursor: "pointer", display: "inline-flex" },
  weekGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 },
  dayColumn: { background: "#fff", borderRadius: 22, padding: 14, boxShadow: "0 8px 28px rgba(15,23,42,.07)", minHeight: 260 },
};

function TaskCard({ task, dateISO, onToggleDone, onRemove, onOpen }) {
  const subtasks = task.subtasks || [];
  const finished = subtasks.filter((item) => item.done).length;

  return (
    <div style={{ ...styles.taskCard, cursor: onOpen ? "pointer" : "default" }} onClick={() => onOpen?.(task.id)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={styles.taskMeta}>
          <Tag size={16} />
          {task.type || "未分类"}
          {task.daily ? " · 每日" : ""}
        </div>
        <span style={styles.priority}>{task.priority}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35, margin: "8px 0 6px" }}>{task.title}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: "#64748b", fontSize: 12 }}>
        <span>{task.daily ? "今日待完成" : deadlineText(task, dateISO)} · {task.estimate}h · 细分 {finished}/{subtasks.length}</span>
        <span style={{ display: "flex", gap: 6 }}>
          <button style={styles.iconButton} onClick={(event) => { event.stopPropagation(); onToggleDone(task.id, dateISO); }} title={task.daily ? "完成今天" : "完成任务"}>
            <CheckCircle2 size={16} />
          </button>
          <button style={styles.iconButton} onClick={(event) => { event.stopPropagation(); onRemove(task.id); }} title="删除">
            <Trash2 size={16} />
          </button>
        </span>
      </div>
    </div>
  );
}

function QuadrantChart({ dateISO, tasks, onToggleDone, onRemove, onOpenTask }) {
  const activeTasks = getAllActiveTasksForDate(tasks, dateISO);
  const grouped = { importantNotUrgent: [], importantUrgent: [], notImportantNotUrgent: [], notImportantUrgent: [] };

  activeTasks.forEach((task) => {
    grouped[getTaskQuadrant(task, dateISO)].push(task);
  });

  const cells = [
    { key: "importantNotUrgent", name: "重要但不紧急", hint: "提前推进，避免变成紧急任务", bg: "#eef6ff" },
    { key: "importantUrgent", name: "重要且紧急", hint: "今天优先处理", bg: "#fff1f2" },
    { key: "notImportantNotUrgent", name: "不重要且不紧急", hint: "可以压缩、延后或取消", bg: "#f8fafc" },
    { key: "notImportantUrgent", name: "不重要但紧急", hint: "快速完成，不要占太久", bg: "#fff7ed" },
  ];

  const renderCell = (cell) => (
    <div key={cell.key} style={{ ...styles.quadrantCell, background: cell.bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{cell.name}</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>{cell.hint}</div>
        </div>
        <span style={styles.badge}>{grouped[cell.key].length}</span>
      </div>
      {grouped[cell.key].length === 0 ? (
        <div style={{ color: "#94a3b8", fontSize: 14 }}>暂无任务</div>
      ) : (
        grouped[cell.key].map((task) => (
          <TaskCard key={`${dateISO}-${cell.key}-${task.id}`} task={task} dateISO={dateISO} onToggleDone={onToggleDone} onRemove={onRemove} onOpen={onOpenTask} />
        ))
      )}
    </div>
  );

  return (
    <section style={styles.card}>
      <div style={styles.sectionHeader}>
        <div>
          <h2 style={styles.sectionTitle}>{formatDate(dateISO)} 四象限任务图</h2>
          <p style={styles.sectionText}>普通任务会从规划开始显示到截止日；每日任务每天独立完成。</p>
        </div>
        <div style={styles.badge}>当前 {activeTasks.length} 个任务</div>
      </div>
      <div style={styles.quadrantGrid}>
        <div />
        <div style={{ textAlign: "center", color: "#64748b", fontWeight: 700 }}>截止时间较远</div>
        <div style={{ textAlign: "center", color: "#64748b", fontWeight: 700 }}>截止时间较近</div>
        <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", textAlign: "center", color: "#64748b", fontWeight: 700 }}>重要程度高</div>
        {cells.slice(0, 2).map(renderCell)}
        <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", textAlign: "center", color: "#64748b", fontWeight: 700 }}>重要程度低</div>
        {cells.slice(2, 4).map(renderCell)}
        <div />
        <div />
        <div style={{ textAlign: "right", color: "#64748b", fontWeight: 700 }}>紧急程度升高 →</div>
      </div>
    </section>
  );
}

function TaskDetailModal({ task, onClose, onToggleSubtask }) {
  if (!task) return null;
  const subtasks = task.subtasks || [];
  const finished = subtasks.filter((item) => item.done).length;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.38)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 50 }} onClick={onClose}>
      <div style={{ width: "min(620px, 100%)", maxHeight: "80vh", overflow: "auto", background: "#fff", borderRadius: 28, padding: 24, boxShadow: "0 24px 80px rgba(15,23,42,.25)" }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={styles.taskMeta}><Tag size={16} />{task.type || "未分类"} · {task.priority}级</div>
            <h2 style={{ margin: "8px 0 4px", fontSize: 26 }}>{task.title}</h2>
            <p style={{ margin: 0, color: "#64748b" }}>截止：{formatDate(task.deadline)} · 预计 {task.estimate}h · 细分 {finished}/{subtasks.length}</p>
          </div>
          <button style={styles.iconButton} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ marginTop: 22 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 18 }}>细分任务</h3>
          {subtasks.length === 0 ? (
            <div style={{ color: "#94a3b8", fontSize: 14 }}>这个任务还没有设置细分任务。</div>
          ) : (
            subtasks.map((subtask) => (
              <label key={subtask.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, border: "1px solid #e2e8f0", borderRadius: 16, marginBottom: 10, background: subtask.done ? "#f8fafc" : "#fff", color: subtask.done ? "#94a3b8" : "#172033", textDecoration: subtask.done ? "line-through" : "none", cursor: "pointer" }}>
                <input type="checkbox" checked={subtask.done} onChange={() => onToggleSubtask(task.id, subtask.id)} />
                <span>{subtask.title}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function WeeklyScheduleApp() {
  const saved = useMemo(() => loadSavedData(), []);
  const [planningStart, setPlanningStart] = useState(saved?.planningStart || defaultStart);
  const [planningEnd, setPlanningEnd] = useState(saved?.planningEnd || defaultEnd);
  const planningDays = useMemo(() => buildDateRange(planningStart, planningEnd), [planningStart, planningEnd]);

  const [tasks, setTasks] = useState(saved?.tasks || []);
  const [availability, setAvailability] = useState(saved?.availability || makeDefaultAvailability(planningDays));
  const [selectedDate, setSelectedDate] = useState(saved?.selectedDate || planningDays[0] || defaultStart);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [form, setForm] = useState({ title: "", type: "", priority: "A", deadline: planningEnd, estimate: 1, daily: false, subtasksText: "" });

  useEffect(() => {
    setAvailability((previous) => {
      const next = {};
      planningDays.forEach((day) => {
        next[day] = previous[day] ?? 4;
      });
      return next;
    });
    setSelectedDate((previous) => (planningDays.includes(previous) ? previous : planningDays[0] || planningStart));
  }, [planningDays, planningStart]);

  useEffect(() => {
    saveData({ planningStart, planningEnd, selectedDate, tasks, availability });
  }, [planningStart, planningEnd, selectedDate, tasks, availability]);

  const { schedule, overflow } = useMemo(() => buildSuggestedSchedule(tasks, availability, planningDays), [tasks, availability, planningDays]);

  const completionStats = useMemo(() => {
    let total = 0;
    let done = 0;
    tasks.forEach((task) => {
      if (task.daily) {
        const validDays = planningDays.filter((day) => isVisibleOnDate(task, day));
        total += validDays.length;
        done += validDays.filter((day) => isDailyDoneOnDate(task, day)).length;
      } else {
        total += 1;
        if (task.done) done += 1;
      }
    });
    return { total, done, rate: Math.round((done / Math.max(total, 1)) * 100) };
  }, [tasks, planningDays]);

  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const invalidRange = planningDays.length === 0;

  const addTask = () => {
    if (!form.title.trim()) return;
    const subtasks = form.subtasksText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((title) => ({ id: crypto.randomUUID(), title, done: false }));

    setTasks((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        title: form.title.trim(),
        type: form.type.trim() || "未分类",
        priority: form.priority,
        deadline: form.deadline,
        estimate: Number(form.estimate) || 1,
        daily: form.daily,
        done: false,
        completedDates: [],
        subtasks,
      },
    ]);

    setForm({ title: "", type: "", priority: "A", deadline: planningEnd, estimate: 1, daily: false, subtasksText: "" });
  };

  const removeTask = (id) => {
    setTasks((previous) => previous.filter((task) => task.id !== id));
    if (selectedTaskId === id) setSelectedTaskId(null);
  };

  const toggleDone = (id, dateISO) => {
    setTasks((previous) => previous.map((task) => {
      if (task.id !== id) return task;
      if (task.daily) {
        const dates = task.completedDates || [];
        const alreadyDone = dates.includes(dateISO);
        return { ...task, completedDates: alreadyDone ? dates.filter((day) => day !== dateISO) : [...dates, dateISO] };
      }
      return { ...task, done: !task.done };
    }));
  };

  const toggleSubtask = (taskId, subtaskId) => {
    setTasks((previous) => previous.map((task) => {
      if (task.id !== taskId) return task;
      return {
        ...task,
        subtasks: (task.subtasks || []).map((subtask) => subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask),
      };
    }));
  };

  const updateAvailability = (day, value) => {
    setAvailability((previous) => ({ ...previous, [day]: Number(value) || 0 }));
  };

  const clearSavedData = () => {
    if (!window.confirm("确定要清空所有任务和本地保存数据吗？")) return;
    window.localStorage.removeItem(STORAGE_KEY);
    const days = buildDateRange(defaultStart, defaultEnd);
    setPlanningStart(defaultStart);
    setPlanningEnd(defaultEnd);
    setTasks([]);
    setAvailability(makeDefaultAvailability(days));
    setSelectedDate(defaultStart);
    setSelectedTaskId(null);
    setForm({ title: "", type: "", priority: "A", deadline: defaultEnd, estimate: 1, daily: false, subtasksText: "" });
  };

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <div style={styles.badge}><CalendarDays size={16} />日历任务周期</div>
            <h1 style={styles.title}>每周任务排程板</h1>
            <p style={styles.subtitle}>用真实日期管理任务周期和截止时间。长期任务可以设置到周期之外。</p>
          </div>
          <div style={styles.card}>
            <div style={{ color: "#64748b", fontSize: 14 }}>完成进度</div>
            <div style={{ fontSize: 34, fontWeight: 800 }}>{completionStats.rate}%</div>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>{completionStats.done}/{completionStats.total}</div>
            <button style={styles.smallButton} onClick={clearSavedData}>清空本地数据</button>
          </div>
        </header>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div><h2 style={styles.sectionTitle}>规划周期</h2><p style={styles.sectionText}>任务截止日可以超出这个周期。</p></div>
            <div style={styles.badge}>{invalidRange ? "日期范围无效" : `${formatDate(planningDays[0])} → ${formatDate(planningDays[planningDays.length - 1])}`}</div>
          </div>
          <div style={styles.grid3}>
            <label style={styles.labelBox}><div style={{ fontWeight: 700, marginBottom: 8 }}>开始日期</div><input style={styles.input} type="date" value={planningStart} onChange={(event) => setPlanningStart(event.target.value)} /></label>
            <label style={styles.labelBox}><div style={{ fontWeight: 700, marginBottom: 8 }}>结束日期</div><input style={styles.input} type="date" value={planningEnd} onChange={(event) => setPlanningEnd(event.target.value)} /></label>
            <div style={styles.labelBox}><div style={{ fontWeight: 700, marginBottom: 8 }}>当前日历</div><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{planningDays.map((day) => <span key={day} style={{ ...styles.badge, boxShadow: "none", background: "#f1f5f9" }}>{formatDate(day)}</span>)}</div></div>
          </div>
        </section>

        {!invalidRange && <>
          <section style={styles.card}>
            <div style={styles.sectionHeader}><div><h2 style={styles.sectionTitle}>每天可用时间</h2><p style={styles.sectionText}>调整每天能投入的小时数。</p></div>{overflow.length > 0 && <div style={{ ...styles.badge, background: "#fff7ed", color: "#c2410c" }}>{overflow.length} 个任务超出可用时间</div>}</div>
            <div style={styles.gridAuto}>{planningDays.map((day) => <label key={day} style={styles.labelBox}><div style={{ fontWeight: 700, marginBottom: 8 }}>{formatDate(day)}</div><div style={{ display: "flex", gap: 8 }}><input style={styles.input} type="number" step="0.5" min="0" value={availability[day] ?? 4} onChange={(event) => updateAvailability(day, event.target.value)} /><span style={{ color: "#64748b", alignSelf: "center" }}>h</span></div></label>)}</div>
          </section>

          <section style={styles.card}>
            <div style={styles.sectionHeader}><div><h2 style={styles.sectionTitle}>添加任务</h2><p style={styles.sectionText}>细分任务一行写一个。点击任务卡片可以查看和勾选。</p></div></div>
            <div style={styles.formGrid}>
              <input style={styles.input} placeholder="任务名称" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              <input style={styles.input} placeholder="任务类型" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} />
              <select style={styles.input} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option>S</option><option>A</option><option>B</option><option>C</option></select>
              <input style={styles.input} type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} />
              <input style={styles.input} type="number" step="0.5" min="0.1" value={form.estimate} onChange={(event) => setForm({ ...form, estimate: event.target.value })} />
              <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#475569" }}><input type="checkbox" checked={form.daily} onChange={(event) => setForm({ ...form, daily: event.target.checked })} />每日任务</label>
              <button style={styles.primary} onClick={addTask}><Plus size={16} />添加</button>
            </div>
            <div style={{ marginTop: 12 }}><textarea style={styles.textarea} placeholder={"细分任务：一行写一个，例如\n改引言\n补注释\n检查参考文献"} value={form.subtasksText} onChange={(event) => setForm({ ...form, subtasksText: event.target.value })} /></div>
          </section>

          <section style={styles.card}>
            <div style={styles.sectionHeader}><div><h2 style={styles.sectionTitle}>选择日期</h2><p style={styles.sectionText}>普通任务从规划开始显示到截止日。每日任务每天独立完成。</p></div><div style={styles.dayButtons}>{planningDays.map((day) => <button key={day} onClick={() => setSelectedDate(day)} style={{ ...styles.dayButton, background: selectedDate === day ? "#172033" : "#e2e8f0", color: selectedDate === day ? "#fff" : "#334155" }}>{formatDate(day)}</button>)}</div></div>
          </section>

          <QuadrantChart dateISO={selectedDate} tasks={tasks} onToggleDone={toggleDone} onRemove={removeTask} onOpenTask={setSelectedTaskId} />

          <section style={styles.card}>
            <div style={styles.sectionHeader}><div><h2 style={styles.sectionTitle}>周期总览</h2><p style={styles.sectionText}>这里显示系统建议安排到哪一天做；四象限显示当天可处理的所有任务。</p></div></div>
            <div style={styles.weekGrid}>{planningDays.map((day) => {
              const total = (schedule[day] || []).reduce((sum, item) => sum + Number(item.estimate || 0), 0);
              const over = total > Number(availability[day] || 0);
              return <div key={day} style={styles.dayColumn}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><strong>{formatDate(day)}</strong><span style={{ borderRadius: 999, padding: "4px 8px", fontSize: 12, background: over ? "#ffe4e6" : "#f1f5f9", color: over ? "#be123c" : "#475569" }}>{total.toFixed(1)}h / {Number(availability[day] || 0).toFixed(1)}h</span></div>{(schedule[day] || []).length === 0 ? <div style={{ color: "#94a3b8", fontSize: 14 }}>暂无任务</div> : (schedule[day] || []).map((task) => <TaskCard key={`${day}-${task.id}`} task={task} dateISO={day} onToggleDone={toggleDone} onRemove={removeTask} onOpen={setSelectedTaskId} />)}</div>;
            })}</div>
          </section>
        </>}
      </div>
      <TaskDetailModal task={selectedTask} onClose={() => setSelectedTaskId(null)} onToggleSubtask={toggleSubtask} />
    </div>
  );
}

