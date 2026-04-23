import type { ReactNode } from 'react';
import { useRef, useCallback } from 'react';
import { TopBar } from './TopBar';
import { TabBar } from './TabBar';
import { StatusBar } from './StatusBar';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { ToastViewport } from '@/components/primitives/ToastViewport';
import { ActivityCenter } from '@/components/activity/ActivityCenter';
import { AIChatPanel } from '@/components/ai/AIChatPanel';
import { useLayoutStore } from '@/stores/layout';


function SidebarResizer() {
  const setSidebarWidth = useLayoutStore((s) => s.setSidebarWidth);
  const isDragging = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isDragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return;
      setSidebarWidth(e.clientX);
    },
    [setSidebarWidth],
  );

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/50 transition-colors"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      aria-label="Resize sidebar"
    />
  );
}

export interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const sidebarWidth = useLayoutStore((s) => s.sidebarWidth);
  const sidebarCollapsed = useLayoutStore((s) => s.sidebarCollapsed);

  const effectiveWidth = sidebarCollapsed ? 48 : sidebarWidth;

  return (
    <div
      className="h-screen overflow-hidden grid"
      style={{
        gridTemplateAreas: `
          "topbar  topbar"
          "sidebar tabbar"
          "sidebar main"
          "statusbar statusbar"
        `,
        gridTemplateColumns: `${effectiveWidth}px 1fr`,
        gridTemplateRows: '40px 32px 1fr 24px',
        transition: 'grid-template-columns 180ms ease',
      }}
    >
      <header style={{ gridArea: 'topbar' }}>
        <TopBar />
      </header>
      <div
        style={{ gridArea: 'tabbar' }}
        className="flex items-stretch bg-bg border-b border-border overflow-x-auto scrollbar-none"
      >
        <TabBar />
      </div>
      <aside
        style={{ gridArea: 'sidebar' }}
        className="border-r border-border relative overflow-hidden"
      >
        <Sidebar />
        {!sidebarCollapsed && <SidebarResizer />}
      </aside>
      <main style={{ gridArea: 'main' }} className="overflow-hidden bg-bg flex">
        <div className="flex-1 min-w-0 relative">
          {children}
        </div>
        <AIChatPanel />
      </main>
      <footer style={{ gridArea: 'statusbar' }}>
        <StatusBar />
      </footer>
      <ToastViewport />
      <ActivityCenter />
      
    </div>
  );
}
