# Weekly Gate

A weekly-budget gate for UPI payments. Scan a QR, it checks what's left of your
weekly pocket money, and only then hands you off to BHIM (or whatever UPI app
you use) to actually pay. Spend gets logged automatically by merchant so you
can see where it's going.

Runs as a home-screen "app" on your iPhone (a PWA) — no App Store, no Mac, no
Apple Developer account needed.

## What this can and can't do (read this first)

- **It cannot make BHIM use UPI Lite, and it cannot skip the UPI PIN.**
  That decision is made entirely inside BHIM (or GPay/PhonePe/whatever you
  pick), based on NPCI's rules — no outside app gets a say in it. Approving
  the payment in your UPI app works exactly as it does today.
- **It cannot read your bank balance or your UPI Lite balance.** The budget
  here is a separate counter this app keeps for itself, based only on
  payments you make *through* it.
- **It cannot stop you from opening BHIM directly and scanning there**,
  bypassing the gate entirely. iOS doesn't let any app monitor or block
  another app. This only works if scanning here becomes your habit — it's a
  speed bump you put in your own way, not a lock.
- **It can't always confirm a payment went through automatically.** Unlike
  Android, iOS doesn't reliably hand back a "payment succeeded" result to the
  app that opened BHIM. So after you tap Pay, the app asks you a one-tap
  "did it go through?" question to keep your weekly total accurate. Be honest
  with it — that's the whole system.
- **Everything stays on your phone.** No server, no account, no analytics.
  Export a backup occasionally (see below) since Safari can clear stored
  data on PWAs you haven't opened in a week or so.

## Deploy it (5 minutes, pick one)

You need real `https://` hosting — Safari won't allow camera access (needed
for QR scanning) on a plain local file.

### Option A — GitHub Pages (free, what I'd use)
1. Create a new **public** GitHub repo (e.g. `weekly-gate`).
2. Upload everything inside this `upi-budget-pwa` folder to the repo root
   (drag-and-drop on github.com works fine, or `git push`).
3. Repo **Settings → Pages → Source: Deploy from a branch → main → / (root) → Save**.
4. After ~1 minute your app is live at `https://<your-username>.github.io/weekly-gate/`.

### Option B — Netlify Drop (no account needed, fastest)
1. Go to **app.netlify.com/drop** on your laptop.
2. Drag the whole `upi-budget-pwa` folder onto the page.
3. You get an `https://...netlify.app` URL instantly.

## Install it on your iPhone

1. Open your deployed URL in **Safari** (must be Safari, not Chrome, for
   "Add to Home Screen" to work properly on iOS).
2. Tap the **Share** icon → **Add to Home Screen** → **Add**.
3. Open it from the home screen icon from now on — it runs full-screen, no
   browser bar, like a real app.
4. First time you scan, allow the camera permission prompt.

## Using it

1. Open the app → set your **weekly limit** in Settings, and which day the
   week resets on.
2. Tap **Scan a QR code** before paying anywhere.
3. If you're within budget, tap **Pay via UPI app** → BHIM opens with the
   amount filled in → approve as normal.
4. Come back to the app and confirm whether it actually went through.
5. Check **History** any time for spend broken down by merchant.

## Project structure

```
upi-budget-pwa/
├── index.html        — the whole UI (scan / history / settings)
├── manifest.json      — makes it installable as a home-screen app
├── service-worker.js  — basic offline shell caching
├── css/style.css       — styling
├── js/
│   ├── storage.js     — budget config, transaction log, week math
│   ├── upi.js          — UPI QR parsing + deep-link building
│   ├── scanner.js      — camera + QR decoding (jsQR)
│   └── app.js          — ties it all together
└── icons/             — home-screen icon
```

Everything is plain HTML/CSS/JS — no build step, no npm install. Edit and
re-deploy any time.
