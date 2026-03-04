import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Toolbar } from '@/components/playground/Toolbar';
import { CodeEditor } from '@/components/playground/CodeEditor';
import { OutputPanel } from '@/components/playground/OutputPanel';
import { ProblemPanel } from '@/components/playground/ProblemPanel';
import { usePlayground } from '@/context/PlaygroundContext';
import { cn } from '@/lib/utils';

export default function PlaygroundPage() {
  const { showProblemPanel } = usePlayground();

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b px-6 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
            Code.Scriet
          </h1>
          <span className="text-sm text-muted-foreground">Playground</span>
        </div>
        <nav className="flex items-center gap-4">
          <a
            href="/snippets"
            className="text-sm hover:text-primary transition-colors"
          >
            Snippets
          </a>
          <a
            href="https://codescriet.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm hover:text-primary transition-colors"
          >
            Main Site
          </a>
        </nav>
      </header>

      {/* Toolbar */}
      <Toolbar />

      {/* Main Content */}
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
              <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />
            </>
          )}

          {/* Editor Panel */}
          <Panel defaultSize={showProblemPanel ? 45 : 60} minSize={30}>
            <div className="h-full border-r">
              <CodeEditor />
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

          {/* Output Panel */}
          <Panel defaultSize={30} minSize={25}>
            <OutputPanel />
          </Panel>
        </PanelGroup>
      </div>

      {/* Mobile Problem Panel Overlay */}
      {showProblemPanel && (
        <div
          className={cn(
            'md:hidden fixed inset-0 z-50 bg-background',
            'flex flex-col'
          )}
        >
          <ProblemPanel />
        </div>
      )}
    </div>
  );
}
