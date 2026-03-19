# Chor-Konzert Ticketbuchungs-Website

Kostenloses Ticketbuchungssystem ohne Bezahlung, mit statischem Frontend (GitHub Pages) und Firebase als Backend (Auth, Firestore, Cloud Functions).

## Features

- Registrierung und Login mit Firebase Auth
- Rollengetrennte Admin-Funktionen ueber Custom Claims
- Event-Verwaltung (Create/Update/Delete)
- Ticketbuchung mit transaktionaler Kapazitaetspruefung
- QR-Code je Ticket
- Buchungsbestaetigung per Cloud Function E-Mail
- Admin-Dashboard mit Check-In und CSV-Export

## Sicherheitsmodell

- Kein Admin-Passwort im Firestore
- Admin-Zugriff nur ueber Firebase Auth Token Claim admin=true
- Claim-Vergabe serverseitig in Cloud Functions aus einer Allowlist
- SMTP-Zugangsdaten nur in Firebase Secret Manager
- Firestore Security Rules trennen User- und Admin-Rechte strikt

## Projektstruktur

- index.html: Benutzer-Frontend
- admin.html: Admin-Frontend
- css/style.css: Styling
- js/firebase-config.js: Firebase Initialisierung
- js/auth.js: Auth und Rollenpruefung
- js/events.js: Event-Logik
- js/booking.js: Buchungslogik
- js/admin.js: Admin-Dashboard-Logik
- functions/index.js: Cloud Functions
- firestore.rules: Security Rules
- firestore.indexes.json: Firestore Indexes
- firebase.json: Firebase Projektkonfiguration
- .firebaserc: Projektzuordnung fuer Firebase CLI

## Setup

1. Firebase Projekt vorbereiten

- Firestore aktivieren
- Authentication mit Email/Passwort aktivieren
- Web-App anlegen und Firebase Config in js/firebase-config.js setzen
- .firebaserc auf die echte Projekt-ID anpassen

2. Abhaengigkeiten installieren

Im Root-Verzeichnis:

```bash
npm install -g firebase-tools
```

Im Functions-Verzeichnis:

```bash
cd functions
npm install
cd ..
```

3. Secrets setzen

ADMIN Allowlist (kommagetrennt):

```bash
firebase functions:secrets:set ADMIN_EMAILS
```

SMTP-Konfiguration:

```bash
firebase functions:secrets:set MAIL_HOST
firebase functions:secrets:set MAIL_PORT
firebase functions:secrets:set MAIL_SECURE
firebase functions:secrets:set MAIL_USER
firebase functions:secrets:set MAIL_PASSWORD
firebase functions:secrets:set MAIL_FROM
```

4. Deploy Firebase Backend

```bash
firebase login
firebase deploy --only firestore:rules,firestore:indexes,functions
```

5. Deploy Frontend

- Git Push auf Branch master triggert .github/workflows/deploy-pages.yml
- GitHub Pages deployt die statischen Dateien automatisch

## Erster Admin-Login

1. User mit einer Email aus ADMIN_EMAILS registrieren
2. Auf admin.html mit denselben Auth-Credentials anmelden
3. Beim Login wird bootstrapAdminRole aufgerufen und der Claim gesetzt
4. Danach stehen Admin-Funktionen zur Verfuegung

## Wichtige Collections

- users/{uid}: Profildaten und Ticket-Referenzen
- events/{eventId}: Eventdaten inkl. bookingCount
- bookings/{bookingId}: Buchungen inkl. emailStatus
- appConfig/public: Oeffentliche App-Metadaten (z. B. Support-Email)

## Lokaler Check

Lint (Functions):

```bash
cd functions
npm run lint
```

Optional Emulator:

```bash
firebase emulators:start --only firestore,functions
```

## Troubleshooting

Admin-Login ohne Rechte:

- Email muss in ADMIN_EMAILS enthalten sein
- Nach Claim-Vergabe neu einloggen oder Token refreshen

E-Mails werden nicht versendet:

- MAIL_* Secrets pruefen
- Functions Logs pruefen: firebase functions:log
- Admin-Dashboard Testmail verwenden

Buchung fehlt oder Event weg:

- App behandelt geloeschte Events defensiv
- bookingCount wird bei Buchung/Storno transaktional gepflegt

## Lizenz

MIT
