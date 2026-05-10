"use client";

import { FormEvent, useMemo, useState } from "react";
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
import { mockAuditLogs, mockComments, mockHistory, mockProjects, mockTasks, mockUsers } from "@/lib/mock-data";
import { AuditLog, Comment, HistoryItem, Project, ProjectAttachment, ProjectStatus, Role, Status, Task, User } from "@/lib/types";

type Page =
  | "admin-dashboard"
  | "developer-dashboard"
  | "projects"
  | "tasks"
  | "my-tasks"
  | "task-details"
  | "developers"
  | "audit-logs"
  | "qr-install"
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

const statuses: Status[] = ["Pending", "In Progress", "Failed", "Waiting for Approval", "Complete"];
const projectStatuses: ProjectStatus[] = ["Not Started", "In Progress", "Completed", "Archived"];

function nowLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Europe/London"
  }).format(new Date());
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function projectAttachmentFromForm(form: FormData, existing?: ProjectAttachment): ProjectAttachment | undefined {
  const file = form.get("attachment");
  if (file instanceof File && file.size > 0) {
    return {
      name: file.name,
      url: URL.createObjectURL(file)
    };
  }
  return existing;
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

export default function Home() {
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [projects, setProjects] = useState<Project[]>(mockProjects);
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [comments, setComments] = useState<Comment[]>(mockComments);
  const [history, setHistory] = useState<HistoryItem[]>(mockHistory);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(mockAuditLogs);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [page, setPage] = useState<Page>("admin-dashboard");
  const [selectedTaskId, setSelectedTaskId] = useState<string>("t-dashboard");
  const [taskReturnPage, setTaskReturnPage] = useState<Page>("tasks");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [modal, setModal] = useState<ModalState>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [loginHistoryUserId, setLoginHistoryUserId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loginError, setLoginError] = useState("");
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

  const addAudit = (
    action: string,
    entityType: string,
    entityName: string,
    oldValue?: string,
    newValue?: string,
    actor = currentUser
  ) => {
    if (!actor) return;
    setAuditLogs((logs) => [
      {
        id: makeId("audit"),
        dateTime: nowLabel(),
        user: actor.name,
        role: actor.role,
        action,
        entityType,
        entityName,
        oldValue,
        newValue
      },
      ...logs
    ]);
  };

  const addHistory = (taskId: string, action: string, oldValue?: string, newValue?: string, actor = currentUser) => {
    if (!actor) return;
    setHistory((items) => [
      {
        id: makeId("history"),
        taskId,
        action,
        user: actor.name,
        role: actor.role,
        oldValue,
        newValue,
        dateTime: nowLabel()
      },
      ...items
    ]);
  };

  const updateTask = (taskId: string, patch: Partial<Task>, action: string, oldValue?: string, newValue?: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    setTasks((items) =>
      items.map((item) => (item.id === taskId ? { ...item, ...patch, lastUpdated: nowLabel() } : item))
    );
    addAudit(action, "Task", task.title, oldValue, newValue);
    addHistory(taskId, action, oldValue, newValue);
  };

  const login = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const nextUser =
      password === "admin123"
        ? users.find((user) => user.role === "Admin")
        : password === "dev123"
          ? users.find((user) => user.name === "Rahim")
          : null;

    if (!nextUser || nextUser.accountStatus !== "Active") {
      setLoginError("Invalid password or inactive account.");
      return;
    }

    const loginTime = nowLabel();
    const updatedUser = { ...nextUser, lastLogin: loginTime };
    setUsers((items) => items.map((user) => (user.id === updatedUser.id ? updatedUser : user)));
    setCurrentUser(updatedUser);
    setPage(updatedUser.role === "Admin" ? "admin-dashboard" : "developer-dashboard");
    setLoginError("");
    setAuditLogs((logs) => [
      {
        id: makeId("audit"),
        dateTime: loginTime,
        user: updatedUser.name,
        role: updatedUser.role,
        action: "User logged in",
        entityType: "User",
        entityName: updatedUser.name
      },
      ...logs
    ]);
  };

  const logout = () => {
    if (currentUser) {
      addAudit("User logged out", "User", currentUser.name, undefined, undefined, currentUser);
    }
    setCurrentUser(null);
    setMobileOpen(false);
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

  const openTaskDetails = (taskId: string) => {
    setSelectedTaskId(taskId);
    setTaskReturnPage(page === "task-details" ? (currentUser?.role === "Admin" ? "tasks" : "my-tasks") : page);
    navigate("task-details");
  };

  const createProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const project: Project = {
      id: makeId("project"),
      name: String(form.get("name")),
      description: String(form.get("description")),
      attachment: projectAttachmentFromForm(form),
      status: form.get("status") as ProjectStatus,
      createdDate: nowLabel()
    };
    setProjects((items) => [project, ...items]);
    addAudit(
      "Project created",
      "Project",
      project.name,
      undefined,
      project.attachment ? `${project.status} with ${project.attachment.name}` : project.status
    );
    setModal(null);
  };

  const editProject = (event: FormEvent<HTMLFormElement>, projectId: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const nextStatus = form.get("status") as ProjectStatus;
    const nextAttachment = projectAttachmentFromForm(form, project.attachment);
    setProjects((items) =>
      items.map((item) =>
        item.id === projectId
          ? {
              ...item,
              name: String(form.get("name")),
              description: String(form.get("description")),
              attachment: nextAttachment,
              status: nextStatus,
              archived: nextStatus === "Archived"
            }
          : item
      )
    );
    addAudit(
      "Project edited",
      "Project",
      project.name,
      project.attachment?.name ?? project.status,
      nextAttachment?.name ?? nextStatus
    );
    setModal(null);
  };

  const deleteProject = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    setProjects((items) => items.filter((item) => item.id !== projectId));
    setTasks((items) => items.map((item) => (item.projectId === projectId ? { ...item, deleted: true } : item)));
    if (selectedProjectId === projectId) setSelectedProjectId("");
    setDeleteProjectId(null);
    addAudit("Project deleted", "Project", project.name, project.status, "Deleted");
  };

  const createTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const task: Task = {
      id: makeId("task"),
      title: String(form.get("title")),
      description: String(form.get("description")),
      projectId: String(form.get("projectId")),
      developerId: String(form.get("developerId")),
      status: "Pending",
      dueDate: String(form.get("dueDate")),
      createdDate: nowLabel(),
      lastUpdated: nowLabel()
    };
    setTasks((items) => [task, ...items]);
    addAudit("Task created", "Task", task.title, undefined, "Pending");
    addHistory(task.id, "Task created", undefined, task.title);
    addHistory(task.id, "Task assigned", undefined, developerName(task.developerId));
    setSelectedTaskId(task.id);
    setModal(null);
  };

  const editTask = (event: FormEvent<HTMLFormElement>, taskId: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const patch: Partial<Task> = {
      title: String(form.get("title")),
      description: String(form.get("description")),
      dueDate: String(form.get("dueDate"))
    };
    if (currentUser?.role === "Admin") {
      patch.projectId = String(form.get("projectId"));
      patch.developerId = String(form.get("developerId"));
      patch.status = form.get("status") as Status;
    }
    updateTask(taskId, patch, "Task edited", task.title, patch.title);
    setModal(null);
  };

  const reassignTask = (event: FormEvent<HTMLFormElement>, taskId: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const oldDeveloper = developerName(task.developerId);
    const developerId = String(form.get("developerId"));
    updateTask(taskId, { developerId }, "Task reassigned", oldDeveloper, developerName(developerId));
    setModal(null);
  };

  const approveTask = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status !== "Waiting for Approval") return;
    updateTask(taskId, { status: "Complete" }, "Task approved", "Waiting for Approval", "Complete");
  };

  const deleteTask = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    updateTask(taskId, { deleted: true }, "Task deleted", task.status, "Deleted");
    setDeleteTaskId(null);
    if (page === "task-details") setPage(currentUser?.role === "Admin" ? "tasks" : "my-tasks");
  };

  const changeTaskStatus = (taskId: string, status: Status) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    updateTask(taskId, { status }, "Task status changed", task.status, status);
  };

  const addComment = (event: FormEvent<HTMLFormElement>, taskId: string) => {
    event.preventDefault();
    if (!currentUser) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const form = new FormData(event.currentTarget);
    const type = form.get("type") as Comment["type"];
    const text = String(form.get("text"));
    if (!text.trim()) return;
    const comment: Comment = {
      id: makeId("comment"),
      taskId,
      writer: currentUser.name,
      role: currentUser.role,
      dateTime: nowLabel(),
      text,
      type
    };
    setComments((items) => [comment, ...items]);
    addAudit(type === "Issue Comment" ? "Issue comment added" : "Comment added", "Task", task.title, undefined, text);
    addHistory(taskId, type === "Issue Comment" ? "Issue comment added" : "Comment added", undefined, text);
    event.currentTarget.reset();
  };

  const createDeveloper = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const user: User = {
      id: makeId("user"),
      name: String(form.get("name")),
      password: String(form.get("password")),
      role: form.get("role") as Role,
      accountStatus: form.get("accountStatus") as User["accountStatus"],
      lastLogin: "Never"
    };
    setUsers((items) => [user, ...items]);
    addAudit("Developer account created", "User", user.name);
    setModal(null);
  };

  const editDeveloper = (event: FormEvent<HTMLFormElement>, userId: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const user = users.find((item) => item.id === userId);
    if (!user) return;
    setUsers((items) =>
      items.map((item) =>
        item.id === userId
          ? {
              ...item,
              name: String(form.get("name")),
              role: form.get("role") as Role,
              accountStatus: form.get("accountStatus") as User["accountStatus"]
            }
          : item
      )
    );
    addAudit("Developer account edited", "User", user.name);
    setModal(null);
  };

  const changePassword = (event: FormEvent<HTMLFormElement>, userId: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    const confirm = String(form.get("confirm"));
    if (password !== confirm) return;
    const user = users.find((item) => item.id === userId);
    if (!user) return;
    setUsers((items) => items.map((item) => (item.id === userId ? { ...item, password } : item)));
    addAudit("Developer password changed by admin", "User", user.name);
    setModal(null);
  };

  const projectName = (projectId: string) => projects.find((project) => project.id === projectId)?.name ?? "Unknown";
  const projectForTask = (task: Task) => projects.find((project) => project.id === task.projectId);
  const developerName = (developerId: string) => users.find((user) => user.id === developerId)?.name ?? "Unassigned";
  const hasIssue = (taskId: string) =>
    comments.some((comment) => comment.taskId === taskId && comment.type === "Issue Comment");
  const openProjectAttachment = (project?: Project) => {
    if (!project?.attachment) return;
    window.open(project.attachment.url, "_blank", "noopener,noreferrer");
    addAudit("Project document opened", "Project", project.name, undefined, project.attachment.name);
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

  if (!currentUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-4">
        <Card className="w-full max-w-md p-6">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-black text-sm font-semibold">
              KP
            </div>
            <p className="text-sm font-semibold text-black">Key Pillar Ai</p>
            <h1 className="mt-2 text-2xl font-semibold text-black">Audit Log & Task Tracking</h1>
            <p className="mt-2 text-sm text-neutral-600">Internal access only</p>
          </div>
          <form className="space-y-4" onSubmit={login}>
            <PasswordInput label="Password" name="password" autoComplete="current-password" required />
            {loginError && <p className="text-sm text-black">{loginError}</p>}
            <Button className="w-full" type="submit">
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
          ["qr-install", "QR Install"],
          ["settings", "Settings"]
        ]
      : [
          ["developer-dashboard", "My Dashboard"],
          ["my-tasks", "My Tasks"],
          ["qr-install", "QR Install"]
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
          <div className="text-lg font-semibold">Key Pillar Ai</div>
          <div className="text-sm text-neutral-600">Audit Log & Task Tracking</div>
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
          <div className="text-right text-sm">
            <div className="font-medium">{authUser.name}</div>
            <div className="text-neutral-600">{authUser.role}</div>
          </div>
        </header>

        <main className="p-4 lg:p-6">
          {page === "admin-dashboard" && <AdminDashboard />}
          {page === "developer-dashboard" && <DeveloperDashboard />}
          {page === "projects" && <ProjectsPage />}
          {page === "tasks" && <TasksPage />}
          {page === "my-tasks" && <MyTasksPage />}
          {page === "task-details" && selectedTask && <TaskDetailsPage task={selectedTask} />}
          {page === "developers" && <DevelopersPage />}
          {page === "audit-logs" && <AuditLogsPage />}
          {page === "qr-install" && <QrInstallPage />}
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
      {loginHistoryUserId && (
        <LoginHistoryModal
          user={users.find((item) => item.id === loginHistoryUserId)}
          onClose={() => setLoginHistoryUserId(null)}
        />
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
          <StatCard label="Total Projects" value={counts.totalProjects} />
          <StatCard label="Active Projects" value={counts.activeProjects} />
          <StatCard label="Completed Projects" value={counts.completedProjects} />
          <StatCard label="Total Tasks" value={counts.totalTasks} />
          <StatCard label="Pending Tasks" value={counts.pending} />
          <StatCard label="In Progress Tasks" value={counts.progress} />
          <StatCard label="Failed Tasks" value={counts.failed} />
          <StatCard label="Waiting for Approval Tasks" value={counts.waiting} />
          <StatCard label="Completed Tasks" value={counts.complete} />
          <StatCard label="Total Developers" value={counts.developers} />
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
                  <Button onClick={() => approveTask(task.id)}>Approve</Button>
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
            {projects.map((project) => {
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
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">Tasks</h2>
          <Button onClick={() => setModal({ name: "create-task" })}>Create Task</Button>
        </div>
        <Card>
          <Table headers={["Task Title", "Project", "Assigned Developer", "Status", "Due Date", "Created Date", "Actions"]}>
            {activeTasks.map((task) => (
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
                      <Button onClick={() => approveTask(task.id)}>Approve task</Button>
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
                <Button onClick={() => changeTaskStatus(task.id, "Waiting for Approval")}>Send for Approval</Button>
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
              {task.status === "Waiting for Approval" && <Button onClick={() => approveTask(task.id)}>Approve Task</Button>}
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
    const [show, setShow] = useState(false);
    return (
      <tr className="hover:bg-neutral-50">
        <Cell>{user.name}</Cell>
        <Cell>{user.role}</Cell>
        <Cell>
          <div className="flex items-center gap-2">
            <span>{show ? user.password : "••••••••"}</span>
            <Button variant="secondary" onClick={() => setShow((value) => !value)}>
              {show ? "Hide" : "Show"}
            </Button>
          </div>
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
        <Button variant="secondary" onClick={() => setLoginHistoryUserId(user.id)}>
          View History
        </Button>
      </div>
    );
  }

  function LoginHistoryModal({ user, onClose }: { user?: User; onClose: () => void }) {
    const records = user ? loginHistoryForUser(user.name) : [];

    return (
      <Modal title={`${user?.name ?? "Developer"} Login History`} onClose={onClose}>
        {records.length === 0 ? (
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
        )}
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

  function QrInstallPage() {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="p-6 text-center">
          <h2 className="text-xl font-semibold">Install Key Pillar Ai App</h2>
          <div className="mx-auto my-6 grid h-56 w-56 grid-cols-5 gap-2 border border-black bg-white p-4">
            {Array.from({ length: 25 }).map((_, index) => (
              <div key={index} className={index % 2 === 0 || index % 7 === 0 ? "bg-black" : "bg-neutral-200"} />
            ))}
          </div>
          <p className="break-all text-sm font-medium">https://app.keypillarai.com/install</p>
          <p className="mt-3 text-sm text-neutral-600">
            Scan this QR code from your mobile device to open and install the app.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              onClick={() => {
                navigator.clipboard?.writeText("https://app.keypillarai.com/install");
                addAudit("App install link copied", "QR Install", "Key Pillar Ai App");
              }}
            >
              Copy App Link
            </Button>
            <Button
              variant="secondary"
              onClick={() => addAudit("QR code download requested", "QR Install", "Key Pillar Ai App")}
            >
              Download QR Code
            </Button>
          </div>
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
          <RuleList items={["Password-only login", "Developers cannot change passwords", "Admin can change passwords"]} />
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
          <Input label="Due date" name="dueDate" type="text" defaultValue={task?.dueDate} placeholder="15 May 2026" required />
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
