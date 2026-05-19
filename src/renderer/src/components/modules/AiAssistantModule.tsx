import { useMemo, useState } from 'react';

const QUICK_COMMANDS = [
  { command: '@图片', description: '把自然语言需求发送到图片生成模块，并填入提示词草稿。' },
  { command: '/skill', description: '查看当前内容链路可用能力。' },
  { command: '/model', description: '查看文字、图片、视频模型配置。' },
  { command: '/help', description: '查看内容工厂对话式操作帮助。' },
];

const PLANNED_ACTIONS = ['上传产品图后自动识别可用图片模板', '根据知识库引用生成图片提示词', '把对话结果发送到图片 / 文章 / 视频模块'];

interface AiAssistantModuleProps {
  workspaceReady: boolean;
  onRouteImageCommand: (input: string) => string;
}

function hasImageCommand(value: string): boolean {
  return /(^|\s)@(图片|image)/i.test(value);
}

export function AiAssistantModule({
  workspaceReady,
  onRouteImageCommand,
}: AiAssistantModuleProps) {
  const [draft, setDraft] = useState('');
  const [assistantMessage, setAssistantMessage] = useState(
    '输入 @图片 加描述，可以把请求转到图片生成模块。当前不会伪造未接入的通用对话结果。',
  );
  const canRouteImage = useMemo(
    () => workspaceReady && hasImageCommand(draft),
    [draft, workspaceReady],
  );

  const routeImageCommand = () => {
    if (!workspaceReady) {
      setAssistantMessage('请先选择工作区，再使用 @图片 创建图片生成任务。');
      return;
    }
    if (!hasImageCommand(draft)) {
      setAssistantMessage('请输入 @图片 加图片需求，例如：@图片 生成一张白底护肤品主图。');
      return;
    }
    const routedPrompt = onRouteImageCommand(draft);
    setAssistantMessage(`已转到图片生成模块，并填入提示词：${routedPrompt}`);
  };

  return (
    <section className="module-grid two-col">
      <article className="panel ai-console-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">内容助手</p>
            <h3>内容工厂助手</h3>
          </div>
          <span className="status-pill blocked">后续接入</span>
        </div>

        <div className="agent-status-card blocked">
          <span>19997</span>
          <div>
            <strong>内容助手暂未接入</strong>
            <p>布谷AI 当前只交付内容工厂主线；@图片 是受控路由，会进入真实图片生成模块，不伪造通用对话成功。</p>
          </div>
        </div>

        <div className="ai-chat-shell">
          <div className="ai-message assistant">
            <strong>内容工厂助手</strong>
            <p>{assistantMessage}</p>
          </div>
          <label>
            <span>对话输入</span>
            <textarea
              value={draft}
              placeholder="@图片 生成一张白底护肤品主图，产品居中，干净高级。"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  routeImageCommand();
                }
              }}
            />
          </label>
          {!workspaceReady ? (
            <small className="ai-command-hint">请先选择工作区，图片生成结果会写入本地内容工厂目录。</small>
          ) : null}
          <div className="log-actions">
            <button className="primary small" disabled={!canRouteImage} onClick={routeImageCommand}>发送到图片生成</button>
            <button className="ghost small" disabled>通用对话后续接入</button>
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Quick Commands</p>
            <h3>快捷指令 / 接入边界</h3>
          </div>
        </div>
        <div className="ai-command-grid">
          {QUICK_COMMANDS.map((item) => (
            <article key={item.command}>
              <strong>{item.command}</strong>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
        <div className="step-list">
          {PLANNED_ACTIONS.map((item, index) => (
            <article key={item}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item}</strong>
              <p>状态：@图片 路由已接入；其他对话式编排待真实服务接入后启用。</p>
            </article>
          ))}
        </div>
      </article>
    </section>
  );
}
