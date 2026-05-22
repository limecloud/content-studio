import type { ModuleKey } from './types';

export type V2FeatureStatus = '可运行入口' | 'Prompt 入口' | '审核入口' | '回炉入口' | '待配置' | '高级视图';
export type V2FeatureActionSlot = 'primary' | 'secondary';
export type V2FeatureActionTarget = { type: 'module'; module: ModuleKey };

export interface V2FeatureCard {
  title: string;
  text: string;
  items: string[];
}

export interface V2FeatureSpec {
  eyebrow: string;
  title: string;
  description: string;
  scope: string;
  status: V2FeatureStatus;
  primaryAction: string;
  secondaryAction: string;
  flow: string[];
  cards: V2FeatureCard[];
  preview: string;
  table: Array<[string, string, string, string]>;
}
