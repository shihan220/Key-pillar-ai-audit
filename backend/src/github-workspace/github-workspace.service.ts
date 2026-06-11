import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { FrontendGithubWorkspace, FrontendGithubWorkspaceDeveloper, FrontendGithubWorkspaceRepository } from '../common/frontend-types';
import type { AuthenticatedUser } from '../auth/auth-user';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REPOSITORIES = [
  'shihan220/Key-pillar-ai-audit',
  'vercel/next.js',
  'nestjs/nest',
  'prisma/prisma',
];

type CachedWorkspace = {
  expiresAt: number;
  data: FrontendGithubWorkspace;
};

type GitHubRepositoryResponse = {
  name: string;
  full_name: string;
  language: string | null;
  updated_at: string;
  html_url: string;
  owner: {
    login: string;
    avatar_url: string;
  };
};

type GitHubCollaboratorResponse = {
  login: string;
  avatar_url: string;
  type?: string;
  permissions?: {
    pull?: boolean;
    push?: boolean;
    admin?: boolean;
  };
};

type GitHubUserResponse = {
  login: string;
  name: string | null;
  avatar_url: string;
};

type ParsedRepository = {
  owner: string;
  name: string;
  fullName: string;
};

@Injectable()
export class GitHubWorkspaceService {
  private readonly logger = new Logger(GitHubWorkspaceService.name);
  private cache: CachedWorkspace | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getWorkspace(): Promise<FrontendGithubWorkspace> {
    await this.ensureSeedRepositories();

    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.data;
    }

    const repositories = await this.prisma.gitWorkspaceRepository.findMany({
      orderBy: { createdAt: 'asc' },
    });

    try {
      const repositoryResults = await Promise.allSettled(
        repositories.map((repository) =>
          this.fetchRepository({
            owner: repository.owner,
            name: repository.name,
            fullName: repository.fullName,
            id: repository.id,
            token: repository.accessTokenEncrypted ? this.decryptToken(repository.accessTokenEncrypted) : undefined,
          }),
        ),
      );

      const successfulRepositories = repositoryResults.flatMap((result, index) => {
        if (result.status === 'fulfilled') {
          return [result.value];
        }

        const repository = repositories[index];
        this.logger.warn(
          `Skipping GitHub workspace repository ${repository?.fullName ?? 'unknown'} because it could not be refreshed.`,
        );
        return repository ? [this.fallbackRepository(repository)] : [];
      });

      const data = {
        repositories: successfulRepositories,
        refreshedAt: new Date().toISOString(),
      };

      this.cache = {
        data,
        expiresAt: now + CACHE_TTL_MS,
      };

      return data;
    } catch (error) {
      this.logger.error('Failed to refresh GitHub workspace data.', error instanceof Error ? error.stack : undefined);
      if (this.cache?.data) {
        return this.cache.data;
      }
      throw error;
    }
  }

  async addRepository(user: AuthenticatedUser, url: string, accessToken: string) {
    this.requireAdmin(user);

    const parsed = this.parseRepositoryUrl(url);
    const token = this.requireAccessToken(accessToken);

    const existing = await this.prisma.gitWorkspaceRepository.findUnique({
      where: { fullName: parsed.fullName },
    });
    await this.fetchRepository({
      ...parsed,
      token,
    });

    const encryptedToken = this.encryptToken(token);

    if (existing) {
      const repository = await this.prisma.gitWorkspaceRepository.update({
        where: { id: existing.id },
        data: {
          owner: parsed.owner,
          name: parsed.name,
          fullName: parsed.fullName,
          accessTokenEncrypted: encryptedToken,
          addedById: user.id,
        },
      });

      this.invalidateCache();
      return { success: true, id: repository.id, updated: true };
    }

    const repository = await this.prisma.gitWorkspaceRepository.create({
      data: {
        owner: parsed.owner,
        name: parsed.name,
        fullName: parsed.fullName,
        accessTokenEncrypted: encryptedToken,
        addedById: user.id,
      },
    });

    await this.notificationsService.notifyDevelopers(
      'GitHub repository added',
      'Git Workspace',
      repository.id,
      'New repository added',
      `${user.name} added ${parsed.fullName} in the Git Workspace section.`,
    );

    this.invalidateCache();
    return { success: true, id: repository.id, updated: false };
  }

  async deleteRepository(user: AuthenticatedUser, repositoryId: string) {
    this.requireAdmin(user);

    const existing = await this.prisma.gitWorkspaceRepository.findUnique({
      where: { id: repositoryId },
    });
    if (!existing) {
      throw new NotFoundException('Repository not found.');
    }

    await this.prisma.gitWorkspaceRepository.delete({
      where: { id: repositoryId },
    });

    this.invalidateCache();
    return { success: true };
  }

  private invalidateCache() {
    this.cache = null;
  }

  private async ensureSeedRepositories() {
    const configured = this.getConfiguredRepositories();
    if (configured.length === 0) return;

    await this.prisma.gitWorkspaceRepository.createMany({
      data: configured.map((repository) => {
        const parsed = this.parseRepositoryRef(repository);
        return {
          owner: parsed.owner,
          name: parsed.name,
          fullName: parsed.fullName,
        };
      }),
      skipDuplicates: true,
    });
  }

  private getConfiguredRepositories() {
    const configured = process.env.GITHUB_REPOSITORIES?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    return configured && configured.length > 0 ? configured : DEFAULT_REPOSITORIES;
  }

  private requireAdmin(user: AuthenticatedUser) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin access required.');
    }
  }

  private parseRepositoryUrl(url: string): ParsedRepository {
    const trimmed = url.trim();

    try {
      const parsed = new URL(trimmed);
      if (!['github.com', 'www.github.com'].includes(parsed.hostname.toLowerCase())) {
        throw new BadRequestException('Invalid GitHub URL.');
      }

      const [owner, name] = parsed.pathname
        .replace(/^\/+|\/+$/g, '')
        .split('/')
        .slice(0, 2);

      if (!owner || !name) {
        throw new BadRequestException('Invalid GitHub URL.');
      }

      return {
        owner,
        name: name.replace(/\.git$/i, ''),
        fullName: `${owner}/${name.replace(/\.git$/i, '')}`,
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Invalid GitHub URL.');
    }
  }

  private parseRepositoryRef(value: string): ParsedRepository {
    const [owner, name] = value.split('/');
    if (!owner || !name) {
      throw new Error(`Invalid GitHub repository value: ${value}`);
    }

    return {
      owner,
      name,
      fullName: `${owner}/${name}`,
    };
  }

  private getToken() {
    return process.env.GITHUB_TOKEN?.trim() || process.env.GITHUB_ACCESS_TOKEN?.trim() || undefined;
  }

  private requireAccessToken(value: string) {
    const token = value.trim();
    if (!token) {
      throw new BadRequestException('GitHub access token is required.');
    }
    return token;
  }

  private getEncryptionKey() {
    const secret =
      process.env.GITHUB_TOKEN_ENCRYPTION_KEY?.trim() ||
      process.env.JWT_SECRET?.trim() ||
      'local-dev-secret';

    return createHash('sha256').update(secret).digest();
  }

  private encryptToken(token: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decryptToken(payload: string) {
    const [ivBase64, authTagBase64, encryptedBase64] = payload.split(':');
    if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
      return undefined;
    }

    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getEncryptionKey(),
        Buffer.from(ivBase64, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedBase64, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      this.logger.warn('Unable to decrypt stored GitHub access token. Falling back to global token if available.');
      return undefined;
    }
  }

  private getHeaders(token?: string) {
    return {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'key-pillar-audit-task-app',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async fetchRepository({
    owner,
    name,
    fullName,
    id,
    token,
  }: ParsedRepository & { id?: string; token?: string }): Promise<FrontendGithubWorkspaceRepository> {
    const authToken = token ?? this.getToken();
    const repository = await this.fetchJson<GitHubRepositoryResponse>(
      `https://api.github.com/repos/${owner}/${name}`,
      authToken,
    );
    const workingDevelopers = await this.fetchWorkingDevelopers(owner, name, repository, authToken);

    return {
      id: id ?? fullName,
      fullName: repository.full_name,
      name: repository.name,
      language: repository.language ?? 'Unknown',
      updatedAt: repository.updated_at,
      url: repository.html_url,
      workingDevelopers,
    };
  }

  private fallbackRepository(repository: {
    id: string;
    owner: string;
    name: string;
    fullName: string;
    updatedAt: Date;
  }): FrontendGithubWorkspaceRepository {
    return {
      id: repository.id,
      fullName: repository.fullName,
      name: repository.name,
      language: 'Unknown',
      updatedAt: repository.updatedAt.toISOString(),
      url: `https://github.com/${repository.fullName}`,
      workingDevelopers: [
        {
          login: repository.owner,
          name: repository.owner,
          initials: this.getInitials(repository.owner),
        },
      ],
    };
  }

  private async fetchWorkingDevelopers(
    owner: string,
    repo: string,
    repository: GitHubRepositoryResponse,
    token?: string,
  ): Promise<FrontendGithubWorkspaceDeveloper[]> {
    const ownerProfile = await this.fetchJson<GitHubUserResponse>(
      `https://api.github.com/users/${repository.owner.login}`,
      token,
    ).catch(() => ({
      login: repository.owner.login,
      name: null,
      avatar_url: repository.owner.avatar_url,
    }));

    const collaborators = await this.fetchCollaborators(owner, repo, token);
    const developers = [this.mapDeveloper(ownerProfile), ...collaborators];
    const uniqueDevelopers = new Map<string, FrontendGithubWorkspaceDeveloper>();

    for (const developer of developers) {
      if (!uniqueDevelopers.has(developer.login)) {
        uniqueDevelopers.set(developer.login, developer);
      }
    }

    return Array.from(uniqueDevelopers.values());
  }

  private async fetchCollaborators(owner: string, repo: string, token?: string): Promise<FrontendGithubWorkspaceDeveloper[]> {
    if (!token) {
      return [];
    }

    const collaborators = await this.fetchJson<GitHubCollaboratorResponse[]>(
      `https://api.github.com/repos/${owner}/${repo}/collaborators?per_page=100`,
      token,
    );

    const workingCollaborators = collaborators.filter((collaborator) => {
      if (collaborator.type?.toLowerCase() === 'bot') return false;
      return Boolean(collaborator.permissions?.push || collaborator.permissions?.admin || collaborator.permissions?.pull);
    });

    const users = await Promise.all(
      workingCollaborators.map((collaborator) =>
        this.fetchJson<GitHubUserResponse>(`https://api.github.com/users/${collaborator.login}`, token).catch(() => ({
          login: collaborator.login,
          name: null,
          avatar_url: collaborator.avatar_url,
        })),
      ),
    );

    return users.map((user) => this.mapDeveloper(user));
  }

  private mapDeveloper(user: GitHubUserResponse): FrontendGithubWorkspaceDeveloper {
    const displayName = user.name?.trim() || user.login;
    return {
      login: user.login,
      name: displayName,
      avatarUrl: user.avatar_url,
      initials: this.getInitials(displayName),
    };
  }

  private getInitials(value: string) {
    const parts = value
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) return 'GH';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }

  private async fetchJson<T>(url: string, token?: string): Promise<T> {
    const response = await fetch(url, {
      headers: this.getHeaders(token),
      cache: 'no-store',
    });

    if (response.status === 404) {
      throw new NotFoundException('Repository not found.');
    }

    if (response.status === 401 || response.status === 403) {
      throw new ForbiddenException('GitHub access failed. Check the access token or repository permissions.');
    }

    if (!response.ok) {
      throw new BadGatewayException(`GitHub API error (${response.status}).`);
    }

    return (await response.json()) as T;
  }
}
