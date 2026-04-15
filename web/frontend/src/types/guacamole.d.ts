/** Minimal type declarations for guacamole-common-js */

declare module "guacamole-common-js" {
  namespace Guacamole {
    class Client {
      constructor(tunnel: Tunnel);
      connect(data: string): void;
      disconnect(): void;
      sendKeyEvent(pressed: 0 | 1, keysym: number): void;
      sendMouseState(state: Mouse.State): void;
      sendSize(width: number, height: number): void;
      getDisplay(): Display;
      createClipboardStream(mimetype: string): OutputStream;
      onerror: ((error: Status) => void) | null;
      onstatechange: ((state: number) => void) | null;
      onclipboard:
        | ((stream: InputStream, mimetype: string) => void)
        | null;
    }

    class WebSocketTunnel implements Tunnel {
      constructor(url: string);
      sendMessage(...elements: unknown[]): void;
      state: number;
      onerror: ((status: Status) => void) | null;
      onstatechange: ((state: number) => void) | null;
    }

    interface Tunnel {
      sendMessage(...elements: unknown[]): void;
      state: number;
      onerror: ((status: Status) => void) | null;
      onstatechange: ((state: number) => void) | null;
    }

    class Display {
      getElement(): HTMLElement;
      getWidth(): number;
      getHeight(): number;
      getScale(): number;
      scale(s: number): void;
      flush(callback: () => void): void;
      onresize: (() => void) | null;
    }

    class Keyboard {
      constructor(element: HTMLElement | Document);
      onkeydown: ((keysym: number) => boolean | void) | null;
      onkeyup: ((keysym: number) => void) | null;
      reset(): void;
    }

    namespace Mouse {
      class State {
        constructor(
          x: number,
          y: number,
          left: boolean,
          middle: boolean,
          right: boolean,
          scrollUp: boolean,
          scrollDown: boolean,
        );
        x: number;
        y: number;
        left: boolean;
        middle: boolean;
        right: boolean;
        scrollUp: boolean;
        scrollDown: boolean;
      }
    }

    class InputStream {
      onblob: ((data: string) => void) | null;
      onend: (() => void) | null;
    }

    class OutputStream {
      sendBlob(data: string): void;
      sendEnd(): void;
    }

    class StringWriter {
      constructor(stream: OutputStream);
      sendText(text: string): void;
      sendEnd(): void;
    }

    class Status {
      code: number;
      message: string;
    }
  }

  export default Guacamole;
}
