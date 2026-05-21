import { useEffect, useMemo, useState } from "react";
import type {
  InstallSkillPackageResult,
  SkillPackageFileNode,
  SkillPackagePreview,
} from "../../../shared/types";

interface SkillPackageInstallDialogProps {
  workspacePath?: string;
  packagePathRequest?: string | null;
  onPackagePathRequestHandled?: () => void;
  onInstalled: (result: InstallSkillPackageResult) => Promise<void> | void;
}

function flattenFirstFile(nodes: SkillPackageFileNode[]): string | null {
  for (const node of nodes) {
    if (node.kind === "file") return node.path;
    const child = node.children ? flattenFirstFile(node.children) : null;
    if (child) return child;
  }
  return null;
}

function fileIcon(node: SkillPackageFileNode): string {
  if (node.kind === "directory") return "▸";
  return node.name.endsWith(".md") ? "◇" : "·";
}

function SkillPackageTree({
  nodes,
  selectedPath,
  onSelect,
}: {
  nodes: SkillPackageFileNode[];
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  return (
    <div className="skill-package-tree">
      {nodes.map((node) => (
        <div key={node.path} className="skill-package-tree-node">
          <button
            type="button"
            className={selectedPath === node.path ? "active" : ""}
            disabled={node.kind === "directory"}
            onClick={() => node.kind === "file" && onSelect(node.path)}
          >
            <span>{fileIcon(node)}</span>
            {node.name}
          </button>
          {node.children?.length ? (
            <div className="skill-package-tree-children">
              <SkillPackageTree
                nodes={node.children}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function SkillPackageInstallDialog({
  workspacePath,
  packagePathRequest,
  onPackagePathRequestHandled,
  onInstalled,
}: SkillPackageInstallDialogProps) {
  const [preview, setPreview] = useState<SkillPackagePreview | null>(null);
  const [selectedPath, setSelectedPath] = useState("SKILL.md");
  const [selectedContent, setSelectedContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetLabel = useMemo(() => {
    if (!workspacePath) return "请先选择工作区";
    return preview?.targetPath ?? `${workspacePath}/.bugu/skills/${preview?.slug ?? ""}`;
  }, [preview?.slug, preview?.targetPath, workspacePath]);

  async function openPackage(packagePath: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const next = await window.contentStudio.previewSkillPackage(
        packagePath,
        workspacePath,
      );
      const firstPath = next.files.some((node) => node.path === "SKILL.md")
        ? "SKILL.md"
        : flattenFirstFile(next.files) ?? next.selectedPath;
      setPreview(next);
      setSelectedPath(firstPath);
      setSelectedContent(
        firstPath === next.selectedPath
          ? next.selectedContent
          : await window.contentStudio.readSkillPackageFile(next.packagePath, firstPath),
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function selectFile(path: string): Promise<void> {
    if (!preview || selectedPath === path) return;
    setBusy(true);
    setError(null);
    try {
      setSelectedPath(path);
      setSelectedContent(
        await window.contentStudio.readSkillPackageFile(preview.packagePath, path),
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function install(): Promise<void> {
    if (!preview || !workspacePath) return;
    const overwrite = preview.targetExists;
    if (
      overwrite &&
      !window.confirm(`工作区已存在 ${preview.slug}，是否覆盖安装？`)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await window.contentStudio.installSkillPackage({
        packagePath: preview.packagePath,
        workspacePath,
        overwrite,
      });
      await onInstalled(result);
      setPreview(null);
      setSelectedPath("SKILL.md");
      setSelectedContent("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const unsubscribe = window.contentStudio.onSkillPackageOpenRequest((packagePath) => {
      void openPackage(packagePath);
    });
    window.contentStudio.notifySkillPackageOpenReady();
    return unsubscribe;
  }, [workspacePath]);

  useEffect(() => {
    if (!packagePathRequest) return;
    void openPackage(packagePathRequest).finally(() => {
      onPackagePathRequestHandled?.();
    });
  }, [packagePathRequest, workspacePath]);

  useEffect(() => {
    if (!preview) return;
    void openPackage(preview.packagePath);
  }, [workspacePath]);

  if (!preview && !error) return null;

  return (
    <div className="skill-package-backdrop" role="presentation">
      <section
        className="skill-package-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-package-title"
      >
        <header className="skill-package-header">
          <div>
            <h2 id="skill-package-title">
              将 “{preview?.slug ?? "skill"}” 添加到技能库？
            </h2>
            <p>安装前请检查 skill 内容。目标位置：{targetLabel}</p>
          </div>
          <div className="skill-package-header-actions">
            <button
              className="primary"
              type="button"
              disabled={busy || !preview || !workspacePath}
              onClick={() => void install()}
            >
              {busy ? "处理中" : preview?.targetExists ? "覆盖安装" : "安装到技能库"}
            </button>
            <button
              className="ghost small"
              type="button"
              onClick={() => {
                setPreview(null);
                setError(null);
              }}
            >
              关闭
            </button>
          </div>
        </header>

        {error ? <div className="error-banner skill-package-error">{error}</div> : null}

        {preview ? (
          <div className="skill-package-body">
            <aside className="skill-package-sidebar">
              <SkillPackageTree
                nodes={preview.files}
                selectedPath={selectedPath}
                onSelect={(path) => void selectFile(path)}
              />
            </aside>
            <main className="skill-package-preview">
              <div className="skill-package-preview-head">
                <span>{selectedPath}</span>
                {preview.targetExists ? <strong>覆盖安装</strong> : <strong>新安装</strong>}
              </div>
              <pre>{selectedContent}</pre>
            </main>
          </div>
        ) : (
          <div className="empty-state skill-package-empty">无法读取安装包。</div>
        )}

        <footer className="skill-package-footer">
          <button
            className="ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              setPreview(null);
              setError(null);
            }}
          >
            取消
          </button>
          <button
            className="primary"
            type="button"
            disabled={busy || !preview || !workspacePath}
            onClick={() => void install()}
          >
            {busy ? "处理中" : preview?.targetExists ? "覆盖安装" : "安装到技能库"}
          </button>
        </footer>
      </section>
    </div>
  );
}
