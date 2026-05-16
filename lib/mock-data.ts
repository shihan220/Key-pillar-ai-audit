import { AuditLog, Comment, HistoryItem, Project, Task, User } from "./types";

export const mockUsers: User[] = [
  {
    id: "u-admin",
    name: "Admin",
    email: "admin@keypillarai.local",
    role: "Admin",
    accountStatus: "Active",
    lastLogin: "9 May 2026, 9:00 AM"
  },
  {
    id: "u-rahim",
    name: "Rahim",
    email: "rahim@keypillarai.local",
    role: "Developer",
    accountStatus: "Active",
    lastLogin: "9 May 2026, 10:15 AM"
  },
  {
    id: "u-karim",
    name: "Karim",
    email: "karim@keypillarai.local",
    role: "Developer",
    accountStatus: "Active",
    lastLogin: "8 May 2026, 4:30 PM"
  }
];

export const mockProjects: Project[] = [
  {
    id: "p-website",
    name: "Key Pillar Ai Website",
    description: "Company website refresh and lead capture pages.",
    attachment: {
      name: "Website project brief.pdf",
      url: "data:text/plain;charset=utf-8,Key%20Pillar%20Ai%20Website%20project%20brief"
    },
    status: "In Progress",
    createdDate: "1 May 2026"
  },
  {
    id: "p-crm",
    name: "Client CRM Dashboard",
    description: "Internal client relationship management dashboard.",
    attachment: {
      name: "CRM dashboard requirements.docx",
      url: "data:text/plain;charset=utf-8,Client%20CRM%20Dashboard%20requirements"
    },
    status: "In Progress",
    createdDate: "2 May 2026"
  },
  {
    id: "p-admin",
    name: "Internal Admin Panel",
    description: "Admin tools for operations, reporting, and access control.",
    attachment: {
      name: "Admin panel scope.txt",
      url: "data:text/plain;charset=utf-8,Internal%20Admin%20Panel%20scope"
    },
    status: "Not Started",
    createdDate: "4 May 2026"
  }
];

export const mockTasks: Task[] = [
  {
    id: "t-homepage",
    title: "Create homepage",
    description: "Build a clean homepage layout for the Key Pillar Ai Website.",
    projectId: "p-website",
    developerId: "u-rahim",
    status: "Complete",
    dueDate: "12 May 2026",
    createdDate: "2 May 2026",
    lastUpdated: "8 May 2026, 3:10 PM"
  },
  {
    id: "t-login",
    title: "Create login page",
    description: "Create the internal password-only login page.",
    projectId: "p-admin",
    developerId: "u-rahim",
    status: "In Progress",
    dueDate: "14 May 2026",
    createdDate: "3 May 2026",
    lastUpdated: "9 May 2026, 10:05 AM"
  },
  {
    id: "t-api",
    title: "Connect login API",
    description: "Connect frontend login form to the authentication API.",
    projectId: "p-admin",
    developerId: "u-karim",
    status: "Pending",
    dueDate: "16 May 2026",
    createdDate: "5 May 2026",
    lastUpdated: "5 May 2026, 9:30 AM"
  },
  {
    id: "t-dashboard",
    title: "Create dashboard UI",
    description: "Create dashboard cards, task tables, and approval sections.",
    projectId: "p-crm",
    developerId: "u-rahim",
    status: "Waiting for Approval",
    dueDate: "13 May 2026",
    createdDate: "4 May 2026",
    lastUpdated: "9 May 2026, 11:30 AM"
  },
  {
    id: "t-responsive",
    title: "Test responsive design",
    description: "Verify desktop, tablet, and mobile screens.",
    projectId: "p-website",
    developerId: "u-karim",
    status: "Failed",
    dueDate: "15 May 2026",
    createdDate: "6 May 2026",
    lastUpdated: "9 May 2026, 12:00 PM"
  },
  {
    id: "t-validation",
    title: "Fix API validation issue",
    description: "Fix API payload validation errors on profile update.",
    projectId: "p-crm",
    developerId: "u-rahim",
    status: "Failed",
    dueDate: "17 May 2026",
    createdDate: "7 May 2026",
    lastUpdated: "9 May 2026, 1:00 PM"
  }
];

export const mockComments: Comment[] = [
  {
    id: "c-1",
    taskId: "t-dashboard",
    writer: "Rahim",
    role: "Developer",
    dateTime: "9 May 2026, 11:20 AM",
    text: "I have completed the UI and now working on API connection.",
    type: "Normal Comment"
  },
  {
    id: "c-2",
    taskId: "t-validation",
    writer: "Rahim",
    role: "Developer",
    dateTime: "9 May 2026, 12:50 PM",
    text: "The API is returning 500 error, so I cannot complete the task.",
    type: "Issue Comment"
  }
];

export const mockHistory: HistoryItem[] = [
  {
    id: "h-1",
    taskId: "t-dashboard",
    action: "Task created",
    user: "Admin",
    role: "Admin",
    newValue: "Create dashboard UI",
    dateTime: "4 May 2026, 9:00 AM"
  },
  {
    id: "h-2",
    taskId: "t-dashboard",
    action: "Task status changed",
    user: "Rahim",
    role: "Developer",
    oldValue: "In Progress",
    newValue: "Waiting for Approval",
    dateTime: "9 May 2026, 11:30 AM"
  },
  {
    id: "h-3",
    taskId: "t-validation",
    action: "Issue comment added",
    user: "Rahim",
    role: "Developer",
    newValue: "The API is returning 500 error, so I cannot complete the task.",
    dateTime: "9 May 2026, 12:50 PM"
  }
];

export const mockAuditLogs: AuditLog[] = [
  {
    id: "a-1",
    dateTime: "9 May 2026, 9:00 AM",
    user: "Admin",
    role: "Admin",
    action: "User logged in",
    entityType: "User",
    entityName: "Admin"
  },
  {
    id: "a-2",
    dateTime: "9 May 2026, 10:15 AM",
    user: "Rahim",
    role: "Developer",
    action: "User logged in",
    entityType: "User",
    entityName: "Rahim"
  },
  {
    id: "a-3",
    dateTime: "9 May 2026, 10:45 AM",
    user: "Rahim",
    role: "Developer",
    action: "User logged out",
    entityType: "User",
    entityName: "Rahim"
  },
  {
    id: "a-4",
    dateTime: "8 May 2026, 4:30 PM",
    user: "Karim",
    role: "Developer",
    action: "User logged in",
    entityType: "User",
    entityName: "Karim"
  },
  {
    id: "a-5",
    dateTime: "8 May 2026, 5:10 PM",
    user: "Karim",
    role: "Developer",
    action: "User logged out",
    entityType: "User",
    entityName: "Karim"
  },
  {
    id: "a-6",
    dateTime: "9 May 2026, 10:05 AM",
    user: "Rahim",
    role: "Developer",
    action: "Task status changed",
    entityType: "Task",
    entityName: "Create login page",
    oldValue: "Pending",
    newValue: "In Progress"
  },
  {
    id: "a-7",
    dateTime: "9 May 2026, 11:30 AM",
    user: "Rahim",
    role: "Developer",
    action: "Task status changed",
    entityType: "Task",
    entityName: "Create dashboard UI",
    oldValue: "In Progress",
    newValue: "Waiting for Approval"
  },
  {
    id: "a-8",
    dateTime: "9 May 2026, 12:50 PM",
    user: "Rahim",
    role: "Developer",
    action: "Issue comment added",
    entityType: "Task",
    entityName: "Fix API validation issue"
  },
  {
    id: "a-9",
    dateTime: "8 May 2026, 3:10 PM",
    user: "Admin",
    role: "Admin",
    action: "Task approved",
    entityType: "Task",
    entityName: "Create homepage",
    oldValue: "Waiting for Approval",
    newValue: "Complete"
  },
  {
    id: "a-10",
    dateTime: "7 May 2026, 2:40 PM",
    user: "Admin",
    role: "Admin",
    action: "Developer password changed by admin",
    entityType: "User",
    entityName: "Karim"
  }
];
