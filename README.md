# Harxora Vibez 🎵
### Personal Music Library • 100% Offline Playback • Installable Progressive Web App (PWA)

**Harxora Vibez** is a modern, privacy-focused personal music player built with Vanilla HTML5, CSS3, JavaScript, IndexedDB, and the Web Audio API. It combines the visual aesthetics and convenience of modern streaming interfaces with the independence of a 100% offline, local music library.

> **Zero accounts. Zero subscriptions. Zero tracking. Zero remote streaming dependencies.**  
> Import your own legally downloaded music files directly from your phone, tablet, or computer and enjoy continuous offline listening anywhere.

---

## ✨ Key Features

### 🎧 Audio Playback & Engine
- **HTML5 Audio Engine**: Gapless-ready playback with accurate seek, volume, and playback speed control (0.5× to 2.0×).
- **Lock-Screen & Headset Controls**: Full integration with the **Media Session API** for Android, iOS, Windows, and macOS control centers, Bluetooth headsets, and vehicle stereos with interactive play, pause, previous, next, and seek controls.
- **Queue System**: Real-time queue management with Now Playing, Up Next, and Played sections. Supports moving tracks up/down, clearing queue, and adding tracks to play next.
- **Repeat & True Shuffle**: Repeat One, Repeat All, Repeat Off, and random queue shuffling.

### 💾 Offline-First Architecture & Storage
- **IndexedDB Binary Storage**: Audio files are safely stored as binary Blobs inside `harxora-vibez-db`—independent of `localStorage` limits.
- **Storage Diagnostics & Quota Meter**: Inspect total tracks, MBs utilized, and available device storage quota in Settings and Statistics.
- **Persistent Storage API**: Request persistent device storage (`navigator.storage.persist()`) to protect your offline collection from browser eviction.
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

### 🎨 Visual Aesthetics & Themes
- **Four Curated Themes**: Dark Mode, Light Mode, AMOLED True Black, and Dynamic Custom Mode.
- **Accent Color Palette**: Vibrant glows with custom hex picker.
- **Dynamic Artwork Palette Extraction**: Automatically extracts dominant accent colors from album covers.
- **Custom Wallpaper**: Upload your own background photo with adjustable glassmorphic blur and dimming sliders.
- **Multi-Mode Web Audio Visualizer**: 4 real-time visualization styles:
  1. *Frequency Bars*
  2. *Oscilloscope Waveform*
  3. *Radial Ring Pulse*
  4. *Minimal Bass Glow*

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
