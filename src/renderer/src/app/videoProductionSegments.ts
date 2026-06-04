import type { VideoBreakdownResourceFramework, VideoStoryboardShot } from "../../../shared/types";

export interface VideoProductionSegment {
  id: string;
  shots: VideoStoryboardShot[];
  shotNumbers: string;
  totalDurationSeconds: number;
  externalDurationSeconds: 5 | 10;
  scene: string;
  character: string;
  prompt: string;
}

export function shotTimeSeconds(shot: VideoStoryboardShot): number {
  const range = shot.timeRange || shot.duration;
  const match = range.match(/(\d+):(\d+)\s*-\s*(\d+):(\d+)/);
  if (match) {
    const start = Number(match[1]) * 60 + Number(match[2]);
    const end = Number(match[3]) * 60 + Number(match[4]);
    return Math.max(0, end - start);
  }
  const seconds = range.match(/(\d+(?:\.\d+)?)s/);
  return seconds ? Number(seconds[1]) : 0;
}

function voiceoverSeconds(text: string): number {
  const length = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").length;
  return length / 4.5;
}

function effectiveShotSeconds(shot: VideoStoryboardShot): number {
  return Math.max(1, shotTimeSeconds(shot), voiceoverSeconds(shot.voiceover || ""));
}

function shouldSplitSegment(previous: VideoStoryboardShot | undefined, next: VideoStoryboardShot): boolean {
  if (!previous) return false;
  const previousScene = previous.scene?.trim();
  const nextScene = next.scene?.trim();
  const previousCharacter = previous.character?.trim();
  const nextCharacter = next.character?.trim();
  return Boolean(
    (previousScene && nextScene && previousScene !== nextScene)
    || (previousCharacter && nextCharacter && previousCharacter !== nextCharacter),
  );
}

function toIllustrationStyle(text: string): string {
  return text
    .replace(/写实风格/g, "半写实动画插画风格")
    .replace(/真实感/g, "精致动画感")
    .replace(/电影级画质/g, "高品质动画画质")
    .replace(/照片级/g, "精致插画级");
}

function compactAppearance(text?: string): string {
  return (text || "")
    .replace(/[()\[\]{}（）【】]/g, "")
    .split(/[,、，。.]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 2)
    .slice(0, 3)
    .join("，")
    .substring(0, 48);
}

function buildDirectorPrompt(
  segmentShots: VideoStoryboardShot[],
  framework?: VideoBreakdownResourceFramework,
): string {
  const first = segmentShots[0];
  const last = segmentShots[segmentShots.length - 1];
  if (!first) return "";

  if (segmentShots.length === 1 && first.videoPrompt?.trim()) {
    let enriched = toIllustrationStyle(first.videoPrompt.trim());
    if (first.voiceover && !enriched.includes(first.voiceover.substring(0, 10))) {
      enriched += ` 画外音："${first.voiceover}"`;
    }
    if (first.transitionHint && !enriched.includes(first.transitionHint)) {
      enriched += ` 转场：${first.transitionHint}。`;
    }
    return enriched;
  }

  const parts: string[] = [];
  const character = first.character
    ? framework?.characters.find((item) => item.name === first.character)
    : undefined;
  if (character) {
    const appearance = compactAppearance(character.threeViewPrompt);
    parts.push(appearance ? `${character.name}，${appearance}` : character.name);
  } else if (first.character) {
    parts.push(first.character);
  }

  const actionParts = segmentShots
    .map((shot, index) => {
      const action = shot.characterAction || shot.visual || "";
      const camera = [shot.shotType, shot.cameraMovement].filter(Boolean).join(" ");
      if (!action) return "";
      if (index === 0) return camera ? `${camera}下${action}` : action;
      return camera ? `转为${camera}继续${action}` : action;
    })
    .filter(Boolean);
  if (actionParts.length === 1) {
    parts.push(actionParts[0]);
  } else if (actionParts.length > 1) {
    parts.push(`动作连贯：${actionParts.join("，接着")}`);
  }

  const voiceovers = segmentShots.map((shot) => shot.voiceover).filter(Boolean);
  if (voiceovers.length > 0) parts.push(`画外音："${voiceovers.join(" ")}"`);

  const scene = first.scene
    ? framework?.scenes.find((item) => item.name === first.scene)
    : undefined;
  if (scene) {
    parts.push(`场景：${[scene.environment, scene.lighting].filter(Boolean).join("，") || scene.name}`);
  } else if (first.scene) {
    parts.push(`场景：${first.scene}`);
  }

  const transition = last?.transitionHint;
  parts.push("半写实动画插画风格，高品质动画画质，浅景深");
  if (transition) parts.push(`结尾转场：${transition}`);

  return parts.join("。") + "。";
}

export function segmentPrompt(
  segmentShots: VideoStoryboardShot[],
  externalDurationSeconds: 5 | 10,
  framework?: VideoBreakdownResourceFramework,
): string {
  const first = segmentShots[0];
  const last = segmentShots[segmentShots.length - 1];
  const shotNumbers = segmentShots.map((shot) => shot.shot).join("、");
  const visualLines = segmentShots.map((shot) => `- 镜头 ${shot.shot}：${shot.visual}`).join("\n");
  const voiceoverLines = segmentShots
    .filter((shot) => shot.voiceover?.trim())
    .map((shot) => `- 镜头 ${shot.shot}：${shot.voiceover}`)
    .join("\n");
  const promptLines = segmentShots
    .map((shot) => shot.videoPrompt || shot.imagePrompt)
    .filter(Boolean)
    .map((prompt, index) => `- ${index + 1}. ${prompt}`)
    .join("\n");
  return [
    `外部视频生成段落：镜头 ${shotNumbers}`,
    `目标时长：${externalDurationSeconds}s`,
    "",
    "导演 Prompt：",
    buildDirectorPrompt(segmentShots, framework),
    first?.timeRange || last?.timeRange ? `时间范围：${first?.timeRange || first?.duration || "未标注"} 到 ${last?.timeRange || last?.duration || "未标注"}` : "",
    first?.character ? `角色：${first.character}` : "",
    first?.scene ? `场景：${first.scene}` : "",
    first?.cameraMovement || last?.cameraMovement ? `运镜：${first?.cameraMovement || last?.cameraMovement}` : "",
    "",
    "画面连续性要求：",
    visualLines,
    voiceoverLines ? ["", "口播：", voiceoverLines].join("\n") : "",
    promptLines ? ["", "可复用 Prompt：", promptLines].join("\n") : "",
    "",
    "生成边界：只生成本段视频素材，不创建第三方任务记录；生成完成后回到内容工厂手动导入成品视频并关联 Prompt。",
  ].filter(Boolean).join("\n");
}

export function buildProductionSegments(
  shots: VideoStoryboardShot[],
  framework?: VideoBreakdownResourceFramework,
): VideoProductionSegment[] {
  const segments: VideoProductionSegment[] = [];
  let currentShots: VideoStoryboardShot[] = [];
  let currentDuration = 0;

  function flush(): void {
    if (!currentShots.length) return;
    const externalDurationSeconds: 5 | 10 = currentDuration > 5.5 ? 10 : 5;
    const first = currentShots[0];
    const last = currentShots[currentShots.length - 1];
    segments.push({
      id: `${first.shot}-${last.shot}-${segments.length}`,
      shots: currentShots,
      shotNumbers: currentShots.map((shot) => String(shot.shot)).join("、"),
      totalDurationSeconds: Number(currentDuration.toFixed(1)),
      externalDurationSeconds,
      scene: first.scene || last.scene || "未标注场景",
      character: first.character || last.character || "未标注角色",
      prompt: segmentPrompt(currentShots, externalDurationSeconds, framework),
    });
    currentShots = [];
    currentDuration = 0;
  }

  shots.forEach((shot, index) => {
    const duration = effectiveShotSeconds(shot);
    const previous = currentShots[currentShots.length - 1];
    if (currentShots.length && (currentDuration + duration > 10.5 || shouldSplitSegment(previous, shot))) {
      flush();
    }

    currentShots.push(shot);
    currentDuration += duration;

    const nextShot = shots[index + 1];
    if (!nextShot || currentDuration < 4.5) return;
    const nextDuration = effectiveShotSeconds(nextShot);
    if (!shouldSplitSegment(shot, nextShot) && currentDuration + nextDuration <= 10.5) return;
    if (currentDuration <= 6.5) flush();
  });

  flush();
  return segments;
}
