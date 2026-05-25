"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Input,
  Modal,
  PasswordInput,
  Select,
  StatCard,
  StatusBadge,
  StatusTimeline,
  Table,
  Textarea
} from "@/components/ui";
import {
  addComment as apiAddComment,
  approveTask as apiApproveTask,
  changeTaskStatus as apiChangeTaskStatus,
  changeUserPassword,
  clearAuthSession,
  clockIn as apiClockIn,
  clockOut as apiClockOut,
  createProject as apiCreateProject,
  createTask as apiCreateTask,
  createUser as apiCreateUser,
  deleteUserAccount as apiDeleteUserAccount,
  deleteProject as apiDeleteProject,
  deleteTask as apiDeleteTask,
  fetchAppState,
  fetchClockHistory,
  fetchNotifications as apiFetchNotifications,
  fetchUserClockHistory,
  getStoredUser,
  login as apiLogin,
  logout as apiLogout,
  markNotificationAsRead as apiMarkNotificationAsRead,
  reassignTask as apiReassignTask,
  removeFailedStatus as apiRemoveFailedStatus,
  storeAuthSession,
  uploadTaskAttachment as apiUploadTaskAttachment,
  updateProject as apiUpdateProject,
  updateTask as apiUpdateTask,
  updateUser as apiUpdateUser
} from "@/lib/api";
import {
  AuditLog,
  ClockSession,
  Comment,
  HistoryItem,
  Notification,
  Project,
  ProjectStatus,
  Role,
  Status,
  TaskAttachment,
  Task,
  User
} from "@/lib/types";

type Page =
  | "admin-dashboard"
  | "developer-dashboard"
  | "projects"
  | "tasks"
  | "my-tasks"
  | "task-details"
  | "developers"
  | "audit-logs"
  | "settings"
  | "help";

type ModalState =
  | { name: "create-project" }
  | { name: "edit-project"; projectId: string }
  | { name: "create-task" }
  | { name: "edit-task"; taskId: string }
  | { name: "reassign-task"; taskId: string }
  | { name: "upload-task-file"; taskId: string }
  | { name: "create-developer" }
  | { name: "edit-developer"; userId: string }
  | { name: "change-password"; userId: string }
  | null;

type AdminProjectDashboardFilter = "all" | "active" | "completed";
type AdminTaskDashboardFilter = "all" | "pending" | "in-progress" | "failed" | "waiting-for-approval" | "complete";
type AdminDashboardView =
  | null
  | { kind: "projects"; title: string; filter: AdminProjectDashboardFilter }
  | { kind: "tasks"; title: string; filter: AdminTaskDashboardFilter }
  | { kind: "developers"; title: string };
type DeveloperDashboardTaskFilter = "all" | "pending" | "in-progress" | "failed" | "waiting-for-approval" | "complete";
type DeveloperDashboardView =
  | null
  | { kind: "tasks"; title: string; filter: DeveloperDashboardTaskFilter };

const statuses: Status[] = ["Pending", "In Progress", "Failed", "Waiting for Approval", "Complete"];
const projectStatuses: ProjectStatus[] = ["Not Started", "In Progress", "Completed", "Archived"];

function projectPayloadFromForm(form: FormData) {
  const payload = new FormData();
  payload.set("name", String(form.get("name") ?? ""));
  payload.set("description", String(form.get("description") ?? ""));
  payload.set("status", String(form.get("status") ?? "Not Started"));

  const file = form.get("attachment");
  if (file instanceof File && file.size > 0) {
    payload.set("attachment", file);
  }

  return payload;
}

function toDateInputValue(dateTime: string) {
  const parsed = Date.parse(dateTime.replace(" at ", ", "));
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10);
}

function parseDisplayDate(date: string) {
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

function isMissedDeadline(task: Task) {
  if (task.status === "Complete") return false;
  const dueDate = parseDisplayDate(task.dueDate);
  if (!dueDate) return false;
  dueDate.setHours(23, 59, 59, 999);
  return dueDate.getTime() < Date.now();
}

function DueDateWarning({ task, compact = false }: { task: Task; compact?: boolean }) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${compact ? "" : "text-sm"}`}>
      <span>{task.dueDate}</span>
      {isMissedDeadline(task) && <span className="font-medium text-amber-700">⚠ Overdue</span>}
    </span>
  );
}

function buildWorkHistorySections(sessions: ClockSession[], currentTimeMs: number) {
  const rows = sessions.map((session) => {
    const clockIn = new Date(session.clockInAt);
    const clockOut = session.clockOutAt ? new Date(session.clockOutAt) : null;
    const completedDuration = clockOut ? Math.max(0, clockOut.getTime() - clockIn.getTime()) : null;
    const liveDuration = clockOut ? null : Math.max(0, currentTimeMs - clockIn.getTime());

    return {
      id: session.id,
      date: formatWorkDate(session.clockInAt),
      clockIn: formatWorkTime(session.clockInAt),
      clockOut: clockOut ? formatWorkTime(session.clockOutAt as string) : "In progress",
      totalWorked: completedDuration !== null ? formatWorkedDuration(completedDuration) : liveDuration !== null ? formatWorkedDuration(liveDuration) : "In progress",
      completedDuration,
    };
  });

  return rows.reduce<
    { date: string; sessions: typeof rows; dailyTotalMs: number }[]
  >((groups, row) => {
    const existing = groups.find((group) => group.date === row.date);
    if (existing) {
      existing.sessions.push(row);
      existing.dailyTotalMs += row.completedDuration ?? 0;
      return groups;
    }

    groups.push({
      date: row.date,
      sessions: [row],
      dailyTotalMs: row.completedDuration ?? 0,
    });
    return groups;
  }, []);
}

function splitDateTime(dateTime: string) {
  const [date, ...timeParts] = dateTime.split(",");
  return {
    date: date.trim(),
    time: timeParts.join(",").trim() || "-"
  };
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatWorkedDuration(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatWorkDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(parsed);
}

function formatWorkTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })
    .format(parsed)
    .toUpperCase();
}

function formatNotificationDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })
    .format(parsed)
    .toUpperCase();
}

function normalizeDate(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function formatCalendarValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCalendarLabel(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(value);
}

function formatCalendarMonth(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric"
  }).format(value);
}

function parseTaskDueDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return normalizeDate(parsed);
  }
  const fallback = parseDisplayDate(value);
  return fallback ? normalizeDate(fallback) : null;
}

function isSameCalendarDay(left: Date | null, right: Date | null) {
  if (!left || !right) return false;
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function DatePickerField({
  label,
  name,
  defaultValue,
  required
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  const initialDate = parseTaskDueDate(defaultValue);
  const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(initialDate ?? normalizeDate(new Date()));

  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const monthEnd = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0);
  const startOffset = (monthStart.getDay() + 6) % 7;
  const daysInMonth = monthEnd.getDate();
  const leadingDays = Array.from({ length: startOffset });
  const trailingDays = Array.from({
    length: (7 - ((startOffset + daysInMonth) % 7 || 7)) % 7
  });
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <label className="block text-sm font-medium text-black">
      <span className="mb-2 block">{label}</span>
      <div className="relative">
        <input
          type="hidden"
          name={name}
          value={selectedDate ? formatCalendarValue(selectedDate) : ""}
          required={required}
          readOnly
        />
        <button
          type="button"
          onClick={() => setCalendarOpen((value) => !value)}
          className="flex w-full items-center justify-between rounded-md border border-neutral-300 bg-white px-3 py-2 text-left text-sm text-black hover:bg-neutral-50 focus:border-black"
        >
          <span>{selectedDate ? formatCalendarLabel(selectedDate) : "Select due date"}</span>
          <span className="text-neutral-500" aria-hidden="true">
            &#x1F4C5;
          </span>
        </button>
        {calendarOpen && (
          <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-md border border-neutral-200 bg-white p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setVisibleMonth(
                    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1)
                  )
                }
                className="rounded-md border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-100"
                aria-label="Previous month"
              >
                ‹
              </button>
              <div className="text-sm font-semibold text-black">{formatCalendarMonth(visibleMonth)}</div>
              <button
                type="button"
                onClick={() =>
                  setVisibleMonth(
                    new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1)
                  )
                }
                className="rounded-md border border-neutral-300 px-2 py-1 text-sm hover:bg-neutral-100"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs text-neutral-500">
              {weekdays.map((day) => (
                <div key={day} className="py-1">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {leadingDays.map((_, index) => (
                <div key={`leading-${index}`} className="h-9" />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const dayDate = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1);
                const isSelected = isSameCalendarDay(selectedDate, dayDate);
                return (
                  <button
                    key={formatCalendarValue(dayDate)}
                    type="button"
                    onClick={() => {
                      setSelectedDate(dayDate);
                      setVisibleMonth(dayDate);
                      setCalendarOpen(false);
                    }}
                    className={`relative h-9 rounded-md border text-sm transition ${
                      isSelected
                        ? "border-black bg-neutral-100 font-semibold text-black"
                        : "border-transparent text-black hover:border-neutral-300 hover:bg-neutral-50"
                    }`}
                  >
                    <span>{index + 1}</span>
                    {isSelected && (
                      <span className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-green-600" />
                    )}
                  </button>
                );
              })}
              {trailingDays.map((_, index) => (
                <div key={`trailing-${index}`} className="h-9" />
              ))}
            </div>
          </div>
        )}
      </div>
    </label>
  );
}

function readDashboardRouteState() {
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  const section = url.searchParams.get("section");
  const status = url.searchParams.get("status");

  const projectFilter: AdminProjectDashboardFilter =
    status === "active" ? "active" : status === "completed" ? "completed" : "all";

  const taskFilter: AdminTaskDashboardFilter =
    status === "pending"
      ? "pending"
      : status === "in-progress"
        ? "in-progress"
        : status === "failed"
          ? "failed"
          : status === "waiting-for-approval"
            ? "waiting-for-approval"
            : status === "complete"
              ? "complete"
              : "all";

  if (section === "projects") {
    return {
      page: "projects" as Page,
      projectFilter,
      taskFilter: "all" as AdminTaskDashboardFilter
    };
  }

  if (section === "tasks") {
    return {
      page: "tasks" as Page,
      projectFilter: "all" as AdminProjectDashboardFilter,
      taskFilter
    };
  }

  if (section === "developers") {
    return {
      page: "developers" as Page,
      projectFilter: "all" as AdminProjectDashboardFilter,
      taskFilter: "all" as AdminTaskDashboardFilter
    };
  }

  return null;
}

export default function Home() {
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [activeClockSession, setActiveClockSession] = useState<ClockSession | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>("admin-dashboard");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [taskReturnPage, setTaskReturnPage] = useState<Page>("tasks");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [approveTaskId, setApproveTaskId] = useState<string | null>(null);
  const [loginHistoryUserId, setLoginHistoryUserId] = useState<string | null>(null);
  const [historyModalTab, setHistoryModalTab] = useState<"login" | "work">("login");
  const [developerWorkSessions, setDeveloperWorkSessions] = useState<ClockSession[]>([]);
  const [developerWorkHistoryLoading, setDeveloperWorkHistoryLoading] = useState(false);
  const [developerWorkHistoryError, setDeveloperWorkHistoryError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isAppLoading, setIsAppLoading] = useState(false);
  const [showClockInPrompt, setShowClockInPrompt] = useState(false);
  const [clockOutPromptMode, setClockOutPromptMode] = useState<"clock-out" | "logout" | null>(null);
  const [showLogoutPrompt, setShowLogoutPrompt] = useState(false);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [adminProjectDashboardFilter, setAdminProjectDashboardFilter] = useState<AdminProjectDashboardFilter>("all");
  const [adminTaskDashboardFilter, setAdminTaskDashboardFilter] = useState<AdminTaskDashboardFilter>("all");
  const [selectedDashboardView, setSelectedDashboardView] = useState<AdminDashboardView>(null);
  const [selectedDeveloperDashboardView, setSelectedDeveloperDashboardView] = useState<DeveloperDashboardView>(null);
  const [settingsPasswordMessage, setSettingsPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [settingsCurrentPassword, setSettingsCurrentPassword] = useState("");
  const [settingsNewPassword, setSettingsNewPassword] = useState("");
  const [settingsConfirmPassword, setSettingsConfirmPassword] = useState("");
  const [taskAttachmentMessage, setTaskAttachmentMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedTaskAttachmentName, setSelectedTaskAttachmentName] = useState("");
  const [myWorkSessions, setMyWorkSessions] = useState<ClockSession[]>([]);
  const [myWorkHistoryLoading, setMyWorkHistoryLoading] = useState(false);
  const [myTaskFilter, setMyTaskFilter] = useState<Status | "All">("All");
  const [auditFilters, setAuditFilters] = useState({
    user: "",
    action: "",
    entity: "",
    search: "",
    from: "",
    to: ""
  });

  const activeTasks = useMemo(() => tasks.filter((task) => !task.deleted), [tasks]);
  const selectedTask = selectedTaskId ? activeTasks.find((task) => task.id === selectedTaskId) : activeTasks[0];
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const developers = users.filter((user) => user.role === "Developer");
  const managedUsers = users.filter((user) => user.id !== authUser?.id);
  const activeClockDuration = useMemo(() => {
    if (!activeClockSession) return "";
    const startedAt = Date.parse(activeClockSession.clockInAt);
    if (Number.isNaN(startedAt)) return "00:00:00";
    return formatDuration(clockTick - startedAt);
  }, [activeClockSession, clockTick]);

  const resetLandingState = (role?: Role) => {
    setSelectedDashboardView(null);
    setSelectedDeveloperDashboardView(null);
    setAdminProjectDashboardFilter("all");
    setAdminTaskDashboardFilter("all");
    setSelectedProjectId("");
    setSelectedTaskId("");
    setPage(role === "Developer" ? "developer-dashboard" : "admin-dashboard");
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/");
    }
  };

  const resetAppState = () => {
    setUsers([]);
    setProjects([]);
    setTasks([]);
    setComments([]);
    setHistory([]);
    setAuditLogs([]);
    setNotifications([]);
    setNotificationUnreadCount(0);
    setNotificationsOpen(false);
    setSelectedNotification(null);
    setActiveClockSession(null);
    setSelectedTaskId("");
    setSelectedProjectId("");
    setDeleteUserId(null);
    setShowClockInPrompt(false);
    setClockOutPromptMode(null);
    setShowLogoutPrompt(false);
    setTaskAttachmentMessage(null);
    setSelectedTaskAttachmentName("");
  };

  const applyAppState = (
    data: {
      users: User[];
      projects: Project[];
      tasks: Task[];
      comments: Comment[];
      history: HistoryItem[];
      auditLogs: AuditLog[];
      activeClockSession: ClockSession | null;
    },
    preserveUserId?: string | null
  ) => {
    setUsers(data.users);
    setProjects(data.projects);
    setTasks(data.tasks);
    setComments(data.comments);
    setHistory(data.history);
    setAuditLogs(data.auditLogs);
    setActiveClockSession(data.activeClockSession);

    if (preserveUserId) {
      setCurrentUser(data.users.find((user) => user.id === preserveUserId) ?? null);
    }
    if (selectedProjectId && !data.projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId("");
    }
    if (selectedTaskId && !data.tasks.some((task) => task.id === selectedTaskId && !task.deleted)) {
      setSelectedTaskId(data.tasks.find((task) => !task.deleted)?.id ?? "");
    }
  };

  const refreshState = async (preserveUserId = currentUser?.id) => {
    setIsAppLoading(true);
    try {
      const data = await fetchAppState();
      applyAppState(data, preserveUserId);
      setSessionError("");
      return data;
    } finally {
      setIsAppLoading(false);
    }
  };

  const showActionError = (error: unknown, fallback = "Request failed.") => {
    const message = error instanceof Error ? error.message : fallback;
    console.error(error);
    const normalized = message.toLowerCase();
    if (
      normalized.includes("authentication required") ||
      normalized.includes("invalid or expired token") ||
      normalized.includes("unauthorized")
    ) {
      clearAuthSession();
      resetAppState();
      setCurrentUser(null);
      setSessionError("Your session expired. Please sign in again.");
      return;
    }
    window.alert(message);
  };

  useEffect(() => {
    const storedUser = getStoredUser();
    if (!storedUser) {
      setIsRestoringSession(false);
      return;
    }

    setCurrentUser(storedUser);
    resetLandingState(storedUser.role);
    void refreshState(storedUser.id)
      .catch((error) => {
        console.error(error);
        clearAuthSession();
        resetAppState();
        setCurrentUser(null);
        setSessionError("Unable to restore the previous session. Please sign in again.");
      })
      .finally(() => {
        setIsRestoringSession(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "Admin") return;

    const applyRouteState = () => {
      const routeState = readDashboardRouteState();
      if (!routeState) return;
      setAdminProjectDashboardFilter(routeState.projectFilter);
      setAdminTaskDashboardFilter(routeState.taskFilter);
      setPage(routeState.page);
    };

    applyRouteState();
    window.addEventListener("popstate", applyRouteState);
    return () => window.removeEventListener("popstate", applyRouteState);
  }, [currentUser]);

  useEffect(() => {
    if (!activeClockSession) return;
    const intervalId = window.setInterval(() => {
      setClockTick(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeClockSession]);

  useEffect(() => {
    if (!loginHistoryUserId || currentUser?.role !== "Admin") return;

    setDeveloperWorkHistoryLoading(true);
    setDeveloperWorkHistoryError("");
    void fetchUserClockHistory(loginHistoryUserId)
      .then((response) => {
        setDeveloperWorkSessions(response.sessions);
      })
      .catch((error) => {
        setDeveloperWorkSessions([]);
        setDeveloperWorkHistoryError(error instanceof Error ? error.message : "Unable to load work history.");
      })
      .finally(() => {
        setDeveloperWorkHistoryLoading(false);
      });
  }, [currentUser?.role, loginHistoryUserId]);

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setNotificationUnreadCount(0);
      setNotificationsOpen(false);
      setSelectedNotification(null);
      return;
    }

    let cancelled = false;

    void apiFetchNotifications()
      .then((notificationResponse) => {
        if (cancelled) return;
        setNotifications(notificationResponse.notifications);
        setNotificationUnreadCount(notificationResponse.notifications.filter((item) => !item.isRead).length);
      })
      .catch((error) => {
        if (cancelled) return;
        setNotifications([]);
        setNotificationUnreadCount(0);
        setSelectedNotification(null);
        console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "Developer") {
      setMyWorkSessions([]);
      setMyWorkHistoryLoading(false);
      return;
    }

    let cancelled = false;
    setMyWorkHistoryLoading(true);

    void fetchClockHistory()
      .then((response) => {
        if (cancelled) return;
        setMyWorkSessions(response.sessions);
      })
      .catch((error) => {
        if (cancelled) return;
        setMyWorkSessions([]);
        console.error(error);
      })
      .finally(() => {
        if (cancelled) return;
        setMyWorkHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const projectTaskCounts = (projectId: string) => {
    const projectTasks = activeTasks.filter((task) => task.projectId === projectId);
    const completed = projectTasks.filter((task) => task.status === "Complete").length;
    return { total: projectTasks.length, completed };
  };

  const resolvedProjectStatus = (project: Project): ProjectStatus => {
    const counts = projectTaskCounts(project.id);
    if (project.archived || project.status === "Archived") return "Archived";
    if (counts.total > 0 && counts.total === counts.completed) return "Completed";
    return project.status;
  };

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const formData = new FormData(event.currentTarget);
      const email = String(formData.get("email") ?? "");
      const password = String(formData.get("password") ?? "");
      const response = await apiLogin(email, password);
      storeAuthSession(response.accessToken, response.user);
      setCurrentUser(response.user);
      resetLandingState(response.user.role);
      setLoginError("");
      setSessionError("");
      try {
        const data = await refreshState(response.user.id);
        if (response.user.role === "Developer" && !data.activeClockSession) {
          setShowClockInPrompt(true);
        }
      } catch (error) {
        setSessionError(error instanceof Error ? error.message : "Unable to load app state after login.");
      }
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed.");
      setIsAppLoading(false);
    }
  };

  const performLogout = async () => {
    try {
      if (currentUser) await apiLogout();
    } catch (error) {
      console.error(error);
    } finally {
      clearAuthSession();
      resetAppState();
      setCurrentUser(null);
      setMobileOpen(false);
      resetLandingState("Admin");
    }
  };

  const handleClockIn = async () => {
    try {
      const response = await apiClockIn();
      setActiveClockSession(response.session);
      setShowClockInPrompt(false);
      setClockTick(Date.now());
    } catch (error) {
      showActionError(error, "Failed to clock in.");
    }
  };

  const handleClockOutConfirmation = async () => {
    try {
      await apiClockOut();
      setActiveClockSession(null);
      const shouldLogout = clockOutPromptMode === "logout";
      setClockOutPromptMode(null);
      if (shouldLogout) {
        await performLogout();
      }
    } catch (error) {
      showActionError(error, "Failed to clock out.");
    }
  };

  const logout = async () => {
    setShowLogoutPrompt(false);
    if (currentUser?.role === "Developer" && activeClockSession) {
      setClockOutPromptMode("logout");
      return;
    }
    await performLogout();
  };

  const requestLogout = () => {
    setShowLogoutPrompt(true);
  };

  const ensureDeveloperCanChangeTasks = () => {
    if (currentUser?.role === "Developer" && !activeClockSession) {
      window.alert("Please start working before making task changes.");
      return false;
    }
    return true;
  };

  const navigate = (nextPage: Page) => {
    if (!currentUser) return;
    const adminOnly: Page[] = ["admin-dashboard", "projects", "tasks", "developers", "audit-logs", "settings"];
    const developerOnly: Page[] = ["developer-dashboard", "my-tasks", "help"];
    if (currentUser.role === "Developer" && adminOnly.includes(nextPage)) return;
    if (currentUser.role === "Admin" && developerOnly.includes(nextPage)) return;
    setSelectedDashboardView(null);
    setSelectedDeveloperDashboardView(null);
    if (nextPage === "projects") {
      setAdminProjectDashboardFilter("all");
    }
    if (nextPage === "tasks") {
      setAdminTaskDashboardFilter("all");
    }
    setPage(nextPage);
    setMobileOpen(false);
  };

  const openTaskDetails = (taskId: string) => {
    setSelectedTaskId(taskId);
    setTaskReturnPage(page === "task-details" ? (currentUser?.role === "Admin" ? "tasks" : "my-tasks") : page);
    navigate("task-details");
  };

  const createProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser) return;
    try {
      const form = new FormData(event.currentTarget);
      await apiCreateProject(projectPayloadFromForm(form));
      await refreshState(currentUser.id);
      setModal(null);
    } catch (error) {
      showActionError(error, "Failed to create project.");
    }
  };

  const editProject = async (event: FormEvent<HTMLFormElement>, projectId: string) => {
    event.preventDefault();
    if (!currentUser) return;
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    try {
      const form = new FormData(event.currentTarget);
      await apiUpdateProject(projectId, projectPayloadFromForm(form));
      await refreshState(currentUser.id);
      setModal(null);
    } catch (error) {
      showActionError(error, "Failed to update project.");
    }
  };

  const deleteProject = async (projectId: string) => {
    if (!currentUser) return;
    try {
      await apiDeleteProject(projectId);
      await refreshState(currentUser.id);
      setDeleteProjectId(null);
    } catch (error) {
      showActionError(error, "Failed to delete project.");
    }
  };

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser) return;
    try {
      const form = new FormData(event.currentTarget);
      const response = await apiCreateTask({
        title: String(form.get("title")),
        description: String(form.get("description")),
        projectId: String(form.get("projectId")),
        developerId: String(form.get("developerId")),
        dueDate: String(form.get("dueDate"))
      });
      await refreshState(currentUser.id);
      setSelectedTaskId(response.id);
      setModal(null);
    } catch (error) {
      showActionError(error, "Failed to create task.");
    }
  };

  const editTask = async (event: FormEvent<HTMLFormElement>, taskId: string) => {
    event.preventDefault();
    if (!currentUser) return;
    if (!ensureDeveloperCanChangeTasks()) return;
    try {
      const form = new FormData(event.currentTarget);
      const body: {
        title: string;
        description: string;
        dueDate?: string;
        projectId?: string;
        developerId?: string;
        status?: Status;
      } = {
        title: String(form.get("title")),
        description: String(form.get("description"))
      };

      if (currentUser.role === "Admin") {
        body.dueDate = String(form.get("dueDate"));
        body.projectId = String(form.get("projectId"));
        body.developerId = String(form.get("developerId"));
        body.status = form.get("status") as Status;
      }

      await apiUpdateTask(taskId, body);
      await refreshState(currentUser.id);
      setModal(null);
    } catch (error) {
      showActionError(error, "Failed to update task.");
    }
  };

  const reassignTask = async (event: FormEvent<HTMLFormElement>, taskId: string) => {
    event.preventDefault();
    if (!currentUser) return;
    try {
      const form = new FormData(event.currentTarget);
      await apiReassignTask(taskId, String(form.get("developerId")));
      await refreshState(currentUser.id);
      setModal(null);
    } catch (error) {
      showActionError(error, "Failed to reassign task.");
    }
  };

  const approveTask = async (taskId: string) => {
    if (!currentUser) return;
    try {
      await apiApproveTask(taskId);
      await refreshState(currentUser.id);
    } catch (error) {
      showActionError(error, "Failed to approve task.");
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!currentUser) return;
    try {
      await apiDeleteTask(taskId);
      await refreshState(currentUser.id);
      setDeleteTaskId(null);
      if (page === "task-details") setPage(currentUser.role === "Admin" ? "tasks" : "my-tasks");
    } catch (error) {
      showActionError(error, "Failed to delete task.");
    }
  };

  const changeTaskStatus = async (taskId: string, status: Status) => {
    if (!currentUser) return;
    if (!ensureDeveloperCanChangeTasks()) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    try {
      if (task.status === "Failed" && status === "In Progress") {
        await apiRemoveFailedStatus(taskId);
      } else {
        await apiChangeTaskStatus(taskId, status);
      }
      await refreshState(currentUser.id);
    } catch (error) {
      showActionError(error, "Failed to update task status.");
    }
  };

  const addComment = async (event: FormEvent<HTMLFormElement>, taskId: string) => {
    event.preventDefault();
    if (!currentUser) return;
    if (!ensureDeveloperCanChangeTasks()) return;
    try {
      const form = new FormData(event.currentTarget);
      const type = form.get("type") as Comment["type"];
      const text = String(form.get("text"));
      if (!text.trim()) return;
      await apiAddComment(taskId, {
        text,
        type
      });
      await refreshState(currentUser.id);
      event.currentTarget.reset();
    } catch (error) {
      showActionError(error, "Failed to add comment.");
    }
  };

  const uploadTaskAttachment = async (event: FormEvent<HTMLFormElement>, taskId: string) => {
    event.preventDefault();
    if (!currentUser) return;
    if (!tasks.some((task) => task.id === taskId && !task.deleted)) {
      setTaskAttachmentMessage({ type: "error", text: "This task is no longer available for upload." });
      return;
    }
    if (!ensureDeveloperCanChangeTasks()) {
      setTaskAttachmentMessage({ type: "error", text: "Please start working before making task changes." });
      return;
    }
    try {
      const form = new FormData(event.currentTarget);
      const file = form.get("attachment");
      if (!(file instanceof File) || file.size === 0) {
        setTaskAttachmentMessage({ type: "error", text: "Please select a file to upload." });
        return;
      }

      const payload = new FormData();
      payload.set("attachment", file);
      await apiUploadTaskAttachment(taskId, payload);
      await refreshState(currentUser.id);
      setTaskAttachmentMessage({ type: "success", text: "File uploaded successfully." });
      setSelectedTaskAttachmentName("");
    } catch (error) {
      setTaskAttachmentMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to upload file."
      });
    }
  };

  const createDeveloper = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser) return;
    try {
      const form = new FormData(event.currentTarget);
      await apiCreateUser({
        name: String(form.get("name")),
        email: String(form.get("email")),
        password: String(form.get("password")),
        role: form.get("role") as Role,
        accountStatus: form.get("accountStatus") as User["accountStatus"]
      });
      await refreshState(currentUser.id);
      setModal(null);
    } catch (error) {
      showActionError(error, "Failed to create user.");
    }
  };

  const editDeveloper = async (event: FormEvent<HTMLFormElement>, userId: string) => {
    event.preventDefault();
    if (!currentUser) return;
    try {
      const form = new FormData(event.currentTarget);
      const accountStatus = String(form.get("accountStatus"));
      if (accountStatus === "Delete Account") {
        if (currentUser.id === userId) {
          window.alert("You cannot delete your own account.");
          return;
        }
        setModal(null);
        setDeleteUserId(userId);
        return;
      }
      await apiUpdateUser(userId, {
        name: String(form.get("name")),
        email: String(form.get("email")),
        role: form.get("role") as Role,
        accountStatus: accountStatus as User["accountStatus"]
      });
      await refreshState(currentUser.id);
      setModal(null);
    } catch (error) {
      showActionError(error, "Failed to update user.");
    }
  };

  const deleteUser = async (userId: string) => {
    if (!currentUser) return;
    try {
      await apiDeleteUserAccount(userId);
      await refreshState(currentUser.id);
      setDeleteUserId(null);
    } catch (error) {
      showActionError(error, "Failed to delete account.");
    }
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>, userId: string) => {
    event.preventDefault();
    if (!currentUser) return;
    try {
      const form = new FormData(event.currentTarget);
      const password = String(form.get("password"));
      const confirm = String(form.get("confirm"));
      if (password !== confirm) {
        window.alert("Passwords do not match.");
        return;
      }
      await changeUserPassword(userId, {
        password,
        confirmPassword: confirm
      });
      await refreshState(currentUser.id);
      setModal(null);
    } catch (error) {
      showActionError(error, "Failed to change password.");
    }
  };

  const updateAdminPasswordFromSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser || currentUser.role !== "Admin") return;

    if (!settingsCurrentPassword) {
      setSettingsPasswordMessage({ type: "error", text: "Current password is required." });
      return;
    }

    if (!settingsNewPassword) {
      setSettingsPasswordMessage({ type: "error", text: "New password is required." });
      return;
    }

    if (!settingsConfirmPassword) {
      setSettingsPasswordMessage({ type: "error", text: "Confirm new password is required." });
      return;
    }

    if (settingsNewPassword !== settingsConfirmPassword) {
      setSettingsPasswordMessage({ type: "error", text: "New password and confirm password must match." });
      return;
    }

    try {
      await changeUserPassword(currentUser.id, {
        currentPassword: settingsCurrentPassword,
        password: settingsNewPassword,
        confirmPassword: settingsConfirmPassword
      });
      setSettingsPasswordMessage({ type: "success", text: "Admin password updated successfully." });
      setSettingsCurrentPassword("");
      setSettingsNewPassword("");
      setSettingsConfirmPassword("");
    } catch (error) {
      setSettingsPasswordMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to update admin password."
      });
    }
  };

  const projectName = (projectId: string) => projects.find((project) => project.id === projectId)?.name ?? "Unknown";
  const projectForTask = (task: Task) => projects.find((project) => project.id === task.projectId);
  const developerName = (developerId: string) => users.find((user) => user.id === developerId)?.name ?? "Unassigned";
  const hasIssue = (taskId: string) =>
    comments.some((comment) => comment.taskId === taskId && comment.type === "Issue Comment");
  const openProjectAttachment = (project?: Project) => {
    if (!project?.attachment) return;
    window.open(project.attachment.url, "_blank", "noopener,noreferrer");
  };
  const developerTasks = (userId: string) => activeTasks.filter((task) => task.developerId === userId);
  const developerDetailCounts = (userId: string) => {
    const ownedTasks = developerTasks(userId);
    return {
      missedDeadlines: ownedTasks.filter((task) => isMissedDeadline(task)).length,
      completedTasks: ownedTasks.filter((task) => task.status === "Complete").length,
      failedTasks: ownedTasks.filter((task) => task.status === "Failed").length
    };
  };
  const loginHistoryForUser = (userName: string) =>
    auditLogs.filter(
      (log) => log.user === userName && (log.action === "User logged in" || log.action === "User logged out")
    );

  const viewNotificationTarget = (notification: Notification) => {
    if (!notification.entityId) {
      setSelectedNotification(null);
      return;
    }

    if (notification.entityType === "Task") {
      setSelectedNotification(null);
      openTaskDetails(notification.entityId);
      return;
    }

    if (notification.entityType === "Project" && currentUser?.role === "Admin") {
      setSelectedNotification(null);
      setSelectedProjectId(notification.entityId);
      navigate("projects");
      return;
    }

    setSelectedNotification(null);
  };

  const openNotification = async (notification: Notification) => {
    const nextNotification = notification.isRead ? notification : { ...notification, isRead: true };
    setSelectedNotification(nextNotification);
    setNotificationsOpen(false);

    if (notification.isRead) return;

    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item))
    );
    setNotificationUnreadCount((current) => Math.max(0, current - 1));

    try {
      await apiMarkNotificationAsRead(notification.id);
    } catch (error) {
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? notification : item))
      );
      setNotificationUnreadCount((current) => current + 1);
      showActionError(error, "Failed to update notification.");
    }
  };

  if (isRestoringSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-4">
        <Card className="w-full max-w-md p-6 text-center">
          <h1 className="text-xl font-semibold text-black">Restoring session</h1>
          <p className="mt-2 text-sm text-neutral-600">Checking the backend connection and your saved sign-in.</p>
        </Card>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-4">
        <Card className="w-full max-w-md p-6">
          <div className="mb-8 text-center">
            <img
              src="/brand/keypillar-ai-logo.jpeg"
              alt="Keypillar AI logo"
              className="mx-auto mb-4 h-14 w-auto object-contain"
            />
            <p className="text-sm font-semibold text-black">Keypillar AI</p>
            <h1 className="mt-2 text-2xl font-semibold text-black">Audit Log & Task Tracking</h1>
            <p className="mt-2 text-sm text-neutral-600">Internal access only</p>
          </div>
          <form className="space-y-4" onSubmit={login}>
            <Input label="Email" name="email" type="email" autoComplete="username" required />
            <PasswordInput label="Password" name="password" autoComplete="current-password" required />
            {sessionError && <p className="text-sm text-black">{sessionError}</p>}
            {loginError && <p className="text-sm text-black">{loginError}</p>}
            <Button className="w-full" type="submit" disabled={isAppLoading}>
              Login
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  const authUser = currentUser;

  const navItems =
    authUser.role === "Admin"
      ? [
          ["admin-dashboard", "Dashboard"],
          ["projects", "Projects"],
          ["tasks", "Tasks"],
          ["developers", "Developers"],
          ["audit-logs", "Audit Logs"],
          ["settings", "Settings"]
        ]
      : [
          ["developer-dashboard", "My Dashboard"],
          ["my-tasks", "My Tasks"],
          ["help", "Help"]
        ];

  const pageTitle =
    navItems.find(([key]) => key === page)?.[1] ??
    (page === "task-details" ? "Task Details" : page === "projects" ? "Projects" : "Dashboard");
  const settingsAdminUser = users.find((user) => user.id === authUser.id) ?? authUser;

  return (
    <div className="min-h-screen bg-white text-black">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-neutral-200 bg-white p-4 transition-transform lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <img
              src="/brand/keypillar-ai-logo.jpeg"
              alt="Keypillar AI logo"
              className="h-10 w-10 rounded-md object-cover"
            />
            <div>
              <div className="text-lg font-semibold">Keypillar AI</div>
              <div className="text-sm text-neutral-600">Audit Log & Task Tracking</div>
            </div>
          </div>
        </div>
        <nav className="space-y-2">
          {navItems.map(([key, label]) => (
            <button
              key={key}
              onClick={() => navigate(key as Page)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium ${
                page === key ? "bg-[#0B1F3A] text-white" : "text-black hover:bg-neutral-100"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={requestLogout}
            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-black hover:bg-neutral-100"
          >
            Logout
          </button>
        </nav>
      </aside>

      {mobileOpen && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-neutral-200 bg-white px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="secondary" className="lg:hidden" onClick={() => setMobileOpen(true)}>
              Menu
            </Button>
            <h1 className="truncate text-lg font-semibold sm:text-xl">{pageTitle}</h1>
          </div>
          <div className="flex items-center gap-3">
            {authUser.role === "Developer" && (
              activeClockSession ? (
                <div className="text-right text-sm">
                  <div className="font-medium">Clocked in: {activeClockDuration}</div>
                  <div className="mt-2">
                    <Button variant="secondary" onClick={() => setClockOutPromptMode("clock-out")}>
                      Clock Out
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => setShowClockInPrompt(true)}>
                  Start Work
                </Button>
              )
            )}
            <div className="relative">
              <button
                type="button"
                aria-label="Notifications"
                onClick={() => setNotificationsOpen((current) => !current)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-neutral-300 bg-white text-lg text-black transition hover:bg-neutral-100"
              >
                <span aria-hidden="true">🔔</span>
                {notificationUnreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-black px-1.5 text-[11px] font-semibold text-white">
                    {notificationUnreadCount > 99 ? "99+" : notificationUnreadCount}
                  </span>
                )}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-12 z-30 w-80 rounded-md border border-neutral-200 bg-white p-2 shadow-lg">
                  <div className="border-b border-neutral-200 px-2 pb-2 pt-1 text-sm font-semibold text-black">
                    Notifications
                  </div>
                  <div className="max-h-96 overflow-y-auto py-2">
                    {notifications.length === 0 ? (
                      <div className="px-2 py-4 text-sm text-neutral-600">No notifications yet.</div>
                    ) : (
                      notifications.map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => {
                            void openNotification(notification);
                          }}
                          className={`w-full rounded-md px-2 py-3 text-left transition hover:bg-neutral-100 ${
                            notification.isRead ? "bg-white" : "bg-neutral-50"
                          }`}
                        >
                          <div className="text-sm font-semibold text-black">{notification.title}</div>
                          <div className="mt-1 text-sm text-neutral-700">{notification.message}</div>
                          <div className="mt-2 text-xs text-neutral-500">
                            {notification.entityType} · {formatNotificationDateTime(notification.createdAt)}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="text-right text-sm">
              <div className="font-medium">{authUser.name}</div>
              <div className="text-neutral-600">{authUser.role}</div>
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-6">
          {sessionError && (
            <Card className="mb-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">Backend connection issue</div>
                  <div className="mt-1 text-sm text-neutral-600">{sessionError}</div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!currentUser) return;
                    void refreshState(currentUser.id).catch((error) => {
                      setSessionError(error instanceof Error ? error.message : "Unable to load app state.");
                    });
                  }}
                >
                  Retry
                </Button>
              </div>
            </Card>
          )}
          {isAppLoading && (
            <Card className="mb-6">
              <div className="text-sm text-neutral-600">Loading the latest app state from the backend.</div>
            </Card>
          )}
          {page === "admin-dashboard" && <AdminDashboard />}
          {page === "developer-dashboard" && <DeveloperDashboard />}
          {page === "projects" && <ProjectsPage />}
          {page === "tasks" && <TasksPage />}
          {page === "my-tasks" && <MyTasksPage />}
          {page === "task-details" &&
            (selectedTask ? (
              <TaskDetailsPage task={selectedTask} />
            ) : (
              <Card>
                <EmptyState title="Task details are unavailable for this item." />
              </Card>
            ))}
          {page === "developers" && <DevelopersPage />}
          {page === "audit-logs" && <AuditLogsPage />}
          {page === "settings" && (
            <div className="space-y-6">
              <Card className="border-[#BFDBFE] bg-white">
                <div className="flex items-center gap-4">
                  <img
                    src="/brand/keypillar-ai-logo.jpeg"
                    alt="Keypillar AI logo"
                    className="h-14 w-14 rounded-md object-cover"
                  />
                  <div>
                    <h2 className="text-xl font-semibold text-[#111827]">Keypillar AI</h2>
                    <p className="text-sm text-neutral-600">Audit Log &amp; Task Tracking App</p>
                  </div>
                </div>
              </Card>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="border-[#BFDBFE] bg-white">
                  <SectionTitle title="Admin Account" />
                  <div className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Current admin email</div>
                    <div className="mt-1 text-sm text-[#111827]">{settingsAdminUser.email}</div>
                  </div>
                  <form className="space-y-4" onSubmit={updateAdminPasswordFromSettings}>
                    <PasswordInput
                      label="Current password"
                      name="currentPassword"
                      value={settingsCurrentPassword}
                      onChange={(event) => {
                        setSettingsCurrentPassword(event.target.value);
                        if (settingsPasswordMessage) setSettingsPasswordMessage(null);
                      }}
                      required
                    />
                    <PasswordInput
                      label="New password"
                      name="password"
                      value={settingsNewPassword}
                      onChange={(event) => {
                        setSettingsNewPassword(event.target.value);
                        if (settingsPasswordMessage) setSettingsPasswordMessage(null);
                      }}
                      required
                    />
                    <PasswordInput
                      label="Confirm new password"
                      name="confirm"
                      value={settingsConfirmPassword}
                      onChange={(event) => {
                        setSettingsConfirmPassword(event.target.value);
                        if (settingsPasswordMessage) setSettingsPasswordMessage(null);
                      }}
                      required
                    />
                    {settingsPasswordMessage && (
                      <div
                        className={`rounded-md border px-3 py-2 text-sm ${
                          settingsPasswordMessage.type === "success"
                            ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#111827]"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {settingsPasswordMessage.text}
                      </div>
                    )}
                    <Button type="submit">Update Password</Button>
                  </form>
                  <p className="mt-4 text-sm text-neutral-600">Only the admin password can be changed from Settings.</p>
                </Card>
              </div>

              <Card className="border-[#BFDBFE] bg-white">
                <SectionTitle title="App Info" />
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Version</div>
                    <div className="mt-1 text-sm text-[#111827]">1.0.0</div>
                  </div>
                  <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Database</div>
                    <div className="mt-1 text-sm text-[#111827]">PostgreSQL</div>
                  </div>
                  <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Backend</div>
                    <div className="mt-1 text-sm text-[#111827]">Connected</div>
                  </div>
                </div>
              </Card>
            </div>
          )}
          {page === "help" && <HelpPage />}
        </main>
      </div>

      {modal?.name === "create-project" && (
        <ProjectForm title="Create Project" onSubmit={createProject} onClose={() => setModal(null)} />
      )}
      {modal?.name === "edit-project" && (
        <ProjectForm
          title="Edit Project"
          project={projects.find((item) => item.id === modal.projectId)}
          onSubmit={(event) => editProject(event, modal.projectId)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.name === "create-task" && (
        <TaskForm title="Create Task" onSubmit={createTask} onClose={() => setModal(null)} />
      )}
      {modal?.name === "edit-task" && (
        <TaskForm
          title="Edit Task"
          task={tasks.find((item) => item.id === modal.taskId)}
          onSubmit={(event) => editTask(event, modal.taskId)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.name === "reassign-task" && (
        <ReassignForm
          task={tasks.find((item) => item.id === modal.taskId)}
          onSubmit={(event) => reassignTask(event, modal.taskId)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.name === "upload-task-file" && (
        <Modal title="Upload File" onClose={() => setModal(null)} showCloseButton={false}>
          <form className="space-y-4" onSubmit={(event) => uploadTaskAttachment(event, modal.taskId)} encType="multipart/form-data">
            <Input
              label="Upload document or image"
              name="attachment"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setSelectedTaskAttachmentName(file?.name ?? "");
                setTaskAttachmentMessage(null);
              }}
            />
            {selectedTaskAttachmentName && <p className="text-sm text-neutral-600">Selected file: {selectedTaskAttachmentName}</p>}
            {taskAttachmentMessage && (
              <div
                className={`rounded-md border px-3 py-2 text-sm ${
                  taskAttachmentMessage.type === "success"
                    ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#111827]"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {taskAttachmentMessage.text}
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button type="submit">Upload</Button>
            </div>
          </form>
        </Modal>
      )}
      {modal?.name === "create-developer" && (
        <DeveloperForm title="Create User" onSubmit={createDeveloper} onClose={() => setModal(null)} />
      )}
      {modal?.name === "edit-developer" && (
        <DeveloperForm
          title="Edit User"
          user={users.find((item) => item.id === modal.userId)}
          onSubmit={(event) => editDeveloper(event, modal.userId)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.name === "change-password" && (
        <PasswordChangeForm
          user={users.find((item) => item.id === modal.userId)}
          onSubmit={(event) => changePassword(event, modal.userId)}
          onClose={() => setModal(null)}
        />
      )}
      {selectedNotification && (
        <Modal title="Notification" onClose={() => setSelectedNotification(null)} showCloseButton={false}>
          <div className="space-y-6">
            <div className="space-y-3">
              <div>
                <div className="text-lg font-semibold text-black">{selectedNotification.title}</div>
                <div className="mt-2 text-sm text-neutral-700">{selectedNotification.message}</div>
              </div>
              <div className="text-sm text-neutral-600">
                <div>Type: {selectedNotification.entityType}</div>
                <div className="mt-1">{formatNotificationDateTime(selectedNotification.createdAt)}</div>
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              {selectedNotification.entityId &&
                (selectedNotification.entityType === "Task" || selectedNotification.entityType === "Project") && (
                  <Button variant="secondary" onClick={() => viewNotificationTarget(selectedNotification)}>
                    {selectedNotification.entityType === "Task" ? "View Task" : "View Project"}
                  </Button>
                )}
              <Button onClick={() => setSelectedNotification(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
      {showLogoutPrompt && (
        <Modal title="Logout" onClose={() => setShowLogoutPrompt(false)} showCloseButton={false}>
          <div className="space-y-6">
            <p className="text-sm text-neutral-700">Do you want to log out ?</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button onClick={logout}>Yes</Button>
              <Button variant="secondary" onClick={() => setShowLogoutPrompt(false)}>
                No
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {deleteTaskId && (
        <ConfirmDialog
          title="Delete Task"
          message="This task will be removed from active task counts and hidden from task lists."
          onCancel={() => setDeleteTaskId(null)}
          onConfirm={() => deleteTask(deleteTaskId)}
        />
      )}
      {deleteProjectId && (
        <ConfirmDialog
          title="Delete Project"
          message="Do you really want to delete the task?"
          confirmLabel="Yes, continue"
          onCancel={() => setDeleteProjectId(null)}
          onConfirm={() => deleteProject(deleteProjectId)}
        />
      )}
      {deleteUserId && (
        <ConfirmDialog
          title="Delete Account"
          message="Are you sure you want to delete this account?"
          confirmLabel="Delete Account"
          cancelLabel="Cancel"
          onCancel={() => setDeleteUserId(null)}
          onConfirm={() => deleteUser(deleteUserId)}
        />
      )}
      {approveTaskId && (
        <ConfirmDialog
          title="Approve Task"
          message="Are you sure?"
          confirmLabel="Yes"
          cancelLabel="No"
          onCancel={() => setApproveTaskId(null)}
          onConfirm={() => {
            approveTask(approveTaskId);
            setApproveTaskId(null);
          }}
        />
      )}
      {loginHistoryUserId && (
        <LoginHistoryModal
          user={users.find((item) => item.id === loginHistoryUserId)}
          onClose={() => setLoginHistoryUserId(null)}
        />
      )}
      {showClockInPrompt && authUser.role === "Developer" && (
        <Modal title="Start Working" onClose={() => setShowClockInPrompt(false)} showCloseButton={false}>
          <div className="space-y-6">
            <p className="text-sm text-neutral-700">Do you want to start working?</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setShowClockInPrompt(false)}>
                NO
              </Button>
              <Button onClick={handleClockIn}>
                YES
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {clockOutPromptMode && authUser.role === "Developer" && (
        <Modal title="Clock Out" onClose={() => setClockOutPromptMode(null)} showCloseButton={false}>
          <div className="space-y-6">
            <p className="text-sm text-neutral-700">Have you finished your work?</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setClockOutPromptMode(null)}>
                NO
              </Button>
              <Button onClick={handleClockOutConfirmation}>
                YES
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );

  function AdminDashboard() {
    const counts = {
      totalProjects: projects.length,
      activeProjects: projects.filter((project) => resolvedProjectStatus(project) !== "Archived").length,
      completedProjects: projects.filter((project) => resolvedProjectStatus(project) === "Completed").length,
      totalTasks: activeTasks.length,
      pending: activeTasks.filter((task) => task.status === "Pending").length,
      progress: activeTasks.filter((task) => task.status === "In Progress").length,
      failed: activeTasks.filter((task) => task.status === "Failed").length,
      waiting: activeTasks.filter((task) => task.status === "Waiting for Approval").length,
      complete: activeTasks.filter((task) => task.status === "Complete").length,
      developers: developers.length
    };
    const waitingTasks = activeTasks.filter((task) => task.status === "Waiting for Approval");
    const dashboardProjects =
      selectedDashboardView?.kind === "projects"
        ? selectedDashboardView.filter === "active"
          ? projects.filter((project) => resolvedProjectStatus(project) !== "Archived")
          : selectedDashboardView.filter === "completed"
            ? projects.filter((project) => resolvedProjectStatus(project) === "Completed")
            : projects
        : [];
    const dashboardTasks =
      selectedDashboardView?.kind === "tasks"
        ? selectedDashboardView.filter === "pending"
          ? activeTasks.filter((task) => task.status === "Pending")
          : selectedDashboardView.filter === "in-progress"
            ? activeTasks.filter((task) => task.status === "In Progress")
            : selectedDashboardView.filter === "failed"
              ? activeTasks.filter((task) => task.status === "Failed")
              : selectedDashboardView.filter === "waiting-for-approval"
                ? activeTasks.filter((task) => task.status === "Waiting for Approval")
                : selectedDashboardView.filter === "complete"
                  ? activeTasks.filter((task) => task.status === "Complete")
                  : activeTasks
        : [];

    if (selectedDashboardView?.kind === "projects") {
      return (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold">{selectedDashboardView.title}</h2>
            <Button
              className="border-[#0B1F3A] bg-[#0B1F3A] text-white hover:bg-[#102A43]"
              onClick={() => setSelectedDashboardView(null)}
            >
              Back to Dashboard
            </Button>
          </div>
          <Card className="border-[#0B1F3A] bg-white">
            <Table headers={["Project Name", "Description", "Status", "Total Tasks", "Completed Tasks", "Created Date"]}>
              {dashboardProjects.map((project) => {
                const projectCounts = projectTaskCounts(project.id);
                return (
                  <tr key={project.id} className="hover:bg-neutral-50">
                    <Cell>{project.name}</Cell>
                    <Cell>{project.description}</Cell>
                    <Cell>
                      <ProjectStatusBadge status={resolvedProjectStatus(project)} />
                    </Cell>
                    <Cell>{projectCounts.total}</Cell>
                    <Cell>{projectCounts.completed}</Cell>
                    <Cell>{project.createdDate}</Cell>
                  </tr>
                );
              })}
            </Table>
            {dashboardProjects.length === 0 && <EmptyState title="No projects found for this view." />}
          </Card>
        </div>
      );
    }

    if (selectedDashboardView?.kind === "tasks") {
      return (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold">{selectedDashboardView.title}</h2>
            <Button
              className="border-[#0B1F3A] bg-[#0B1F3A] text-white hover:bg-[#102A43]"
              onClick={() => setSelectedDashboardView(null)}
            >
              Back to Dashboard
            </Button>
          </div>
          <Card className="border-[#0B1F3A] bg-white">
            <Table headers={["Task Title", "Project", "Assigned Developer", "Status", "Due Date", "Last Updated"]}>
              {dashboardTasks.map((task) => (
                <tr key={task.id} className="hover:bg-neutral-50">
                  <Cell>{task.title}</Cell>
                  <Cell>{projectName(task.projectId)}</Cell>
                  <Cell>{developerName(task.developerId)}</Cell>
                  <Cell>
                    <StatusBadge status={task.status} />
                  </Cell>
                  <Cell>
                    <DueDateWarning task={task} compact />
                  </Cell>
                  <Cell>{task.lastUpdated}</Cell>
                </tr>
              ))}
            </Table>
            {dashboardTasks.length === 0 && <EmptyState title="No tasks found for this view." />}
          </Card>
        </div>
      );
    }

    if (selectedDashboardView?.kind === "developers") {
      return (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold">{selectedDashboardView.title}</h2>
            <Button
              className="border-[#0B1F3A] bg-[#0B1F3A] text-white hover:bg-[#102A43]"
              onClick={() => setSelectedDashboardView(null)}
            >
              Back to Dashboard
            </Button>
          </div>
          <Card className="border-[#0B1F3A] bg-white">
            <Table headers={["Name", "Role", "Account Status", "Completed Tasks", "Failed Tasks", "Last Login"]}>
              {developers.map((user) => {
                const developerCounts = developerDetailCounts(user.id);
                return (
                  <tr key={user.id} className="hover:bg-neutral-50">
                    <Cell>{user.name}</Cell>
                    <Cell>{user.role}</Cell>
                    <Cell>
                      <Badge
                        className={
                          user.accountStatus === "Active"
                            ? "border-green-600 bg-white text-green-700"
                            : "border-red-600 bg-white text-red-700"
                        }
                      >
                        {user.accountStatus}
                      </Badge>
                    </Cell>
                    <Cell>{developerCounts.completedTasks}</Cell>
                    <Cell>{developerCounts.failedTasks}</Cell>
                    <Cell>{user.lastLogin}</Cell>
                  </tr>
                );
              })}
            </Table>
            {developers.length === 0 && <EmptyState title="No developers found for this view." />}
          </Card>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <DashboardNavCard label="Total Projects" value={counts.totalProjects} onClick={() => setSelectedDashboardView({ kind: "projects", title: "All Projects", filter: "all" })} />
          <DashboardNavCard label="Active Projects" value={counts.activeProjects} onClick={() => setSelectedDashboardView({ kind: "projects", title: "Active Projects", filter: "active" })} />
          <DashboardNavCard label="Completed Projects" value={counts.completedProjects} onClick={() => setSelectedDashboardView({ kind: "projects", title: "Completed Projects", filter: "completed" })} />
          <DashboardNavCard label="Total Tasks" value={counts.totalTasks} onClick={() => setSelectedDashboardView({ kind: "tasks", title: "All Tasks", filter: "all" })} />
          <DashboardNavCard label="Pending Tasks" value={counts.pending} onClick={() => setSelectedDashboardView({ kind: "tasks", title: "Pending Tasks", filter: "pending" })} />
          <DashboardNavCard label="In Progress Tasks" value={counts.progress} onClick={() => setSelectedDashboardView({ kind: "tasks", title: "In Progress Tasks", filter: "in-progress" })} />
          <DashboardNavCard label="Failed Tasks" value={counts.failed} onClick={() => setSelectedDashboardView({ kind: "tasks", title: "Failed Tasks", filter: "failed" })} />
          <DashboardNavCard label="Waiting for Approval Tasks" value={counts.waiting} onClick={() => setSelectedDashboardView({ kind: "tasks", title: "Waiting for Approval Tasks", filter: "waiting-for-approval" })} />
          <DashboardNavCard label="Completed Tasks" value={counts.complete} onClick={() => setSelectedDashboardView({ kind: "tasks", title: "Completed Tasks", filter: "complete" })} />
          <DashboardNavCard label="Total Developers" value={counts.developers} onClick={() => setSelectedDashboardView({ kind: "developers", title: "Developers" })} />
        </div>

        <Card className="border-[#BFDBFE] bg-white">
          <SectionTitle title="Recent Task Activity" />
          <Table headers={["Task Name", "Project", "Developer", "Status", "Last Updated"]}>
            {activeTasks.slice(0, 5).map((task) => (
              <tr key={task.id} className="hover:bg-neutral-50">
                <Cell>{task.title}</Cell>
                <Cell>{projectName(task.projectId)}</Cell>
                <Cell>{developerName(task.developerId)}</Cell>
                <Cell>
                  <StatusBadge status={task.status} />
                </Cell>
                <Cell>{task.lastUpdated}</Cell>
              </tr>
            ))}
          </Table>
        </Card>

        <Card className="border-[#BFDBFE] bg-white">
          <SectionTitle title="Recent Audit Logs" />
          <Table headers={["Action", "User", "Role", "Date & Time"]}>
            {auditLogs.slice(0, 5).map((log) => (
              <tr key={log.id} className="hover:bg-neutral-50">
                <Cell>{log.action}</Cell>
                <Cell>{log.user}</Cell>
                <Cell>{log.role}</Cell>
                <Cell>{log.dateTime}</Cell>
              </tr>
            ))}
          </Table>
        </Card>

        <Card className="border-[#BFDBFE] bg-white">
          <SectionTitle title="Tasks Waiting for Approval" />
          <div className="grid gap-3">
            {waitingTasks.length === 0 && <EmptyState title="No tasks are waiting for approval." />}
            {waitingTasks.map((task) => (
              <div
                key={task.id}
                className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium">{task.title}</div>
                  <div className="text-sm text-neutral-600">
                    {developerName(task.developerId)} · {projectName(task.projectId)}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => setApproveTaskId(task.id)}>Approve</Button>
                  <Button
                    variant="secondary"
                    onClick={() => openTaskDetails(task.id)}
                  >
                    View task
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  function DeveloperDashboard() {
    const myTasks = activeTasks.filter((task) => task.developerId === authUser.id);
    const list = (status: Status) => myTasks.filter((task) => task.status === status);
    const workSections = buildWorkHistorySections(myWorkSessions, clockTick);
    const dashboardTasks =
      selectedDeveloperDashboardView?.kind === "tasks"
        ? selectedDeveloperDashboardView.filter === "pending"
          ? list("Pending")
          : selectedDeveloperDashboardView.filter === "in-progress"
            ? list("In Progress")
            : selectedDeveloperDashboardView.filter === "failed"
              ? list("Failed")
              : selectedDeveloperDashboardView.filter === "waiting-for-approval"
                ? list("Waiting for Approval")
                : selectedDeveloperDashboardView.filter === "complete"
                  ? list("Complete")
                  : myTasks
        : [];

    if (selectedDeveloperDashboardView?.kind === "tasks") {
      return (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-semibold">{selectedDeveloperDashboardView.title}</h2>
            <Button
              className="border-[#0B1F3A] bg-[#0B1F3A] text-white hover:bg-[#102A43]"
              onClick={() => setSelectedDeveloperDashboardView(null)}
            >
              Back to Dashboard
            </Button>
          </div>
          <Card className="border-[#0B1F3A] bg-white">
            <Table headers={["Task Title", "Project", "Status", "Due Date", "Last Updated", "Actions"]}>
              {dashboardTasks.map((task) => (
                <tr key={task.id} className="hover:bg-neutral-50">
                  <Cell>{task.title}</Cell>
                  <Cell>{projectName(task.projectId)}</Cell>
                  <Cell>
                    <StatusBadge status={task.status} />
                  </Cell>
                  <Cell>
                    <DueDateWarning task={task} compact />
                  </Cell>
                  <Cell>{task.lastUpdated}</Cell>
                  <Cell>
                    <ActionGroup>
                      <ProjectFileButton project={projectForTask(task)} label="Open Project File" hideWhenMissing />
                      <Button
                        variant="secondary"
                        onClick={() => openTaskDetails(task.id)}
                      >
                        View Details
                      </Button>
                    </ActionGroup>
                  </Cell>
                </tr>
              ))}
            </Table>
            {dashboardTasks.length === 0 && <EmptyState title="No tasks found for this view." />}
          </Card>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <DashboardNavCard
            label="My Total Tasks"
            value={myTasks.length}
            onClick={() => setSelectedDeveloperDashboardView({ kind: "tasks", title: "All Tasks", filter: "all" })}
          />
          <DashboardNavCard
            label="Pending"
            value={list("Pending").length}
            onClick={() => setSelectedDeveloperDashboardView({ kind: "tasks", title: "Pending Tasks", filter: "pending" })}
          />
          <DashboardNavCard
            label="In Progress"
            value={list("In Progress").length}
            onClick={() => setSelectedDeveloperDashboardView({ kind: "tasks", title: "In Progress Tasks", filter: "in-progress" })}
          />
          <DashboardNavCard
            label="Failed"
            value={list("Failed").length}
            onClick={() => setSelectedDeveloperDashboardView({ kind: "tasks", title: "Failed Tasks", filter: "failed" })}
          />
          <DashboardNavCard
            label="Waiting for Approval"
            value={list("Waiting for Approval").length}
            onClick={() =>
              setSelectedDeveloperDashboardView({
                kind: "tasks",
                title: "Waiting for Approval Tasks",
                filter: "waiting-for-approval",
              })
            }
          />
          <DashboardNavCard
            label="Complete"
            value={list("Complete").length}
            onClick={() => setSelectedDeveloperDashboardView({ kind: "tasks", title: "Completed Tasks", filter: "complete" })}
          />
        </div>
        {!activeClockSession && (
          <div className="rounded-md border border-[#0B1F3A] bg-[#0B1F3A] px-5 py-4">
            <p className="text-sm font-medium text-white">Please start working before making any task changes!</p>
          </div>
        )}
        <TaskListSection title="My Current Tasks" tasks={myTasks.filter((task) => ["Pending", "In Progress"].includes(task.status))} />
        <TaskListSection title="My Failed Tasks" tasks={list("Failed")} />
        <TaskListSection title="My Waiting for Approval Tasks" tasks={list("Waiting for Approval")} />
        <Card className="border-[#BFDBFE] bg-white">
          <SectionTitle title="Work History" />
          {myWorkHistoryLoading ? (
            <EmptyState title="Loading work history." />
          ) : workSections.length === 0 ? (
            <EmptyState title="No work sessions found." />
          ) : (
            <div className="space-y-4">
              {workSections.map((section) => (
                <div key={section.date} className="space-y-2">
                  <Table headers={["Date", "Started", "Ended", "Total Worked"]}>
                    {section.sessions.map((session) => (
                      <tr key={session.id} className="hover:bg-neutral-50">
                        <Cell>{session.date}</Cell>
                        <Cell>{session.clockIn}</Cell>
                        <Cell>{session.clockOut}</Cell>
                        <Cell>{session.totalWorked}</Cell>
                      </tr>
                    ))}
                  </Table>
                  <div className="text-sm font-medium text-neutral-700">
                    Daily total: {formatWorkedDuration(section.dailyTotalMs)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    );
  }

  function ProjectsPage() {
    const filteredProjects =
      adminProjectDashboardFilter === "active"
        ? projects.filter((project) => resolvedProjectStatus(project) !== "Archived")
        : adminProjectDashboardFilter === "completed"
          ? projects.filter((project) => resolvedProjectStatus(project) === "Completed")
          : projects;
    const projectTasks = selectedProject ? activeTasks.filter((task) => task.projectId === selectedProject.id) : [];
    const counts = selectedProject ? projectTaskCounts(selectedProject.id) : { total: 0, completed: 0 };

    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">Projects</h2>
          <Button onClick={() => setModal({ name: "create-project" })}>Create Project</Button>
        </div>
        <Card>
          <Table
            headers={[
              "Project Name",
              "Description",
              "Document",
              "Status",
              "Total Tasks",
              "Completed Tasks",
              "Created Date",
              "Actions"
            ]}
          >
            {filteredProjects.map((project) => {
              const counts = projectTaskCounts(project.id);
              return (
                <tr key={project.id} className="hover:bg-neutral-50">
                  <Cell>{project.name}</Cell>
                  <Cell>{project.description}</Cell>
                  <Cell>
                    <ProjectFileButton project={project} label="Open file" />
                  </Cell>
                  <Cell>
                    <ProjectStatusBadge status={resolvedProjectStatus(project)} />
                  </Cell>
                  <Cell>{counts.total}</Cell>
                  <Cell>{counts.completed}</Cell>
                  <Cell>{project.createdDate}</Cell>
                  <Cell>
                    <ActionGroup>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelectedProjectId(project.id);
                        }}
                      >
                        View
                      </Button>
                      <Button variant="secondary" onClick={() => setModal({ name: "edit-project", projectId: project.id })}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => setDeleteProjectId(project.id)}>
                        Delete
                      </Button>
                    </ActionGroup>
                  </Cell>
                </tr>
              );
            })}
          </Table>
        </Card>

        {selectedProject && (
          <Card>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold">{selectedProject.name}</h3>
                <p className="mt-1 text-sm text-neutral-600">{selectedProject.description}</p>
                <div className="mt-3">
                  <ProjectFileButton project={selectedProject} label="Open project document" />
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <ProjectStatusBadge status={resolvedProjectStatus(selectedProject)} />
                <Button variant="secondary" onClick={() => setSelectedProjectId("")}>
                  Back to Projects
                </Button>
              </div>
            </div>
            <p className="mb-4 text-sm text-neutral-700">
              Progress: {counts.completed} / {counts.total} tasks complete
            </p>
            <Table headers={["Task Title", "Assigned Developer", "Status", "Due Date", "Last Updated", "Actions"]}>
              {projectTasks.map((task) => (
                <tr key={task.id} className="hover:bg-neutral-50">
                  <Cell>{task.title}</Cell>
                  <Cell>{developerName(task.developerId)}</Cell>
                  <Cell>
                    <StatusBadge status={task.status} />
                  </Cell>
                  <Cell>
                    <DueDateWarning task={task} compact />
                  </Cell>
                  <Cell>{task.lastUpdated}</Cell>
                  <Cell>
                    <ActionGroup>
                      <Button
                        variant="secondary"
                        onClick={() => openTaskDetails(task.id)}
                      >
                        View task
                      </Button>
                      <Button variant="secondary" onClick={() => setModal({ name: "edit-task", taskId: task.id })}>
                        Edit task
                      </Button>
                      <Button variant="danger" onClick={() => setDeleteTaskId(task.id)}>
                        Delete task
                      </Button>
                      <Button variant="secondary" onClick={() => setModal({ name: "reassign-task", taskId: task.id })}>
                        Reassign task
                      </Button>
                    </ActionGroup>
                  </Cell>
                </tr>
              ))}
            </Table>
          </Card>
        )}
      </div>
    );
  }

  function TasksPage() {
    const filteredTasks =
      adminTaskDashboardFilter === "pending"
        ? activeTasks.filter((task) => task.status === "Pending")
        : adminTaskDashboardFilter === "in-progress"
          ? activeTasks.filter((task) => task.status === "In Progress")
          : adminTaskDashboardFilter === "failed"
            ? activeTasks.filter((task) => task.status === "Failed")
            : adminTaskDashboardFilter === "waiting-for-approval"
              ? activeTasks.filter((task) => task.status === "Waiting for Approval")
              : adminTaskDashboardFilter === "complete"
                ? activeTasks.filter((task) => task.status === "Complete")
                : activeTasks;
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">Tasks</h2>
          <Button onClick={() => setModal({ name: "create-task" })}>Create Task</Button>
        </div>
        <Card>
          <Table headers={["Task Title", "Project", "Assigned Developer", "Status", "Due Date", "Created Date", "Actions"]}>
            {filteredTasks.map((task) => (
              <tr key={task.id} className="hover:bg-neutral-50">
                <Cell>
                  <div className="flex flex-wrap items-center gap-2">
                    {task.title}
                    {hasIssue(task.id) && <Badge className="border-black bg-white text-black">Issue Reported</Badge>}
                  </div>
                </Cell>
                <Cell>{projectName(task.projectId)}</Cell>
                <Cell>{developerName(task.developerId)}</Cell>
                <Cell>
                  <StatusBadge status={task.status} />
                </Cell>
                <Cell>
                  <DueDateWarning task={task} compact />
                </Cell>
                <Cell>{task.createdDate}</Cell>
                <Cell>
                  <ActionGroup>
                    <Button
                      variant="secondary"
                      onClick={() => openTaskDetails(task.id)}
                    >
                      View task
                    </Button>
                    <Button variant="secondary" onClick={() => setModal({ name: "edit-task", taskId: task.id })}>
                      Edit task
                    </Button>
                    <Button variant="danger" onClick={() => setDeleteTaskId(task.id)}>
                      Delete task
                    </Button>
                    <Button variant="secondary" onClick={() => setModal({ name: "reassign-task", taskId: task.id })}>
                      Reassign developer
                    </Button>
                    {task.status === "Waiting for Approval" && (
                      <Button onClick={() => setApproveTaskId(task.id)}>Approve task</Button>
                    )}
                  </ActionGroup>
                </Cell>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    );
  }

  function MyTasksPage() {
    const myTasks = activeTasks.filter((task) => task.developerId === authUser.id);
    const filtered = myTaskFilter === "All" ? myTasks : myTasks.filter((task) => task.status === myTaskFilter);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {(["All", ...statuses] as const).map((status) => (
            <Button
              key={status}
              variant={myTaskFilter === status ? "primary" : "secondary"}
              onClick={() => setMyTaskFilter(status)}
            >
              {status}
            </Button>
          ))}
        </div>
        <div className="grid gap-4">
          {filtered.length === 0 && <EmptyState title="No tasks match this filter." />}
          {filtered.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      </div>
    );
  }

  function TaskDetailsPage({ task }: { task: Task }) {
    const taskComments = comments.filter((comment) => comment.taskId === task.id);
    const taskHistory = history.filter((item) => item.taskId === task.id);
    const taskAttachments = task.attachments ?? [];
    const canComment = authUser.role === "Admin" || task.developerId === authUser.id;
    const canDeveloperChangeTask = authUser.role !== "Developer" || Boolean(activeClockSession);
    const returnLabel =
      taskReturnPage === "developer-dashboard"
        ? "My Dashboard"
        : taskReturnPage === "my-tasks"
          ? "My Tasks"
          : taskReturnPage === "projects"
            ? "Projects"
            : taskReturnPage === "admin-dashboard"
              ? "Dashboard"
              : "Tasks";

    return (
      <div className="space-y-6">
        <Button variant="secondary" onClick={() => navigate(taskReturnPage)}>
          Back to {returnLabel}
        </Button>
        <Card>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">{task.title}</h2>
              <p className="mt-1 text-sm text-neutral-600">{projectName(task.projectId)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={task.status} />
              {hasIssue(task.id) && <Badge className="border-black bg-white text-black">Issue Reported</Badge>}
            </div>
          </div>
          <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Info label="Assigned developer" value={developerName(task.developerId)} />
            <div className="mb-4">
              <dt className="text-xs font-semibold uppercase text-neutral-500">Due date</dt>
              <dd className="mt-1 text-sm text-black">
                <DueDateWarning task={task} />
              </dd>
            </div>
            <Info label="Created date" value={task.createdDate} />
            <Info label="Last updated" value={task.lastUpdated} />
            <Info label="Status" value={task.status} />
            <Info label="Project" value={projectName(task.projectId)} />
            <Info label="Project document" value={projectForTask(task)?.attachment?.name ?? "No document attached"} />
          </dl>
          {projectForTask(task)?.attachment && (
            <div className="mt-5">
              <ProjectFileButton project={projectForTask(task)} label="Open Project File" />
            </div>
          )}
          <div className="mt-5">
            <div className="mb-2 text-sm font-semibold">Description</div>
            <p className="text-sm text-neutral-700">{task.description}</p>
          </div>
          <div className="mt-5">
            <div className="mb-2 text-sm font-semibold">Attachments</div>
            <TaskAttachmentList attachments={taskAttachments} />
          </div>
        </Card>

        <Card>
          <SectionTitle title="Task Status Flow" />
          <div className="flex items-center">
            <StatusBadge status={task.status} />
          </div>
        </Card>

        <Card>
          <SectionTitle title="Actions" />
          {authUser.role === "Developer" ? (
            canDeveloperChangeTask ? (
              <ActionGroup>
                {task.status === "Pending" && <Button onClick={() => changeTaskStatus(task.id, "In Progress")}>Start Task</Button>}
                {task.status === "In Progress" && (
                  <>
                    <Button variant="secondary" onClick={() => changeTaskStatus(task.id, "Failed")}>
                      Mark as Failed
                    </Button>
                    <Button onClick={() => changeTaskStatus(task.id, "Waiting for Approval")}>Send for Approval</Button>
                  </>
                )}
                {task.status === "Failed" && (
                  <>
                    <Button variant="secondary" onClick={() => changeTaskStatus(task.id, "In Progress")}>
                      Remove Failed Status
                    </Button>
                    <Button onClick={() => changeTaskStatus(task.id, "Waiting for Approval")}>Send for Approval</Button>
                  </>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setTaskAttachmentMessage(null);
                    setSelectedTaskAttachmentName("");
                    setModal({ name: "upload-task-file", taskId: task.id });
                  }}
                >
                  Upload File
                </Button>
              </ActionGroup>
            ) : (
              <div className="rounded-md border border-[#0B1F3A] bg-[#0B1F3A] px-4 py-3 text-sm font-medium text-white">
                Please start working before making any task changes!
              </div>
            )
          ) : (
            <ActionGroup>
              <Button variant="secondary" onClick={() => setModal({ name: "edit-task", taskId: task.id })}>
                Edit Task
              </Button>
              <Button variant="danger" onClick={() => setDeleteTaskId(task.id)}>
                Delete Task
              </Button>
              <Button variant="secondary" onClick={() => setModal({ name: "reassign-task", taskId: task.id })}>
                Reassign Task
              </Button>
              {task.status === "Waiting for Approval" && (
                <Button onClick={() => setApproveTaskId(task.id)}>Approve Task</Button>
              )}
              <Button variant="secondary">View History</Button>
            </ActionGroup>
          )}
        </Card>

        <Card>
          <SectionTitle title="Comments" />
          <div className="mb-5 grid gap-3">
            {taskComments.length === 0 && <EmptyState title="No comments yet." />}
            {taskComments.map((comment) => (
              <div key={comment.id} className="rounded-md border border-neutral-200 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{comment.writer}</span>
                  <Badge className="border-neutral-300 bg-white text-black">{comment.role}</Badge>
                  <Badge className={comment.type === "Issue Comment" ? "border-black bg-black text-white" : "border-neutral-300 bg-white text-black"}>
                    {comment.type}
                  </Badge>
                  <span className="text-sm text-neutral-600">{comment.dateTime}</span>
                </div>
                <p className="text-sm text-neutral-700">{comment.text}</p>
              </div>
            ))}
          </div>
          {canComment && (authUser.role !== "Developer" || canDeveloperChangeTask) && (
            <form className="space-y-4" onSubmit={(event) => addComment(event, task.id)}>
              <Textarea label="Comment" name="text" required />
              <Select label="Comment type" name="type" defaultValue="Normal Comment">
                <option>Normal Comment</option>
                <option>Issue Comment</option>
              </Select>
              <Button type="submit">{authUser.role === "Admin" ? "Add Admin Comment" : "Add Comment"}</Button>
            </form>
          )}
          {canComment && authUser.role === "Developer" && !canDeveloperChangeTask && (
            <div className="text-sm text-neutral-700">Please start working before making task changes.</div>
          )}
        </Card>

        {authUser.role === "Admin" && (
          <Card>
            <SectionTitle title="Task History" />
            <div className="grid gap-3">
              {taskHistory.length === 0 && <EmptyState title="No history items for this task." />}
              {taskHistory.map((item) => (
                <div key={item.id} className="rounded-md border border-neutral-200 p-4">
                  <div className="font-medium">{item.action}</div>
                  <div className="mt-1 text-sm text-neutral-600">
                    {item.user} · {item.role} · {item.dateTime}
                  </div>
                  {(item.oldValue || item.newValue) && (
                    <div className="mt-2 text-sm text-neutral-700">
                      {item.oldValue && <span>Old: {item.oldValue}. </span>}
                      {item.newValue && <span>New: {item.newValue}.</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  function DevelopersPage() {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">Users</h2>
          <Button onClick={() => setModal({ name: "create-developer" })}>Create User</Button>
        </div>
        <Card>
          <Table headers={["Name", "Role", "Password", "Account Status", "Details", "Last Login", "Actions"]}>
            {managedUsers.map((user) => (
              <DeveloperRow key={user.id} user={user} />
            ))}
          </Table>
          {managedUsers.length === 0 && <EmptyState title="No users found." />}
        </Card>
      </div>
    );
  }

  function DeveloperRow({ user }: { user: User }) {
    return (
      <tr className="hover:bg-neutral-50">
        <Cell>{user.name}</Cell>
        <Cell>{user.role}</Cell>
        <Cell>
          <span className="text-neutral-600">Stored securely</span>
        </Cell>
        <Cell>
          <Badge
            className={
              user.accountStatus === "Active"
                ? "border-green-600 bg-white text-green-700"
                : "border-red-600 bg-white text-red-700"
            }
          >
            {user.accountStatus}
          </Badge>
        </Cell>
        <Cell>
          <DeveloperDetailsCell user={user} />
        </Cell>
        <Cell>{user.lastLogin}</Cell>
        <Cell>
          <ActionGroup>
            <Button variant="secondary" onClick={() => setModal({ name: "edit-developer", userId: user.id })}>
              Edit User
            </Button>
            {user.role === "Developer" && (
              <Button variant="secondary" onClick={() => setModal({ name: "change-password", userId: user.id })}>
                Change Password
              </Button>
            )}
          </ActionGroup>
        </Cell>
      </tr>
    );
  }

  function DeveloperDetailsCell({ user }: { user: User }) {
    const counts = developerDetailCounts(user.id);

    return (
      <div className="min-w-44 space-y-2 text-sm">
        <div>Missed deadlines: {counts.missedDeadlines}</div>
        <div>Completed tasks: {counts.completedTasks}</div>
        <div>Failed tasks: {counts.failedTasks}</div>
        <Button
          variant="secondary"
          onClick={() => {
            setHistoryModalTab("login");
            setDeveloperWorkSessions([]);
            setDeveloperWorkHistoryError("");
            setLoginHistoryUserId(user.id);
          }}
        >
          View History
        </Button>
      </div>
    );
  }

  function HelpPage() {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Help</h2>
          <p className="mt-2 text-sm text-neutral-700">Support information for developers.</p>
        </div>
        <Card className="max-w-3xl space-y-4 p-6">
          <div className="space-y-4 text-sm leading-7 text-neutral-800">
            <p>Need help using the app?</p>
            <p>
              If you face any issue while using the task panel, uploading files, updating task status,
              clocking in or clocking out, please contact support. You can also reach out if you do not
              understand how to use any feature inside the app.
            </p>
            <p>
              When contacting support, briefly explain the issue and include any useful details, such as
              the task name, project name, or the action you were trying to complete.
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
            <div className="text-sm font-medium text-black">Contact email</div>
            <a
              href="mailto:mohammad.shihan@outlook.com"
              className="mt-1 inline-block text-sm font-medium text-black underline underline-offset-4"
            >
              mohammad.shihan@outlook.com
            </a>
          </div>
        </Card>
      </div>
    );
  }

  function LoginHistoryModal({ user, onClose }: { user?: User; onClose: () => void }) {
    const records = user ? loginHistoryForUser(user.name) : [];
    const workSections = buildWorkHistorySections(developerWorkSessions, clockTick);

    return (
      <Modal title={`${user?.name ?? "Developer"} History`} onClose={onClose} showCloseButton={false}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={historyModalTab === "login" ? "primary" : "secondary"}
              onClick={() => setHistoryModalTab("login")}
            >
              Login History
            </Button>
            <Button
              variant={historyModalTab === "work" ? "primary" : "secondary"}
              onClick={() => setHistoryModalTab("work")}
            >
              Work History
            </Button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {historyModalTab === "login" ? (
              records.length === 0 ? (
                <EmptyState title="No login or logout records found." />
              ) : (
                <Table headers={["Action", "Date", "Time"]}>
                  {records.map((record) => {
                    const dateTime = splitDateTime(record.dateTime);
                    return (
                      <tr key={record.id} className="hover:bg-neutral-50">
                        <Cell>{record.action}</Cell>
                        <Cell>{dateTime.date}</Cell>
                        <Cell>{dateTime.time}</Cell>
                      </tr>
                    );
                  })}
                </Table>
              )
            ) : developerWorkHistoryLoading ? (
              <EmptyState title="Loading work history." />
            ) : developerWorkHistoryError ? (
              <EmptyState title={developerWorkHistoryError} />
            ) : workSections.length === 0 ? (
              <EmptyState title="No work sessions found." />
            ) : (
              <div className="space-y-4">
                {workSections.map((section) => (
                  <div key={section.date} className="space-y-2">
                    <Table headers={["Date", "Clock In", "Clock Out", "Total Worked"]}>
                      {section.sessions.map((session) => (
                        <tr key={session.id} className="hover:bg-neutral-50">
                          <Cell>{session.date}</Cell>
                          <Cell>{session.clockIn}</Cell>
                          <Cell>{session.clockOut}</Cell>
                          <Cell>{session.totalWorked}</Cell>
                        </tr>
                      ))}
                    </Table>
                    <div className="text-sm font-medium text-neutral-700">
                      Daily total: {formatWorkedDuration(section.dailyTotalMs)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  function AuditLogsPage() {
    const filtered = auditLogs.filter((log) => {
      const search = auditFilters.search.toLowerCase();
      const logDate = toDateInputValue(log.dateTime);
      return (
        (!auditFilters.user || log.user === auditFilters.user) &&
        (!auditFilters.action || log.action === auditFilters.action) &&
        (!auditFilters.entity || log.entityType === auditFilters.entity) &&
        (!auditFilters.from || (logDate && logDate >= auditFilters.from)) &&
        (!auditFilters.to || (logDate && logDate <= auditFilters.to)) &&
        (!search ||
          `${log.user} ${log.role} ${log.action} ${log.entityType} ${log.entityName}`.toLowerCase().includes(search))
      );
    });
    const actions = Array.from(new Set(auditLogs.map((log) => log.action)));
    const entities = Array.from(new Set(auditLogs.map((log) => log.entityType)));

    return (
      <div className="space-y-6">
        <Card>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Select label="User" value={auditFilters.user} onChange={(event) => setAuditFilters({ ...auditFilters, user: event.target.value })}>
              <option value="">All users</option>
              {users.map((user) => (
                <option key={user.id}>{user.name}</option>
              ))}
            </Select>
            <Select
              label="Action type"
              value={auditFilters.action}
              onChange={(event) => setAuditFilters({ ...auditFilters, action: event.target.value })}
            >
              <option value="">All actions</option>
              {actions.map((action) => (
                <option key={action}>{action}</option>
              ))}
            </Select>
            <Select
              label="Entity type"
              value={auditFilters.entity}
              onChange={(event) => setAuditFilters({ ...auditFilters, entity: event.target.value })}
            >
              <option value="">All entities</option>
              {entities.map((entity) => (
                <option key={entity}>{entity}</option>
              ))}
            </Select>
            <Input label="Date from" type="date" value={auditFilters.from} onChange={(event) => setAuditFilters({ ...auditFilters, from: event.target.value })} />
            <Input label="Date to" type="date" value={auditFilters.to} onChange={(event) => setAuditFilters({ ...auditFilters, to: event.target.value })} />
            <Input label="Search" value={auditFilters.search} onChange={(event) => setAuditFilters({ ...auditFilters, search: event.target.value })} />
          </div>
        </Card>
        <Card>
          <Table headers={["Date & Time", "User", "Role", "Action", "Entity Type", "Entity Name", "Old Value", "New Value"]}>
            {filtered.map((log) => (
              <tr key={log.id} className="hover:bg-neutral-50">
                <Cell>{log.dateTime}</Cell>
                <Cell>{log.user}</Cell>
                <Cell>{log.role}</Cell>
                <Cell>{log.action}</Cell>
                <Cell>{log.entityType}</Cell>
                <Cell>{log.entityName}</Cell>
                <Cell>{log.oldValue ?? "-"}</Cell>
                <Cell>{log.newValue ?? "-"}</Cell>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    );
  }

  function TaskListSection({ title, tasks }: { title: string; tasks: Task[] }) {
    return (
      <Card className="border-[#BFDBFE] bg-white">
        <SectionTitle title={title} />
        <div className="grid gap-3">
          {tasks.length === 0 && <EmptyState title="No tasks in this section." />}
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-col gap-3 rounded-md border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-medium">{task.title}</div>
                <div className="text-sm text-neutral-600">
                  {projectName(task.projectId)} · Due <DueDateWarning task={task} compact />
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <StatusBadge status={task.status} />
                <ProjectFileButton project={projectForTask(task)} label="Open file" hideWhenMissing />
                <Button
                  variant="secondary"
                  onClick={() => openTaskDetails(task.id)}
                >
                  View Details
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  function TaskCard({ task }: { task: Task }) {
    return (
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{task.title}</h3>
              {hasIssue(task.id) && <Badge className="border-black bg-white text-black">Issue Reported</Badge>}
            </div>
            <p className="mt-1 text-sm text-neutral-600">{projectName(task.projectId)}</p>
            <p className="mt-3 text-sm text-neutral-700">{task.description}</p>
            <div className="mt-3 text-sm text-neutral-600">
              Due <DueDateWarning task={task} compact /> · Last updated {task.lastUpdated}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:items-end">
            <StatusBadge status={task.status} />
            <ProjectFileButton project={projectForTask(task)} label="Open Project File" hideWhenMissing />
            <Button
              variant="secondary"
              onClick={() => openTaskDetails(task.id)}
            >
              View Details
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  function ProjectFileButton({
    project,
    label,
    hideWhenMissing = false
  }: {
    project?: Project;
    label: string;
    hideWhenMissing?: boolean;
  }) {
    if (!project?.attachment) {
      return hideWhenMissing ? null : <span className="text-sm text-neutral-500">No file</span>;
    }

    return (
      <Button variant="secondary" onClick={() => openProjectAttachment(project)}>
        {label}
      </Button>
    );
  }

  function TaskAttachmentList({ attachments = [] }: { attachments?: TaskAttachment[] }) {
    return (
      <div className="space-y-2">
        {attachments.length === 0 ? (
          <div className="text-sm text-neutral-500">No uploaded files.</div>
        ) : (
          attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex flex-col gap-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="text-sm font-medium text-black">{attachment.name}</div>
                <div className="text-xs text-neutral-500">{attachment.uploadedAt}</div>
              </div>
              <a
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-[#0B1F3A] underline"
              >
                View / Download
              </a>
            </div>
          ))
        )}
      </div>
    );
  }

  function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
    const styles: Record<ProjectStatus, string> = {
      "Not Started": "border-neutral-300 bg-white text-black",
      "In Progress": "border-orange-600 bg-white text-orange-700",
      Completed: "border-green-600 bg-white text-green-700",
      Archived: "border-green-900 bg-white text-green-900"
    };

    return <Badge className={styles[status]}>{status}</Badge>;
  }

  function ProjectForm({
    title,
    project,
    onSubmit,
    onClose
  }: {
    title: string;
    project?: Project;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onClose: () => void;
  }) {
    return (
      <Modal title={title} onClose={onClose} showCloseButton={false}>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input label="Project name" name="name" defaultValue={project?.name} required />
          <Textarea label="Project description" name="description" defaultValue={project?.description} required />
          <Input
            label="Project document attachment"
            name="attachment"
            type="file"
            accept=".pdf,.doc,.docx,.txt"
          />
          {project?.attachment && (
            <p className="text-sm text-neutral-600">Current document: {project.attachment.name}</p>
          )}
          <Select label="Status" name="status" defaultValue={project?.status ?? "Not Started"}>
            {projectStatuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </Select>
          <FormActions onCancel={onClose} />
        </form>
      </Modal>
    );
  }

  function TaskForm({
    title,
    task,
    onSubmit,
    onClose
  }: {
    title: string;
    task?: Task;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onClose: () => void;
  }) {
    const isAdmin = authUser.role === "Admin";
    return (
      <Modal title={title} onClose={onClose} showCloseButton={false}>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input label="Task title" name="title" defaultValue={task?.title} required />
          <Textarea label="Task description" name="description" defaultValue={task?.description} required />
          {isAdmin && (
            <>
              <Select label="Select project" name="projectId" defaultValue={task?.projectId ?? projects[0]?.id}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
              <Select label="Select developer" name="developerId" defaultValue={task?.developerId ?? developers[0]?.id}>
                {developers.map((developer) => (
                  <option key={developer.id} value={developer.id}>
                    {developer.name}
                  </option>
                ))}
              </Select>
              {task && (
                <Select label="Status" name="status" defaultValue={task.status}>
                  {statuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </Select>
              )}
              <DatePickerField label="Due date" name="dueDate" defaultValue={task?.dueDate} required />
            </>
          )}
          {!task && <p className="text-sm text-neutral-600">Initial status will be Pending.</p>}
          <FormActions onCancel={onClose} />
        </form>
      </Modal>
    );
  }

  function ReassignForm({
    task,
    onSubmit,
    onClose
  }: {
    task?: Task;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onClose: () => void;
  }) {
    return (
      <Modal title="Reassign Task" onClose={onClose} showCloseButton={false}>
        <form className="space-y-4" onSubmit={onSubmit}>
          <p className="text-sm text-neutral-700">{task?.title}</p>
          <Select label="Assigned developer" name="developerId" defaultValue={task?.developerId}>
            {developers.map((developer) => (
              <option key={developer.id} value={developer.id}>
                {developer.name}
              </option>
            ))}
          </Select>
          <FormActions onCancel={onClose} />
        </form>
      </Modal>
    );
  }

  function DeveloperForm({
    title,
    user,
    onSubmit,
    onClose
  }: {
    title: string;
    user?: User;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onClose: () => void;
  }) {
    const [accountStatus, setAccountStatus] = useState<"Active" | "Inactive" | "Delete Account">(
      user?.accountStatus ?? "Active"
    );

    return (
      <Modal title={title} onClose={onClose} showCloseButton={false}>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input label="Name" name="name" defaultValue={user?.name} required />
          <Input label="Email" name="email" type="email" defaultValue={user?.email} required />
          {!user && <PasswordInput label="Password" name="password" required />}
          <Select label="Role" name="role" defaultValue={user?.role ?? "Developer"}>
            <option>Developer</option>
            <option>Admin</option>
          </Select>
          <Select
            label="Account status"
            name="accountStatus"
            value={accountStatus}
            onChange={(event) =>
              setAccountStatus(event.target.value as "Active" | "Inactive" | "Delete Account")
            }
          >
            <option>Active</option>
            <option>Inactive</option>
            {user && currentUser?.id !== user.id && <option>Delete Account</option>}
          </Select>
          {accountStatus === "Delete Account" && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              This option will deactivate the account after confirmation.
            </p>
          )}
          <FormActions onCancel={onClose} />
        </form>
      </Modal>
    );
  }

  function PasswordChangeForm({
    user,
    onSubmit,
    onClose
  }: {
    user?: User;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onClose: () => void;
  }) {
    return (
      <Modal title="Change Password" onClose={onClose} showCloseButton={false}>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input label="Name" value={user?.name ?? ""} readOnly />
          <PasswordInput label="New password" name="password" required />
          <PasswordInput label="Confirm password" name="confirm" required />
          <FormActions onCancel={onClose} saveLabel="Save" />
        </form>
      </Modal>
    );
  }
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top text-sm text-black">{children}</td>;
}

function ActionGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-48 flex-col gap-2 sm:flex-row sm:flex-wrap">{children}</div>;
}

function DashboardNavCard({
  label,
  value,
  onClick
}: {
  label: string;
  value: number | string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-md text-left transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8] focus-visible:ring-offset-2"
    >
      <StatCard label={label} value={value} />
    </button>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="mb-4 text-base font-semibold text-black">{title}</h2>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-4">
      <dt className="text-xs font-semibold uppercase text-neutral-500">{label}</dt>
      <dd className="mt-1 text-sm text-black">{value}</dd>
    </div>
  );
}

function RuleList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm text-neutral-700">
      {items.map((item) => (
        <li key={item} className="rounded-md border border-neutral-200 p-3">
          {item}
        </li>
      ))}
    </ul>
  );
}

function FormActions({ onCancel, saveLabel = "Submit" }: { onCancel: () => void; saveLabel?: string }) {
  return (
    <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit">{saveLabel}</Button>
    </div>
  );
}
