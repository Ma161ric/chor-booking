// Admin Panel Module
class AdminPanel {
  constructor() {
    this.currentTab = "events";
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async guardAdminAccess() {
    const isAdmin = await authManager.checkAdminStatus(true);
    if (!isAdmin) {
      authManager.showAlert("Diese Seite ist nur für Admins verfügbar.", "error");
      setTimeout(() => {
        window.location.href = "index.html";
      }, 1000);
      return false;
    }

    return true;
  }

  // Switch Tab
  switchTab(tabName) {
    this.currentTab = tabName;

    // Update button states
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (tabButton) {
      tabButton.classList.add("active");
    }

    // Update content visibility
    document.querySelectorAll(".tab-content").forEach((content) => {
      content.classList.remove("active");
    });
    const tabContent = document.getElementById(`${tabName}-tab`);
    if (tabContent) {
      tabContent.classList.add("active");
    }

    // Load tab content
    if (tabName === "events") this.loadEventsList();
    else if (tabName === "bookings") this.loadBookingsList();
    else if (tabName === "settings") this.loadSettings();
  }

  // Load Events List
  async loadEventsList() {
    const container = document.getElementById("events-list");
    if (!container) return;

    if (!(await this.guardAdminAccess())) {
      return;
    }

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
      const title = this.escapeHtml(event.title);

      html += `
        <tr>
          <td><strong>${title}</strong></td>
          <td>${date}</td>
          <td>${event.capacity}</td>
          <td>${booked}</td>
          <td>${available}</td>
          <td>
            <button class="btn btn-warning btn-small" onclick="adminPanel.editEventModal('${event.id}')">Bearbeiten</button>
            <button class="btn btn-danger btn-small" onclick="adminPanel.handleDeleteEvent('${event.id}')">Löschen</button>
          </td>
        </tr>
      `;
    }

    html += "</tbody></table></div>";
    container.innerHTML = html;
  }

  async handleDeleteEvent(eventId) {
    const success = await eventsManager.deleteEvent(eventId);
    if (success) {
      await this.loadEventsList();
    }
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
    const safeTitle = this.escapeHtml(event.title);
    const safeDescription = this.escapeHtml(event.description);
    const safeTime = this.escapeHtml(event.time);
    const safeLocation = this.escapeHtml(event.location || "");

    modalContent.innerHTML = `
      <div class="form-group">
        <label>Veranstaltungstitel *</label>
        <input type="text" id="event-title" value="${safeTitle}" required />
      </div>
      <div class="form-group">
        <label>Beschreibung *</label>
        <textarea id="event-description" rows="4" required>${safeDescription}</textarea>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label>Datum *</label>
          <input type="date" id="event-date" value="${dateStr}" required />
        </div>
        <div class="form-group">
          <label>Uhrzeit *</label>
          <input type="time" id="event-time" value="${safeTime}" required />
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        <div class="form-group">
          <label>Kapazität (Plätze) *</label>
          <input type="number" id="event-capacity" value="${event.capacity}" min="1" required />
        </div>
        <div class="form-group">
          <label>Ort</label>
          <input type="text" id="event-location" value="${safeLocation}" />
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
    if (!(await this.guardAdminAccess())) {
      return;
    }

    const eventData = {
      title: document.getElementById("event-title").value.trim(),
      description: document.getElementById("event-description").value.trim(),
      date: document.getElementById("event-date").value,
      time: document.getElementById("event-time").value,
      capacity: document.getElementById("event-capacity").value,
      location: document.getElementById("event-location").value.trim()
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
    const modal = document.getElementById("event-modal");
    if (modal) {
      modal.classList.remove("active");
    }
  }

  // Load Bookings List
  async loadBookingsList() {
    const container = document.getElementById("bookings-list");
    if (!container) return;

    if (!(await this.guardAdminAccess())) {
      return;
    }

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
      const eventName = this.escapeHtml(event ? event.title : "Gelöschtes Event");
      const date = booking.createdAt?.toDate ? booking.createdAt.toDate().toLocaleDateString("de-DE") : "N/A";
      const checkedInBadge = booking.checkedIn ? "✓ Eingecheckt" : "Ausstehend";
      const ticket = this.escapeHtml(booking.ticketNumber || "-");
      const userName = this.escapeHtml(booking.userName || "-");
      const userEmail = this.escapeHtml(booking.userEmail || "-");

      html += `
        <tr>
          <td><code style="font-size: 0.8rem;">${ticket}</code></td>
          <td>${userName}</td>
          <td>${userEmail}</td>
          <td>${eventName}</td>
          <td>${date}</td>
          <td>${checkedInBadge}</td>
          <td>
            ${!booking.checkedIn ? `<button class="btn btn-success btn-small" onclick="adminPanel.checkInBooking('${booking.id}')">Einchecken</button>` : ""}
            <button class="btn btn-danger btn-small" onclick="adminPanel.handleCancelBooking('${booking.id}')">Stornieren</button>
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

  async handleCancelBooking(bookingId) {
    const success = await bookingManager.cancelBooking(bookingId);
    if (success) {
      await this.loadBookingsList();
    }
  }

  // Check In Booking
  async checkInBooking(bookingId) {
    const success = await bookingManager.checkInBooking(bookingId);
    if (success) {
      await this.loadBookingsList();
    }
  }

  // Load Settings
  async loadSettings() {
    const container = document.getElementById("settings-tab");
    if (!container) return;

    if (!(await this.guardAdminAccess())) {
      return;
    }

    const publicConfig = await bookingManager.getPublicConfig();
    const supportEmail = this.escapeHtml(publicConfig?.supportEmail || authManager.currentUser?.email || "");
    const mailFromName = this.escapeHtml(publicConfig?.mailFromName || "Chor Konzert Team");
    const emailjsServiceId = this.escapeHtml(publicConfig?.emailjsServiceId || "");
    const emailjsTemplateId = this.escapeHtml(publicConfig?.emailjsTemplateId || "");
    const emailjsPublicKey = this.escapeHtml(publicConfig?.emailjsPublicKey || "");
    const defaultTestEmail = this.escapeHtml(authManager.currentUser?.email || "");

    container.innerHTML = `
      <div class="card">
        <h3>Öffentliche App-Konfiguration</h3>
        <p style="color: #6b7280; margin-bottom: 1.5rem;">Diese Werte sind für die UI sichtbar und enthalten keine Secrets.</p>

        <div class="form-group">
          <label>Support-Email-Adresse *</label>
          <input type="email" id="support-email" value="${supportEmail}" placeholder="kontakt@example.com" required />
          <small>Diese Adresse wird in Buchungsbestätigungen als Kontakt angezeigt.</small>
        </div>

        <div class="form-group">
          <label>Absender-Name *</label>
          <input type="text" id="mail-from-name" value="${mailFromName}" placeholder="Chor Konzert Team" required />
          <small>Name, der in der Bestätigungsmail als Absender erscheint.</small>
        </div>

        <div class="form-group">
          <button class="btn btn-primary" onclick="adminPanel.saveSettings()">Einstellungen speichern</button>
        </div>

        <h3>EmailJS (Clientseitige Mail)</h3>
        <p style="color: #6b7280; margin-bottom: 1rem;">Lege Service ID, Template ID und Public Key aus EmailJS hier ab. Das sind oeffentliche Werte und duerfen clientseitig verwendet werden.</p>

        <div class="form-group">
          <label>EmailJS Service ID *</label>
          <input type="text" id="emailjs-service-id" value="${emailjsServiceId}" placeholder="service_xxxxxxx" />
        </div>

        <div class="form-group">
          <label>EmailJS Template ID *</label>
          <input type="text" id="emailjs-template-id" value="${emailjsTemplateId}" placeholder="template_xxxxxxx" />
        </div>

        <div class="form-group">
          <label>EmailJS Public Key *</label>
          <input type="text" id="emailjs-public-key" value="${emailjsPublicKey}" placeholder="xxxxxxxxxxxxxxx" />
        </div>

        <hr style="margin: 2rem 0; border: none; border-top: 1px solid #e5e7eb;">

        <h3>Mail-System testen</h3>
        <div class="form-group">
          <label>Test-Email-Adresse</label>
          <input type="email" id="test-email" value="${defaultTestEmail}" placeholder="test@example.com" />
        </div>
        <button class="btn btn-outline" onclick="adminPanel.sendTestEmail()">Testmail senden</button>

        <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 1rem; border-radius: 8px; margin-top: 1rem;">
          <p style="margin: 0; color: #7f1d1d; font-size: 0.9rem;">
            <strong>Hinweis:</strong> Diese Variante versendet Mails direkt aus dem Browser ueber EmailJS. Das ist einfach, aber weniger sicher als serverseitige Functions.
          </p>
        </div>
      </div>
    `;
  }

  // Save Settings
  async saveSettings() {
    if (!(await this.guardAdminAccess())) {
      return;
    }

    const supportEmail = document.getElementById("support-email").value.trim();
    const mailFromName = document.getElementById("mail-from-name").value.trim();
    const emailjsServiceId = document.getElementById("emailjs-service-id").value.trim();
    const emailjsTemplateId = document.getElementById("emailjs-template-id").value.trim();
    const emailjsPublicKey = document.getElementById("emailjs-public-key").value.trim();

    if (!supportEmail || !mailFromName) {
      authManager.showAlert("Bitte alle Pflichtfelder ausfüllen.", "error");
      return;
    }

    try {
      await db.collection("appConfig").doc("public").set({
        supportEmail,
        mailFromName,
        emailjsServiceId,
        emailjsTemplateId,
        emailjsPublicKey,
        updatedAt: new Date(),
        updatedBy: authManager.currentUser?.uid || null
      }, { merge: true });

      await bookingManager.getPublicConfig(true);
      authManager.showAlert("Einstellungen gespeichert!", "success");
      this.loadSettings();
    } catch (error) {
      console.error("Error saving settings:", error);
      authManager.showAlert("Fehler beim Speichern. " + error.message, "error");
    }
  }

  async sendTestEmail() {
    if (!(await this.guardAdminAccess())) {
      return;
    }

    const testInput = document.getElementById("test-email");
    const testEmail = (testInput?.value || authManager.currentUser?.email || "").trim();

    if (!testEmail) {
      authManager.showAlert("Bitte eine Test-Email angeben.", "error");
      return;
    }

    try {
      const result = await bookingManager.sendTestEmail(testEmail);
      if (!result?.sent) {
        authManager.showAlert("EmailJS ist noch nicht konfiguriert. Bitte Service/Template/Public Key speichern.", "warning");
        return;
      }
      authManager.showAlert("Testmail wurde versendet.", "success");
    } catch (error) {
      console.error("Error sending test email:", error);
      authManager.showAlert("Testmail fehlgeschlagen: " + (error.message || "Unbekannter Fehler"), "error");
    }
  }
}

// Initialize Admin Panel
const adminPanel = new AdminPanel();
