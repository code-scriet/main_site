export interface LanguageConfig {
  id: string;
  name: string;
  pistonId: string;
  version: string;
  icon: string;
  fileExtension: string;
  monacoId: string;
  boilerplate: string;
  comment: string;
}

export const LANGUAGES: Record<string, LanguageConfig> = {
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    pistonId: 'javascript',
    version: '18.15.0',
    icon: '🟨',
    fileExtension: '.js',
    monacoId: 'javascript',
    comment: '//',
    boilerplate: `// JavaScript Playground
console.log('Hello from Code Scriet!');

// Try some code
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('Coder'));
`,
  },
  python: {
    id: 'python',
    name: 'Python',
    pistonId: 'python',
    version: '3.10.0',
    icon: '🐍',
    fileExtension: '.py',
    monacoId: 'python',
    comment: '#',
    boilerplate: `# Python Playground
print('Hello from Code Scriet!')

# Try some code
def greet(name):
    return f'Hello, {name}!'

print(greet('Coder'))
`,
  },
  cpp: {
    id: 'cpp',
    name: 'C++',
    pistonId: 'c++',
    version: '10.2.0',
    icon: '⚡',
    fileExtension: '.cpp',
    monacoId: 'cpp',
    comment: '//',
    boilerplate: `// C++ Playground
#include <iostream>
#include <string>
using namespace std;

int main() {
    cout << "Hello from Code Scriet!" << endl;
    
    // Try some code
    string name = "Coder";
    cout << "Hello, " << name << "!" << endl;
    
    return 0;
}
`,
  },
  java: {
    id: 'java',
    name: 'Java',
    pistonId: 'java',
    version: '15.0.2',
    icon: '☕',
    fileExtension: '.java',
    monacoId: 'java',
    comment: '//',
    boilerplate: `// Java Playground
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Code Scriet!");
        
        // Try some code
        String name = "Coder";
        System.out.println("Hello, " + name + "!");
    }
}
`,
  },
  c: {
    id: 'c',
    name: 'C',
    pistonId: 'c',
    version: '10.2.0',
    icon: '🔷',
    fileExtension: '.c',
    monacoId: 'c',
    comment: '//',
    boilerplate: `// C Playground
#include <stdio.h>

int main() {
    printf("Hello from Code Scriet!\\n");
    
    // Try some code
    char name[] = "Coder";
    printf("Hello, %s!\\n", name);
    
    return 0;
}
`,
  },
  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    pistonId: 'typescript',
    version: '5.0.3',
    icon: '🔷',
    fileExtension: '.ts',
    monacoId: 'typescript',
    comment: '//',
    boilerplate: `// TypeScript Playground
console.log('Hello from Code Scriet!');

// Try some code
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('Coder'));
`,
  },
  web: {
    id: 'web',
    name: 'HTML/CSS/JS',
    pistonId: 'web',
    version: '1.0.0',
    icon: '🌐',
    fileExtension: '.html',
    monacoId: 'html',
    comment: '<!--',
    boilerplate: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Web Playground</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
        }
        .container {
            max-width: 600px;
            margin: 50px auto;
        }
        button {
            background: white;
            color: #667eea;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            transform: scale(1.05);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Hello from Code Scriet!</h1>
        <p>Edit this HTML, CSS, and JavaScript to see live changes!</p>
        <button onclick="greet()">Click Me!</button>
    </div>

    <script>
        function greet() {
            alert('Hello, Coder! 🚀');
        }
    </script>
</body>
</html>
`,
  },
};

export const DEFAULT_LANGUAGE = 'javascript';

export function getLanguageById(id: string): LanguageConfig {
  return LANGUAGES[id] || LANGUAGES[DEFAULT_LANGUAGE];
}

export function getAllLanguages(): LanguageConfig[] {
  return Object.values(LANGUAGES);
}
