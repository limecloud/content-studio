import type { GlobalGenerationParams, ImageGenerationProtocol, TextGenerationProtocol } from '../../../shared/types';
import type { Dispatch, SetStateAction } from 'react';

export type ModuleKey = 'image' | 'video' | 'article' | 'knowledge' | 'assets' | 'skills';
export type NavItem = { key?: ModuleKey; label: string; badge?: string; disabled?: boolean };

export type ModelDraft = {
  apiEndpoint: string;
  apiKey: string;
  textProtocol: TextGenerationProtocol;
  imageApiEndpoint: string;
  imageApiKey: string;
  imageProtocol: ImageGenerationProtocol;
  imageOuterModel: string;
  textModel: string;
  imageModels: string;
  videoApiEndpoint: string;
  videoApiKey: string;
  videoModel: string;
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
export type ModelSettingView = 'provider_list' | 'edit_claude' | 'edit_deepseek' | 'edit_custom';
export type ProviderTab = 'recommended' | 'domestic' | 'aggregate' | 'overseas' | 'local';

export type SetGlobalParams = Dispatch<SetStateAction<GlobalGenerationParams>>;
