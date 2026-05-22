import { app, safeStorage } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  BuguAuthState,
  BuguClientBootstrap,
  BuguCurrentSession,
  BuguEmailCodeSendInput,
  BuguEmailCodeSendResult,
  BuguEmailCodeVerifyInput,
  BuguPasswordLoginInput,
  BuguTenantSession,
  BuguTenantUser,
  ContentStudioBrandingConfig,
} from '../../shared/types';
import { buildRuntimeBranding, getOemRuntimeConfig } from './oemRuntimeConfig';

interface ApiEnvelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

interface StoredBuguSession {
  tokenEncrypted?: string;
  tokenPlain?: string;
  user?: BuguTenantUser;
  session?: BuguTenantSession;
  savedAt?: string;
}

const OEM_RUNTIME_CONFIG = getOemRuntimeConfig();
const DEFAULT_API_BASE_URL = OEM_RUNTIME_CONFIG.apiBaseUrl || 'https://bugu.run/api';
const DEFAULT_TENANT_ID = OEM_RUNTIME_CONFIG.tenantId || 'tenant-2230';
const DEFAULT_BRANDING = buildRuntimeBranding(OEM_RUNTIME_CONFIG);

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function tenantPath(path: string): string {
  return `/v1/public/tenants/${encodeURIComponent(DEFAULT_TENANT_ID)}${path}`;
}

function normalizeInput(value: string): string {
  return value.trim();
}

function isAutomationSession(): boolean {
  return process.env.CONTENT_STUDIO_SMOKE === '1' || process.env.CONTENT_STUDIO_E2E === '1';
}

function mergeBranding(branding?: ContentStudioBrandingConfig): ContentStudioBrandingConfig {
  return {
    ...DEFAULT_BRANDING,
    ...branding,
  };
}

function buildLocalBootstrap(): BuguClientBootstrap {
  const appName = DEFAULT_BRANDING.appName || '布谷AI';
  return {
    tenant: {
      id: DEFAULT_TENANT_ID,
      name: appName,
      slug: DEFAULT_BRANDING.brandId || 'bugu',
    },
    branding: DEFAULT_BRANDING,
    agentAppCatalog: {
      apps: [
        {
          appId: DEFAULT_BRANDING.brandId || 'bugu',
          displayName: `${appName} 内容生产系统`,
          enabled: true,
        },
      ],
    },
  };
}

function withRuntimeBranding(bootstrap: BuguClientBootstrap): BuguClientBootstrap {
  return {
    ...bootstrap,
    tenant: bootstrap.tenant ?? buildLocalBootstrap().tenant,
    branding: mergeBranding(bootstrap.branding),
  };
}

function buildAutomationAuthState(): BuguAuthState {
  const bootstrap = buildLocalBootstrap();
  return {
    authenticated: true,
    user: {
      id: 'local-automation-user',
      email: 'smoke@bugu.run',
      displayName: '本地验证账号',
      status: 'active',
    },
    session: {
      id: 'local-automation-session',
    },
    bootstrap: {
      ...bootstrap,
      subscription: {
        status: 'active',
        planName: '本地验证',
      },
    },
  };
}

export class BuguAuthService {
  private readonly filePath = join(app.getPath('userData'), 'bugu-auth-session.json');
  private readonly apiBaseUrl = trimTrailingSlash(DEFAULT_API_BASE_URL);

  async getAuthState(): Promise<BuguAuthState> {
    if (isAutomationSession()) return buildAutomationAuthState();

    const token = await this.readToken();
    if (!token) return { authenticated: false, bootstrap: buildLocalBootstrap() };

    try {
      const [current, bootstrap] = await Promise.all([
        this.requestApi<BuguCurrentSession>(tenantPath('/client/session'), undefined, token),
        this.requestApi<BuguClientBootstrap>(tenantPath('/client/bootstrap'), undefined, token),
      ]);
      await this.saveSession(token, current);
      return {
        authenticated: true,
        user: current.user,
        session: current.session,
        bootstrap: withRuntimeBranding(bootstrap),
      };
    } catch (error) {
      await this.clearSession();
      return {
        authenticated: false,
        bootstrap: buildLocalBootstrap(),
        error: error instanceof Error ? error.message : '登录状态已失效，请重新登录。',
      };
    }
  }

  async loginByPassword(input: BuguPasswordLoginInput): Promise<BuguAuthState> {
    const identifier = normalizeInput(input.identifier);
    const password = input.password;
    if (!identifier || !password) throw new Error('请输入邮箱 / 用户名和密码。');

    const session = await this.requestApi<BuguCurrentSession>(tenantPath('/auth/password/login'), {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    return this.persistAndBuildState(session);
  }

  async sendEmailCode(input: BuguEmailCodeSendInput): Promise<BuguEmailCodeSendResult> {
    const identifier = normalizeInput(input.identifier);
    if (!identifier) throw new Error('请输入邮箱。');
    return this.requestApi<BuguEmailCodeSendResult>(tenantPath('/auth/email-code/send'), {
      method: 'POST',
      body: JSON.stringify({ identifier, turnstileToken: input.turnstileToken }),
    });
  }

  async verifyEmailCode(input: BuguEmailCodeVerifyInput): Promise<BuguAuthState> {
    const identifier = normalizeInput(input.identifier);
    const code = normalizeInput(input.code);
    const displayName = normalizeInput(input.displayName || '');
    if (!identifier || !code) throw new Error('请输入邮箱和验证码。');

    const session = await this.requestApi<BuguCurrentSession>(tenantPath('/auth/email-code/verify'), {
      method: 'POST',
      body: JSON.stringify({ identifier, code, displayName }),
    });
    return this.persistAndBuildState(session);
  }

  async logout(): Promise<BuguAuthState> {
    const token = await this.readToken();
    if (token) {
      await this.requestApi<{ revoked?: boolean }>(
        tenantPath('/client/logout'),
        { method: 'POST' },
        token,
      ).catch(() => undefined);
    }
    await this.clearSession();
    return { authenticated: false, bootstrap: buildLocalBootstrap() };
  }

  private async persistAndBuildState(session: BuguCurrentSession): Promise<BuguAuthState> {
    const token = normalizeInput(session.token || '');
    if (!token) throw new Error('账号服务未返回会话 token。');
    await this.saveSession(token, session);
    return this.getAuthState();
  }

  private async requestApi<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set('Accept', 'application/json');
    if (init?.body) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers,
    });
    const envelope = await response.json().catch(() => ({})) as ApiEnvelope<T>;
    if (!response.ok) {
      throw new Error(envelope.message || `${response.status} ${response.statusText}`);
    }
    if (envelope.data === undefined || envelope.data === null) {
      throw new Error(envelope.message || '账号服务未返回数据。');
    }
    return envelope.data;
  }

  private async readToken(): Promise<string | undefined> {
    const stored = await this.readRaw();
    if (stored.tokenEncrypted) {
      try {
        return safeStorage.decryptString(Buffer.from(stored.tokenEncrypted, 'base64'));
      } catch {
        await this.clearSession();
        return undefined;
      }
    }
    return stored.tokenPlain;
  }

  private async saveSession(token: string, session: BuguCurrentSession): Promise<void> {
    const stored: StoredBuguSession = {
      user: session.user,
      session: session.session,
      savedAt: new Date().toISOString(),
    };
    if (safeStorage.isEncryptionAvailable()) {
      stored.tokenEncrypted = safeStorage.encryptString(token).toString('base64');
    } else {
      stored.tokenPlain = token;
    }
    await this.writeRaw(stored);
  }

  private async clearSession(): Promise<void> {
    await this.writeRaw({});
  }

  private async readRaw(): Promise<StoredBuguSession> {
    if (!existsSync(this.filePath)) return {};
    try {
      return JSON.parse(await readFile(this.filePath, 'utf-8')) as StoredBuguSession;
    } catch {
      return {};
    }
  }

  private async writeRaw(session: StoredBuguSession): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(session, null, 2)}\n`, 'utf-8');
  }
}
