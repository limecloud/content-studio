/// <reference types="vite/client" />

import type { ContentStudioApi } from '../../shared/types';

declare global {
  interface Window {
    contentStudio: ContentStudioApi;
  }
}
