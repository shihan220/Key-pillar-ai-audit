import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProjectStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth-user';
import { projectStatusFromFrontend } from '../common/frontend-mappers';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';

type UploadedAttachment = {
  originalname?: string;
  mimetype?: string;
  buffer?: Buffer;
};

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async createProject(user: AuthenticatedUser, body: CreateProjectDto, file: UploadedAttachment | undefined, publicOrigin: string) {
    this.requireAdmin(user);
    const attachment = file ? await this.storeAttachment(file, publicOrigin) : undefined;

    const project = await this.prisma.project.create({
      data: {
        name: body.name,
        description: body.description,
        status: projectStatusFromFrontend(body.status),
        archivedAt: body.status === 'Archived' ? new Date() : null,
        createdById: user.id,
        attachments: attachment
          ? {
              create: {
                fileName: attachment.name,
                storageUrl: attachment.url,
                mimeType: attachment.mimeType,
                uploadedById: user.id,
              },
            }
          : undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'Project created',
        entityType: 'Project',
        entityId: project.id,
        entityName: project.name,
      },
    });

    return { success: true, id: project.id };
  }

  async updateProject(
    projectId: string,
    user: AuthenticatedUser,
    body: UpdateProjectDto,
    file: UploadedAttachment | undefined,
    publicOrigin: string,
  ) {
    this.requireAdmin(user);

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { attachments: { orderBy: { createdAt: 'asc' } } },
    });
    if (!project || project.deletedAt) {
      throw new NotFoundException('Project not found.');
    }

    const nextStatus = body.status ? projectStatusFromFrontend(body.status) : project.status;
    const attachment = file ? await this.storeAttachment(file, publicOrigin) : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: {
          name: body.name ?? project.name,
          description: body.description ?? project.description,
          status: nextStatus,
          archivedAt: nextStatus === ProjectStatus.ARCHIVED ? new Date() : null,
        },
      });

      if (attachment) {
        if (project.attachments[0]) {
          await tx.projectAttachment.update({
            where: { id: project.attachments[0].id },
            data: {
              fileName: attachment.name,
              storageUrl: attachment.url,
              mimeType: attachment.mimeType,
              uploadedById: user.id,
            },
          });
        } else {
          await tx.projectAttachment.create({
            data: {
              projectId,
              fileName: attachment.name,
              storageUrl: attachment.url,
              mimeType: attachment.mimeType,
              uploadedById: user.id,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          action: 'Project edited',
          entityType: 'Project',
          entityId: project.id,
          entityName: body.name ?? project.name,
        },
      });
    });

    return { success: true };
  }

  async deleteProject(projectId: string, user: AuthenticatedUser) {
    this.requireAdmin(user);

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.deletedAt) {
      throw new NotFoundException('Project not found.');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: projectId },
        data: { deletedAt: now },
      });
      await tx.task.updateMany({
        where: { projectId, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role,
          action: 'Project deleted',
          entityType: 'Project',
          entityId: project.id,
          entityName: project.name,
          oldValue: project.status,
          newValue: 'Deleted',
        },
      });
    });

    return { success: true };
  }

  private requireAdmin(user: AuthenticatedUser) {
    if (!user?.id) {
      throw new BadRequestException('Authenticated user is required.');
    }
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }
  }

  private async storeAttachment(file: UploadedAttachment, publicOrigin: string) {
    if (!file.buffer || !file.originalname) {
      throw new BadRequestException('Attachment upload failed.');
    }

    const extension = extname(file.originalname);
    const storedName = `${Date.now()}-${randomUUID()}${extension}`;
    const uploadDirectory = join(process.cwd(), 'uploads', 'project-documents');
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(join(uploadDirectory, storedName), file.buffer);

    return {
      name: file.originalname,
      url: `${publicOrigin}/uploads/project-documents/${storedName}`,
      mimeType: file.mimetype,
    };
  }
}
