export type Role = "Admin" | "Developer";

export type Status =
  | "Pending"
  | "In Progress"
  | "Failed"
  | "Waiting for Approval"
  | "Complete";

export type ProjectStatus = "Not Started" | "In Progress" | "Completed" | "Archived";

export type ProjectAttachment = {
  name: string;
  url: string;
};

export type User = {
  id: string;
  name: string;
  role: Role;
  password: string;
  accountStatus: "Active" | "Inactive";
  lastLogin: string;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  attachment?: ProjectAttachment;
  status: ProjectStatus;
  createdDate: string;
  archived?: boolean;
};

export type Comment = {
  id: string;
  taskId: string;
  writer: string;
  role: Role;
  dateTime: string;
  text: string;
  type: "Normal Comment" | "Issue Comment";
};

export type HistoryItem = {
  id: string;
  taskId: string;
  action: string;
  user: string;
  role: Role;
  oldValue?: string;
  newValue?: string;
  dateTime: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  projectId: string;
  developerId: string;
  status: Status;
  dueDate: string;
  createdDate: string;
  lastUpdated: string;
  deleted?: boolean;
};

export type AuditLog = {
  id: string;
  dateTime: string;
  user: string;
  role: Role;
  action: string;
  entityType: string;
  entityName: string;
  oldValue?: string;
  newValue?: string;
};
