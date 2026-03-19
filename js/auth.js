// Authentication Module
class AuthManager {
  constructor() {
    this.currentUser = null;
    this.isAdmin = false;
    this.setupAuthStateListener();
  }

  // Listen to Auth State Changes
  setupAuthStateListener() {
    auth.onAuthStateChanged((user) => {
      this.currentUser = user;
      if (user) {
        this.checkAdminStatus();
        this.updateUI();
      } else {
        this.isAdmin = false;
        this.showAuthSection();
      }
    });
  }

  // Check if User is Admin
  async checkAdminStatus() {
    if (!this.currentUser) return false;

    try {
      const adminDoc = await db.collection("admin").doc("config").get();
      if (adminDoc.exists) {
        const adminEmail = adminDoc.data().adminEmail;
        this.isAdmin = this.currentUser.email === adminEmail;
      }
      return this.isAdmin;
    } catch (error) {
      console.error("Error checking admin status:", error);
      return false;
    }
  }

  // Register New User
  async register(email, password, name) {
    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;

      // Save User Data to Firestore
      await db.collection("users").doc(user.uid).set({
        uid: user.uid,
        email: email,
        name: name,
        createdAt: new Date(),
        bookings: []
      });

      this.showAlert("Registrierung erfolgreich! Du wirst weitergeleitet...", "success");
      setTimeout(() => location.reload(), 2000);
      return user;
    } catch (error) {
      console.error("Registration error:", error);
      this.showAlert(this.getErrorMessage(error), "error");
      throw error;
    }
  }

  // Login User
  async login(email, password) {
    try {
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      this.showAlert("Erfolgreich angemeldet!", "success");
      return userCredential.user;
    } catch (error) {
      console.error("Login error:", error);
      this.showAlert(this.getErrorMessage(error), "error");
      throw error;
    }
  }

  // Admin Login
  async adminLogin(email, password) {
    try {
      // Verify Admin Credentials
      const adminDoc = await db.collection("admin").doc("config").get();
      if (!adminDoc.exists) {
        throw new Error("Admin-Konfiguration nicht gefunden. Bitte bei Firebase-Setup prüfen.");
      }

      const adminData = adminDoc.data();
      if (adminData.adminEmail !== email) {
        throw new Error("Ungültige Admin-Email");
      }

      // Check Admin Password
      if (adminData.adminPassword !== password) {
        throw new Error("Ungültiges Admin-Passwort");
      }

      // Login with Firebase Auth
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      this.isAdmin = true;
      this.showAlert("Admin erfolgreich angemeldet!", "success");
      return userCredential.user;
    } catch (error) {
      console.error("Admin login error:", error);
      this.showAlert(this.getErrorMessage(error), "error");
      throw error;
    }
  }

  // Logout User
  async logout() {
    try {
      await auth.signOut();
      this.currentUser = null;
      this.isAdmin = false;
      this.showAlert("Erfolgreich abgemeldet!", "success");
      setTimeout(() => location.reload(), 1000);
    } catch (error) {
      console.error("Logout error:", error);
      this.showAlert(this.getErrorMessage(error), "error");
    }
  }

  // Get Error Message in German
  getErrorMessage(error) {
    const errorMessages = {
      "auth/email-already-in-use": "Diese E-Mail wird bereits verwendet.",
      "auth/invalid-email": "Ungültige E-Mail-Adresse.",
      "auth/weak-password": "Das Passwort ist zu schwach. Mindestens 6 Zeichen.",
      "auth/user-not-found": "Benutzer nicht gefunden.",
      "auth/wrong-password": "Falsches Passwort.",
      "auth/invalid-credential": "Ungültige Anmeldedaten.",
      "auth/too-many-requests": "Zu viele Anmeldeversuche. Versuche es später.",
    };
    return errorMessages[error.code] || error.message;
  }

  // Show/Hide Auth Section
  showAuthSection() {
    document.querySelectorAll(".auth-page").forEach(el => el.classList.remove("active"));
    const authContainer = document.getElementById("auth-container");
    if (authContainer) authContainer.style.display = "block";

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.style.display = "none";

    const adminBtn = document.getElementById("admin-btn");
    if (adminBtn) adminBtn.style.display = "none";
  }

  // Update UI based on Auth State
  updateUI() {
    if (!this.currentUser) return;

    const authContainer = document.getElementById("auth-container");
    if (authContainer) authContainer.style.display = "none";
    document.querySelectorAll(".auth-page").forEach(el => el.classList.add("active"));

    // Show Admin Button if Admin
    const adminBtn = document.getElementById("admin-btn");
    if (adminBtn && this.isAdmin) {
      adminBtn.style.display = "block";
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.style.display = "block";

    // Update Header
    const userNameSpan = document.getElementById("user-name");
    if (userNameSpan) {
      userNameSpan.textContent = this.currentUser.email;
    }
  }

  // Show Alert Message
  showAlert(message, type = "info") {
    const alertContainer = document.getElementById("alert-container");
    if (!alertContainer) return;

    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type}`;
    alertDiv.innerHTML = `
      <span>${message}</span>
    `;

    alertContainer.appendChild(alertDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => alertDiv.remove(), 5000);
  }

  // Get Current User Data
  async getCurrentUserData() {
    if (!this.currentUser) return null;

    try {
      const userDoc = await db.collection("users").doc(this.currentUser.uid).get();
      return userDoc.exists ? userDoc.data() : null;
    } catch (error) {
      console.error("Error getting user data:", error);
      return null;
    }
  }
}

// Initialize Auth Manager
const authManager = new AuthManager();
