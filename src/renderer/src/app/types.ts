import type { GlobalGenerationParams, ImageGenerationProtocol, TextGenerationProtocol } from '../../../shared/types';
import type { Dispatch, SetStateAction } from 'react';

export type CoreModuleKey = 'image' | 'image-showcase' | 'video' | 'video-showcase' | 'article' | 'knowledge' | 'assets' | 'skills';

export type BusinessModuleKey = 'content-batch';

export type V2ModuleKey =
  | 'material-breakdown'
  | 'image-scene-prompts'
  | 'image-green-screen'
  | 'image-compliance'
  | 'image-retouch'
  | 'video-script'
  | 'video-prompt'
  | 'video-import'
  | 'video-mix-export'
  | 'video-creative'
  | 'video-custom'
  | 'article-title'
  | 'article-script'
  | 'knowledge-map'
  | 'knowledge-review'
  | 'knowledge-brand'
  | 'knowledge-scenes'
  | 'knowledge-ip'
  | 'knowledge-inputs'
  | 'assets-prompt-workbench'
  | 'assets-history';

export type ModuleKey = CoreModuleKey | BusinessModuleKey | V2ModuleKey;
export type NavItem = { key?: ModuleKey; label: string; disabled?: boolean; advanced?: boolean };

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

export type SettingsTab = 'general' | 'theme' | 'model' | 'account' | 'about';
export type ModelSettingView = 'provider_list' | 'edit_text_http' | 'edit_deepseek' | 'edit_custom';
export type ProviderTab = 'recommended' | 'domestic' | 'aggregate' | 'overseas' | 'local';

export type SetGlobalParams = Dispatch<SetStateAction<GlobalGenerationParams>>;
