# 🎵 Chor-Konzert Ticketbuchungs-Website

Eine kostenlose, wartungsfreie Website zum Buchen von Tickets für Chor-Konzerte. Gehostet auf GitHub Pages mit Firebase als Backend.

## ✨ Features

- **Benutzerregistrierung & Login** — Sicher mit Firebase Auth
- **Event-Management** — Admin kann Events erstellen, bearbeiten, löschen
- **Ticketbuchungs-System** — Benutzer buchen Tickets mit automatischen Kapazitätsprüfungen
- **Automatische Bestätigungsmails** — Mit QR-Codes und Ticketnummern
- **Admin-Dashboard** — Buchungsübersicht, Export zu CSV, Einchecken
- **QR-Codes** — Automatisch generiert für jedes Ticket
- **Responsives Design** — Funktioniert auf Desktop, Tablet, Mobilgeräten

## 🚀 Quick Start

### 1. Firebase-Projekt erstellen

1. Gehe zu [Firebase Console](https://console.firebase.google.com/)
2. Erstelle ein neues Projekt (z.B. "chor-booking")
3. Aktiviere **Firestore Database** (Test-Modus)
4. Aktiviere **Firebase Authentication** (Email/Passwort)
5. Kopiere deine Firebase Config: **Projekteinstellungen → Meine Apps**

### 2. Firebase Config aktualisieren

Öffne `js/firebase-config.js` und trage deine Credentials ein:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 3. Firestore Collections einrichten

Gehe zu **Firestore Console** und erstelle diese Collections:

#### a) `admin` Collection
Create Document mit ID `config`:
```json
{
  "adminEmail": "admin@example.com",
  "adminPassword": "SicheresPasswort123!", 
  "senderEmail": "deine-email@gmail.com",
  "senderPassword": "dein-app-password",
  "smtpServer": "smtp.gmail.com",
  "smtpPort": 587,
  "createdAt": timestamp
}
```

**Important für Gmail:**
- Nutze ein [App Password](https://support.google.com/accounts/answer/185833)
- 2FA muss aktiviert sein

#### b) `users` Collection
Wird automatisch erstellt bei Registrierung

#### c) `events` Collection
Wird vom Admin erstellt (noch leer initial)

#### d) `bookings` Collection
Wird automatisch bei Buchungen erstellt

### 4. Firestore Security Rules

Gehe zu **Firestore → Rules** und ersetze sie mit:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Admin Collection: nur Admin darf auslesen/schreiben
    match /admin/{document=**} {
      allow read, write: if request.auth.uid != null && 
        request.auth.token.email == get(/databases/$(database)/documents/admin/config).data.adminEmail;
      allow read: if false;
    }
    
    // Users Collection: User sieht nur sich selbst
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
    
    // Events Collection: Jeder kann lesen, nur Admin schreiben
    match /events/{eventId} {
      allow read: if true;
      allow create, update, delete: if request.auth.uid != null;
    }
    
    // Bookings Collection: User sieht nur eigene, Admin sieht alle
    match /bookings/{bookingId} {
      allow read: if request.auth.uid == resource.data.userId;
      allow read: if request.auth.uid != null && 
        request.auth.token.email == get(/databases/$(database)/documents/admin/config).data.adminEmail;
      allow create: if request.auth.uid == request.resource.data.userId;
      allow delete: if request.auth.uid == resource.data.userId || 
        (request.auth.uid != null && request.auth.token.email == get(/databases/$(database)/documents/admin/config).data.adminEmail);
    }
  }
}
```

### 5. Cloud Function für Emails (Optional aber Empfohlen)

Wenn du automatische Bestätigungsmails möchtest:

```bash
# Installiere Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize Firebase in deinem Projekt
firebase init functions

# Kopiere den Code aus cloud-functions/sendBookingEmail.js
# Deploy
firebase deploy --only functions
```

### 6. GitHub Pages Deployment

1. Erstelle ein GitHub Repository: `chor-booking`
2. Klone es lokal:
```bash
git clone https://github.com/YOUR-USERNAME/chor-booking.git
cd chor-booking
```

3. Kopiere alle Dateien (index.html, admin.html, css/, js/, cloud-functions/) in das Repo

4. Commit & Push:
```bash
git add .
git commit -m "Initial commit: Chor-Konzert Ticketbuchungs-Website"
git push origin main
```

5. Enable GitHub Pages:
   - Gehe zu **Repository Settings → Pages**
   - Wähle **Deploy from branch → main**
   - Folder: `/ (root)`
   - Save

6. Website wird verfügbar unter: `https://YOUR-USERNAME.github.io/chor-booking/`

## 🎯 Verwendung

### Für Benutzer
1. Gehe zur Website
2. Registriere dich oder melde dich an
3. Wähle ein Event
4. Buche ein Ticket
5. Aktivierungsmail kommt an mit QR-Code

### Für Admin
1. Gehe zu `/admin.html`
2. Melde dich mit Admin-Email und Passwort an
3. Tab **Events**: Erstelle/bearbeite Events
4. Tab **Bookings**: Sehe alle Buchungen, checke QR-Codes ein, exportiere CSV
5. Tab **Settings**: Konfiguriere Email-Versand

## 📁 Projektstruktur

```
chor-booking/
├── index.html           # Benutzer-Frontend
├── admin.html           # Admin-Dashboard
├── css/
│   └── style.css       # Styling
├── js/
│   ├── firebase-config.js  # Firebase Setup
│   ├── auth.js            # Authentifizierung
│   ├── events.js          # Event-Management
│   ├── booking.js         # Buchungs-Logik
│   └── admin.js           # Admin-Panel-Logik
├── cloud-functions/
│   └── sendBookingEmail.js # Cloud Function
└── README.md

```

## 🔒 Sicherheit

- **Firebase Auth** — Sichere Passwort-Speicherung
- **Firestore Security Rules** — Benutzer sehen nur ihre Daten
- **Admin-Passwort** — In Firestore (verschlüsselt in der Praxis)
- **QR-Codes** — Eindeutige Ticketnummern
- **GitHub Pages** — HTTPS standardmäßig

## 🐛 Troubleshooting

### "Firebase is not defined"
- Stelle sicher, dass beide Firebase SDKs in index.html/admin.html eingebunden sind:
```html
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js"></script>
```

### Email-Versand funktioniert nicht
- Überprüfe Admin-Config in Firestore
- Teste mit einem Gmail App-Password (nicht dein normales Passwort)
- Aktiviere 2FA bei Gmail
- Überprüfe Cloud Function Logs

### Admin kann sich nicht anmelden
- Überprüfe, dass der Eintrag in `admin/config` existiert
- Admin-Email muss exakt gleich sein
- Admin-Passwort muss exakt gleich sein

## 📝 Lizenz

MIT — Frei zu verwenden und anzupassen

## 🤝 Support

Bei Fragen:
1. Überprüfe die [Firebase Docs](https://firebase.google.com/docs)
2. Überprüfe die [GitHub Pages Docs](https://docs.github.com/en/pages)
3. Schau dir die Konsole an (F12 → Console)

---

**Viel Spaß mit deiner Chor-Konzert Ticketbuchungs-Website! 🎶**
