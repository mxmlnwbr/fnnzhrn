# fnnzhrn for iOS and Android

The fnnzhrn tools as a native app, built with [Expo](https://expo.dev) (React Native). It signs in with the same account as fnnzhrn.ch and uses the web app's API, so there is no second backend.

| Screen | What |
| --- | --- |
| Sign-in | Email and password. Sign-up and password reset open fnnzhrn.ch |
| Depot | Net worth, today's change, total return, cash and the positions, per depot or all added up. Read-only; pull to refresh |
| Finanzen | **Monat**: frei verfügbar, Einkommen, Fixkosten, Investieren und Ausgaben gegen das Budget; Ausgaben erfassen (Name, Betrag, Kategorie) und mit langem Drücken löschen; die Fixkosten aus dem Plan. **Plan**: pro Monat oder Jahr, wohin das Einkommen geht, und alle Einträge. Changes save right away to `/api/budget`; the plan itself is edited on the website |
| Cockpit | Märkte (Heute bis 1 Jahr, mit Verlauf), Marktstimmung (Fear & Greed, VIX, Put/Call), Tagesgewinner und -verlierer pro Markt, Makro (Rohstoffe, Krypto, Währungen), News zu den eigenen Aktien und die nächsten Quartalszahlen. Eigene Titel sind hervorgehoben. Same `/api/cockpit/*` routes as the web Cockpit; the lists in `src/lib/cockpit.ts` mirror `src/app/cockpit/cockpit.html` |
| Konto | Who is signed in, a link to the website, sign out |

Editing the Finanzen plan, the Cockpit's other tiles (radar, value, Buffett, takeovers, watchlist) and the assistant are still website-only.

## How it fits together

- **Shared logic.** The Depot calculation is not copied: the app imports the web app's `src/lib` as `@core/...` (see `tsconfig.json` and `metro.config.js`), e.g. `@core/portfolio` for `summarize` and `@core/market` for loading quotes. Only files without web or Node dependencies can be shared that way.
- **Sign-in.** Better Auth's Expo plugin (`@better-auth/expo`) runs on the server (`src/lib/auth.ts`) and in the app (`src/lib/auth-client.ts`). The session cookie lives in the iOS keychain / Android keystore (`expo-secure-store`) and goes along with every API call (`src/lib/api.ts`). The server trusts the app's scheme `fnnzhrn://`.
- **API address.** Production by default, at `https://www.fnnzhrn.ch` (the bare domain redirects there). For a local web app, put `EXPO_PUBLIC_API_URL=http://localhost:3000` in `mobile/.env.local` (the iOS simulator reaches the Mac at localhost). The server needs the Expo plugin, so sign-in only works against a deployment that includes it.

- **Password AutoFill.** The app claims `webcredentials:fnnzhrn.ch` (Associated Domains, in `app.config.ts`) and the website confirms it at `/.well-known/apple-app-site-association` (`src/lib/app-links.ts`). iOS then suggests the passwords saved for fnnzhrn.ch in the sign-in and offers to save new ones. This needs a production build signed by the paid developer account and the site deployed; Apple's CDN can take a while to pick up a changed file.

## Run it

Needs Xcode for iOS and Android Studio for Android.

```bash
cd mobile
npm install
npm run ios        # builds and opens the iOS simulator
npm run android    # same for an Android emulator
npm start          # just the bundler, for an app that's already installed
npm run typecheck
```

**On your own iPhone with a free Apple account** (a "personal team"): Apple doesn't allow Associated Domains there, so leave them out. Plug in the iPhone, unlock it, then:

```bash
FNNZHRN_PERSONAL_TEAM=1 npx expo run:ios --device --configuration Release
```

On the iPhone, trust the certificate once under Settings → General → VPN & Device Management. Apps from a personal team stop opening after 7 days; install again then. Password AutoFill only suggests fnnzhrn.ch's passwords in builds with Associated Domains; without them, pick the password from the key in the keyboard's bar.

The icons in `assets/images/` are drawn from the logo by `python3 scripts/make-icons.py` (needs ImageMagick).

`ios/` and `android/` are generated (Expo's Continuous Native Generation) and not committed. Change native settings in `app.json`.

## Publishing

Builds and uploads run on [EAS](https://docs.expo.dev/eas/) (`eas.json`). One-time setup:

1. An [Apple Developer Program](https://developer.apple.com/programs/) membership (99 USD a year) and, for Android, a [Google Play Console](https://play.google.com/console) account (25 USD once).
2. `npx eas-cli@latest login`. The project is already linked to the Expo account `weber-studio` (`owner` and `extra.eas.projectId` in `app.json`), at https://expo.dev/accounts/weber-studio/projects/fnnzhrn.

Then for each release:

```bash
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios
```

The build lands in App Store Connect; from there it goes to TestFlight testers or to review. The app is meant for the members only, so either keep it on TestFlight or apply for [unlisted distribution](https://developer.apple.com/support/unlisted-app-distribution/). For review, Apple needs a demo account that is marked `authorized`.

The bundle id and Android package are `ch.fnnzhrn.app`.
