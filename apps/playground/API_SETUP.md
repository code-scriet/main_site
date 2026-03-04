# Code Execution API Setup Guide

## 🎯 Current Status

Your playground is now configured to work with **JDoodle API** for secure code execution.

### ✅ What Works NOW (No Setup Needed)

**JavaScript** - Runs client-side in your browser using a sandboxed eval environment. No API required!

```javascript
// This works immediately!
console.log('Hello from Code Scriet!');
const name = 'Khushi';
console.log(`Hello, ${name}!`);
```

### 🔧 For Other Languages (Requires Free API Key)

To run Python, C++, Java, C, and TypeScript, you need a **free JDoodle API account**.

## 📝 JDoodle Setup (2 minutes)

### Step 1: Create Free Account
1. Visit: https://www.jdoodle.com/compiler-api
2. Click "Sign Up" (Free tier: 200 calls/day)
3. Confirm your email

### Step 2: Get API Credentials
1. Log in to your JDoodle account
2. Go to "My Account" → "API"
3. Copy your:
   - **Client ID**
   - **Client Secret**

### Step 3: Add to Your Project

Create or update `.env` file in `apps/playground/`:

```bash
VITE_API_URL=http://localhost:5001

# JDoodle API Credentials
VITE_JDOODLE_CLIENT_ID=your_actual_client_id_here
VITE_JDOODLE_CLIENT_SECRET=your_actual_client_secret_here
```

### Step 4: Restart Server
```bash
cd apps/playground
npm run dev
```

## 🧪 Testing

### Test JavaScript (Works Immediately)
```javascript
// No API needed - runs in browser
console.log('Hello World!');

function sum(a, b) {
  return a + b;
}

console.log('5 + 3 =', sum(5, 3));
```

### Test Python (Needs API Key)
```python
# Requires JDoodle API
name = input()  # Use stdin input
print(f'Hello, {name}!')
```

### Test C++ (Needs API Key)
```cpp
#include <iostream>
using namespace std;

int main() {
    cout << "Hello from C++!" << endl;
    return 0;
}
```

## 🆓 Free Tier Limits

| Plan | Calls/Day | Languages | Cost |
|------|-----------|-----------|------|
| **Free** | 200 | All | $0 |
| **Basic** | 2,500 | All | $7/month |
| **Pro** | 10,000 | All | $20/month |

**200 calls/day = ~10-20 coding sessions** - Perfect for college projects!

## 🔐 Why JDoodle?

✅ **Free tier available**  
✅ **No CORS issues**  
✅ **Reliable and fast**  
✅ **Secure sandboxed execution**  
✅ **Supports 6+ languages**  
✅ **No credit card required**  

## 🐛 Troubleshooting

### "Execution failed" Error
- **For JavaScript**: Should work without API key. Clear browser cache.
- **For other languages**: Add JDoodle credentials to `.env` file.
- **Check console**: Look for detailed error messages in browser DevTools.

### "Failed to fetch" Error
```bash
# 1. Check if .env file exists
ls apps/playground/.env

# 2. Verify credentials are set
cat apps/playground/.env

# 3. Restart dev server
cd apps/playground
npm run dev
```

### Rate Limit Exceeded
- Free tier: 200 calls/day
- Wait 24 hours or upgrade plan
- Use JavaScript (unlimited - runs client-side)

## 🌐 Production Deployment

For production (playground.codescriet.dev), add environment variables to Vercel:

```bash
# In Vercel Dashboard → Settings → Environment Variables
VITE_JDOODLE_CLIENT_ID=your_client_id
VITE_JDOODLE_CLIENT_SECRET=your_client_secret
```

## 🎓 Alternative APIs (If JDoodle Doesn't Work)

### Option 1: Piston API (If they re-open public access)
- Free and open source
- No API key needed
- Currently whitelist-only

### Option 2: Build Your Own Backend
- Use Docker containers
- Isolate code execution
- Full control but more complex

### Option 3: Use Vercel Edge Functions
- Create serverless API wrapper
- Call JDoodle from backend
- Hide API keys from client

## 📊 Current Language Support

| Language | Execution | API Needed? | Status |
|----------|-----------|-------------|--------|
| **JavaScript** | Client-side | ❌ No | ✅ Working |
| **Python** | JDoodle API | ✅ Yes | ✅ Ready |
| **C++** | JDoodle API | ✅ Yes | ✅ Ready |
| **Java** | JDoodle API | ✅ Yes | ✅ Ready |
| **C** | JDoodle API | ✅ Yes | ✅ Ready |
| **TypeScript** | JDoodle API | ✅ Yes | ✅ Ready |
| **HTML/CSS/JS** | Client-side | ❌ No | ✅ Working |

## 📞 Need Help?

1. **Check browser console** (F12 → Console tab)
2. **Verify API credentials** in `.env` file
3. **Test with JavaScript first** (should always work)
4. **Check JDoodle account** for remaining credits

---

**Quick Start Summary:**
1. ✅ JavaScript works NOW (no setup)
2. 📝 Get free JDoodle API key for other languages (2 min)
3. 🔧 Add to `.env` file
4. 🚀 Restart server and you're done!

**Built with ❤️ by Code.Scriet Team**
