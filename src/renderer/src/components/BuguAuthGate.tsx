import { FormEvent, useEffect, useState } from 'react';
import type { BuguAuthState } from '../../../shared/types';

type RequestState = 'idle' | 'loading' | 'success' | 'error';

export interface BuguAuthActions {
  onPasswordLogin: (input: { identifier: string; password: string }) => Promise<BuguAuthState>;
}

interface BuguAuthFormProps extends BuguAuthActions {
  checking?: boolean;
  authState?: BuguAuthState | null;
  compact?: boolean;
  title?: string;
  description?: string;
}

interface BuguAuthGateProps extends BuguAuthActions {
  checking: boolean;
  authState: BuguAuthState | null;
  onSkip: () => void;
}

interface SkipDirectActionProps {
  variant: 'hero' | 'panel';
  onSkip: () => void;
}

function resolveAccountVerificationUrl(authState?: BuguAuthState | null): string | undefined {
  const value = authState?.bootstrap?.branding?.supportUrl?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : '登录失败，请稍后再试。';
  if (message.includes('tenant user not found')) return '账号不存在或尚未开通，请先到官网完成邮箱验证并设置密码。';
  if (message.includes('password not configured')) return '该账号尚未设置密码，请先到官网完成邮箱验证并设置密码。';
  return message;
}

function resolveBrandName(authState?: BuguAuthState | null): string {
  return authState?.bootstrap?.branding?.shortName
    || authState?.bootstrap?.branding?.appName
    || authState?.bootstrap?.tenant?.name
    || '布谷 AI';
}

function SkipDirectAction({ variant, onSkip }: SkipDirectActionProps) {
  const isHero = variant === 'hero';

  return (
    <button
      className={`bugu-auth-direct-start ${variant}`}
      type="button"
      onClick={onSkip}
      aria-label="跳过登录，直接进入本地内容工厂"
    >
      <span>{isHero ? '不想登录？' : '登录是可选项'}</span>
      <strong>{isHero ? '跳过登录，马上开始' : '不登录，直接进入工作台'}</strong>
      <em>本地内容工厂可直接使用，账号之后在“设置 - 账号”里连接。</em>
      <b aria-hidden="true">→</b>
    </button>
  );
}

export function BuguAuthForm({
  checking = false,
  authState,
  compact = false,
  title,
  description,
  onPasswordLogin,
}: BuguAuthFormProps) {
  const brandName = resolveBrandName(authState);
  const verifyUrl = resolveAccountVerificationUrl(authState);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [requestState, setRequestState] = useState<RequestState>('idle');
  const [message, setMessage] = useState(authState?.error || '');

  useEffect(() => {
    if (authState?.error) setMessage(authState.error);
  }, [authState?.error]);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestState('loading');
    setMessage('');
    try {
      await onPasswordLogin({ identifier, password });
      setRequestState('success');
    } catch (error) {
      setRequestState('error');
      setMessage(friendlyAuthError(error));
    }
  }

  return (
    <section
      id={compact ? undefined : 'bugu-auth-login'}
      className={`bugu-auth-panel ${compact ? 'compact' : ''}`}
    >
      <div className="bugu-auth-panel-head">
        <span>{checking ? 'SYNC' : compact ? 'ACCOUNT' : 'LOGIN'}</span>
        <h2>{checking ? '正在同步账号状态' : title || `登录${brandName}`}</h2>
        <p>{description || `使用邮箱 + 密码连接${brandName}账号；邮箱验证码只在官网用于首次验证或重置密码，避免消耗邮件额度。`}</p>
      </div>

      {checking ? (
        <div className="bugu-auth-loading">
          <span />
          正在检查本机会话...
        </div>
      ) : (
        <>
          <form className="bugu-auth-form" onSubmit={submitPassword}>
            <label>
              <span>邮箱 / 用户名</span>
              <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="name@company.com" required />
            </label>
            <label>
              <span>密码</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="输入账号密码" required type="password" />
            </label>
            <button className="primary" disabled={requestState === 'loading'} type="submit">
              {requestState === 'loading' ? '登录中...' : `连接${brandName}账号`}
            </button>
          </form>

          <div className="bugu-auth-verify-card">
            <strong>还没有密码？</strong>
            <p>前往官网完成 Cloudflare Turnstile 人机验证，再发送邮箱验证码并设置密码。</p>
            {verifyUrl ? (
              <a href={verifyUrl} target="_blank" rel="noreferrer">
                去官网验证邮箱 / 设置密码
              </a>
            ) : (
              <span>当前品牌暂未配置验证入口。</span>
            )}
          </div>

          {message ? <p className={`bugu-auth-message ${requestState}`}>{message}</p> : null}
        </>
      )}
    </section>
  );
}

export function BuguAuthGate({
  checking,
  authState,
  onSkip,
  onPasswordLogin,
}: BuguAuthGateProps) {
  const brandName = resolveBrandName(authState);
  const brandLogoUrl = authState?.bootstrap?.branding?.logoUrl;
  const brandInitial = brandName.trim().slice(0, 1).toUpperCase() || 'C';
  return (
    <main className="bugu-auth-shell">
      <section className="bugu-auth-hero">
        <div className="bugu-auth-orbit-map" aria-hidden="true">
          <div className="bugu-auth-orbit-card is-factory">
            <span>PROJECT</span>
            <strong>内容工厂</strong>
            <em>本地可用</em>
          </div>
          <div className="bugu-auth-orbit-card is-account">
            <span>ACCOUNT</span>
            <strong>账号权益</strong>
            <em>可稍后连接</em>
          </div>
          <div className="bugu-auth-orbit-card is-verify">
            <span>VERIFY</span>
            <strong>邮箱验证</strong>
            <em>人机校验保护</em>
          </div>
          <div className="bugu-auth-orbit-rail">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="bugu-auth-brand">
          {brandLogoUrl ? <img src={brandLogoUrl} alt={brandName} /> : <span className="brand-logo-fallback">{brandInitial}</span>}
          <div>
            <strong>{brandName}</strong>
            <span>内容生产系统客户端</span>
          </div>
        </div>
        <div className="bugu-auth-copy">
          <p className="eyebrow">{brandName.toUpperCase()} ACCOUNT</p>
          <h1>连接账号，或直接开始本地生产</h1>
          <p>
            登录用于同步企业权益、软件下载和账号状态；不登录也可以跳过，直接进入本地内容工厂。
            邮箱验证码只在官网验证时使用，并带免费人机校验保护邮件额度。
          </p>
          <div className="bugu-auth-cta-row">
            <SkipDirectAction variant="hero" onSkip={onSkip} />
            <a href="#bugu-auth-login">需要同步账号权益时再登录</a>
          </div>
        </div>
        <div className="bugu-auth-proof">
          <span>邮箱 + 密码日常登录</span>
          <span>不登录也能进入本地模式</span>
          <span>验证码发送前人机验证</span>
        </div>
      </section>

      <div className="bugu-auth-side">
        <SkipDirectAction variant="panel" onSkip={onSkip} />
        <BuguAuthForm
          checking={checking}
          authState={authState}
          onPasswordLogin={onPasswordLogin}
        />
      </div>
    </main>
  );
}
