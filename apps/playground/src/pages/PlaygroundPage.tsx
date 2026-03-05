import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Toolbar } from '@/components/playground/Toolbar';
import { CodeEditor } from '@/components/playground/CodeEditor';
import { OutputPanel } from '@/components/playground/OutputPanel';
import { ProblemPanel } from '@/components/playground/ProblemPanel';
import { LanguageSidebar } from '@/components/playground/LanguageSidebar';
import { Navbar } from '@/components/playground/Navbar';
import { usePlayground } from '@/context/PlaygroundContext';
import { cn } from '@/lib/utils';

export default function PlaygroundPage() {
  const { showProblemPanel } = usePlayground();

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {/* Navbar */}
      <Navbar />

      {/* Toolbar */}
      <Toolbar />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Language Sidebar — hidden on mobile */}
        <div className="hidden md:block">
          <LanguageSidebar />
        </div>

        {/* Resizable panels */}
        <div className="flex-1 overflow-hidden">
          <PanelGroup direction="horizontal" className="h-full">
            {/* Problem Panel (Collapsible) */}
            {showProblemPanel && (
              <>
                <Panel
                  defaultSize={25}
                  minSize={20}
                  maxSize={40}
                  className="hidden md:block"
                >
                  <ProblemPanel />
                </Panel>
                <PanelResizeHandle className="w-1 bg-border hover:bg-amber-500/50 transition-colors" />
              </>
            )}

            {/* Editor Panel */}
            <Panel defaultSize={showProblemPanel ? 45 : 60} minSize={30}>
              <div className="h-full border-r border-border">
                <CodeEditor />
              </div>
            </Panel>

            <PanelResizeHandle className="w-1 bg-border hover:bg-amber-500/50 transition-colors" />

            {/* Output Panel */}
            <Panel defaultSize={30} minSize={25}>
              <OutputPanel />
            </Panel>
          </PanelGroup>
        </div>
      </div>

      {/* Mobile Problem Panel Overlay */}
      {showProblemPanel && (
        <div
          className={cn(
            'md:hidden fixed inset-0 z-50 bg-background',
            'flex flex-col',
          )}
        >
          <ProblemPanel />
        </div>
      )}
    </div>
  );
}
