import { Routes, Route, Navigate } from 'react-router-dom';
import { PlaygroundProvider } from './context/PlaygroundContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { AuthGate } from './components/auth/AuthGate';
import PlaygroundPage from './pages/PlaygroundPage';
import SnippetsPage from './pages/SnippetsPage';
import SnippetViewPage from './pages/SnippetViewPage';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGate>
          <PlaygroundProvider>
            <Routes>
              <Route path="/" element={<PlaygroundPage />} />
              <Route path="/snippets" element={<SnippetsPage />} />
              <Route path="/snippet/:id" element={<SnippetViewPage />} />
              <Route path="/s/:shareToken" element={<SnippetViewPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PlaygroundProvider>
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
