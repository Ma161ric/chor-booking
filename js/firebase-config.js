// Firebase Configuration
// Runtime override supported via window.__FIREBASE_CONFIG__
// Optional runtime EmailJS config via window.__EMAILJS_CONFIG__ = { serviceId, templateId, publicKey }

const defaultFirebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};

const publicRuntimeFirebaseConfig = window.__FIREBASE_CONFIG_PUBLIC__ || {};
const localRuntimeFirebaseConfig = window.__FIREBASE_CONFIG__ || {};
const firebaseConfig = {
  ...defaultFirebaseConfig,
  ...publicRuntimeFirebaseConfig,
  ...localRuntimeFirebaseConfig,
};

const requiredConfigKeys = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

const hasPlaceholderConfig = requiredConfigKeys.some((key) => {
  const value = String(firebaseConfig[key] || "");
  return !value || value.startsWith("YOUR_");
});

if (hasPlaceholderConfig) {
  throw new Error("Firebase config missing. Set js/runtime-config.public.js or provide window.__FIREBASE_CONFIG__ in js/runtime-config.local.js.");
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Initialize Firestore
const db = firebase.firestore();

// Initialize Auth
const auth = firebase.auth();

console.log("Firebase initialized successfully.");
