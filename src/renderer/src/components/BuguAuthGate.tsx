import { FormEvent, useEffect, useState } from 'react';
import logoUrl from '../logo.png';
import type { BuguAuthState } from '../../../shared/types';

type RequestState = 'idle' | 'loading' | 'success' | 'error';

const accountVerificationUrl = 'https://bugu.run/login/?mode=verify';

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

function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : '登录失败，请稍后再试。';
  if (message.includes('tenant user not found')) return '账号不存在或尚未开通，请先到官网完成邮箱验证并设置密码。';
  if (message.includes('password not configured')) return '该账号尚未设置密码，请先到官网完成邮箱验证并设置密码。';
  return message;
}

export function BuguAuthForm({
  checking = false,
  authState,
  compact = false,
  title = '登录布谷 AI',
  description = '使用邮箱 + 密码连接布谷账号；邮箱验证码只在官网用于首次验证或重置密码，避免消耗邮件额度。',
  onPasswordLogin,
}: BuguAuthFormProps) {
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
    <section className={`bugu-auth-panel ${compact ? 'compact' : ''}`}>
      <div className="bugu-auth-panel-head">
        <span>{checking ? 'SYNC' : compact ? 'ACCOUNT' : 'LOGIN'}</span>
        <h2>{checking ? '正在同步账号状态' : title}</h2>
        <p>{description}</p>
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
              {requestState === 'loading' ? '登录中...' : '连接布谷账号'}
            </button>
          </form>

          <div className="bugu-auth-verify-card">
            <strong>还没有密码？</strong>
            <p>前往官网完成 Cloudflare Turnstile 人机验证，再发送邮箱验证码并设置密码。</p>
            <a href={accountVerificationUrl} target="_blank" rel="noreferrer">
              去官网验证邮箱 / 设置密码
            </a>
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
  return (
    <main className="bugu-auth-shell">
      <section className="bugu-auth-hero">
        <div className="bugu-auth-brand">
          <img src={logoUrl} alt="布谷 AI" />
          <div>
            <strong>布谷 AI</strong>
            <span>内容生产系统客户端</span>
          </div>
        </div>
        <div className="bugu-auth-copy">
          <p className="eyebrow">BUGU ACCOUNT</p>
          <h1>连接账号，或直接开始本地生产</h1>
          <p>
            登录用于同步企业权益、软件下载和账号状态；不登录也可以跳过，直接进入本地内容工厂。
            邮箱验证码只在官网验证时使用，并带免费人机校验保护邮件额度。
          </p>
        </div>
        <div className="bugu-auth-proof">
          <span>邮箱 + 密码日常登录</span>
          <span>可跳过并使用本地模式</span>
          <span>验证码发送前人机验证</span>
        </div>
      </section>

      <div className="bugu-auth-side">
        <BuguAuthForm
          checking={checking}
          authState={authState}
          onPasswordLogin={onPasswordLogin}
        />
        <button className="bugu-auth-skip" type="button" onClick={onSkip}>
          <span>无需登录，直接开始</span>
          <strong>进入本地内容工厂</strong>
          <em>账号可之后在“设置 - 账号”里再连接</em>
        </button>
      </div>
    </main>
  );
}
