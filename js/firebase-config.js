// Firebase Configuration
// Runtime override supported via window.__FIREBASE_CONFIG__
// Optional runtime EmailJS config via window.__EMAILJS_CONFIG__ = { serviceId, templateId, publicKey }

const defaultFirebaseConfig = {
  apiKey: "AIzaSyC_WVALyKeeNiuftVaJWtiUd_7l6C0SfTY",
  authDomain: "choir-booking.firebaseapp.com",
  projectId: "choir-booking",
  storageBucket: "choir-booking.firebasestorage.app",
  messagingSenderId: "1079032727043",
  appId: "1:1079032727043:web:383c9ee87bba7111ac3036",
};

const runtimeFirebaseConfig = window.__FIREBASE_CONFIG__ || {};
const firebaseConfig = { ...defaultFirebaseConfig, ...runtimeFirebaseConfig };

const hasPlaceholderConfig =
  firebaseConfig.projectId === defaultFirebaseConfig.projectId ||
  firebaseConfig.apiKey === defaultFirebaseConfig.apiKey ||
  firebaseConfig.appId === defaultFirebaseConfig.appId;

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

console.log("Firebase initialized successfully.");
