// Firebase Configuration
// Runtime override supported via window.__FIREBASE_CONFIG__

const defaultFirebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

const runtimeFirebaseConfig = window.__FIREBASE_CONFIG__ || {};
const firebaseConfig = { ...defaultFirebaseConfig, ...runtimeFirebaseConfig };

const hasPlaceholderConfig =
  firebaseConfig.projectId === "YOUR_PROJECT_ID" ||
  firebaseConfig.apiKey === "YOUR_API_KEY_HERE";

if (hasPlaceholderConfig) {
  console.warn("Firebase config placeholders detected. Update js/firebase-config.js or provide window.__FIREBASE_CONFIG__.");
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Initialize Firestore
const db = firebase.firestore();

// Initialize Auth
const auth = firebase.auth();

// Initialize Cloud Functions (for admin bootstrap + operational tools)
const functionsRegion = window.__FIREBASE_FUNCTIONS_REGION__ || "europe-west1";
const firebaseFunctions = firebase.functions
  ? firebase.app().functions(functionsRegion)
  : null;

console.log("Firebase initialized successfully.");
