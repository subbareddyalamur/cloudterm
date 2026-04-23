/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_WS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'asciinema-player' {
  export interface PlayerInstance {
    dispose: () => void;
    play: () => Promise<void>;
    pause: () => void;
    seek: (target: string | number) => Promise<void>;
    getCurrentTime: () => number | undefined;
    getDuration: () => number | undefined;
  }

  export interface CreateOptions {
    speed?: number;
    autoPlay?: boolean;
    idleTimeLimit?: number;
    theme?: string;
    poster?: string;
    preload?: boolean;
    cols?: number;
    rows?: number;
    fit?: string;
    terminalFontSize?: string;
  }

  export function create(
    src: string,
    container: HTMLElement,
    opts?: CreateOptions,
  ): PlayerInstance;
}
