// Admin Panel Module
class AdminPanel {
  constructor() {
    this.currentTab = "events";
  }

  // Switch Tab
  switchTab(tabName) {
    this.currentTab = tabName;

    // Update button states
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");

    // Update content visibility
    document.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.remove("active");
    });
    document.getElementById(`${tabName}-tab`).classList.add("active");

    // Load tab content
    if (tabName === "events") this.loadEventsList();
    else if (tabName === "bookings") this.loadBookingsList();
    else if (tabName === "settings") this.loadSettings();
  }

  // Load Events List
  async loadEventsList() {
    const container = document.getElementById("events-list");
    if (!container) return;

    const events = await eventsManager.loadEvents();

    if (events.length === 0) {
      container.innerHTML = "<p>Keine Events vorhanden. Erstelle ein neues Event!</p>";
      return;
    }

    let html = "<div class='table-responsive'><table>";
    html += "<thead><tr><th>Titel</th><th>Datum</th><th>Kapazität</th><th>Gebucht</th><th>Verfügbar</th><th>Aktionen</th></tr></thead><tbody>";

    for (const event of events) {
      const available = await eventsManager.getAvailableTickets(event.id);
      const booked = event.capacity - available;
      const date = eventsManager.formatDate(event.date);

      html += `
        <tr>
          <td><strong>${event.title}</strong></td>
          <td>${date}</td>
          <td>${event.capacity}</td>
          <td>${booked}</td>
          <td>${available}</td>
          <td>
            <button class="btn btn-warning btn-small" onclick="adminPanel.editEventModal('${event.id}')">Bearbeiten</button>
            <button class="btn btn-danger btn-small" onclick="eventsManager.deleteEvent('${event.id}'); adminPanel.loadEventsList();">Löschen</button>
          </td>
        </tr>
      `;
    }

    html += "</tbody></table></div>";
    container.innerHTML = html;
  }

  // Open Create Event Modal
  openCreateEventModal() {
    const modal = document.getElementById("event-modal");
    const modalContent = document.getElementById("event-form-content");

    modalContent.innerHTML = `
      <div class="form-group">
        <label>Veranstaltungstitel *</label>
        <input type="text" id="event-title" placeholder="z.B. Chor-Konzert 2024" required />
      </div>
      <div class="form-group">
        <label>Beschreibung *</label>
        <textarea id="event-description" placeholder="Beschreibe dein Event..." rows="4" required></textarea>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label>Datum *</label>
          <input type="date" id="event-date" required />
        </div>
        <div class="form-group">
          <label>Uhrzeit *</label>
          <input type="time" id="event-time" required />
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label>Kapazität (Plätze) *</label>
          <input type="number" id="event-capacity" min="1" placeholder="100" required />
        </div>
        <div class="form-group">
          <label>Ort</label>
          <input type="text" id="event-location" placeholder="z.B. Konzerthalle" />
        </div>
      </div>
      <div class="form-group">
        <button class="btn btn-primary btn-block" onclick="adminPanel.saveEvent()">Event erstellen</button>
        <button class="btn btn-outline btn-block" onclick="adminPanel.closeEventModal()">Abbrechen</button>
      </div>
    `;

    modal.classList.add("active");
  }

  // Edit Event Modal
  async editEventModal(eventId) {
    const event = await eventsManager.getEventById(eventId);
    if (!event) return;

    const modal = document.getElementById("event-modal");
    const modalContent = document.getElementById("event-form-content");
    const date = event.date.toDate ? event.date.toDate() : new Date(event.date);
    const dateStr = date.toISOString().split("T")[0];

    modalContent.innerHTML = `
      <div class="form-group">
        <label>Veranstaltungstitel *</label>
        <input type="text" id="event-title" value="${event.title}" required />
      </div>
      <div class="form-group">
        <label>Beschreibung *</label>
        <textarea id="event-description" rows="4" required>${event.description}</textarea>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label>Datum *</label>
          <input type="date" id="event-date" value="${dateStr}" required />
        </div>
        <div class="form-group">
          <label>Uhrzeit *</label>
          <input type="time" id="event-time" value="${event.time}" required />
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label>Kapazität (Plätze) *</label>
          <input type="number" id="event-capacity" value="${event.capacity}" min="1" required />
        </div>
        <div class="form-group">
          <label>Ort</label>
          <input type="text" id="event-location" value="${event.location || ""}" />
        </div>
      </div>
      <div class="form-group">
        <button class="btn btn-primary btn-block" onclick="adminPanel.saveEvent('${eventId}')">Event aktualisieren</button>
        <button class="btn btn-outline btn-block" onclick="adminPanel.closeEventModal()">Abbrechen</button>
      </div>
    `;

    modal.classList.add("active");
  }

  // Save Event
  async saveEvent(eventId = null) {
    const eventData = {
      title: document.getElementById("event-title").value,
      description: document.getElementById("event-description").value,
      date: document.getElementById("event-date").value,
      time: document.getElementById("event-time").value,
      capacity: document.getElementById("event-capacity").value,
      location: document.getElementById("event-location").value
    };

    // Validation
    if (!eventData.title || !eventData.description || !eventData.date || !eventData.time || !eventData.capacity) {
      authManager.showAlert("Bitte fülle alle Pflichtfelder aus.", "error");
      return;
    }

    if (eventId) {
      await eventsManager.updateEvent(eventId, eventData);
    } else {
      await eventsManager.createEvent(eventData);
    }

    this.closeEventModal();
    this.loadEventsList();
  }

  // Close Event Modal
  closeEventModal() {
    document.getElementById("event-modal").classList.remove("active");
  }

  // Load Bookings List
  async loadBookingsList() {
    const container = document.getElementById("bookings-list");
    if (!container) return;

    container.innerHTML = '<div class="spinner"></div> Lade Buchungen...';

    const bookings = await bookingManager.getAllBookings();

    if (bookings.length === 0) {
      container.innerHTML = "<p>Keine Buchungen vorhanden.</p>";
      return;
    }

    let html = "<div class='table-responsive'><table>";
    html += "<thead><tr><th>Ticketnummer</th><th>Benutzer</th><th>E-Mail</th><th>Event</th><th>Datum</th><th>Status</th><th>Aktionen</th></tr></thead><tbody>";

    for (const booking of bookings) {
      const event = await eventsManager.getEventById(booking.eventId);
      const eventName = event ? event.title : "Unbekannt";
      const date = booking.createdAt.toDate ? booking.createdAt.toDate().toLocaleDateString("de-DE") : "N/A";
      const checkedInBadge = booking.checkedIn ? "✓ Eingecheckt" : "Ausstehend";

      html += `
        <tr>
          <td><code style="font-size: 0.8rem;">${booking.ticketNumber}</code></td>
          <td>${booking.userName}</td>
          <td>${booking.userEmail}</td>
          <td>${eventName}</td>
          <td>${date}</td>
          <td>${checkedInBadge}</td>
          <td>
            ${!booking.checkedIn ? `<button class="btn btn-success btn-small" onclick="adminPanel.checkInBooking('${booking.id}')">Einchecken</button>` : ""}
            <button class="btn btn-danger btn-small" onclick="bookingManager.cancelBooking('${booking.id}'); adminPanel.loadBookingsList();">Stornieren</button>
          </td>
        </tr>
      `;
    }

    html += "</tbody></table></div>";
    html += `
      <div style="margin-top: 2rem;">
        <button class="btn btn-primary" onclick="bookingManager.exportBookingsToCSV()">
          📊 Zu CSV exportieren
        </button>
      </div>
    `;

    container.innerHTML = html;
  }

  // Check In Booking
  async checkInBooking(bookingId) {
    await bookingManager.checkInBooking(bookingId);
    this.loadBookingsList();
  }

  // Load Settings
  async loadSettings() {
    const container = document.getElementById("settings-tab");
    if (!container) return;

    const adminConfig = await bookingManager.getAdminConfig();

    container.innerHTML = `
      <div class="card">
        <h3>Email-Konfiguration</h3>
        <p style="color: #6b7280; margin-bottom: 1.5rem;">Konfiguriere die Email-Adresse, von der Bestätigungsmails versendet werden.</p>

        <div class="form-group">
          <label>Versand-Email-Adresse *</label>
          <input type="email" id="sender-email" value="${adminConfig?.senderEmail || ""}" placeholder="noreply@example.com" required />
          <small>Dies ist die Absender-Email-Adresse für Bestätigungsmails</small>
        </div>

        <div class="form-group">
          <label>Email-Passwort / App-Passwort *</label>
          <input type="password" id="sender-password" placeholder="••••••••" />
          <small>Verwende ein App-Password oder SMTP-Passwort (wird sicher gespeichert)</small>
        </div>

        <div class="form-group">
          <label>SMTP Server (Optional)</label>
          <input type="text" id="smtp-server" value="${adminConfig?.smtpServer || ""}" placeholder="smtp.gmail.com" />
        </div>

        <div class="form-group">
          <label>SMTP Port (Optional)</label>
          <input type="number" id="smtp-port" value="${adminConfig?.smtpPort || "587"}" placeholder="587" />
        </div>

        <div class="form-group">
          <button class="btn btn-primary" onclick="adminPanel.saveSettings()">Einstellungen speichern</button>
        </div>

        <hr style="margin: 2rem 0; border: none; border-top: 1px solid #e5e7eb;">

        <h3>Admin-Konfiguration</h3>
        <div class="form-group">
          <label>Admin-Email *</label>
          <input type="email" id="admin-email" value="${adminConfig?.adminEmail || authManager.currentUser?.email || ""}" disabled />
          <small>Dies ist deine Admin-Email (Grundeinstellung bei der Konfiguration)</small>
        </div>

        <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 1rem; border-radius: 8px; margin-top: 1rem;">
          <p style="margin: 0; color: #7f1d1d; font-size: 0.9rem;">
            <strong>⚠️ Hinweis:</strong> Admin-Passwort kann nur direkt in Firestore in der Collection <code>admin</code> verändert werden (für Sicherheit).
          </p>
        </div>
      </div>
    `;
  }

  // Save Settings
  async saveSettings() {
    const senderEmail = document.getElementById("sender-email").value.trim();
    const senderPassword = document.getElementById("sender-password").value;
    const smtpServer = document.getElementById("smtp-server").value.trim();
    const smtpPort = document.getElementById("smtp-port").value.trim();

    if (!senderEmail) {
      authManager.showAlert("Bitte gib eine Versand-Email-Adresse ein.", "error");
      return;
    }

    try {
      const adminDoc = await db.collection("admin").doc("config").get();
      const currentAdmin = adminDoc.exists ? adminDoc.data() : {};

      const updates = {
        ...currentAdmin,
        senderEmail: senderEmail,
        smtpServer: smtpServer || "",
        smtpPort: parseInt(smtpPort) || 587,
        updatedAt: new Date()
      };

      // Only update password if provided
      if (senderPassword) {
        updates.senderPassword = senderPassword;
      }

      await db.collection("admin").doc("config").set(updates, { merge: true });
      authManager.showAlert("Einstellungen gespeichert!", "success");
      this.loadSettings();
    } catch (error) {
      console.error("Error saving settings:", error);
      authManager.showAlert("Fehler beim Speichern. " + error.message, "error");
    }
  }
}

// Initialize Admin Panel
const adminPanel = new AdminPanel();
