import type { PlatformAppearanceSettings, PlatformColorTheme } from '../../../shared/types';
import type { ColorTheme } from './types';

const contentStudioColorThemes = new Set<ColorTheme>([
  'emerald',
  'ocean',
  'vintage',
  'neon',
  'lime',
  'dusk',
  'minimal',
  'vibrant',
  'nature',
  'arts',
  'luxury',
]);

export function createDefaultPlatformAppearance(colorTheme: ColorTheme = 'emerald'): PlatformAppearanceSettings {
  return {
    colorTheme,
    fontScale: 1,
    serifEnabled: false,
  };
}

export function platformColorThemeToContentStudio(value?: PlatformColorTheme): ColorTheme {
  return value && contentStudioColorThemes.has(value as ColorTheme) ? (value as ColorTheme) : 'emerald';
}
