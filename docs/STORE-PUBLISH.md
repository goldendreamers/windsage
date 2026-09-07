# Publishing Windsage to Google Play / App Store

Neither store listing is free.

| Store | Fee | Notes |
|-------|-----|-------|
| **Google Play** | **US$25 one-time** | Required Google Play Console developer account. Personal accounts also need a closed test with ≥12 testers for 14 days before production. |
| **Apple App Store** | **US$99 / year** | Apple Developer Program. Not optional for App Store distribution. |

The live PWA at https://windsage.nimrod.bio/ remains free for users to install from the browser.

## Privacy policy (required by both stores)

Public URL: https://windsage.nimrod.bio/privacy

## Prepare native builds (EAS)

1. Create / log in to an Expo account: https://expo.dev/signup
2. From the repo:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd /path/to/windsage
npx eas-cli login
npx eas-cli init   # replaces placeholder projectId in app.json
```

3. Android production AAB (for Play Console):

```bash
npx eas-cli build --platform android --profile production
```

4. iOS production IPA (only after Apple Developer enrollment):

```bash
npx eas-cli build --platform ios --profile production
```

5. Submit (after store consoles exist):

```bash
npx eas-cli submit --platform android --profile production
npx eas-cli submit --platform ios --profile production
```

## Google Play Console checklist

1. Pay $25 at https://play.google.com/console/signup
2. Create app **Windsage** (`com.windsage.app`)
3. Store listing: short/full description, icon 512, feature graphic 1024×500, screenshots
4. Privacy policy URL: https://windsage.nimrod.bio/privacy
5. Upload AAB from EAS
6. Complete Data safety / permissions forms (notifications)
7. Closed testing track → 12 testers → 14 days → apply for production

## App Store Connect checklist

1. Enroll at https://developer.apple.com/programs/enroll/ ($99/year)
2. Create app with bundle id `com.windsage.app`
3. Privacy policy URL: https://windsage.nimrod.bio/privacy
4. Screenshots for required device sizes
5. Upload IPA via EAS Submit or Transporter
6. App Review notes: cloud URL https://windsage.nimrod.bio/

## Support contact

Use a public address you are willing to publish (also listed on `/privacy`).
