// Booking Management Module
class BookingManager {
  constructor() {
    this.bookings = [];
    this.currentBooking = null;
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
      // Check available tickets
      const available = await eventsManager.getAvailableTickets(eventId);
      if (available <= 0) {
        authManager.showAlert("Dieser Event ist ausverkauft!", "error");
        return null;
      }

      const ticketNumber = this.generateTicketNumber();
      const qrCodeUrl = this.generateQRCode(ticketNumber);

      const booking = {
        eventId: eventId,
        userId: authManager.currentUser.uid,
        userEmail: authManager.currentUser.email,
        userName: userData.name || authManager.currentUser.email,
        ticketNumber: ticketNumber,
        qrCodeUrl: qrCodeUrl,
        status: "confirmed",
        createdAt: new Date(),
        checkedIn: false,
        checkedInAt: null
      };

      // Save booking to Firestore
      const docRef = await db.collection("bookings").add(booking);

      // Update user's booking list
      await db.collection("users").doc(authManager.currentUser.uid).update({
        bookings: firebase.firestore.FieldValue.arrayUnion(docRef.id)
      });

      // Trigger Cloud Function for Email (via custom call or webhook)
      await this.triggerBookingEmail(booking, docRef.id);

      authManager.showAlert("Ticket erfolgreich gebucht!", "success");
      this.currentBooking = { id: docRef.id, ...booking };
      return this.currentBooking;
    } catch (error) {
      console.error("Error creating booking:", error);
      authManager.showAlert("Fehler beim Buchen des Tickets. " + error.message, "error");
      return null;
    }
  }

  // Trigger Booking Email (Cloud Function)
  async triggerBookingEmail(booking, bookingId) {
    try {
      // Get event details
      const event = await eventsManager.getEventById(booking.eventId);
      if (!event) return;

      // Call Cloud Function via HTTP trigger
      // This assumes you have set up a Cloud Function endpoint
      const response = await fetch("/.netlify/functions/sendBookingEmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: bookingId,
          booking: booking,
          event: event,
          adminConfig: await this.getAdminConfig()
        })
      });

      if (!response.ok) {
        console.warn("Email sending may have failed (non-critical)");
      }
    } catch (error) {
      console.warn("Email trigger error (non-critical):", error);
      // Non-blocking error - booking is still saved
    }
  }

  // Get Admin Configuration
  async getAdminConfig() {
    try {
      const adminDoc = await db.collection("admin").doc("config").get();
      return adminDoc.exists ? adminDoc.data() : null;
    } catch (error) {
      console.error("Error getting admin config:", error);
      return null;
    }
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
    if (!authManager.isAdmin) {
      authManager.showAlert("Du hast keine Berechtigung.", "error");
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
    if (!authManager.isAdmin) {
      authManager.showAlert("Du hast keine Berechtigung.", "error");
      return false;
    }

    try {
      await db.collection("bookings").doc(bookingId).update({
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
    try {
      const bookingDoc = await db.collection("bookings").doc(bookingId).get();
      if (!bookingDoc.exists) {
        authManager.showAlert("Buchung nicht gefunden.", "error");
        return false;
      }

      const booking = bookingDoc.data();

      // User can only cancel their own bookings
      if (booking.userId !== authManager.currentUser.uid && !authManager.isAdmin) {
        authManager.showAlert("Du darfst nur deine eigenen Buchungen stornieren.", "error");
        return false;
      }

      await db.collection("bookings").doc(bookingId).delete();
      authManager.showAlert("Buchung storniert!", "success");
      return true;
    } catch (error) {
      console.error("Error canceling booking:", error);
      authManager.showAlert("Fehler beim Stornieren der Buchung.", "error");
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
      html += `
        <div class="card">
          <h3>${event ? event.title : "Unbekanntes Event"}</h3>
          <div class="event-details">
            <div class="event-detail-row">
              <strong>Ticketnummer:</strong>
              <code>${booking.ticketNumber}</code>
            </div>
            <div class="event-detail-row">
              <strong>Datum:</strong>
              <span>${event ? eventsManager.formatDate(event.date) : "N/A"}</span>
            </div>
            <div class="event-detail-row">
              <strong>Status:</strong>
              <span>${booking.status === "confirmed" ? "✓ Bestätigt" : booking.status}</span>
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
      document.getElementById("auth-container").scrollIntoView({ behavior: "smooth" });
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
        <input type="text" value="${eventTitle}" disabled />
      </div>
      <div class="form-group">
        <label>Dein Name *</label>
        <input type="text" id="booking-name" placeholder="Dein Name" value="${authManager.currentUser.displayName || ""}" required />
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
    const name = document.getElementById("booking-name").value.trim();
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

    modalContent.innerHTML = `
      <div style="text-align: center;">
        <h2>✓ Ticket erfolgreich gebucht!</h2>
        <p>Deine Bestätigungsemail wird in Kürze versendet.</p>
        <div class="qr-container">
          <img src="${booking.qrCodeUrl}" alt="QR Code" />
        </div>
        <div class="card" style="background: #f0fdf4; border-left: 4px solid #10b981;">
          <p><strong>Ticketnummer:</strong></p>
          <p style="font-family: monospace; font-size: 1.2rem; letter-spacing: 2px;">${booking.ticketNumber}</p>
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
    modal.classList.remove("active");
  }

  // Export Bookings to CSV (Admin Only)
  async exportBookingsToCSV() {
    if (!authManager.isAdmin) {
      authManager.showAlert("Du hast keine Berechtigung.", "error");
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
      const date = booking.createdAt.toDate().toLocaleDateString("de-DE");

      csv += `"${booking.ticketNumber}","${booking.userName}","${booking.userEmail}","${eventName}","${date}","${booking.status}"\n`;
    }

    // Download CSV
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `bookings_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();

    authManager.showAlert("Buchungen exportiert!", "success");
  }
}

// Initialize Booking Manager
const bookingManager = new BookingManager();
