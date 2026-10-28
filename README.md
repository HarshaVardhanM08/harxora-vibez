# Harxora Vibez 🎵
### Personal Music Library • 100% Offline Playback • Installable Progressive Web App (PWA)

**Harxora Vibez** is a modern, privacy-focused personal music player built with Vanilla HTML5, CSS3, JavaScript, IndexedDB, and the Web Audio API. It combines the visual aesthetics and convenience of modern streaming interfaces with the independence of a 100% offline, local music library.

> **Zero accounts. Zero subscriptions. Zero tracking. Zero remote streaming dependencies.**  
> Import your own legally downloaded music files directly from your phone, tablet, or computer and enjoy continuous offline listening anywhere.

---

## ✨ Key Features

### 🎧 Audio Playback & Engine
- **HTML5 Audio Engine**: Gapless-ready playback with accurate seek, volume, and playback speed control (0.5× to 2.0×).
- **Session-Locked Playback Concurrency**: Protected by an asynchronous `currentPlaySession` token engine that discards stale promises during rapid clicking, preventing corrupted audio states or mismatched UI metadata.
- **Resilient Audio Error & Duration Handling**: Native `error` and `durationchange` listeners detect corrupted files or unsupported formats with descriptive alerts and graceful state recovery.
- **Lock-Screen & Background Playback**: Full integration with the **Media Session API** with real-time `playbackState` synchronization (`playing`, `paused`, `none`), accurate duration/position tracking, comprehensive multi-resolution artwork (96×96 through 512×512), and lock-screen seek, previous, and next controls. Audio playback continues uninterrupted when the screen turns off or locks on supported devices.
- **Queue System**: Real-time queue management with Now Playing, Up Next, and Played sections. Supports moving tracks up/down, clearing queue, and adding tracks to play next.
- **Repeat & True Shuffle**: Repeat One, Repeat All, Repeat Off, and random queue shuffling with anti-repeat safeguards that prevent playing the same track twice on playlist loops.

### 🏠 Responsive Home Screen & Collection Browsing
- **7 Curated Home Sections**: Clean, grid-aligned previews for *Recently Played*, *Favorites*, *Your Playlists*, *Recently Added*, *Albums*, *Artists*, and *Suggested For You*.
- **Performance Preview Bounds**: Standardized 6-card preview limit per section (`HOME_PREVIEW_LIMIT`) ensures instant initial rendering regardless of library size.
- **Dedicated "See All" Views & Actions**: Every "See All" button routes to its dedicated full-collection view with "Play All" and "Shuffle" actions.
- **Smart History Back Navigation**: Dynamic `previousView` state remembers the originating view (Home, Songs, Albums, Artists, Playlists) for seamless return navigation.

### 💾 Offline-First Architecture & Storage
- **IndexedDB Binary Storage**: Audio files are safely stored as binary Blobs inside `harxora-vibez-db`—independent of `localStorage` limits. Supports storing hundreds to thousands of audio tracks locally depending on available device storage.
- **IndexedDB Max Storage & Persistence**:
  - **Chromium / Edge / Brave**: Up to **60% to 80% of free disk space** can be allocated to IndexedDB (often tens or hundreds of gigabytes).
  - **Safari (iOS / iPadOS / macOS)**: Starts with a default quota of ~1GB and requests incremental expansions as library size grows.
  - **Persistent Storage API**: Request persistent storage (`navigator.storage.persist()`) directly from the Settings menu to prevent browsers from automatically evicting stored music when disk space is constrained.
- **Storage Diagnostics & Quota Meter**: Inspect total tracks, MBs utilized, and available device storage quota in Settings and Statistics.
- **Legacy Migration**: Automatic, non-destructive migration from previous versions (`aurora-music` DB and `aurora-state-v1` localStorage).

### 🏷️ Local Metadata Extraction & Manual Editor
- **Multi-Format Metadata Extractor**: Extracts title, artist, album, genre, release year, track number, and embedded artwork for:
  - **MP3** (ID3v2.2, ID3v2.3, ID3v2.4)
  - **M4A / AAC / MP4** (Apple atom boxes)
  - **FLAC / OGG** (Vorbis comments)
  - **WAV** (RIFF audio headers)
- **Metadata Editor**: Edit title, artist, album, genre, and year directly in the app. Changes persist instantly in your local library.
- **Intelligent Duplicate Detection**: Scans filename and file size to skip duplicates during large folder imports.

### 📝 Real-Time Synchronized Lyrics
- **LRC Synchronizer**: Automatically parses `[mm:ss.xx]` timestamps, displays lyrics line-by-line, highlights the active line with glowing accent effects, and auto-scrolls with the song.
- **Interactive Seek**: Click or tap any lyric line to jump directly to that exact second in the track.
- **In-App Lyrics Editor**: Import `.lrc` / `.txt` files or paste lyrics manually with one tap.

### 📊 Local Music Statistics
- **100% Local Listening Metrics**: Total tracks, unique artists, albums, and total playback duration recorded locally.
- **Top 5 Most Played**: Track ranking based on your playback count with instant one-click playback.
- **Top Artists & Genre Breakdown**: Visual breakdown computed entirely offline from your personal collection.

### 🎨 Visual Aesthetics, Themes & Personalization Studio
- **Complete Interface Theme Presets (8 Handcrafted Modes)**:
  1. **Midnight**: Pure OLED pitch-black backdrop, subtle indigo accents (`#6366f1`), and high-contrast typography.
  2. **Neon Cyber**: Dark carbon slate with luminous electric cyan (`#00f0ff`) and vivid magenta glow, cybernetic neon borders.
  3. **Aero Glass**: Translucent frosted crystalline surfaces with refractive backdrop blur and soft luminous reflections.
  4. **Nordic Minimal**: Distraction-free flat monochrome charcoal (`#17181c`), clean silver trim, and zero glowing shadows.
  5. **Immersive Cosmic**: Twilight atmospheric background with radiant violet aura and warm cinematic highlights.
  6. **Aurora Borealis**: Flowing northern lights aesthetic with emerald jade (`#10b981`) and deep amethyst sheen.
  7. **Daylight Light**: Refined porcelain canvas (`#f6f8fc`), crisp slate text, soft daylight shadows, and royal blue accents.
  8. **Audiophile Classic**: Matte studio charcoal with warm amber brass hardware dials and subtle metallic trim.
- **Dedicated Player Appearance (6 Distinct Styles)**:
  1. **Glass** *(Default)*: Translucent glassmorphic surfaces, subtle blur, fine borders, soft highlights.
  2. **Immersive**: Cinematic backdrop with artwork-inspired gradients and radiant ambient glow.
  3. **Minimal**: Flat solid dark aesthetic with clean typography and zero visual distractions.
  4. **Transparent**: Ultra-sheer backdrop allowing wallpapers to show through while maintaining high-contrast controls.
  5. **Dynamic Artwork**: Derives background gradients and accent colors directly from the active track's cover art in real time.
  6. **Classic**: Grounded dark matte finish with familiar media player ergonomics.
- **Dynamic Surface & Glassmorphism Controls**:
  - Application-wide **Surface Opacity** slider (5% to 95%).
  - Real-time **Glass Blur** slider (0px to 60px).
  - Background **Dimming** slider (0% to 90%).
- **Wallpaper Studio & Visibility Scope**:
  - Upload custom high-resolution background photos with automatic color extraction.
  - Curated preset textures (*Aurora Glow*, *Cosmic Nebula*, *Cyber Grid*).
  - **Wallpaper Scope**: Choose whether your custom wallpaper displays across the *Whole Application* or exclusively within the *Expanded Player*.
- **Layout Density & Interface Ergonomics**:
  - **Interface Density**: *Comfortable* (generous touch targets) or *Compact* (streamlined row heights and dense card grids).
  - **Corner Radius**: *Rounded (18px)*, *Soft (10px)*, or *Sharp (4px)*.
  - **Grid Card Sizing**: *Compact*, *Standard*, or *Large*.
  - Mini-player album artwork visibility toggle.
  - Card hover glow effect toggle.
- **Typography & Font Scaling**:
  - 4 font personality presets: *Modern Sans*, *Clean Rounded*, *Geometric Tech*, and *Monospace Accent*.
  - 3 global font scales: *Small (92%)*, *Standard (100%)*, and *Large (108%)*.
- **Motion & Visual Effects**:
  - 3 animation speeds: *Full Motion*, *Subtle (140ms)*, or *Off (zero animations)*.
  - Expanded player ambient aura glow toggle.
  - System reduced-motion preference compliance.
- **Appearance Preset Backup, Export & Reset**:
  - **Export Theme Preset**: Save your appearance settings to a standalone `.json` preset.
  - **Import Theme Preset**: Instantly restore or share visual themes across devices.
  - **Reset Appearance**: Surgically reverts UI styles to default without altering any music files, playlists, favorites, or listening history.
- **Responsive Expanded Player**:
  - **Desktop Dual-Pane**: Player on the left and docked, independently scrollable Queue/Lyrics sidebar on the right. Toggling the sidebar smoothly adjusts the player width (`calc(100% - 380px)`) so the album art and controls remain centered.
  - **Mobile Portrait Mode**: Full-width immersive player. The sidebar is hidden from the main view and opens on-demand as a native-feeling slide-up bottom sheet with blurred backdrop, safe-area inset support, and dedicated close button.
  - **Phone Landscape & Short Screen Layout**: Dual-column layout on short screens (`max-height: 580px`) placing artwork and visualizer on the left and metadata, seek bar, and playback controls on the right.
  - **Mini-Player Sub-Action Toolbar**: Dedicated Queue and Lyrics quick-action pills directly on the mini-player with a real-time track count badge. Opens the respective panel on-demand without interrupting audio playback.
  - **Fluid Framed Artwork**: Preserves original cover aspect ratios with `object-fit: contain` / `cover` inside an elegant rounded frame—no center vinyl hole punching or unexpected cropping.
  - **Full Secondary Controls**: Volume control with responsive slider and mute toggle, playback speed selector (0.5× to 2.0×), synchronized lyrics access, queue management with badge, and fullscreen mode.
- **Multi-Mode Web Audio Visualizer**: 4 real-time visualization styles with Retina High-DPI scaling (`window.devicePixelRatio`), container-relative sizing, and automatic background suspension to save CPU/battery:
  1. *Frequency Bars*
  2. *Oscilloscope Waveform*
  3. *Radial Ring Pulse*
  4. *Minimal Bass Glow*

### 📱 Responsive Layout & Mobile Ergonomics
- **Safe-Area Inset Support**: Full integration with `env(safe-area-inset-bottom)`, `env(safe-area-inset-top)`, and horizontal insets for iPhones with Home Bar, notch, dynamic island, and gesture-bar Android phones.
- **Collision-Free Bottom Navigation & Mini-Player**:
  - Independent positioning layers: Mobile Bottom Nav (`z-index: 55`) and Mini-Player (`z-index: 50`) never collide or obscure controls.
  - Clean initial inactive state: No ghost elements, no fake metadata, and no misleading `0:00 / 0:00` progress bar before playback begins.
  - Dynamic body padding: Content automatically adapts to the presence or absence of the mini-player.
  - Ellipsis text truncation prevents long song titles from crowding artwork, controls, or time labels.
- **Unified Home-Page Card Grid**:
  - Responsive CSS Grid across all 5 home sections: *Recently Played*, *Favorites*, *Your Playlists*, *Recently Added*, and *Suggested From Your Library*.
  - Consistent 1:1 artwork aspect ratios and hover lift effects.
  - Informative empty-state cards when a section has no tracks yet.
- **Cross-Device Compatibility**: Seamlessly adapts across small phones (320×568), standard phones (375×667, 390×844), large phones (430×932), tablets (768×1024, 1024×768), laptops, desktops, and ultrawide displays (2560×1080).
- **Reduced Motion Support**: Respects `@media (prefers-reduced-motion: reduce)` for users sensitive to animations.

### 📲 First-Class Mobile & Desktop PWA
- **Installable Progressive Web App**: Compliant `manifest.json`, bundled PNG icons (192×192, 512×512, maskable), and a versioned cache-first Service Worker (`service-worker.js`).
- **Touch-Friendly Bottom Navigation**: Dedicated mobile navigation bar (`Home`, `Songs`, `Playlists`, `Stats`, `Settings`) with iOS safe-area support.
- **Data Backup & Restore**: One-click JSON export and import for all your playlists, favorites, metadata, lyrics, and settings.

---

## 🚀 Running Locally

Because Progressive Web Apps and Service Workers require a secure context (`http://localhost` or `https://`), run Harxora Vibez through a local HTTP server:

### Option 1: Python 3 (Recommended)
```bash
# Navigate to the project directory
cd "/Users/harsha/Documents/my apps/music player"

# Start a local web server on port 8080
python3 -m http.server 8080
```
Open your browser and navigate to:
```
http://localhost:8080
```

### Option 2: Node.js (npx serve or http-server)
```bash
npx serve .
# or
npx http-server -p 8080
```

---

## 📱 How to Install the PWA

### Android (Chrome / Brave / Edge)
1. Open `http://localhost:8080` (or your HTTPS URL).
2. Tap the **Install** button inside the app, or tap the browser menu (**⋮**) and choose **Install app** or **Add to Home screen**.
3. Harxora Vibez will appear as a standalone app on your home screen and app drawer.

### iPhone & iPad (Safari)
1. Open the website in **Safari**.
2. Tap the **Share** button (box with an upward arrow) in the toolbar.
3. Scroll down and tap **Add to Home Screen**.
4. Confirm by tapping **Add**. Harxora Vibez will launch in full standalone mode with no browser address bar.

### Windows, macOS & Linux (Chrome / Edge / Brave)
1. In the browser address bar, click the **Install icon** (a screen with a down arrow).
2. Or open **Settings** inside the app and click **Install Harxora Vibez**.
3. The app will open in its own dedicated, native-feeling window.

---

## 🔒 Offline Use & Privacy

1. **Initial Visit**: When you first load the website, the service worker caches the HTML, CSS, JavaScript, icons, and fonts into local Cache Storage.
2. **Going Offline**: You can now turn off Wi-Fi and mobile data. Opening the app from your home screen or bookmarks will boot instantly offline.
3. **Importing Music**: Click **Add Music** or drag and drop audio files. They are saved in browser IndexedDB on your device.
4. **Data Privacy**: No audio files, metadata, or metrics leave your device. There is no telemetry, no tracking, and no external analytics.

---

## 💾 Backing Up & Restoring Your Library

### How to Back Up
1. Go to **Settings** → **Data Backup & Restore**.
2. Click **Export Backup (JSON)**.
3. A JSON file (`harxora-vibez-backup-YYYY-MM-DD.json`) containing your playlists, favorites, track details, lyrics, and settings will download to your device.

> **Important Distinction:**  
> The JSON backup file preserves your playlist sequences, favorites, custom metadata edits, listening counts, and synchronized lyrics. The actual audio files remain stored in your device's IndexedDB. Keep your original audio files stored safely on your device or an external drive.

### How to Restore
1. Go to **Settings** → **Data Backup & Restore**.
2. Click **Restore Backup** and select your `.json` backup file.
3. Confirm the restoration preview to restore all playlists and preferences.

---

## 🌐 Deploying to HTTPS

To access Harxora Vibez on mobile devices over your local network or the internet, deploy it to any static web host with HTTPS:

- **Cloudflare Pages / GitHub Pages / Vercel / Netlify**:
  Simply connect your repository or upload the project folder. No build step or Node dependencies are required—it is 100% pure static HTML, CSS, and JS.
- **Local Network Testing**:
  If testing on a phone over your local Wi-Fi, modern browsers require HTTPS for Service Workers and Media Session except on `localhost`. Use tools like `ngrok http 8080` or `mkcert` for local HTTPS.

---

## ⚠️ Known Browser Limitations

1. **iOS Audio Background Limitations**:
   iOS Safari may pause Web Audio API or HTML5 Audio if the device enters deep sleep or low-power mode after prolonged inactivity. The Media Session API provides lock-screen controls, but iOS manages memory aggressively.
2. **Browser Storage Eviction**:
   Mobile browsers may clear IndexedDB if device storage drops below 5-10%. Use the **"Request Persistent Storage"** button in Settings to signal the OS to preserve your music library.
3. **Folder Selection Support**:
   Folder imports (`webkitdirectory`) are supported on desktop Chrome, Safari, and Edge. On mobile browsers that do not support directory selection, use multi-file selection.

---

## 🛠️ Project Structure

```
music player/
├── index.html              # Core application markup, views & modals
├── style.css               # Complete responsive design system & glassmorphism
├── script.js               # Audio engine, IndexedDB, lyrics, visualizer, PWA logic
├── manifest.json           # Web App Manifest for standalone PWA installation
├── service-worker.js       # Offline shell caching & service worker lifecycle
├── assets/
│   └── icons/
│       └── neon-h-music-wave-icon.png  # Master unified app icon for favicon, PWA, and lockscreen
├── LICENSE                 # MIT License
├── .gitignore              # Git ignore rules for clean repository
└── README.md               # Complete documentation and setup guide
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) — free to use, modify, and distribute for personal and commercial use.

---

*Harxora Vibez — Your personal music library. Your music. Your space. Offline.*
