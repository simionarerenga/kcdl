# KCDL Copra Inspector App

Digital field tool for **Kiribati Cooperative Development Ltd (KCDL)** outer-island copra inspectors. Replaces paper-based bag tracking, weighing records, shipment dispatch, and CPR/TWC reporting with a Firebase-backed app that works offline.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI framework | React 18 + Vite |
| Mobile (Android/iOS) | Capacitor 6 |
| Desktop (Windows/macOS/Linux) | Electron 32 + electron-builder |
| Cloud database | Firebase Firestore v10 (offline persistence enabled) |
| Authentication | Firebase Auth (email + password) |
| Local storage | `@capacitor/preferences` (native) / `localStorage` (web/desktop) |
| Camera | `@capacitor/camera` (native) / file input (web/desktop) |
| File sharing | `@capacitor/filesystem` + `@capacitor/share` |
| CI/CD | GitHub Actions |

---

## How Data is Stored

Most operational data lives in **Firebase Firestore**, scoped per station by `stationId`. Firestore is configured with `persistentLocalCache`, so all data is available and writable offline — changes queue locally and sync automatically when a connection is restored. The green/red dot in the top bar reflects live connectivity status.

**CPR and TWC entries** are stored locally via `@capacitor/preferences` / `localStorage` (not Firestore), because they include base64-encoded photos which are too large for Firestore documents. They are optionally written to a Firestore collection when saving, but the local copy is the source of truth.

**App settings** (dark mode, font size, language) are stored in `localStorage` only.

### Firestore Collections

| Collection | Description |
|------------|-------------|
| `users` | Inspector profiles (station name, island, stationId, role) |
| `stations` | Station records created at first login |
| `farmers` | Registered farmers per station |
| `bagIssuances` | Bags issued to farmers (status: issued / returned / weighed) |
| `shedStock` | Weighed copra bags in the station warehouse (status: in_shed / shipped) |
| `shipments` | Vessel shipment records grouping dispatched bags |
| `bagStock` | Current empty-bag inventory balance per station |
| `bagTransactions` | History of bag receive / distribute operations |

---

## Project Structure

```
kcdl-app/
├── src/
│   ├── main.jsx                    # React entry point
│   ├── App.jsx                     # Root component — section router, auth, back-button handling
│   ├── index.css                   # All global styles (CSS variables, dark mode, components)
│   ├── firebase.js                 # Firebase init — Firestore (offline), Auth, Storage
│   ├── components/
│   │   ├── TopBar.jsx              # Sticky top bar with hamburger nav + online/offline dot
│   │   └── Modal.jsx               # Image / comment overlay modal
│   ├── sections/
│   │   ├── HomeScreen.jsx          # Dashboard — 8-card landing screen
│   │   ├── ShedStockSection.jsx    # Weigh Copra — weighing sessions, bag + batch recording
│   │   ├── BagsHubSection.jsx      # Bags & Stock hub — Issue Bags tab + Bag Stock tab
│   │   ├── BagsIssuedSection.jsx   # Issue Bags logic (rendered inside BagsHubSection)
│   │   ├── QualityBagsSection.jsx  # Bag inventory logic (rendered inside BagsHubSection)
│   │   ├── WarehouseSection.jsx    # Warehouse hub — Records, Bag Search, Unstacked tabs
│   │   ├── BagSearchSection.jsx    # Cross-collection bag lookup (rendered inside WarehouseSection)
│   │   ├── ShipmentSection.jsx     # Shipments — dispatch bags to vessel, shipment history
│   │   ├── FarmersSection.jsx      # Farmers Registry — add / edit / delete farmers
│   │   ├── DailySummarySection.jsx # Daily Summary — per-date stats and activity breakdown
│   │   ├── CPRSection.jsx          # CPR form — data entry, camera capture, journal
│   │   ├── TWCSection.jsx          # TWC form — data entry, camera capture, journal
│   │   ├── SettingsSection.jsx     # Settings (language, font, dark mode) + export tools
│   │   ├── ToolsSection.jsx        # Export helpers (also embedded in SettingsSection)
│   │   ├── HelpSection.jsx         # FAQ accordion and contact information
│   │   └── LoginScreen.jsx         # Firebase Auth sign-in / sign-up screen
│   ├── lang/
│   │   ├── en.js                   # English strings
│   │   └── zh.js                   # Chinese strings
│   └── utils/
│       ├── camera.js               # Unified camera capture — native + web/desktop fallback
│       └── storage.js              # Cross-platform storage wrapper
├── electron/
│   ├── main.js                     # Electron main process + IPC handlers (backup/save dialog)
│   └── preload.js                  # Context bridge exposing electronAPI to renderer
├── public/
│   └── img/
│       ├── icon_bg.png             # App logo / splash screen
│       └── icon_launcher.jpg       # Android launcher icon
├── capacitor.config.js
├── vite.config.js
├── package.json
└── .github/workflows/
    ├── android.yml                 # Android APK CI
    └── desktop.yml                 # Electron Windows / macOS / Linux CI
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Android Studio (for Android builds)
- Xcode (for iOS builds, macOS only)

### Install

```bash
npm install
```

### Run in browser (development)

```bash
npm run dev
```

### Run as Electron desktop app (development)

```bash
npm run electron:dev
# Vite dev server starts on :5173, Electron loads it
```

---

## Mobile — Capacitor (Android / iOS)

### 1. Add platforms (first time only)

```bash
npx cap add android
npx cap add ios          # macOS only
```

### 2. Build web assets + sync to native

```bash
npm run build
npx cap sync
```

### 3. Open in Android Studio / Xcode

```bash
npm run cap:android      # opens Android Studio
npm run cap:ios          # opens Xcode (macOS only)
```

Then build and run on device / emulator from the IDE.

### Permissions

`@capacitor/camera` handles runtime permission requests. The `AndroidManifest.xml` generated by Capacitor includes `CAMERA` and `READ_EXTERNAL_STORAGE`. Filesystem write and share-sheet permissions are handled by `@capacitor/filesystem` and `@capacitor/share` respectively.

---

## Desktop — Electron

### Development

```bash
npm run electron:dev
```

### Production build

```bash
npm run electron:build
# Outputs to dist-electron/
# Windows: .exe NSIS installer
# macOS:   .dmg (x64 + arm64)
# Linux:   .AppImage
```

The Electron main process exposes `window.electronAPI.backupData(jsonStr)` via the preload context bridge, which opens a native Save dialog when the inspector exports data from Settings.

---

## CI/CD (GitHub Actions)

### Android APK

Push to `main` → `.github/workflows/android.yml` runs.

- Always produces a **debug APK**
- Produces a **signed release APK** if you add these repository secrets:
  - `KEYSTORE_BASE64` — base64-encoded `.jks` keystore
  - `KEY_ALIAS` — key alias
  - `KEY_PASSWORD` — key password
  - `STORE_PASSWORD` — keystore password

### Desktop installers

Push to `main` → `.github/workflows/desktop.yml` runs on three runners in parallel:

- `windows-latest` → NSIS `.exe` installer
- `macos-latest` → `.dmg`
- `ubuntu-latest` → `.AppImage`

---

## Features

### 🏠 Dashboard
The home screen presents 8 shortcut cards. All section data is scoped to the logged-in inspector's station via `stationId`.

### ⚖️ Weigh Copra
Records copra bags delivered to the station shed. The inspector selects a farmer to open a weighing session, then adds bags individually (serial number + weight in kg) or as unlabelled batches (weight only). All records are saved to the `shedStock` Firestore collection with `status: in_shed`. The list supports filtering (In Warehouse / Shipped / All), multi-field sorting (date, weight, serial, farmer name), and free-text search. Individual bags can also be marked as shipped directly from this view.

### 📦 Bags & Stock
A two-tab hub for managing physical bags:

- **Issue Bags** — Assign an empty bag (by serial number) to a registered farmer. Prevents issuing a bag that is already active. Bags can be marked as returned when the farmer brings the filled bag back.
- **Bag Stock** — Tracks the station's physical inventory of empty bags. Record bags received from Tarawa HQ or distributed to farmers. Maintains a running balance with a full dated transaction history.

### 🏚️ Warehouse
A three-tab hub for post-weighing bag management:

- **Records** — Complete list of all `shedStock` entries for the station. Filter by status, sort, search by serial or farmer, and mark individual bags as shipped.
- **Bag Search** — Cross-collection lookup by bag serial number. Retrieves and displays the complete lifecycle of a bag: issuance record → weighing/shed record → shipment record, with current location and status clearly shown.
- **Unstacked** — Lists batch-weighed records (bags recorded without individual serial numbers).

### 🚢 Shipments
Creates a shipment by selecting a vessel name and dispatch date, then choosing one or more bags from the current warehouse stock. All selected bags and the shipment document are updated atomically in Firestore. Past shipments are listed with bag count, total weight in kg, and a full bag manifest in the detail view.

### 👩‍🌾 Farmers Registry
Registers and manages farmers at the station. Each record stores name, ID card number, village, gender, email, and phone. The app auto-generates a unique `KI-###` farmer ID per station. Registered farmers appear in selection dropdowns throughout the app (bag issuance, weighing sessions).

### 📊 Daily Summary
A date-selectable summary screen. For any chosen date it shows four headline stats — bags issued, bags weighed, total weight in kg, and bags shipped — followed by full breakdowns: each bag issued with the farmer name, each weighed bag with its weight, and each shipment with vessel name and bag list.

### 📋 CPR Data Entry
The Copra Purchase Record form. Fields: island, cooperative, inspector name, date, start time, end time, CPR number, total weight, and comments. A photo of the CPR document is required on new entries. Entries remain editable for 20 minutes after the recorded end time, then lock automatically. Records are stored locally and synced to Firestore. Accessible from the hamburger navigation menu.

### 📋 TWC Data Entry
The Total Weight Certificate form. Same fields as CPR plus vessel name, number of sacks, and total weight. Photo required. Same 20-minute edit window. Stored and synced identically to CPR.

### ⚙️ Settings & Export
Two-tab section:

- **Settings** — Language selector (English, te Kiribati, 中文), font size slider (adjusts globally via a CSS variable), dark mode toggle.
- **Tools** — Export today's report as a JSON file (bag issuances, shed stock, shipments, and CPR/TWC entries for the current date). Export a full backup of all station data. On Android, exports are shared via the system share sheet; on desktop, a native Save dialog opens.

---

## First-Time Login & Station Setup

On first sign-in, the app prompts the inspector to enter their **station name** and **island**. This creates a `users/{uid}` profile document and a `stations/{uid}` document in Firestore. Subsequent logins load the profile automatically and use its `stationId` to scope all Firestore queries.

---

## Adding Kiribati Language Strings

Edit `src/lang/en.js` as a reference, then create `src/lang/ki.js` with the same keys translated into te Kiribati. Wire it up in `SettingsSection.jsx` by importing the file and adding it to the language switch. The Settings language selector already includes the "Kiribati (te Kiribati)" option — it is waiting on this file to be populated.
