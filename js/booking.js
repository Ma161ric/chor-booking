// Booking Management Module
class BookingManager {
  constructor() {
    this.bookings = [];
    this.currentBooking = null;
    this.publicConfigCache = null;
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Generate Unique Ticket Number
  generateTicketNumber() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${timestamp}-${random}`;
  }

  // Generate QR Code
  generateQRCode(data) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}`;
  }

  // Create Booking
  async createBooking(eventId, userData) {
    if (!authManager.currentUser) {
      authManager.showAlert("Du musst angemeldet sein, um ein Ticket zu buchen.", "error");
      return null;
    }

    try {
      const user = authManager.currentUser;
      const bookingRef = db.collection("bookings").doc();
      const eventRef = db.collection("events").doc(eventId);
      const userRef = db.collection("users").doc(user.uid);

      const newBooking = await db.runTransaction(async (transaction) => {
        const [eventDoc, userDoc] = await Promise.all([
          transaction.get(eventRef),
          transaction.get(userRef)
        ]);

        if (!eventDoc.exists) {
          throw new Error("EVENT_NOT_FOUND");
        }

        const eventData = eventDoc.data();
        const capacity = Number.parseInt(eventData.capacity, 10) || 0;
        const bookingCount = Number.parseInt(eventData.bookingCount, 10) || 0;

        if (capacity < 1) {
          throw new Error("EVENT_INVALID_CAPACITY");
        }

        if (bookingCount >= capacity) {
          throw new Error("EVENT_SOLD_OUT");
        }

        const safeName = (userData.name || user.displayName || user.email || "Gast").trim();
        const ticketNumber = this.generateTicketNumber();
        const qrCodeUrl = this.generateQRCode(ticketNumber);
        const createdAt = new Date();
        const cancellationDeadline = new Date(createdAt.getTime() + (24 * 60 * 60 * 1000));

        const booking = {
          eventId,
          userId: user.uid,
          userEmail: user.email,
          userName: safeName,
          ticketNumber,
          qrCodeUrl,
          status: "confirmed",
          createdAt,
          checkedIn: false,
          checkedInAt: null,
          emailStatus: "pending",
          cancellationDeadline
        };

        transaction.set(bookingRef, booking);
        transaction.update(eventRef, {
          bookingCount: bookingCount + 1,
          updatedAt: new Date()
        });

        if (userDoc.exists) {
          transaction.update(userRef, {
            bookings: firebase.firestore.FieldValue.arrayUnion(bookingRef.id),
            updatedAt: new Date()
          });
        } else {
          transaction.set(userRef, {
            uid: user.uid,
            email: user.email,
            name: safeName,
            role: "user",
            createdAt: new Date(),
            updatedAt: new Date(),
            bookings: [bookingRef.id]
          }, { merge: true });
        }

        return {
          id: bookingRef.id,
          ...booking,
          eventTitle: eventData.title || "Event",
          eventDate: eventData.date || null,
          eventTime: eventData.time || "",
          eventLocation: eventData.location || ""
        };
      });

      this.sendBookingConfirmationEmail(newBooking).catch((mailError) => {
        console.error("Client-side booking mail failed:", mailError);
      });

      authManager.showAlert("Ticket erfolgreich gebucht!", "success");
      this.currentBooking = newBooking;
      return this.currentBooking;
    } catch (error) {
      console.error("Error creating booking:", error);

      const code = error.message || error.code;
      if (code === "EVENT_NOT_FOUND") {
        authManager.showAlert("Dieses Event wurde gelöscht oder ist nicht mehr verfügbar.", "error");
      } else if (code === "EVENT_SOLD_OUT") {
        authManager.showAlert("Dieses Event ist leider ausverkauft.", "error");
      } else if (code === "EVENT_INVALID_CAPACITY") {
        authManager.showAlert("Dieses Event ist aktuell nicht buchbar.", "error");
      } else {
        authManager.showAlert("Fehler beim Buchen des Tickets. " + (error.message || "Unbekannter Fehler"), "error");
      }

      return null;
    }
  }

  // Public configuration (safe for client)
  async getPublicConfig(forceRefresh = false) {
    if (this.publicConfigCache && !forceRefresh) {
      return this.publicConfigCache;
    }

    try {
      const configDoc = await db.collection("appConfig").doc("public").get();
      this.publicConfigCache = configDoc.exists ? configDoc.data() : null;
      return this.publicConfigCache;
    } catch (error) {
      console.error("Error getting public config:", error);
      return null;
    }
  }

  getEmailJsConfig(publicConfig = null) {
    const runtimeConfig = window.__EMAILJS_CONFIG__ || {};
    const config = publicConfig || this.publicConfigCache || {};

    return {
      serviceId: runtimeConfig.serviceId || config.emailjsServiceId || "",
      templateId: runtimeConfig.templateId || config.emailjsTemplateId || "",
      publicKey: runtimeConfig.publicKey || config.emailjsPublicKey || ""
    };
  }

  async sendEmailWithEmailJs(templateParams) {
    const publicConfig = await this.getPublicConfig();
    const emailJs = this.getEmailJsConfig(publicConfig);

    if (!emailJs.serviceId || !emailJs.templateId || !emailJs.publicKey) {
      return {
        sent: false,
        code: "EMAIL_NOT_CONFIGURED"
      };
    }

    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        service_id: emailJs.serviceId,
        template_id: emailJs.templateId,
        user_id: emailJs.publicKey,
        template_params: templateParams
      })
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`EMAILJS_REQUEST_FAILED:${response.status}:${details}`);
    }

    return {
      sent: true,
      code: "EMAIL_SENT"
    };
  }

  async sendBookingConfirmationEmail(booking) {
    if (!booking || !booking.id) {
      return;
    }

    const eventDate = booking.eventDate?.toDate
      ? booking.eventDate.toDate().toLocaleDateString("de-DE")
      : booking.eventDate
        ? new Date(booking.eventDate).toLocaleDateString("de-DE")
        : "Wird noch bekanntgegeben";

    try {
      const result = await this.sendEmailWithEmailJs({
        to_email: booking.userEmail || "",
        to_name: booking.userName || "",
        event_title: booking.eventTitle || "Event",
        event_date: eventDate,
        event_time: booking.eventTime || "",
        event_location: booking.eventLocation || "",
        ticket_number: booking.ticketNumber || booking.id,
        qr_code_url: booking.qrCodeUrl || ""
      });

      if (result.code === "EMAIL_NOT_CONFIGURED") {
        authManager.showAlert("Hinweis: EmailJS ist nicht konfiguriert. Ticket wurde trotzdem gebucht.", "warning");
        return;
      }
    } catch (error) {
      authManager.showAlert("Ticket gebucht, aber Bestaetigungsmail konnte nicht versendet werden.", "warning");
    }
  }

  async sendTestEmail(toEmail) {
    const email = String(toEmail || "").trim();
    if (!email) {
      throw new Error("TEST_EMAIL_REQUIRED");
    }

    return this.sendEmailWithEmailJs({
      to_email: email,
      to_name: "Test",
      event_title: "Testmail Chor Booking",
      event_date: new Date().toLocaleDateString("de-DE"),
      event_time: "",
      event_location: "",
      ticket_number: "TEST-0000",
      qr_code_url: ""
    });
  }

  // Get User Bookings
  async getUserBookings() {
    if (!authManager.currentUser) return [];

    try {
      const snapshot = await db.collection("bookings")
        .where("userId", "==", authManager.currentUser.uid)
        .orderBy("createdAt", "desc")
        .get();

      this.bookings = [];
      snapshot.forEach((doc) => {
        this.bookings.push({ id: doc.id, ...doc.data() });
      });
      return this.bookings;
    } catch (error) {
      console.error("Error getting user bookings:", error);
      return [];
    }
  }

  // Get All Bookings (Admin Only)
  async getAllBookings() {
    if (!(await authManager.ensureAdmin())) {
      return [];
    }

    try {
      const snapshot = await db.collection("bookings")
        .orderBy("createdAt", "desc")
        .get();

      this.bookings = [];
      snapshot.forEach((doc) => {
        this.bookings.push({ id: doc.id, ...doc.data() });
      });
      return this.bookings;
    } catch (error) {
      console.error("Error getting all bookings:", error);
      return [];
    }
  }

  // Check In Booking (Admin Only)
  async checkInBooking(bookingId) {
    if (!(await authManager.ensureAdmin())) {
      return false;
    }

    try {
      const bookingDoc = await db.collection("bookings").doc(bookingId).get();
      if (!bookingDoc.exists) {
        authManager.showAlert("Buchung wurde bereits gelöscht.", "warning");
        return false;
      }

      if (bookingDoc.data().checkedIn) {
        authManager.showAlert("Ticket ist bereits eingecheckt.", "warning");
        return true;
      }

      await bookingDoc.ref.update({
        checkedIn: true,
        checkedInAt: new Date()
      });

      authManager.showAlert("Ticket eingecheckt!", "success");
      return true;
    } catch (error) {
      console.error("Error checking in booking:", error);
      authManager.showAlert("Fehler beim Einchecken.", "error");
      return false;
    }
  }

  // Cancel Booking
  async cancelBooking(bookingId) {
    if (!authManager.currentUser) {
      authManager.showAlert("Bitte zuerst einloggen.", "error");
      return false;
    }

    try {
      const user = authManager.currentUser;
      const isAdmin = await authManager.checkAdminStatus();
      const bookingRef = db.collection("bookings").doc(bookingId);

      await db.runTransaction(async (transaction) => {
        const bookingDoc = await transaction.get(bookingRef);
        if (!bookingDoc.exists) {
          throw new Error("BOOKING_NOT_FOUND");
        }

        const booking = bookingDoc.data();
        const canCancel = booking.userId === user.uid || isAdmin;
        if (!canCancel) {
          throw new Error("BOOKING_FORBIDDEN");
        }

        if (!isAdmin) {
          const deadlineSource = booking.cancellationDeadline || booking.createdAt;
          const deadlineDate = deadlineSource?.toDate ? deadlineSource.toDate() : new Date(deadlineSource);
          if (Number.isFinite(deadlineDate.getTime()) && Date.now() > deadlineDate.getTime()) {
            throw new Error("CANCELLATION_WINDOW_EXPIRED");
          }
        }

        const eventRef = db.collection("events").doc(booking.eventId);
        const userRef = db.collection("users").doc(booking.userId);
        const [eventDoc, bookingOwnerDoc] = await Promise.all([
          transaction.get(eventRef),
          transaction.get(userRef)
        ]);

        if (eventDoc.exists) {
          const eventData = eventDoc.data();
          const bookingCount = Number.parseInt(eventData.bookingCount, 10) || 0;
          transaction.update(eventRef, {
            bookingCount: Math.max(0, bookingCount - 1),
            updatedAt: new Date()
          });
        }

        if (bookingOwnerDoc.exists) {
          transaction.update(userRef, {
            bookings: firebase.firestore.FieldValue.arrayRemove(bookingId),
            updatedAt: new Date()
          });
        }

        transaction.delete(bookingRef);
      });

      authManager.showAlert("Buchung storniert!", "success");
      return true;
    } catch (error) {
      console.error("Error canceling booking:", error);

      const code = error.message || error.code;
      if (code === "BOOKING_NOT_FOUND") {
        authManager.showAlert("Buchung existiert nicht mehr.", "warning");
      } else if (code === "BOOKING_FORBIDDEN") {
        authManager.showAlert("Du darfst nur eigene Buchungen stornieren.", "error");
      } else if (code === "CANCELLATION_WINDOW_EXPIRED") {
        authManager.showAlert("Storno ist nur innerhalb von 24 Stunden nach Buchung möglich.", "error");
      } else {
        authManager.showAlert("Fehler beim Stornieren der Buchung.", "error");
      }
      return false;
    }
  }

  // Display User Bookings
  async displayUserBookings(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const bookings = await this.getUserBookings();

    if (bookings.length === 0) {
      container.innerHTML = "<p>Du hast noch keine Tickets gebucht.</p>";
      return;
    }

    let html = "<div class='bookings-list'>";
    for (const booking of bookings) {
      const event = await eventsManager.getEventById(booking.eventId);
      const eventTitle = this.escapeHtml(event ? event.title : "Gelöschtes Event");
      const ticketNumber = this.escapeHtml(booking.ticketNumber);
      const status = this.escapeHtml(booking.status === "confirmed" ? "✓ Bestätigt" : booking.status);

      html += `
        <div class="card">
          <h3>${eventTitle}</h3>
          <div class="event-details">
            <div class="event-detail-row">
              <strong>Ticketnummer:</strong>
              <code>${ticketNumber}</code>
            </div>
            <div class="event-detail-row">
              <strong>Datum:</strong>
              <span>${event ? eventsManager.formatDate(event.date) : "N/A"}</span>
            </div>
            <div class="event-detail-row">
              <strong>Status:</strong>
              <span>${status}</span>
            </div>
            ${booking.checkedIn ? `<div class="event-detail-row"><strong>Eingecheckt:</strong> ✓ Ja</div>` : ""}
          </div>
          <div class="qr-container">
            <img src="${booking.qrCodeUrl}" alt="QR Code" />
            <p><small>Zeige diesen QR-Code am Event</small></p>
          </div>
          <button class="btn btn-danger btn-small" onclick="bookingManager.cancelBooking('${booking.id}')">
            Stornieren
          </button>
        </div>
      `;
    }
    html += "</div>";
    container.innerHTML = html;
  }

  // Open Booking Modal
  async openBookingModal(eventId, eventTitle) {
    if (!authManager.currentUser) {
      authManager.showAlert("Bitte logge dich ein, um ein Ticket zu buchen.", "error");
      const authContainer = document.getElementById("auth-container");
      if (authContainer) {
        authContainer.scrollIntoView({ behavior: "smooth" });
      }
      return;
    }

    const available = await eventsManager.getAvailableTickets(eventId);
    if (available <= 0) {
      authManager.showAlert("Dieser Event ist ausverkauft!", "error");
      return;
    }

    const modal = document.getElementById("booking-modal");
    const modalContent = document.getElementById("booking-form-content");

    modalContent.innerHTML = `
      <div class="form-group">
        <label>Event</label>
        <input type="text" value="${this.escapeHtml(eventTitle)}" disabled />
      </div>
      <div class="form-group">
        <label>Dein Name *</label>
        <input type="text" id="booking-name" placeholder="Dein Name" value="${this.escapeHtml(authManager.currentUser.displayName || "")}" required />
      </div>
      <div class="form-group">
        <label>E-Mail *</label>
        <input type="email" id="booking-email" value="${authManager.currentUser.email}" disabled />
      </div>
      <div class="form-group">
        <button class="btn btn-primary btn-block" onclick="bookingManager.confirmBooking('${eventId}')">
          Ticket buchen
        </button>
        <button class="btn btn-outline btn-block" onclick="bookingManager.closeBookingModal()">
          Abbrechen
        </button>
      </div>
    `;

    modal.classList.add("active");
  }

  // Confirm Booking
  async confirmBooking(eventId) {
    const nameInput = document.getElementById("booking-name");
    const name = nameInput ? nameInput.value.trim() : "";
    if (!name) {
      authManager.showAlert("Bitte gib deinen Namen ein.", "error");
      return;
    }

    const booking = await this.createBooking(eventId, { name });
    if (booking) {
      this.displayBookingConfirmation(booking);
    }
  }

  // Display Booking Confirmation
  displayBookingConfirmation(booking) {
    const modal = document.getElementById("booking-modal");
    const modalContent = document.getElementById("booking-form-content");

    const eventDate = booking.eventDate?.toDate
      ? booking.eventDate.toDate().toLocaleDateString("de-DE")
      : booking.eventDate
        ? new Date(booking.eventDate).toLocaleDateString("de-DE")
        : "Wird in der Email bestätigt";

    modalContent.innerHTML = `
      <div style="text-align: center;">
        <h2>✓ Ticket erfolgreich gebucht!</h2>
        <p>Falls EmailJS konfiguriert ist, wird eine Bestaetigungsmail versendet.</p>
        <p><strong>${this.escapeHtml(booking.eventTitle || "Event")}</strong></p>
        <p>${this.escapeHtml(eventDate)} ${this.escapeHtml(booking.eventTime || "")}</p>
        <div class="qr-container">
          <img src="${booking.qrCodeUrl}" alt="QR Code" />
        </div>
        <div class="card" style="background: #f0fdf4; border-left: 4px solid #10b981;">
          <p><strong>Ticketnummer:</strong></p>
          <p style="font-family: monospace; font-size: 1.2rem; letter-spacing: 2px;">${this.escapeHtml(booking.ticketNumber)}</p>
        </div>
        <p><small>Speichere diese Ticketnummer oder zeige den QR-Code am Event.</small></p>
        <button class="btn btn-primary btn-block" onclick="bookingManager.closeBookingModal()">
          Schließen
        </button>
      </div>
    `;
  }

  // Close Booking Modal
  closeBookingModal() {
    const modal = document.getElementById("booking-modal");
    if (modal) {
      modal.classList.remove("active");
    }
  }

  // Export Bookings to CSV (Admin Only)
  async exportBookingsToCSV() {
    if (!(await authManager.ensureAdmin())) {
      return;
    }

    const bookings = await this.getAllBookings();
    if (bookings.length === 0) {
      authManager.showAlert("Keine Buchungen zum Exportieren.", "warning");
      return;
    }

    let csv = "Ticketnummer,Benutzer,E-Mail,Event,Gebucht am,Status\n";

    for (const booking of bookings) {
      const event = await eventsManager.getEventById(booking.eventId);
      const eventName = event ? event.title : "Unbekannt";
      const createdAt = booking.createdAt?.toDate ? booking.createdAt.toDate() : new Date(booking.createdAt);
      const date = createdAt.toLocaleDateString("de-DE");

      csv += `"${booking.ticketNumber}","${booking.userName}","${booking.userEmail}","${eventName}","${date}","${booking.status}"\n`;
    }

    // Download CSV
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `bookings_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    authManager.showAlert("Buchungen exportiert!", "success");
  }
}

// Initialize Booking Manager
const bookingManager = new BookingManager();
