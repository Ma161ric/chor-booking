// Firebase Configuration
// TODO: Ersetze diese Werte mit deinen Firebase-Projekt-Credentials
// Siehe https://console.firebase.google.com > Projekteinstellungen > Meine Apps

const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID" // Optional
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore
const db = firebase.firestore();

// Initialize Auth
const auth = firebase.auth();

console.log("Firebase initialized successfully!");
