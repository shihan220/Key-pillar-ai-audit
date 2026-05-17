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
  deleteProject as apiDeleteProject,
  deleteTask as apiDeleteTask,
  fetchAppState,
  fetchNotifications as apiFetchNotifications,
  fetchNotificationUnreadCount,
  fetchUserClockHistory,
  getStoredUser,
  login as apiLogin,
  logout as apiLogout,
  markNotificationAsRead as apiMarkNotificationAsRead,
  reassignTask as apiReassignTask,
  removeFailedStatus as apiRemoveFailedStatus,
  storeAuthSession,
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
  | "settings";

type ModalState =
  | { name: "create-project" }
  | { name: "edit-project"; projectId: string }
  | { name: "create-task" }
  | { name: "edit-task"; taskId: string }
  | { name: "reassign-task"; taskId: string }
  | { name: "create-developer" }
  | { name: "edit-developer"; userId: string }
  | { name: "change-password"; userId: string }
  | null;

type AdminProjectDashboardFilter = "all" | "active" | "completed";
type AdminTaskDashboardFilter = "all" | "pending" | "in-progress" | "failed" | "waiting-for-approval" | "complete";

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
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [adminProjectDashboardFilter, setAdminProjectDashboardFilter] = useState<AdminProjectDashboardFilter>("all");
  const [adminTaskDashboardFilter, setAdminTaskDashboardFilter] = useState<AdminTaskDashboardFilter>("all");
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
  const selectedTask = activeTasks.find((task) => task.id === selectedTaskId) ?? activeTasks[0];
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const developers = users.filter((user) => user.role === "Developer");
  const activeClockDuration = useMemo(() => {
    if (!activeClockSession) return "";
    const startedAt = Date.parse(activeClockSession.clockInAt);
    if (Number.isNaN(startedAt)) return "00:00:00";
    return formatDuration(clockTick - startedAt);
  }, [activeClockSession, clockTick]);

  const resetAppState = () => {
    setUsers([]);
    setProjects([]);
    setTasks([]);
    setComments([]);
    setHistory([]);
    setAuditLogs([]);
    setNotifications([]);
    setNotificationUnreadCount(0);
    setSelectedNotification(null);
    setActiveClockSession(null);
    setSelectedTaskId("");
    setSelectedProjectId("");
    setShowClockInPrompt(false);
    setClockOutPromptMode(null);
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
    setPage(storedUser.role === "Admin" ? "admin-dashboard" : "developer-dashboard");
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
      setSelectedNotification(null);
      return;
    }

    let cancelled = false;

    void Promise.all([apiFetchNotifications(), fetchNotificationUnreadCount()])
      .then(([notificationResponse, unreadCountResponse]) => {
        if (cancelled) return;
        setNotifications(notificationResponse.notifications);
        setNotificationUnreadCount(unreadCountResponse.count);
      })
      .catch((error) => {
        console.error(error);
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
      setPage(response.user.role === "Admin" ? "admin-dashboard" : "developer-dashboard");
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
      setPage("admin-dashboard");
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
    if (currentUser?.role === "Developer" && activeClockSession) {
      setClockOutPromptMode("logout");
      return;
    }
    await performLogout();
  };

  const navigate = (nextPage: Page) => {
    if (!currentUser) return;
    const adminOnly: Page[] = ["admin-dashboard", "projects", "tasks", "developers", "audit-logs", "settings"];
    const developerOnly: Page[] = ["developer-dashboard", "my-tasks"];
    if (currentUser.role === "Developer" && adminOnly.includes(nextPage)) return;
    if (currentUser.role === "Admin" && developerOnly.includes(nextPage)) return;
    setPage(nextPage);
    setMobileOpen(false);
  };

  const openAdminDashboardTarget = (
    nextPage: Extract<Page, "projects" | "tasks" | "developers">,
    options?: {
      projectFilter?: AdminProjectDashboardFilter;
      taskFilter?: AdminTaskDashboardFilter;
      path?: string;
    }
  ) => {
    if (!currentUser || currentUser.role !== "Admin") return;
    setAdminProjectDashboardFilter(options?.projectFilter ?? "all");
    setAdminTaskDashboardFilter(options?.taskFilter ?? "all");
    setPage(nextPage);
    setMobileOpen(false);
    if (typeof window !== "undefined" && options?.path) {
      window.history.pushState({}, "", options.path);
    }
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
    try {
      const form = new FormData(event.currentTarget);
      const body: {
        title: string;
        description: string;
        dueDate: string;
        projectId?: string;
        developerId?: string;
        status?: Status;
      } = {
        title: String(form.get("title")),
        description: String(form.get("description")),
        dueDate: String(form.get("dueDate"))
      };

      if (currentUser.role === "Admin") {
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
      showActionError(error, "Failed to create developer.");
    }
  };

  const editDeveloper = async (event: FormEvent<HTMLFormElement>, userId: string) => {
    event.preventDefault();
    if (!currentUser) return;
    try {
      const form = new FormData(event.currentTarget);
      await apiUpdateUser(userId, {
        name: String(form.get("name")),
        email: String(form.get("email")),
        role: form.get("role") as Role,
        accountStatus: form.get("accountStatus") as User["accountStatus"]
      });
      await refreshState(currentUser.id);
      setModal(null);
    } catch (error) {
      showActionError(error, "Failed to update developer.");
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
  const isDashboardPage = page === "admin-dashboard" || page === "developer-dashboard";

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
          ["my-tasks", "My Tasks"]
        ];

  const pageTitle =
    navItems.find(([key]) => key === page)?.[1] ??
    (page === "task-details" ? "Task Details" : page === "projects" ? "Projects" : "Dashboard");

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
                page === key ? "bg-black text-white" : "text-black hover:bg-neutral-100"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={logout}
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
          {page === "task-details" && selectedTask && <TaskDetailsPage task={selectedTask} />}
          {page === "developers" && <DevelopersPage />}
          {page === "audit-logs" && <AuditLogsPage />}
          {page === "settings" && <SettingsPage />}
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
      {modal?.name === "create-developer" && (
        <DeveloperForm title="Create Developer" onSubmit={createDeveloper} onClose={() => setModal(null)} />
      )}
      {modal?.name === "edit-developer" && (
        <DeveloperForm
          title="Edit Developer"
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

    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <DashboardNavCard label="Total Projects" value={counts.totalProjects} onClick={() => openAdminDashboardTarget("projects", { projectFilter: "all", path: "/?section=projects" })} />
          <DashboardNavCard label="Active Projects" value={counts.activeProjects} onClick={() => openAdminDashboardTarget("projects", { projectFilter: "active", path: "/?section=projects&status=active" })} />
          <DashboardNavCard label="Completed Projects" value={counts.completedProjects} onClick={() => openAdminDashboardTarget("projects", { projectFilter: "completed", path: "/?section=projects&status=completed" })} />
          <DashboardNavCard label="Total Tasks" value={counts.totalTasks} onClick={() => openAdminDashboardTarget("tasks", { taskFilter: "all", path: "/?section=tasks" })} />
          <DashboardNavCard label="Pending Tasks" value={counts.pending} onClick={() => openAdminDashboardTarget("tasks", { taskFilter: "pending", path: "/?section=tasks&status=pending" })} />
          <DashboardNavCard label="In Progress Tasks" value={counts.progress} onClick={() => openAdminDashboardTarget("tasks", { taskFilter: "in-progress", path: "/?section=tasks&status=in-progress" })} />
          <DashboardNavCard label="Failed Tasks" value={counts.failed} onClick={() => openAdminDashboardTarget("tasks", { taskFilter: "failed", path: "/?section=tasks&status=failed" })} />
          <DashboardNavCard label="Waiting for Approval Tasks" value={counts.waiting} onClick={() => openAdminDashboardTarget("tasks", { taskFilter: "waiting-for-approval", path: "/?section=tasks&status=waiting-for-approval" })} />
          <DashboardNavCard label="Completed Tasks" value={counts.complete} onClick={() => openAdminDashboardTarget("tasks", { taskFilter: "complete", path: "/?section=tasks&status=complete" })} />
          <DashboardNavCard label="Total Developers" value={counts.developers} onClick={() => openAdminDashboardTarget("developers", { path: "/?section=developers" })} />
        </div>

        <Card>
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

        <Card>
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

        <Card>
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

    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="My Total Tasks" value={myTasks.length} />
          <StatCard label="Pending" value={list("Pending").length} />
          <StatCard label="In Progress" value={list("In Progress").length} />
          <StatCard label="Failed" value={list("Failed").length} />
          <StatCard label="Waiting for Approval" value={list("Waiting for Approval").length} />
          <StatCard label="Complete" value={list("Complete").length} />
        </div>
        <TaskListSection title="My Current Tasks" tasks={myTasks.filter((task) => ["Pending", "In Progress"].includes(task.status))} />
        <TaskListSection title="My Failed Tasks" tasks={list("Failed")} />
        <TaskListSection title="My Waiting for Approval Tasks" tasks={list("Waiting for Approval")} />
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
                  <Cell>{task.dueDate}</Cell>
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
                <Cell>{task.dueDate}</Cell>
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
    const canComment = authUser.role === "Admin" || task.developerId === authUser.id;
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
            <Info label="Due date" value={task.dueDate} />
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
        </Card>

        <Card>
          <SectionTitle title="Task Status Flow" />
          <StatusTimeline current={task.status} />
        </Card>

        <Card>
          <SectionTitle title="Actions" />
          {authUser.role === "Developer" ? (
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
              <Button variant="secondary" onClick={() => setModal({ name: "edit-task", taskId: task.id })}>
                Edit Task
              </Button>
            </ActionGroup>
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
          {canComment && (
            <form className="space-y-4" onSubmit={(event) => addComment(event, task.id)}>
              <Textarea label="Comment" name="text" required />
              <Select label="Comment type" name="type" defaultValue="Normal Comment">
                <option>Normal Comment</option>
                <option>Issue Comment</option>
              </Select>
              <Button type="submit">{authUser.role === "Admin" ? "Add Admin Comment" : "Add Comment"}</Button>
            </form>
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
          <h2 className="text-xl font-semibold">Developers</h2>
          <Button onClick={() => setModal({ name: "create-developer" })}>Create Developer</Button>
        </div>
        <Card>
          <Table headers={["Name", "Role", "Password", "Account Status", "Details", "Last Login", "Actions"]}>
            {users.map((user) => (
              <DeveloperRow key={user.id} user={user} />
            ))}
          </Table>
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
              Edit Developer
            </Button>
            <Button variant="secondary" onClick={() => setModal({ name: "change-password", userId: user.id })}>
              Change Password
            </Button>
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

  function LoginHistoryModal({ user, onClose }: { user?: User; onClose: () => void }) {
    const records = user ? loginHistoryForUser(user.name) : [];
    const workRows = developerWorkSessions.map((session) => {
      const clockIn = new Date(session.clockInAt);
      const clockOut = session.clockOutAt ? new Date(session.clockOutAt) : null;
      const completedDuration = clockOut ? Math.max(0, clockOut.getTime() - clockIn.getTime()) : null;

      return {
        id: session.id,
        date: formatWorkDate(session.clockInAt),
        clockIn: formatWorkTime(session.clockInAt),
        clockOut: clockOut ? formatWorkTime(session.clockOutAt as string) : "In progress",
        totalWorked: completedDuration !== null ? formatWorkedDuration(completedDuration) : "In progress",
        completedDuration
      };
    });

    const workSections = workRows.reduce<
      { date: string; sessions: typeof workRows; dailyTotalMs: number }[]
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
        dailyTotalMs: row.completedDuration ?? 0
      });
      return groups;
    }, []);

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

  function SettingsPage() {
    return (
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <SectionTitle title="Company Profile" />
          <Info label="Company name" value="Key Pillar Ai" />
          <Info label="App name" value="Audit Log & Task Tracking App" />
        </Card>
        <Card>
          <SectionTitle title="App Theme" />
          <Badge className="border-black bg-white text-black">Black and white selected</Badge>
        </Card>
        <Card>
          <SectionTitle title="Password Management Rules" />
          <RuleList items={["Email and password login", "Developers cannot change passwords", "Admin can change passwords"]} />
        </Card>
        <Card>
          <SectionTitle title="Task Status Rules" />
          <RuleList items={statuses} />
        </Card>
      </div>
    );
  }

  function TaskListSection({ title, tasks }: { title: string; tasks: Task[] }) {
    return (
      <Card>
        <SectionTitle title={title} />
        <div className="grid gap-3">
          {tasks.length === 0 && <EmptyState title="No tasks in this section." />}
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-medium">{task.title}</div>
                <div className="text-sm text-neutral-600">
                  {projectName(task.projectId)} · Due {task.dueDate}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <StatusBadge status={task.status} />
                <ProjectFileButton project={projectForTask(task)} label="Open file" hideWhenMissing />
                <Button
                  variant="secondary"
                  onClick={() => openTaskDetails(task.id)}
                >
                  Open task
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
              Due {task.dueDate} · Last updated {task.lastUpdated}
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
            </>
          )}
          <DatePickerField label="Due date" name="dueDate" defaultValue={task?.dueDate} required />
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
    return (
      <Modal title={title} onClose={onClose} showCloseButton={false}>
        <form className="space-y-4" onSubmit={onSubmit}>
          <Input label="Developer name" name="name" defaultValue={user?.name} required />
          <Input label="Email" name="email" type="email" defaultValue={user?.email} required />
          {!user && <PasswordInput label="Password" name="password" required />}
          <Select label="Role" name="role" defaultValue={user?.role ?? "Developer"}>
            <option>Developer</option>
            <option>Admin</option>
          </Select>
          <Select label="Account status" name="accountStatus" defaultValue={user?.accountStatus ?? "Active"}>
            <option>Active</option>
            <option>Inactive</option>
          </Select>
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
          <Input label="Developer name" value={user?.name ?? ""} readOnly />
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
      className="rounded-md text-left transition hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
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
