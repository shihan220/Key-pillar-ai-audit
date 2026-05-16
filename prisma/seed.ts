import { existsSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcrypt";
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { AccountStatus, CommentType, PrismaClient, ProjectStatus, Role, TaskStatus } from "@prisma/client";

for (const candidate of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), candidate);
  if (existsSync(path)) {
    loadEnv({ path, override: false });
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL ?? ""
  })
});

function parseDate(date: string) {
  return new Date(date);
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.taskHistory.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectAttachment.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const [adminPasswordHash, developerPasswordHash] = await Promise.all([
    bcrypt.hash("admin123", 10),
    bcrypt.hash("dev123", 10)
  ]);

  await prisma.user.createMany({
    data: [
      {
        id: "u-admin",
        name: "Admin",
        email: "admin@keypillarai.local",
        role: Role.ADMIN,
        passwordHash: adminPasswordHash,
        accountStatus: AccountStatus.ACTIVE,
        lastLoginAt: parseDate("2026-05-09T09:00:00Z")
      },
      {
        id: "u-rahim",
        name: "Rahim",
        email: "rahim@keypillarai.local",
        role: Role.DEVELOPER,
        passwordHash: developerPasswordHash,
        accountStatus: AccountStatus.ACTIVE,
        lastLoginAt: parseDate("2026-05-09T10:15:00Z")
      },
      {
        id: "u-karim",
        name: "Karim",
        email: "karim@keypillarai.local",
        role: Role.DEVELOPER,
        passwordHash: developerPasswordHash,
        accountStatus: AccountStatus.ACTIVE,
        lastLoginAt: parseDate("2026-05-08T16:30:00Z")
      }
    ]
  });

  await prisma.project.createMany({
    data: [
      {
        id: "p-website",
        name: "Key Pillar Ai Website",
        description: "Company website refresh and lead capture pages.",
        status: ProjectStatus.IN_PROGRESS,
        createdById: "u-admin",
        createdAt: parseDate("1 May 2026")
      },
      {
        id: "p-crm",
        name: "Client CRM Dashboard",
        description: "Internal client relationship management dashboard.",
        status: ProjectStatus.IN_PROGRESS,
        createdById: "u-admin",
        createdAt: parseDate("2 May 2026")
      },
      {
        id: "p-admin",
        name: "Internal Admin Panel",
        description: "Admin tools for operations, reporting, and access control.",
        status: ProjectStatus.NOT_STARTED,
        createdById: "u-admin",
        createdAt: parseDate("4 May 2026")
      }
    ]
  });

  await prisma.projectAttachment.createMany({
    data: [
      {
        id: "pa-website",
        projectId: "p-website",
        fileName: "Website project brief.pdf",
        storageUrl: "data:text/plain;charset=utf-8,Key%20Pillar%20Ai%20Website%20project%20brief",
        mimeType: "application/pdf",
        uploadedById: "u-admin"
      },
      {
        id: "pa-crm",
        projectId: "p-crm",
        fileName: "CRM dashboard requirements.docx",
        storageUrl: "data:text/plain;charset=utf-8,Client%20CRM%20Dashboard%20requirements",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        uploadedById: "u-admin"
      },
      {
        id: "pa-admin",
        projectId: "p-admin",
        fileName: "Admin panel scope.txt",
        storageUrl: "data:text/plain;charset=utf-8,Internal%20Admin%20Panel%20scope",
        mimeType: "text/plain",
        uploadedById: "u-admin"
      }
    ]
  });

  await prisma.task.createMany({
    data: [
      {
        id: "t-homepage",
        title: "Create homepage",
        description: "Build a clean homepage layout for the Key Pillar Ai Website.",
        projectId: "p-website",
        assignedDeveloperId: "u-rahim",
        createdById: "u-admin",
        approvedById: "u-admin",
        status: TaskStatus.COMPLETE,
        dueAt: parseDate("12 May 2026"),
        approvedAt: parseDate("8 May 2026, 3:10 PM"),
        completedAt: parseDate("8 May 2026, 3:10 PM"),
        createdAt: parseDate("2 May 2026"),
        updatedAt: parseDate("8 May 2026, 3:10 PM")
      },
      {
        id: "t-login",
        title: "Create login page",
        description: "Create the internal password-only login page.",
        projectId: "p-admin",
        assignedDeveloperId: "u-rahim",
        createdById: "u-admin",
        status: TaskStatus.IN_PROGRESS,
        dueAt: parseDate("14 May 2026"),
        startedAt: parseDate("9 May 2026, 10:05 AM"),
        createdAt: parseDate("3 May 2026"),
        updatedAt: parseDate("9 May 2026, 10:05 AM")
      },
      {
        id: "t-api",
        title: "Connect login API",
        description: "Connect frontend login form to the authentication API.",
        projectId: "p-admin",
        assignedDeveloperId: "u-karim",
        createdById: "u-admin",
        status: TaskStatus.PENDING,
        dueAt: parseDate("16 May 2026"),
        createdAt: parseDate("5 May 2026"),
        updatedAt: parseDate("5 May 2026, 9:30 AM")
      },
      {
        id: "t-dashboard",
        title: "Create dashboard UI",
        description: "Create dashboard cards, task tables, and approval sections.",
        projectId: "p-crm",
        assignedDeveloperId: "u-rahim",
        createdById: "u-admin",
        status: TaskStatus.WAITING_FOR_APPROVAL,
        dueAt: parseDate("13 May 2026"),
        submittedForApprovalAt: parseDate("9 May 2026, 11:30 AM"),
        createdAt: parseDate("4 May 2026"),
        updatedAt: parseDate("9 May 2026, 11:30 AM")
      },
      {
        id: "t-responsive",
        title: "Test responsive design",
        description: "Verify desktop, tablet, and mobile screens.",
        projectId: "p-website",
        assignedDeveloperId: "u-karim",
        createdById: "u-admin",
        status: TaskStatus.FAILED,
        dueAt: parseDate("15 May 2026"),
        startedAt: parseDate("9 May 2026, 12:00 PM"),
        createdAt: parseDate("6 May 2026"),
        updatedAt: parseDate("9 May 2026, 12:00 PM")
      },
      {
        id: "t-validation",
        title: "Fix API validation issue",
        description: "Fix API payload validation errors on profile update.",
        projectId: "p-crm",
        assignedDeveloperId: "u-rahim",
        createdById: "u-admin",
        status: TaskStatus.FAILED,
        dueAt: parseDate("17 May 2026"),
        startedAt: parseDate("9 May 2026, 1:00 PM"),
        createdAt: parseDate("7 May 2026"),
        updatedAt: parseDate("9 May 2026, 1:00 PM")
      }
    ]
  });

  await prisma.taskComment.createMany({
    data: [
      {
        id: "c-1",
        taskId: "t-dashboard",
        authorId: "u-rahim",
        type: CommentType.NORMAL_COMMENT,
        body: "I have completed the UI and now working on API connection.",
        createdAt: parseDate("9 May 2026, 11:20 AM")
      },
      {
        id: "c-2",
        taskId: "t-validation",
        authorId: "u-rahim",
        type: CommentType.ISSUE_COMMENT,
        body: "The API is returning 500 error, so I cannot complete the task.",
        createdAt: parseDate("9 May 2026, 12:50 PM")
      }
    ]
  });

  await prisma.taskHistory.createMany({
    data: [
      {
        id: "h-1",
        taskId: "t-dashboard",
        actorId: "u-admin",
        action: "Task created",
        newValue: "Create dashboard UI",
        createdAt: parseDate("4 May 2026, 9:00 AM")
      },
      {
        id: "h-2",
        taskId: "t-dashboard",
        actorId: "u-rahim",
        action: "Task status changed",
        oldValue: "In Progress",
        newValue: "Waiting for Approval",
        createdAt: parseDate("9 May 2026, 11:30 AM")
      },
      {
        id: "h-3",
        taskId: "t-validation",
        actorId: "u-rahim",
        action: "Issue comment added",
        newValue: "The API is returning 500 error, so I cannot complete the task.",
        createdAt: parseDate("9 May 2026, 12:50 PM")
      }
    ]
  });

  await prisma.auditLog.createMany({
    data: [
      {
        id: "a-1",
        actorId: "u-admin",
        actorName: "Admin",
        actorRole: Role.ADMIN,
        action: "User logged in",
        entityType: "User",
        entityId: "u-admin",
        entityName: "Admin",
        createdAt: parseDate("9 May 2026, 9:00 AM")
      },
      {
        id: "a-2",
        actorId: "u-rahim",
        actorName: "Rahim",
        actorRole: Role.DEVELOPER,
        action: "User logged in",
        entityType: "User",
        entityId: "u-rahim",
        entityName: "Rahim",
        createdAt: parseDate("9 May 2026, 10:15 AM")
      },
      {
        id: "a-3",
        actorId: "u-rahim",
        actorName: "Rahim",
        actorRole: Role.DEVELOPER,
        action: "User logged out",
        entityType: "User",
        entityId: "u-rahim",
        entityName: "Rahim",
        createdAt: parseDate("9 May 2026, 10:45 AM")
      },
      {
        id: "a-4",
        actorId: "u-karim",
        actorName: "Karim",
        actorRole: Role.DEVELOPER,
        action: "User logged in",
        entityType: "User",
        entityId: "u-karim",
        entityName: "Karim",
        createdAt: parseDate("8 May 2026, 4:30 PM")
      },
      {
        id: "a-5",
        actorId: "u-karim",
        actorName: "Karim",
        actorRole: Role.DEVELOPER,
        action: "User logged out",
        entityType: "User",
        entityId: "u-karim",
        entityName: "Karim",
        createdAt: parseDate("8 May 2026, 5:10 PM")
      },
      {
        id: "a-6",
        actorId: "u-rahim",
        actorName: "Rahim",
        actorRole: Role.DEVELOPER,
        action: "Task status changed",
        entityType: "Task",
        entityId: "t-login",
        entityName: "Create login page",
        oldValue: "Pending",
        newValue: "In Progress",
        createdAt: parseDate("9 May 2026, 10:05 AM")
      },
      {
        id: "a-7",
        actorId: "u-rahim",
        actorName: "Rahim",
        actorRole: Role.DEVELOPER,
        action: "Task status changed",
        entityType: "Task",
        entityId: "t-dashboard",
        entityName: "Create dashboard UI",
        oldValue: "In Progress",
        newValue: "Waiting for Approval",
        createdAt: parseDate("9 May 2026, 11:30 AM")
      },
      {
        id: "a-8",
        actorId: "u-rahim",
        actorName: "Rahim",
        actorRole: Role.DEVELOPER,
        action: "Issue comment added",
        entityType: "Task",
        entityId: "t-validation",
        entityName: "Fix API validation issue",
        createdAt: parseDate("9 May 2026, 12:50 PM")
      },
      {
        id: "a-9",
        actorId: "u-admin",
        actorName: "Admin",
        actorRole: Role.ADMIN,
        action: "Task approved",
        entityType: "Task",
        entityId: "t-homepage",
        entityName: "Create homepage",
        oldValue: "Waiting for Approval",
        newValue: "Complete",
        createdAt: parseDate("8 May 2026, 3:10 PM")
      },
      {
        id: "a-10",
        actorId: "u-admin",
        actorName: "Admin",
        actorRole: Role.ADMIN,
        action: "Developer password changed by admin",
        entityType: "User",
        entityId: "u-karim",
        entityName: "Karim",
        createdAt: parseDate("7 May 2026, 2:40 PM")
      }
    ]
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
