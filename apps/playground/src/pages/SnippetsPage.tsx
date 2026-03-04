export default function SnippetsPage() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Code Snippets</h1>
          <p className="text-muted-foreground">
            Browse and share code snippets from the community
          </p>
        </div>

        <div className="text-center py-20">
          <p className="text-muted-foreground">
            Snippet gallery coming soon! Save your code and share it with others.
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
