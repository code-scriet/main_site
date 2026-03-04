# 🎮 Where to Find the Playground Button

## On the Main Website (codescriet.dev)

### Desktop View

The **"Playground"** button appears in the **top navigation bar** alongside other menu items:

```
┌──────────────────────────────────────────────────────────────────────┐
│  [Logo] code.scriet    Home  About  Events  Announcements  Team     │
│                        Achievements  Network  [PLAYGROUND]            │
│                                              Sign In / Dashboard →    │
└──────────────────────────────────────────────────────────────────────┘
```

**Location**: Top navigation bar (Header)
**Position**: After "Achievements" and "Network", before authentication buttons
**Behavior**: Opens in a new tab

---

## Development vs Production

### Development (localhost)
When running locally:
- Main site: `http://localhost:5173`
- Playground button links to: `http://localhost:5174`

### Production
When deployed:
- Main site: `https://codescriet.dev`
- Playground button links to: `https://playground.codescriet.dev`

---

## Mobile View

On mobile devices, the navigation collapses into a **hamburger menu (☰)**:

1. Click the hamburger icon (☰) in the top-right corner
2. Menu slides open showing all navigation items
3. **"Playground"** is listed among the menu items
4. Tap "Playground" to open in a new tab

---

## How It Looks

### Navigation Bar Items (Order):
1. **Home** → Main landing page
2. **About** → Club information  
3. **Events** → Event listings
4. **Announcements** → News and updates
5. **Team** → Team members
6. **Achievements** → Club milestones
7. **Network** → Member network (conditional)
8. **🎮 Playground** ← **THIS IS IT!** (Opens in new tab)
9. **Sign In** / **Dashboard** → Authentication

---

## Code Location

The Playground link is defined in:
**File**: `apps/web/src/components/layout/Header.tsx`
**Line**: ~20

```tsx
{ 
  name: 'Playground', 
  href: import.meta.env.DEV 
    ? 'http://localhost:5174' 
    : 'https://playground.codescriet.dev', 
  external: true 
}
```

---

## Visual Example

```
┌─────────────────────────────────────────────────────────────┐
│ 🟧 code.scriet                                              │
│                                                              │
│  [ ] Home                                                   │
│  [ ] About                                                  │
│  [ ] Events                                                 │
│  [ ] Announcements                                          │
│  [ ] Team                                                   │
│  [ ] Achievements                                           │
│  [ ] Network                                                │
│  [🎮] PLAYGROUND  ← Click here!                            │
│  [ ] Sign In                                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing

### To test the Playground link:

1. **Start the main website**:
   ```bash
   npm run web
   ```
   Opens at: http://localhost:5173

2. **Start the playground** (in another terminal):
   ```bash
   npm run playground
   ```
   Opens at: http://localhost:5174

3. **Go to main website**: http://localhost:5173
4. **Look at the top navigation bar**
5. **Click "Playground"** → Opens http://localhost:5174 in new tab

---

## Styling

The Playground link has the same styling as other navigation items:
- **Font**: Medium weight, clean sans-serif
- **Color**: Gray-700 (default)
- **Hover**: Amber-600 (matches theme)
- **Active**: Underline or color change
- **Transitions**: Smooth 200ms

---

## If You Don't See It

### Possible Reasons:

1. **Settings disabled**: Check if `showNetwork` or other settings hide it (unlikely)
2. **Not logged in**: Link is visible to everyone (public)
3. **Browser cache**: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### Quick Fix:
```bash
# Clear and restart
lsof -ti:5173 | xargs kill -9
npm run web
```

---

## Future Customization

Want to move or style the Playground button differently?

Edit: `apps/web/src/components/layout/Header.tsx`

Example - Add an icon:
```tsx
{ 
  name: '🎮 Playground',  // Add emoji
  href: '...',
  external: true 
}
```

Example - Change position (move in array):
```tsx
const navigation = [
  { name: 'Home', href: '/' },
  { name: 'Playground', href: '...', external: true }, // Move up
  { name: 'About', href: '/about' },
  // ... rest
];
```

---

## Summary

✅ **Location**: Top navigation bar, after "Network", before "Sign In"
✅ **Behavior**: Opens in new tab
✅ **Local URL**: http://localhost:5174
✅ **Production URL**: https://playground.codescriet.dev
✅ **Always visible**: No login required
✅ **Mobile**: In hamburger menu (☰)

**Just look at the top of your website and you'll see it! 😊**
