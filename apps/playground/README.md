# Code.Scriet Playground 🚀

A powerful, browser-based coding playground supporting multiple programming languages with real-time code execution.

## ✨ Features

- **Multi-Language Support**: JavaScript, Python, C++, Java, C, TypeScript, and HTML/CSS/JS (7 languages)
- **Monaco Editor**: VS Code-like editing experience with IntelliSense and syntax highlighting
- **Real-Time Execution**: Execute code using the free OneCompiler API
- **Custom Input**: Support for stdin input for interactive programs
- **Live Web Preview**: Real-time preview for HTML/CSS/JS code
- **Dark/Light Themes**: Toggle between dark and light editor themes
- **Auto-Save**: Automatic code saving to localStorage
- **Code Download**: Download your code with proper file extensions
- **Format Code**: Basic code formatting for better readability
- **Fullscreen Mode**: Distraction-free coding experience
- **Resizable Panels**: Customize your workspace layout
- **Problem Panel**: Practice coding with built-in problem sets
- **Mobile Responsive**: Works on tablets and mobile devices

## 🛠️ Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Monaco Editor** - Code editor component
- **TailwindCSS** - Styling
- **OneCompiler API** - Free code execution engine
- **React Resizable Panels** - Split pane layout
- **Zustand** - State management
- **Sonner** - Toast notifications

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Modern web browser

### Installation

From the root of the monorepo:

```bash
# Install dependencies
npm install

# Start the playground (port 5174)
npm run playground

# Build for production
npm run playground:build

# Preview production build
npm run playground:preview
```

### Standalone Development

From the playground directory:

```bash
cd apps/playground

# Install dependencies (if not already installed)
npm install

# Start dev server
npm run dev

# Build
npm run build

# Preview
npm run preview
```

## 📐 Architecture

```
apps/playground/
├── src/
│   ├── components/
│   │   ├── playground/       # Core playground components
│   │   │   ├── CodeEditor.tsx
│   │   │   ├── Toolbar.tsx
│   │   │   ├── OutputPanel.tsx
│   │   │   └── ProblemPanel.tsx
│   │   └── ui/               # Reusable UI components
│   ├── context/              # React contexts
│   │   ├── PlaygroundContext.tsx
│   │   └── ThemeContext.tsx
│   ├── pages/                # Page components
│   │   ├── PlaygroundPage.tsx
│   │   ├── SnippetsPage.tsx
│   │   └── SnippetViewPage.tsx
│   ├── utils/                # Utility functions
│   │   ├── languageConfig.ts # Language definitions
│   │   └── pistonApi.ts      # API integration
│   ├── data/                 # Static data
│   │   └── problems.ts       # Sample problems
│   └── lib/                  # Helper libraries
│       └── utils.ts
├── public/                   # Static assets
├── index.html                # Entry HTML
└── vite.config.ts            # Vite configuration
```

## 🎯 Available Commands

### Root Level Commands

| Command | Description |
|---------|-------------|
| `npm run playground` | Start playground dev server |
| `npm run playground:build` | Build playground for production |
| `npm run playground:preview` | Preview playground production build |
| `npm run dev:all` | Start API + Web + Playground together |
| `npm run build:all` | Build all apps |

### Playground Level Commands (from `apps/playground/`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server on port 5174 |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## 🌐 Supported Languages

| Language | Runtime | Piston ID |
|----------|---------|-----------|
| JavaScript | Node.js 18.15.0 | javascript |
| Python | Python 3.10.0 | python |
| C++ | GCC 10.2.0 | c++ |
| Java | OpenJDK 15.0.2 | java |
| C | GCC 10.2.0 | c |
| TypeScript | TS 5.0.3 | typescript |
| Go | Go 1.16.2 | go |
| Rust | Rust 1.68.2 | rust |
| HTML/CSS/JS | Browser | web (local) |

## 🔑 Environment Variables

Create a `.env` file in the playground directory:

```env
# Piston API (default: https://emkc.org/api/v2/piston)
VITE_PISTON_API_URL=https://emkc.org/api/v2/piston

# Optional: Main site API (for snippet saving)
VITE_API_URL=http://localhost:5001

# Optional: Judge0 API (alternative to Piston)
# VITE_JUDGE0_API_URL=https://judge0-ce.p.rapidapi.com
# VITE_JUDGE0_API_KEY=your_rapidapi_key_here
```

## 📝 Key Features

### Code Editor
- Monaco Editor with VS Code features
- Syntax highlighting for all supported languages
- IntelliSense and autocomplete
- Code folding and minimap
- Adjustable font size
- Multiple themes

### Code Execution
- Real-time code execution via Piston API
- Support for custom stdin input
- Separate stdout and stderr display
- Execution time tracking
- Error highlighting with line numbers
- Compile error detection

### User Interface
- Resizable split-pane layout
- Collapsible problem panel
- Dark/Light theme toggle
- Responsive design for mobile
- Toast notifications for actions
- Clean, modern design

### Auto-Save
- Code saved to localStorage every 2 seconds
- Preserves language selection
- Maintains custom input
- Survives browser refresh

## 🔧 Customization

### Adding a New Language

Edit `src/utils/languageConfig.ts`:

```typescript
newlang: {
  id: 'newlang',
  name: 'New Language',
  pistonId: 'newlang',
  version: '1.0.0',
  icon: '🔥',
  fileExtension: '.ext',
  monacoId: 'newlang',
  comment: '//',
  boilerplate: `// Your boilerplate code here`,
}
```

### Adding Problems

Edit `src/data/problems.ts`:

```typescript
{
  id: 'problem-id',
  title: 'Problem Title',
  difficulty: 'Easy' | 'Medium' | 'Hard',
  description: 'Problem description...',
  examples: [...],
  constraints: [...],
  testCases: [...]
}
```

## 🚢 Deployment

### Vercel

```bash
# From playground directory
npm run build

# Deploy dist/ folder
vercel --prod
```

### Netlify

```bash
# Build
npm run build

# Deploy
netlify deploy --prod --dir=dist
```

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 5174
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0"]
```

## 📊 Performance

- **Bundle Size**: ~800KB (with Monaco Editor)
- **Code splitting**: Monaco Editor lazy-loaded
- **Build time**: ~10-15 seconds
- **Dev server startup**: ~2-3 seconds

## 🐛 Known Issues

- Monaco Editor increases bundle size significantly
- Web preview (iframe) has security limitations
- Piston API has rate limits on free tier
- Mobile keyboard can overlap code editor on small screens

## 🤝 Contributing

This is part of the Code.Scriet platform. See the main project README for contribution guidelines.

## 📄 License

MIT

## 🔗 Links

- [Main Site](https://codescriet.dev)
- [Piston API](https://github.com/engineer-man/piston)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)

---

Built with ❤️ by the Code.Scriet team
