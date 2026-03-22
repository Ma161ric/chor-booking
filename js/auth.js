// Authentication Module
class AuthManager {
  constructor() {
    this.currentUser = null;
    this.isAdmin = false;
    this.setupAuthStateListener();
  }

  // Listen to Auth State Changes
  setupAuthStateListener() {
    auth.onAuthStateChanged(async (user) => {
      this.currentUser = user;

      if (user) {
        await this.checkAdminStatus();
        this.updateUI();
      } else {
        this.isAdmin = false;
        this.showAuthSection();
      }
    });
  }

  // Check if user is admin via Firestore admins/{uid}
  async checkAdminStatus(forceRefresh = false) {
    void forceRefresh;
    if (!this.currentUser) {
      this.isAdmin = false;
      return false;
    }

    try {
      const adminDoc = await db.collection("admins").doc(this.currentUser.uid).get();
      this.isAdmin = adminDoc.exists;
      return this.isAdmin;
    } catch (error) {
      console.error("Error checking admin status:", error);
      this.isAdmin = false;
      return false;
    }
  }

  async ensureAdmin() {
    const isAdmin = await this.checkAdminStatus(true);
    if (!isAdmin) {
      this.showAlert("Fehlende Berechtigung: Nur Admins dürfen diese Aktion ausführen.", "error");
      return false;
    }
    return true;
  }

  // Register New User
  async register(email, password, name) {
    try {
      const userCredential = await auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;

      // Save User Data to Firestore
      await db.collection("users").doc(user.uid).set({
        uid: user.uid,
        email,
        name,
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        bookings: []
      }, { merge: true });

      this.showAlert("Registrierung erfolgreich!", "success");
      return user;
    } catch (error) {
      console.error("Registration error:", error);
      this.showAlert(this.getErrorMessage(error), "error");
      throw error;
    }
  }

  // Login User
  async login(email, password, showSuccess = true) {
    try {
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      if (showSuccess) {
        this.showAlert("Erfolgreich angemeldet!", "success");
      }
      return userCredential.user;
    } catch (error) {
      console.error("Login error:", error);
      this.showAlert(this.getErrorMessage(error), "error");
      throw error;
    }
  }

  // Admin Login (admins/{uid} allowlist)
  async adminLogin(email, password) {
    try {
      await this.login(email, password, false);

      const isAdmin = await this.checkAdminStatus(true);

      if (!isAdmin) {
        await auth.signOut();
        throw new Error("Kein Admin-Zugriff. Bitte admins/{uid} in Firestore freischalten.");
      }

      this.showAlert("Admin erfolgreich angemeldet!", "success");
      return this.currentUser;
    } catch (error) {
      console.error("Admin login error:", error);
      this.showAlert(this.getErrorMessage(error), "error");
      throw error;
    }
  }

  // Logout User
  async logout(redirectUrl = null) {
    try {
      await auth.signOut();
      this.currentUser = null;
      this.isAdmin = false;
      this.showAlert("Erfolgreich abgemeldet!", "success");

      if (redirectUrl) {
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 400);
      }
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
      "permission-denied": "Für diese Aktion fehlen Berechtigungen."
    };

    return errorMessages[error.code] || error.message || "Unbekannter Fehler.";
  }

  // Show/Hide Auth Section
  showAuthSection() {
    document.querySelectorAll(".auth-page").forEach((el) => el.classList.remove("active"));

    const authContainer = document.getElementById("auth-container");
    if (authContainer) {
      authContainer.style.display = "block";
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.style.display = "none";
    }

    const adminBtn = document.getElementById("admin-btn");
    if (adminBtn) {
      adminBtn.style.display = "none";
    }
  }

  // Update UI based on Auth State
  updateUI() {
    if (!this.currentUser) {
      return;
    }

    const authContainer = document.getElementById("auth-container");
    if (authContainer) {
      authContainer.style.display = "none";
    }

    document.querySelectorAll(".auth-page").forEach((el) => el.classList.add("active"));

    const adminBtn = document.getElementById("admin-btn");
    if (adminBtn) {
      adminBtn.style.display = this.isAdmin ? "block" : "none";
    }

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.style.display = "block";
    }

    const userNameSpan = document.getElementById("user-name");
    if (userNameSpan) {
      userNameSpan.textContent = this.currentUser.displayName || this.currentUser.email || "Nutzer";
    }
  }

  // Show Alert Message
  showAlert(message, type = "info") {
    const alertContainer = document.getElementById("alert-container");
    if (!alertContainer) {
      return;
    }

    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type}`;

    const text = document.createElement("span");
    text.textContent = message;
    alertDiv.appendChild(text);

    alertContainer.appendChild(alertDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => alertDiv.remove(), 5000);
  }

  // Get Current User Data
  async getCurrentUserData() {
    if (!this.currentUser) {
      return null;
    }

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
