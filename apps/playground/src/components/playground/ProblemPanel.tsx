import { usePlayground } from '@/context/PlaygroundContext';
import { Button } from '@/components/ui/button';
import { X, BookOpen, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ProblemPanel() {
  const { currentProblem, toggleProblemPanel } = usePlayground();

  if (!currentProblem) {
    return (
      <div className="h-full flex flex-col p-6 bg-card/30">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Problem</h2>
          </div>
          <Button
            onClick={toggleProblemPanel}
            variant="ghost"
            size="icon"
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center text-center">
          <div className="max-w-sm">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              No problem selected. Start coding in the editor or select a problem from
              the snippets page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const difficultyColors = {
    Easy: 'bg-green-500/10 text-green-500 border-green-500/20',
    Medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    Hard: 'bg-red-500/10 text-red-500 border-red-500/20',
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-card/30">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Problem</h2>
        </div>
        <Button
          onClick={toggleProblemPanel}
          variant="ghost"
          size="icon"
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Problem Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Title and Difficulty */}
        <div>
          <h3 className="text-xl font-bold mb-2">{currentProblem.title}</h3>
          <span
            className={cn(
              'inline-block px-3 py-1 rounded-full text-xs font-medium border',
              difficultyColors[currentProblem.difficulty]
            )}
          >
            {currentProblem.difficulty}
          </span>
        </div>

        {/* Description */}
        <div>
          <h4 className="font-semibold mb-2">Description</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {currentProblem.description}
          </p>
        </div>

        {/* Examples */}
        {currentProblem.examples && currentProblem.examples.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3">Examples</h4>
            <div className="space-y-4">
              {currentProblem.examples.map((example, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-4 bg-background/50 space-y-2"
                >
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Input:
                    </span>
                    <pre className="mt-1 p-2 bg-muted rounded text-sm font-mono">
                      {example.input}
                    </pre>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      Output:
                    </span>
                    <pre className="mt-1 p-2 bg-muted rounded text-sm font-mono">
                      {example.output}
                    </pre>
                  </div>
                  {example.explanation && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">
                        Explanation:
                      </span>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {example.explanation}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Constraints */}
        {currentProblem.constraints && currentProblem.constraints.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Constraints</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {currentProblem.constraints.map((constraint, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground flex-shrink-0" />
                  <span>{constraint}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
