import { useParams } from 'react-router-dom';

export default function SnippetViewPage() {
  const { id } = useParams();

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Snippet: {id}</h1>

        <div className="text-center py-20">
          <p className="text-muted-foreground">
            Snippet view page coming soon!
          </p>
          <a
            href="/"
            className="inline-block mt-6 px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Back to Playground
          </a>
        </div>
      </div>
    </div>
  );
}
