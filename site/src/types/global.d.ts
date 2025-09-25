// src/types/global.d.ts
export {};

declare global {
  interface Window {
    __lalaLogClientError?: (info: unknown) => void;
  }
}
