# 🖤 Netherite

<p align="center">
  <img src="public/placeholder-logo.png" alt="Netherite Logo" width="120" />
</p>

<p align="center">
  <a href="https://github.com/netherite-app/netherite/releases">
    <img src="https://img.shields.io/github/v/release/netherite-app/netherite?include_prereleases&label=latest" alt="Latest Release" />
  </a>
  <img src="https://img.shields.io/github/license/netherite-app/netherite" alt="License" />
  <img src="https://img.shields.io/github/stars/netherite-app/netherite" alt="Stars" />
  <img src="https://img.shields.io/badge/platform-Windows-blue" alt="Platform" />
</p>

> Your second brain. Built different.

Netherite is a desktop second-brain application that combines notes, flashcards, habits, and todos in one unified workspace — all wrapped in a sleek game-inspired interface.

## ✨ Features

### 📝 Markdown Notes
- Vault-based note organization with folder hierarchy
- Full Markdown support with live preview
- Wiki-style linking between notes `[[note-name]]`
- Attachment support for images and files

### 🧠 Flashcards
- Spaced-repetition review system
- Rich media support in cards
- Progress tracking and statistics

### ✅ Habits & Todos
- Daily habit tracking with streak counters
- Todo management with priorities
- Integrated momentum system to keep you moving

### 🎮 Gamified Experience
- Gacha-style item collection system
- Cosmetic upgrades for your profile
- Level progression and achievements

### 📊 Analytics
- Habit and productivity dashboards
- Visual progress charts
- PreChaos AI-powered fatigue detection

### 🔄 Cloud Sync
- Appwrite-powered cloud synchronization
- Cross-device note sync
- Inventory backup and restore

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18, TypeScript, Tailwind CSS |
| **Desktop** | Electron 35, electron-vite |
| **State** | Zustand |
| **UI** | Radix UI, shadcn/ui components |
| **Backend** | Python (PreChaos AI), Appwrite Cloud |
| **Editor** | CodeMirror 6 |

## 📋 Prerequisites

- **Node.js** 18+ 
- **npm** 9+
- **Python** 3.10+ (for PreChaos AI backend)
- **Appwrite** account (for cloud features)

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/netherite.git
cd netherite
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Copy the environment template and fill in your Appwrite credentials:

```bash
# Linux/Mac
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

Edit `.env` with your Appwrite values:

```env
VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=your_project_id
VITE_APPWRITE_DATABASE_ID=your_database_id
# ... other Appwrite variables
```

### 4. Run in Development

```bash
npm run dev
```

The app will launch in development mode with hot reload.

### 5. Build for Production

```bash
npm run build
```

### 6. Create Windows Installer

```bash
npm run dist:win
```

The installer will be generated in the `release/` folder.

## 🧠 PreChaos AI Backend (Optional)

The PreChaos backend provides AI-powered fatigue detection and behavior analysis.

### Setup

```bash
# Navigate to backend directory
cd prechaos/backend

# Create virtual environment
python -m venv .venv

# Activate (Linux/Mac)
source .venv/bin/activate

# Activate (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

### Start the API

```bash
npm run prechaos:api
```

The API runs at `http://127.0.0.1:8765`.

### Available Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/predict` | Predict fatigue score |
| POST | `/feedback` | Submit user feedback |
| GET | `/baseline` | Get baseline metrics |
| POST | `/baseline` | Set baseline metrics |
| POST | `/train` | Train model on new data |

### Training Data Format

```json
[
  {
    "user_id": "demo-user",
    "hold_time": 142,
    "dd_latency": 81,
    "ud_latency": 63,
    "deviation": 14,
    "idle_time": 0.2,
    "mouse_movement_speed": 0.8,
    "tab_switch_frequency": 0.1,
    "session_duration": 11.2,
    "fatigue_score": 0.0
  }
]
```

## 📁 Project Structure

```
netherite/
├── src/
│   ├── main/           # Electron main process
│   ├── preload/        # Secure IPC bridge
│   └── renderer/       # React frontend
│       └── src/
│           ├── pages/      # Route pages
│           ├── components/ # UI components
│           ├── stores/    # Zustand stores
│           ├── hooks/     # Custom hooks
│           ├── lib/       # Utilities
│           └── prechaos/  # AI integration
├── prechaos/
│   └── backend/        # Python AI backend
├── appwrite/
│   ├── functions/      # Appwrite cloud functions
│   └── scripts/       # Setup scripts
├── public/            # Static assets
└── release/           # Built installers
```

## ☁️ Appwrite Setup

To enable cloud sync and the gacha store features, create the following in your Appwrite project:

### Database Collections

| Collection ID | Purpose | Key Attributes |
|---------------|---------|----------------|
| `user_settings` | User profile data | `userId` (document ID), `gender`, `dob`, `avatar_id` |
| `vault_snapshots` | Vault sync metadata | `vaultId`, `userId`, `snapshotName`, `uploadedAt` |
| `sync_manifests` | Sync state tracking | `vaultId`, `userId`, `lastSyncedAt` |
| `gacha_users` | Store user data | `userId` (document ID), `scraps`, `lifetimeScraps`, `level` |
| `gacha_inventory` | Owned items | `userId`, `itemId`, `quantity`, `acquiredAt` |
| `gacha_cosmetics` | Item catalog | `itemId` (document ID), `name`, `rarity`, `price`, `type` |
| `gacha_chests` | Chest catalog | `chestId` (document ID), `name`, `cost`, `contents` |

### Storage Buckets

- `snapshots` — Vault zip files
- `avatars` — User profile pictures

### Cloud Functions

- `open_chest` — Gacha chest opening logic
- `sync_gacha_profile` — Inventory sync

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Appwrite](https://appwrite.io) — Backend-as-a-Service
- [MediaPipe](https://google.github.io/mediapipe/) — Face tracking
- [Radix UI](https://radix-ui.com) — Accessible components
- [electron-vite](https://electron-vite.github.io) — Build tooling

---

<p align="center">Built with ❤️ using Electron + React + TypeScript</p>