# Glide: file sharing for Windows and Android

Share files with people on your Wi-Fi (like AirDrop / Quick Share) and with anyone over the internet using a short code. Phone and PC talk to each other directly, so transfers run at your network's full speed.

```
glide/
  main.js, preload.js, renderer/   Windows app (Electron). renderer/ is shared with Android.
  server/                          signaling server (already built into the Windows app)
  mobile/                          Android app (Capacitor) + native saver plugin
  .github/workflows/android.yml    builds the APK in the cloud
```

## 1. Windows app (.exe)

On a Windows PC with Node.js 18+ (https://nodejs.org):

```
cd glide
npm install
npm start          # run it to test
npm run dist       # builds the installer + portable .exe
```

Output in `dist/`: `Glide Setup 1.0.0.exe` (installer) and `Glide 1.0.0.exe` (portable).
Received files go to `Downloads\Glide`.

**The server is built in.** When the app starts it also starts the signaling server on port 8080, so you do not need to run anything separately. In *Online > Server address* you can see its addresses and switch it off. On first run, allow Glide through Windows Firewall on **Private networks**.

## 2. Android app (.apk)

The APK is built from the same UI. Pick one way:

### Option A: GitHub builds it for you (no Android tools needed)
1. Create a new GitHub repository and upload the **contents of the `glide` folder** (so `mobile/` and `.github/` are at the top level).
2. Open the repo's **Actions** tab, choose **Build Android APK**, press **Run workflow**.
3. When it finishes (about 5 minutes), download **Glide-apk** from the run page. Unzip it to get `app-debug.apk`.

### Option B: build on your PC
Needs Node.js 18+, JDK 21 and the Android SDK (easiest: install Android Studio, which includes both).

```
cd glide/mobile
npm install
npm run apk
```

The APK is at `mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
Or run `npm run setup`, then open the `mobile/android` folder in Android Studio and use *Build > Build APK*.

### Install on the phone
Copy `app-debug.apk` to the phone, open it, and allow "Install unknown apps" when asked. It needs **Android 10 or newer**. Received files are saved to **Downloads/Glide**.

## 3. Phone <-> PC on the same Wi-Fi (fastest)

1. On the PC, open Glide > **Online** > open *Server address*. Under "Phones on the same Wi-Fi" you will see something like `ws://192.168.1.5:8080`.
2. On the phone, open Glide > **Online** > *Server address* and type that address once (it is remembered).
3. PC: press **Create a code**. Phone: type the code and press **Join**.
4. When it says Connected, choose files and send in either direction.

Both devices must be on the same Wi-Fi with AP isolation off. Use 5 GHz Wi-Fi for the best speed. Keep Glide open on the phone while sending (the screen is kept on during a session).

## 4. Internet sharing

For people who are not on your network, the signaling server must be reachable from the internet. It only introduces the two apps; files go directly between them, encrypted.

```
cd server
npm install
npm start          # listens on port 8080 (set PORT to change)
```

Host it on a VPS or any Node host (Render, Fly.io, Railway) behind HTTPS so the address is `wss://your-domain`, and enter that in *Server address* on both devices.
Strict networks (some mobile data, corporate Wi-Fi) need a TURN relay: install **coturn** on a VPS and add it to the `iceServers` list in `renderer/app.js`.

## Known limits

- Android has no "Nearby" auto-discovery yet; connect with a code as in section 3.
- Nearby transfers between two PCs use plain HTTP on the local network (not encrypted). Code-based transfers are encrypted (WebRTC DTLS).
- Folders can't be sent yet, only files.
- The APK is a debug build (installable, not for the Play Store). A release build needs your own signing key.
- If the connection drops mid-transfer, the partly received file is not resumed.
