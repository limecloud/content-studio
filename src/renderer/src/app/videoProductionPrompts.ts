import type { VideoBreakdownResourceFramework, VideoScriptGenerationResult } from "../../../shared/types";

export interface VideoProductionPromptItem {
  id: string;
  title: string;
  meta: string;
  prompt: string;
}

export interface VideoProductionDeliveryItem {
  id: string;
  title: string;
  status: "ready" | "warning" | "blocked";
  detail: string;
}

type CharacterRef = NonNullable<VideoBreakdownResourceFramework["characters"]>[number];
type SceneRef = NonNullable<VideoBreakdownResourceFramework["scenes"]>[number];

export function characterReferencePrompt(character: CharacterRef): string {
  const existing = character.threeViewPrompt?.trim();
  if (existing) return existing;

  return [
    `角色参考图：${character.name}`,
    character.voiceTraits ? `角色气质/音色：${character.voiceTraits}` : "",
    "生成要求：输出正面、侧面、背面三视图，照片级写实，真实人类，全身角色设计图，中性背景，柔和均匀灯光，高细节皮肤纹理，服装和姿态适配短视频带货场景。",
  ].filter(Boolean).join("\n");
}

export function sceneBackgroundPrompt(scene: SceneRef): string {
  const existing = scene.sceneImagePrompt?.trim();
  if (existing) return existing;

  return [
    `Scene background of ${scene.name}.`,
    scene.environment ? `Environment: ${scene.environment}.` : "Environment: realistic home or product-use space.",
    scene.lighting ? `Lighting: ${scene.lighting}.` : "Lighting: natural soft cinematic light.",
    "Photorealistic, high detail, cinematic wide angle shot, clean composition, no people, no text overlay.",
  ].join(" ");
}

export function buildCharacterPromptItems(
  framework?: VideoBreakdownResourceFramework,
): VideoProductionPromptItem[] {
  return framework?.characters.map((character) => ({
    id: `character:${character.name}`,
    title: character.name,
    meta: `${character.shotCount} 镜${character.voiceTraits ? ` / ${character.voiceTraits}` : ""}`,
    prompt: characterReferencePrompt(character),
  })) ?? [];
}

export function buildScenePromptItems(
  framework?: VideoBreakdownResourceFramework,
): VideoProductionPromptItem[] {
  return framework?.scenes.map((scene) => ({
    id: `scene:${scene.name}`,
    title: scene.name,
    meta: `${scene.shotCount} 镜${scene.environment ? ` / ${scene.environment}` : ""}`,
    prompt: sceneBackgroundPrompt(scene),
  })) ?? [];
}

export function buildVideoProductionReviewItems(
  script: VideoScriptGenerationResult | null | undefined,
): VideoProductionDeliveryItem[] {
  if (!script) return [];
  if (!script.publishCheck.length) {
    return [{
      id: "review:no-checks",
      title: "发布检查",
      status: "warning",
      detail: "脚本没有返回发布检查，请人工复核功效、合规、字幕和平台限制。",
    }];
  }

  return script.publishCheck.map((item, index) => ({
    id: `review:${index}`,
    title: item.level === "risk" ? "发布风险" : item.level === "warning" ? "发布提醒" : "发布检查",
    status: item.level === "risk" ? "blocked" : item.level === "warning" ? "warning" : "ready",
    detail: item.message,
  }));
}

export function buildVideoProductionDeliveryItems(input: {
  characterPromptCount: number;
  scenePromptCount: number;
  segmentCount: number;
  hasScript: boolean;
}): VideoProductionDeliveryItem[] {
  return [
    {
      id: "delivery:character",
      title: "角色参考图",
      status: input.characterPromptCount > 0 ? "ready" : "warning",
      detail: input.characterPromptCount > 0
        ? `已整理 ${input.characterPromptCount} 个角色参考图 Prompt，外部生成后用于人物一致性。`
        : "未找到角色参考图 Prompt；若视频含人物，请先补齐角色三视图。",
    },
    {
      id: "delivery:scene",
      title: "场景背景图",
      status: input.scenePromptCount > 0 ? "ready" : "warning",
      detail: input.scenePromptCount > 0
        ? `已整理 ${input.scenePromptCount} 个场景背景图 Prompt，外部生成后用于首帧和背景一致性。`
        : "未找到场景背景图 Prompt；请人工确认外部平台是否需要首帧背景。",
    },
    {
      id: "delivery:segments",
      title: "镜头视频段",
      status: input.segmentCount > 0 ? "ready" : "blocked",
      detail: input.segmentCount > 0
        ? `已按 5/10 秒规则整理 ${input.segmentCount} 个外部生成段落。`
        : "缺少可生成的视频段落，请先生成或选择带分镜的脚本。",
    },
    {
      id: "delivery:import",
      title: "合成导出",
      status: input.hasScript ? "warning" : "blocked",
      detail: input.hasScript
        ? "内容工厂不创建第三方任务；外部生成和剪辑完成后，需手动导入成品视频并关联本交接 Prompt。"
        : "未找到脚本，暂不能形成成品导入要求。",
    },
  ];
}
