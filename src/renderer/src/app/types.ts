import type { GlobalGenerationParams, ImageGenerationProtocol, TextGenerationProtocol } from '../../../shared/types';
import type { PlatformSettingsPageKey } from '@limecloud/desktop-platform-react';
import type { Dispatch, SetStateAction } from 'react';

export type AgentModuleKey = 'agents';

export type CoreModuleKey = AgentModuleKey | 'image' | 'image-production' | 'image-showcase' | 'video' | 'video-showcase' | 'article' | 'knowledge' | 'assets' | 'skills';

export type V2ModuleKey =
  | 'material-breakdown'
  | 'image-green-screen'
  | 'video-script'
  | 'video-prompt'
  | 'video-import'
  | 'video-mix-export'
  | 'video-creative'
  | 'video-custom'
  | 'article-title'
  | 'article-script'
  | 'knowledge-brand';

export type ModuleKey = CoreModuleKey | V2ModuleKey;
export type NavItem = { key?: ModuleKey; label: string };

export type ModelDraft = {
  apiEndpoint: string;
  apiKey: string;
  textProtocol: TextGenerationProtocol;
  imageApiEndpoint: string;
  imageApiKey: string;
  imageProtocol: ImageGenerationProtocol;
  imageOuterModel: string;
  textModel: string;
  textModels: string;
  imageModels: string;
  videoApiEndpoint: string;
  videoApiKey: string;
  videoModel: string;
  videoModels: string;
};

export type ColorTheme =
  | 'emerald'
  | 'ocean'
  | 'vintage'
  | 'neon'
  | 'lime'
  | 'dusk'
  | 'minimal'
  | 'vibrant'
  | 'nature'
  | 'arts'
  | 'luxury';

export type SettingsPageKey = PlatformSettingsPageKey;
export type ModelSettingView = 'provider_list' | 'edit_text_http' | 'edit_deepseek' | 'edit_custom';
export type ProviderTab = 'recommended' | 'domestic' | 'aggregate' | 'overseas' | 'local';

export type SetGlobalParams = Dispatch<SetStateAction<GlobalGenerationParams>>;
