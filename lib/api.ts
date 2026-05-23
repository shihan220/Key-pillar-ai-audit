import { AuditLog, ClockSession, Comment, HistoryItem, Notification, Project, Task, User } from "./types";

const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !configuredApiBaseUrl) {
  throw new Error("API base URL is not configured.");
}

const REQUIRED_API_BASE_URL: string = configuredApiBaseUrl || "http://localhost:4000";

const AUTH_TOKEN_KEY = "key-pillar-auth-token";
const AUTH_USER_KEY = "key-pillar-auth-user";

type JsonBody = Record<string, unknown> | undefined;
type RequestBody = JsonBody | FormData | undefined;

type AppStateResponse = {
  users: User[];
  projects: Project[];
  tasks: Task[];
  comments: Comment[];
  history: HistoryItem[];
  auditLogs: AuditLog[];
  activeClockSession: ClockSession | null;
};

function getStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

function buildApiUrl(path: string) {
  const baseUrl = REQUIRED_API_BASE_URL.endsWith("/") ? REQUIRED_API_BASE_URL : `${REQUIRED_API_BASE_URL}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, baseUrl).toString();
}

export function storeAuthSession(accessToken: string, user: User) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
}

export function getStoredUser() {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(AUTH_USER_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as User;
  } catch {
    return null;
  }
}

async function request<T>(path: string, method = "GET", body?: RequestBody): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  if (body && !isFormData) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = buildApiUrl(path);
  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
      cache: "no-store"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown network error";
    throw new Error(`Network request failed. Check the frontend API base URL and backend availability. ${message}`);
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) {
        message = data.message.join(", ");
      } else if (typeof data.message === "string") {
        message = data.message;
      }
    } catch {
      // keep fallback message
    }

    if (response.status === 401) {
      clearAuthSession();
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function fetchHealth() {
  return request<{ ok: true }>("/health");
}

export function fetchAppState() {
  return request<AppStateResponse>("/app-state");
}

export function login(email: string, password: string) {
  return request<{ user: User; accessToken: string }>("/auth/login", "POST", { email, password });
}

export function fetchCurrentUser() {
  return request<{ user: User }>("/auth/me");
}

export function logout() {
  return request<{ success: boolean }>("/auth/logout", "POST");
}

export function clockIn() {
  return request<{ session: ClockSession | null }>("/clock-sessions/clock-in", "POST");
}

export function clockOut() {
  return request<{ session: ClockSession | null }>("/clock-sessions/clock-out", "POST");
}

export function fetchCurrentClockSession() {
  return request<{ session: ClockSession | null }>("/clock-sessions/current");
}

export function fetchClockHistory() {
  return request<{ sessions: ClockSession[] }>("/clock-sessions/history");
}

export function fetchNotifications() {
  return request<{ notifications: Notification[] }>("/notifications");
}

export function fetchNotificationUnreadCount() {
  return request<{ count: number }>("/notifications/unread-count");
}

export function markNotificationAsRead(notificationId: string) {
  return request<{ success: boolean }>(`/notifications/${notificationId}/read`, "POST");
}

export function fetchUserClockHistory(userId: string) {
  return request<{ sessions: ClockSession[] }>(`/clock-sessions/user/${userId}/history`);
}

export function createProject(body: FormData) {
  return request<{ success: boolean; id: string }>("/projects", "POST", body);
}

export function updateProject(projectId: string, body: FormData) {
  return request<{ success: boolean }>(`/projects/${projectId}`, "PATCH", body);
}

export function deleteProject(projectId: string) {
  return request<{ success: boolean }>(`/projects/${projectId}`, "DELETE");
}

export function createTask(body: {
  title: string;
  description: string;
  projectId: string;
  developerId: string;
  dueDate: string;
}) {
  return request<{ success: boolean; id: string }>("/tasks", "POST", body);
}

export function updateTask(
  taskId: string,
  body: {
    title?: string;
    description?: string;
    dueDate?: string;
    projectId?: string;
    developerId?: string;
    status?: Task["status"];
  }
) {
  return request<{ success: boolean }>(`/tasks/${taskId}`, "PATCH", body);
}

export function deleteTask(taskId: string) {
  return request<{ success: boolean }>(`/tasks/${taskId}`, "DELETE");
}

export function reassignTask(taskId: string, developerId: string) {
  return request<{ success: boolean }>(`/tasks/${taskId}/reassign`, "POST", { developerId });
}

export function approveTask(taskId: string) {
  return request<{ success: boolean }>(`/tasks/${taskId}/approve`, "POST");
}

export function changeTaskStatus(taskId: string, status: Task["status"]) {
  return request<{ success: boolean }>(`/tasks/${taskId}/status`, "POST", { status });
}

export function removeFailedStatus(taskId: string) {
  return request<{ success: boolean }>(`/tasks/${taskId}/remove-failed-status`, "POST");
}

export function addComment(
  taskId: string,
  body: {
    text: string;
    type: Comment["type"];
  }
) {
  return request<{ success: boolean }>(`/tasks/${taskId}/comments`, "POST", body);
}

export function uploadTaskAttachment(taskId: string, body: FormData) {
  return request<{ success: boolean; id: string }>(`/tasks/${taskId}/attachments`, "POST", body);
}

export function createUser(body: {
  name: string;
  email: string;
  password: string;
  role: User["role"];
  accountStatus: User["accountStatus"];
}) {
  return request<{ success: boolean; id: string }>("/users", "POST", body);
}

export function updateUser(
  userId: string,
  body: {
    name: string;
    email: string;
    role: User["role"];
    accountStatus: User["accountStatus"];
  }
) {
  return request<{ success: boolean }>(`/users/${userId}`, "PATCH", body);
}

export function deleteUserAccount(userId: string) {
  return request<{ success: boolean }>(`/users/${userId}`, "DELETE");
}

export function changeUserPassword(
  userId: string,
  body: {
    currentPassword?: string;
    password: string;
    confirmPassword: string;
  }
) {
  return request<{ success: boolean }>(`/users/${userId}/change-password`, "POST", body);
}
