/* eslint-disable @typescript-eslint/no-explicit-any */
type GA = any;

export interface GuacamoleNamespace {
  Client: new (tunnel: GA) => GA;
  WebSocketTunnel: new (url: string) => GA;
  Keyboard: new (element: HTMLElement | Document) => GA;
  Mouse: { State: new (x: number, y: number, left: boolean, middle: boolean, right: boolean, up: boolean, down: boolean) => GA };
  StringWriter: new (stream: GA) => { sendText(t: string): void; sendEnd(): void };
}

declare global {
  interface Window {
    Guacamole: GuacamoleNamespace;
  }
}

let _loadPromise: Promise<GuacamoleNamespace> | null = null;

export function loadGuacamole(): Promise<GuacamoleNamespace> {
  if (_loadPromise) return _loadPromise;

  _loadPromise = new Promise<GuacamoleNamespace>((resolve, reject) => {
    if (window.Guacamole) {
      resolve(window.Guacamole);
      return;
    }
    const script = document.createElement('script');
    script.src = '/guacamole/guacamole-common.js';
    script.async = true;
    script.onload = () => {
      if (window.Guacamole) {
        resolve(window.Guacamole);
      } else {
        _loadPromise = null;
        reject(new Error('window.Guacamole not defined after script load'));
      }
    };
    script.onerror = () => {
      _loadPromise = null;
      reject(new Error('Failed to load Guacamole.js'));
    };
    document.head.appendChild(script);
  });

  return _loadPromise;
}
