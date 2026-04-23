declare namespace Guacamole {
  class Display {
    getElement(): HTMLElement;
    getWidth(): number;
    getHeight(): number;
    scale(scale: number): void;
    onresize: (() => void) | null;
  }

  class SessionRecording {
    constructor(source: Blob | string);
    getDisplay(): Display;
    getDuration(): number;
    getPosition(): number;
    play(): void;
    pause(): void;
    seek(position: number, callback?: () => void): void;
    onplay: (() => void) | null;
    onpause: (() => void) | null;
    onseek: ((position: number) => void) | null;
    onprogress: ((duration: number) => void) | null;
    onload: (() => void) | null;
    onerror: ((message: string) => void) | null;
  }
}

interface Window {
  Guacamole: typeof Guacamole;
}
