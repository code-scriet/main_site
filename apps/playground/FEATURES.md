# Playground Features ✨

## Latest Updates (March 2026)

### 🔧 Fixed Issues
- ✅ **Switched to OneCompiler API** - Reliable, free code execution
- ✅ **Removed Go language** - Streamlined to 7 languages
- ✅ **Removed Rust language** - Focus on most-used languages
- ✅ **Improved error handling** - Better error messages and user feedback
- ✅ **Fixed execution failures** - Code now runs successfully

### 🆕 New Features Added

#### Code Management
- **📥 Download Code** - Save your code to local files with proper extensions
- **📋 Copy Code** - One-click copy to clipboard
- **🔄 Reset Code** - Quick reset to language boilerplate
- **💾 Auto-Save** - Code automatically saves to localStorage every 2 seconds

#### Code Editing
- **🎨 Format Code** - Basic code formatting for better readability
- **🔍 Font Size Controls** - Zoom in/out for comfortable viewing
- **🌓 Dark/Light Theme** - Toggle between VS Code dark and light themes
- **⌨️ Monaco Editor** - Full-featured code editor with:
  - IntelliSense auto-completion
  - Syntax highlighting
  - Error detection
  - Multi-cursor editing
  - Find and replace

#### Execution & Output
- **▶️ Run Code** - Execute code in 8 supported languages
- **⏱️ Execution Time** - See how long your code took to run
- **📝 Custom Input (stdin)** - Provide input for your programs
- **🖥️ Terminal Output** - View stdout/stderr in a terminal-like interface
- **🌐 Web Preview** - Live preview for HTML/CSS/JS code

#### UI/UX Enhancements
- **📱 Responsive Design** - Works on desktop, tablet, and mobile
- **🖼️ Fullscreen Mode** - Distraction-free coding experience
- **📊 Split Panels** - Resizable editor, output, and problem panels
- **📚 Problem Panel** - View coding challenges while you code
- **🎯 Language Selector** - Easy switching between languages with icons

---

## Supported Languages (7)

| Language | Version | Icon | Features |
|----------|---------|------|----------|
| **JavaScript** | Node.js 18.15 | 🟨 | Full ES6+ support, async/await |
| **Python** | 3.10.0 | 🐍 | Modern Python with type hints |
| **C++** | GCC 10.2.0 | ⚡ | C++17 standard, STL support |
| **Java** | 15.0.2 | ☕ | Modern Java features |
| **C** | GCC 10.2.0 | 🔷 | Standard C library |
| **TypeScript** | 5.0.3 | 🔷 | Type-safe JavaScript |
| **HTML/CSS/JS** | Native | 🌐 | Live web preview |

---

## Code Execution Features

### OneCompiler API Integration
- **100% Free** - No API key required
- **Reliable execution** - Stable and fast
- **Secure execution** - Sandboxed environment
- **Fast execution** - Results in 1-3 seconds
- **Error handling** - Compile and runtime errors displayed
- **Multi-language support** - 7 languages supported

### Execution Features
- **Timeout**: 15 seconds per execution
- **Memory**: Reasonable limits per language
- **Output**: Full stdout/stderr capture
- **Input**: Custom stdin support
- **Compilation**: Automatic for compiled languages

---

## Problem Panel Features

### 5 Sample Problems
1. **Two Sum** (Easy) - Array manipulation, hash maps
2. **Palindrome Checker** (Easy) - String processing
3. **Reverse String** (Easy) - String algorithms
4. **Fibonacci Sequence** (Medium) - Recursion, dynamic programming
5. **Valid Parentheses** (Medium) - Stack data structure

### Problem Display
- Difficulty levels (Easy/Medium/Hard)
- Detailed descriptions
- Input/output examples
- Constraints and edge cases
- Test cases (coming soon)

---

## Keyboard Shortcuts

### Monaco Editor (VS Code-like)
- `Ctrl/Cmd + F` - Find
- `Ctrl/Cmd + H` - Replace
- `Ctrl/Cmd + /` - Toggle comment
- `Ctrl/Cmd + ]` - Indent
- `Ctrl/Cmd + [` - Outdent
- `Alt + ↑/↓` - Move line up/down
- `Shift + Alt + ↑/↓` - Copy line up/down
- `Ctrl/Cmd + D` - Select next occurrence
- `Ctrl/Cmd + Enter` - Insert line below

### Custom Shortcuts (Coming Soon)
- `Ctrl/Cmd + Enter` - Run code
- `Ctrl/Cmd + Shift + F` - Format code
- `Escape` - Exit fullscreen

---

## Planned Features 🚀

### Short Term
- [ ] **Snippet Library** - Save and share code snippets
- [ ] **Code Templates** - Quick start templates for common tasks
- [ ] **Share Code** - Generate shareable links
- [ ] **Import Files** - Upload local code files
- [ ] **Export History** - Download code execution history

### Medium Term
- [ ] **Test Cases** - Run code against multiple test cases
- [ ] **Code Comparison** - Compare different solutions
- [ ] **Collaborative Editing** - Real-time code collaboration
- [ ] **Code Reviews** - Share and review code with peers
- [ ] **Syntax Checking** - Real-time linting

### Long Term
- [ ] **More Languages** - Ruby, PHP, Swift, Kotlin, etc.
- [ ] **Custom Themes** - User-customizable editor themes
- [ ] **Extensions** - Plugin system for custom features
- [ ] **AI Assistant** - Code suggestions and debugging help
- [ ] **Performance Profiling** - Memory and CPU usage analysis
- [ ] **Video Tutorials** - Integrated learning resources

---

## Technical Stack

### Frontend
- **React 19** - Modern React with server components
- **TypeScript** - Type-safe development
- **Vite** - Fast development and builds
- **TailwindCSS** - Utility-first styling
- **Monaco Editor** - VS Code's editor component
- **React Resizable Panels** - Flexible layout system

### UI Components
- **Radix UI** - Accessible component primitives
- **Lucide Icons** - Beautiful icon set
- **Sonner** - Toast notifications

### State Management
- **Zustand** - Lightweight state management
- **React Context** - Theme and playground state
- **LocalStorage** - Persistent code storage

### Code Execution
- **Judge0 CE API** - Secure code execution
- **OneCompiler API** - Free and reliable code execution
- **Web Workers** (Coming) - Client-side execution for JS

---

## Performance Optimizations

### Code Splitting
- Monaco Editor loaded lazily (~2MB)
- Language definitions loaded on demand
- Conditional rendering for panels

### Caching
- Code auto-saved to localStorage
- Language preferences persisted
- Theme selection remembered

### Responsive Design
- Mobile-optimized touch targets
- Adaptive layouts for small screens
- Reduced animations on mobile

---

## Browser Support

### Recommended Browsers
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

### Required Features
- ES6+ JavaScript
- LocalStorage API
- Fetch API
- Fullscreen API (optional)

---

## Contributing

Want to add more features? Check out the issues or submit a PR!

### Development
```bash
npm install
npm run dev
```

### Building
```bash
npm run build
npm run preview
```

### Deployment
```bash
./deploy.sh
```

---

## License

MIT License - Feel free to use and modify!

---

**Built with ❤️ by Code.Scriet Team**
