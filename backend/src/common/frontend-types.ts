export type FrontendRole = 'Admin' | 'Developer';

export type FrontendStatus =
  | 'Pending'
  | 'In Progress'
  | 'Failed'
  | 'Waiting for Approval'
  | 'Complete';

export type FrontendProjectStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Archived';

export type FrontendProjectAttachment = {
  name: string;
  url: string;
};

export type FrontendTaskAttachment = {
  id: string;
  name: string;
  url: string;
  mimeType?: string;
  uploadedAt: string;
};

export type FrontendClockSession = {
  id: string;
  userId: string;
  clockInAt: string;
  clockOutAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FrontendUser = {
  id: string;
  name: string;
  email: string;
  role: FrontendRole;
  accountStatus: 'Active' | 'Inactive';
  lastLogin: string;
};

export type FrontendProject = {
  id: string;
  name: string;
  description: string;
  attachment?: FrontendProjectAttachment;
  status: FrontendProjectStatus;
  createdDate: string;
  archived?: boolean;
};

export type FrontendComment = {
  id: string;
  taskId: string;
  writer: string;
  role: FrontendRole;
  dateTime: string;
  text: string;
  type: 'Normal Comment' | 'Issue Comment';
};

export type FrontendHistoryItem = {
  id: string;
  taskId: string;
  action: string;
  user: string;
  role: FrontendRole;
  oldValue?: string;
  newValue?: string;
  dateTime: string;
};

export type FrontendTask = {
  id: string;
  title: string;
  description: string;
  projectId: string;
  developerId: string;
  status: FrontendStatus;
  dueDate: string;
  createdDate: string;
  lastUpdated: string;
  attachments: FrontendTaskAttachment[];
  deleted?: boolean;
};

export type FrontendAuditLog = {
  id: string;
  dateTime: string;
  user: string;
  role: FrontendRole;
  action: string;
  entityType: string;
  entityName: string;
  oldValue?: string;
  newValue?: string;
};

export type FrontendAppState = {
  users: FrontendUser[];
  projects: FrontendProject[];
  tasks: FrontendTask[];
  comments: FrontendComment[];
  history: FrontendHistoryItem[];
  auditLogs: FrontendAuditLog[];
  activeClockSession: FrontendClockSession | null;
};
