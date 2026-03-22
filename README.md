# Chor-Konzert Ticketbuchungs-Website

Kostenloses Ticketbuchungssystem ohne Bezahlung, mit statischem Frontend (GitHub Pages) und Firebase als Backend (Auth + Firestore).

Diese Variante benoetigt keine Cloud Functions und damit auch kein Functions-Secrets-Setup.

## Features

- Registrierung und Login mit Firebase Auth
- Admin-Freigabe ueber Firestore Allowlist admins/{uid}
- Event-Verwaltung (Create/Update/Delete)
- Ticketbuchung mit Firestore-Transaktion (Kapazitaet + bookingCount)
- Storno fuer Nutzer innerhalb von 24h nach Buchung
- QR-Code je Ticket
- Buchungsbestaetigung via EmailJS (clientseitig)
- Admin-Dashboard mit Check-In und CSV-Export

## Sicherheitsmodell

- Kein Admin-Passwort im Firestore
- Admin-Status wird durch Dokument admins/{uid} bestimmt
- Firestore Rules trennen User/Admin strikt
- Kritischer Hinweis: clientseitige EmailJS-Mails sind einfacher, aber weniger sicher als serverseitiger Versand

## Projektstruktur

- index.html: Benutzer-Frontend
- admin.html: Admin-Frontend
- css/style.css: Styling
- js/firebase-config.js: Firebase Initialisierung
- js/auth.js: Auth und Admin-Check ueber admins/{uid}
- js/events.js: Event-Logik
- js/booking.js: Buchungslogik + EmailJS Versand
- js/admin.js: Admin-Dashboard-Logik + Settings
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

2. Firebase CLI installieren

```bash
npm install -g firebase-tools
```

3. Firestore Rules + Indexes deployen

```bash
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

4. Admin freischalten (ohne Functions)

1. Registriere dich normal in der App.
2. Kopiere deine UID aus Firebase Auth Console.
3. Lege in Firestore ein Dokument an: admins/{UID}
4. Inhalt z. B.:

```json
{
	"email": "deine@email.de",
	"createdAt": "server timestamp"
}
```

5. Neu anmelden auf admin.html.

5. EmailJS fuer Buchungsmails konfigurieren

1. Konto bei EmailJS erstellen.
2. Service, Template und Public Key erzeugen.
3. Werte im Adminbereich unter Einstellungen speichern:
	 - emailjsServiceId
	 - emailjsTemplateId
	 - emailjsPublicKey

Die Werte landen in appConfig/public und sind fuer den Client lesbar.

## Wichtige Collections

- admins/{uid}: Admin-Allowlist
- users/{uid}: Profildaten und Ticket-Referenzen
- events/{eventId}: Eventdaten inkl. bookingCount
- bookings/{bookingId}: Buchungen inkl. emailStatus
- appConfig/public: Oeffentliche App-Konfiguration inkl. EmailJS Daten

## Deploy Frontend

- Git Push auf master triggert .github/workflows/deploy-pages.yml
- GitHub Pages deployt die statischen Dateien automatisch

## Troubleshooting

Admin-Login ohne Rechte:

- Pruefen, ob admins/{uid} existiert
- Nach Anlegen neu anmelden

E-Mails werden nicht versendet:

- EmailJS Service/Template/Public Key in Einstellungen pruefen
- Template-Feldnamen in EmailJS mit den gesendeten Parametern abstimmen
- Admin-Dashboard Testmail verwenden

Buchung/Storno scheitert mit permission-denied:

- Firestore Rules neu deployen
- Pruefen, ob Event-Dokument ein int Feld bookingCount und capacity hat

## Lizenz

MIT
