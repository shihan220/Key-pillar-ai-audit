import {
  AccountStatus,
  AuditLog,
  CommentType,
  ClockSession,
  Project,
  ProjectAttachment,
  ProjectStatus,
  Role,
  Task,
  TaskComment,
  TaskHistory,
  TaskStatus,
  User,
} from '@prisma/client';
import {
  FrontendAuditLog,
  FrontendClockSession,
  FrontendComment,
  FrontendHistoryItem,
  FrontendProject,
  FrontendProjectStatus,
  FrontendRole,
  FrontendStatus,
  FrontendTask,
  FrontendUser,
} from './frontend-types';

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Europe/London',
});

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/London',
});

export function formatDateTime(value?: Date | null) {
  if (!value) return 'Never';
  return dateTimeFormatter.format(value);
}

export function formatDate(value?: Date | null) {
  if (!value) return '-';
  return dateFormatter.format(value);
}

export function parseDateInput(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return parsed;
}

export function roleToFrontend(role: Role | null | undefined): FrontendRole {
  return role === Role.ADMIN ? 'Admin' : 'Developer';
}

export function roleFromFrontend(role: string) {
  return role === 'Admin' ? Role.ADMIN : Role.DEVELOPER;
}

export function accountStatusToFrontend(status: AccountStatus): 'Active' | 'Inactive' {
  return status === AccountStatus.ACTIVE ? 'Active' : 'Inactive';
}

export function accountStatusFromFrontend(status: string) {
  return status === 'Inactive' ? AccountStatus.INACTIVE : AccountStatus.ACTIVE;
}

export function taskStatusToFrontend(status: TaskStatus): FrontendStatus {
  const map: Record<TaskStatus, FrontendStatus> = {
    [TaskStatus.PENDING]: 'Pending',
    [TaskStatus.IN_PROGRESS]: 'In Progress',
    [TaskStatus.FAILED]: 'Failed',
    [TaskStatus.WAITING_FOR_APPROVAL]: 'Waiting for Approval',
    [TaskStatus.COMPLETE]: 'Complete',
  };
  return map[status];
}

export function taskStatusFromFrontend(status: string) {
  const map: Record<string, TaskStatus> = {
    Pending: TaskStatus.PENDING,
    'In Progress': TaskStatus.IN_PROGRESS,
    Failed: TaskStatus.FAILED,
    'Waiting for Approval': TaskStatus.WAITING_FOR_APPROVAL,
    Complete: TaskStatus.COMPLETE,
  };
  const next = map[status];
  if (!next) {
    throw new Error(`Invalid task status: ${status}`);
  }
  return next;
}

export function projectStatusToFrontend(status: ProjectStatus): FrontendProjectStatus {
  const map: Record<ProjectStatus, FrontendProjectStatus> = {
    [ProjectStatus.NOT_STARTED]: 'Not Started',
    [ProjectStatus.IN_PROGRESS]: 'In Progress',
    [ProjectStatus.COMPLETED]: 'Completed',
    [ProjectStatus.ARCHIVED]: 'Archived',
  };
  return map[status];
}

export function projectStatusFromFrontend(status: string) {
  const map: Record<string, ProjectStatus> = {
    'Not Started': ProjectStatus.NOT_STARTED,
    'In Progress': ProjectStatus.IN_PROGRESS,
    Completed: ProjectStatus.COMPLETED,
    Archived: ProjectStatus.ARCHIVED,
  };
  const next = map[status];
  if (!next) {
    throw new Error(`Invalid project status: ${status}`);
  }
  return next;
}

export function commentTypeToFrontend(type: CommentType): 'Normal Comment' | 'Issue Comment' {
  return type === CommentType.ISSUE_COMMENT ? 'Issue Comment' : 'Normal Comment';
}

export function commentTypeFromFrontend(type: string) {
  return type === 'Issue Comment' ? CommentType.ISSUE_COMMENT : CommentType.NORMAL_COMMENT;
}

export function stringifyJson(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

export function mapUser(user: User): FrontendUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: roleToFrontend(user.role),
    accountStatus: accountStatusToFrontend(user.accountStatus),
    lastLogin: formatDateTime(user.lastLoginAt),
  };
}

export function mapProject(project: Project & { attachments: ProjectAttachment[] }): FrontendProject {
  const attachment = project.attachments[0];
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    attachment: attachment
      ? {
          name: attachment.fileName,
          url: attachment.storageUrl,
        }
      : undefined,
    status: projectStatusToFrontend(project.status),
    createdDate: formatDate(project.createdAt),
    archived: Boolean(project.archivedAt) || project.status === ProjectStatus.ARCHIVED,
  };
}

export function mapClockSession(session: ClockSession): FrontendClockSession {
  return {
    id: session.id,
    userId: session.userId,
    clockInAt: session.clockInAt.toISOString(),
    clockOutAt: session.clockOutAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export function mapTask(task: Task): FrontendTask {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    projectId: task.projectId,
    developerId: task.assignedDeveloperId,
    status: taskStatusToFrontend(task.status),
    dueDate: formatDate(task.dueAt),
    createdDate: formatDateTime(task.createdAt),
    lastUpdated: formatDateTime(task.updatedAt),
    deleted: Boolean(task.deletedAt),
  };
}

export function mapComment(
  comment: TaskComment & {
    author: User;
  },
): FrontendComment {
  return {
    id: comment.id,
    taskId: comment.taskId,
    writer: comment.author.name,
    role: roleToFrontend(comment.author.role),
    dateTime: formatDateTime(comment.createdAt),
    text: comment.body,
    type: commentTypeToFrontend(comment.type),
  };
}

export function mapHistory(
  item: TaskHistory & {
    actor: User | null;
  },
): FrontendHistoryItem {
  return {
    id: item.id,
    taskId: item.taskId,
    action: item.action,
    user: item.actor?.name ?? 'Unknown',
    role: roleToFrontend(item.actor?.role),
    oldValue: stringifyJson(item.oldValue),
    newValue: stringifyJson(item.newValue),
    dateTime: formatDateTime(item.createdAt),
  };
}

export function mapAudit(log: AuditLog): FrontendAuditLog {
  return {
    id: log.id,
    dateTime: formatDateTime(log.createdAt),
    user: log.actorName,
    role: roleToFrontend(log.actorRole),
    action: log.action,
    entityType: log.entityType,
    entityName: log.entityName,
    oldValue: stringifyJson(log.oldValue),
    newValue: stringifyJson(log.newValue),
  };
}
