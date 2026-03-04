# 🚀 Playground Quick Reference

## Commands

### From Root Directory

```bash
# Development
npm run playground              # Start playground dev server (port 5174)
npm run dev                     # Start frontend + backend only
npm run dev:all                 # Start all three apps

# Build
npm run playground:build        # Build playground only
npm run build                   # Build frontend + backend only
npm run build:all              # Build all three apps

# Preview
npm run playground:preview      # Preview playground production build
```

### From Playground Directory (`cd apps/playground`)

```bash
npm run dev                    # Start dev server
npm run build                  # Build for production
npm run preview                # Preview production build
npm run lint                   # Run linter
```

## URLs

- **Playground Dev**: http://localhost:5174
- **Frontend Dev**: http://localhost:5173
- **Backend API**: http://localhost:5001

## File Locations

```
apps/playground/
├── src/
│   ├── components/playground/     # Main components
│   ├── pages/                     # Page components
│   ├── context/                   # State management
│   ├── utils/                     # Language configs, API
│   └── hooks/                     # Custom hooks
├── package.json                   # Dependencies
├── vite.config.ts                 # Build config
├── .env                           # Environment variables
├── README.md                      # Full documentation
└── IMPLEMENTATION_SUMMARY.md      # This implementation
```

## Adding Languages

Edit `src/utils/languageConfig.ts`:

```typescript
newlang: {
  id: 'newlang',
  name: 'New Language',
  pistonId: 'newlang',  // See Piston docs
  version: '1.0.0',
  icon: '🔥',
  fileExtension: '.ext',
  monacoId: 'newlang',  // Monaco language ID
  comment: '//',
  boilerplate: `// Your code here`,
}
```

## Adding Problems

Edit `src/data/problems.ts`:

```typescript
{
  id: 'problem-id',
  title: 'Problem Title',
  difficulty: 'Easy' | 'Medium' | 'Hard',
  description: '...',
  examples: [...],
  constraints: [...],
  testCases: [...]
}
```

## Environment Variables

```env
# .env file
VITE_PISTON_API_URL=https://emkc.org/api/v2/piston
VITE_API_URL=http://localhost:5001
```

## Deployment

### Vercel (Easiest)

```bash
cd apps/playground
vercel --prod
```

### Build Locally

```bash
npm run playground:build
# Output: apps/playground/dist/
```

## Key Features

- ✅ 9 programming languages
- ✅ Real-time code execution (Piston API)
- ✅ Monaco Editor (VS Code)
- ✅ Dark/Light themes
- ✅ Auto-save to localStorage
- ✅ Custom stdin input
- ✅ Split-pane layout
- ✅ Problem panel
- ✅ Mobile responsive
- ✅ Web preview (HTML/CSS/JS)

## Troubleshooting

### Build fails

```bash
cd apps/playground
rm -rf node_modules dist
cd ../..
npm install
npm run playground:build
```

### Port already in use

```bash
# Change port in vite.config.ts
server: {
  port: 5175,  // or any available port
}
```

### Monaco Editor not loading

Check browser console. Ensure:
- Build completed successfully
- No CORS errors
- Internet connection (Monaco CDN)

## Keyboard Shortcuts

- **Ctrl+Enter**: Run code
- **Ctrl+S**: Auto-save (automatic)

## Support

- 📖 Full docs: [README.md](README.md)
- 🚀 Deployment: [DEPLOYMENT.md](DEPLOYMENT.md)
- 📝 Implementation: [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)

---

**Status**: ✅ Production Ready  
**Independent**: ✅ Separate from frontend/backend  
**Build Time**: ~3-4 seconds
