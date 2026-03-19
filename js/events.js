// Events Management Module
class EventsManager {
  constructor() {
    this.events = [];
    this.loadEvents();
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  escapeForSingleQuotedJs(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\r?\n/g, " ");
  }

  // Load Events from Firestore
  async loadEvents() {
    try {
      const snapshot = await db.collection("events").orderBy("date", "asc").get();
      this.events = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        this.events.push({
          id: doc.id,
          ...data,
          capacity: Number.parseInt(data.capacity, 10) || 0,
          bookingCount: Number.parseInt(data.bookingCount, 10) || 0
        });
      });
      return this.events;
    } catch (error) {
      console.error("Error loading events:", error);
      return [];
    }
  }

  // Create New Event (Admin Only)
  async createEvent(eventData) {
    if (!(await authManager.ensureAdmin())) {
      return null;
    }

    try {
      const capacity = Number.parseInt(eventData.capacity, 10);
      if (!eventData.title || !eventData.description || !eventData.date || !eventData.time || !Number.isInteger(capacity) || capacity < 1) {
        authManager.showAlert("Bitte alle Pflichtfelder korrekt ausfüllen.", "error");
        return null;
      }

      const newEvent = {
        title: eventData.title.trim(),
        description: eventData.description.trim(),
        date: new Date(eventData.date),
        time: eventData.time.trim(),
        capacity,
        location: (eventData.location || "").trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
        bookingCount: 0
      };

      const docRef = await db.collection("events").add(newEvent);
      authManager.showAlert("Event erfolgreich erstellt!", "success");
      await this.loadEvents();
      return docRef.id;
    } catch (error) {
      console.error("Error creating event:", error);
      authManager.showAlert("Fehler beim Erstellen des Events: " + (error.message || "Unbekannter Fehler"), "error");
      return null;
    }
  }

  // Update Event (Admin Only)
  async updateEvent(eventId, eventData) {
    if (!(await authManager.ensureAdmin())) {
      return false;
    }

    try {
      const eventDoc = await db.collection("events").doc(eventId).get();
      if (!eventDoc.exists) {
        authManager.showAlert("Event nicht gefunden oder bereits gelöscht.", "error");
        return false;
      }

      const existingEvent = eventDoc.data();
      const existingBookings = Number.parseInt(existingEvent.bookingCount, 10) || 0;
      const capacity = Number.parseInt(eventData.capacity, 10);

      if (!Number.isInteger(capacity) || capacity < existingBookings) {
        authManager.showAlert(`Kapazität muss mindestens ${existingBookings} sein.`, "error");
        return false;
      }

      const updatedEvent = {
        title: eventData.title.trim(),
        description: eventData.description.trim(),
        date: new Date(eventData.date),
        time: eventData.time.trim(),
        capacity,
        location: (eventData.location || "").trim(),
        bookingCount: existingBookings,
        updatedAt: new Date()
      };

      await db.collection("events").doc(eventId).update(updatedEvent);
      authManager.showAlert("Event erfolgreich aktualisiert!", "success");
      await this.loadEvents();
      return true;
    } catch (error) {
      console.error("Error updating event:", error);
      authManager.showAlert("Fehler beim Aktualisieren des Events: " + (error.message || "Unbekannter Fehler"), "error");
      return false;
    }
  }

  // Delete Event (Admin Only)
  async deleteEvent(eventId) {
    if (!(await authManager.ensureAdmin())) {
      return false;
    }

    if (!confirm("Möchtest du dieses Event wirklich löschen? Alle Buchungen werden ebenfalls gelöscht.")) {
      return false;
    }

    try {
      // Delete all bookings for this event
      const bookingsSnapshot = await db.collection("bookings")
        .where("eventId", "==", eventId)
        .get();

      const docs = bookingsSnapshot.docs;
      while (docs.length > 0) {
        const chunk = docs.splice(0, 400);
        const batch = db.batch();
        chunk.forEach((doc) => batch.delete(doc.ref));
        if (docs.length === 0) {
          batch.delete(db.collection("events").doc(eventId));
        }
        await batch.commit();
      }

      if (bookingsSnapshot.empty) {
        await db.collection("events").doc(eventId).delete();
      }

      authManager.showAlert("Event und alle Buchungen gelöscht!", "success");
      await this.loadEvents();
      return true;
    } catch (error) {
      console.error("Error deleting event:", error);
      authManager.showAlert("Fehler beim Löschen des Events: " + (error.message || "Unbekannter Fehler"), "error");
      return false;
    }
  }

  // Get Available Tickets for Event
  async getAvailableTickets(eventId) {
    try {
      const eventDoc = await db.collection("events").doc(eventId).get();
      if (!eventDoc.exists) return 0;

      const event = eventDoc.data();
      const capacity = Number.parseInt(event.capacity, 10) || 0;
      const booked = Number.parseInt(event.bookingCount, 10) || 0;
      return Math.max(0, capacity - booked);
    } catch (error) {
      console.error("Error getting available tickets:", error);
      return 0;
    }
  }

  // Format Date for Display
  formatDate(date) {
    if (!(date instanceof Date)) {
      date = date.toDate ? date.toDate() : new Date(date);
    }
    return date.toLocaleDateString("de-DE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  // Display Events in Grid
  async displayEvents(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    await this.loadEvents();

    if (this.events.length === 0) {
      container.innerHTML = "<p>Keine Events verfügbar.</p>";
      return;
    }

    container.innerHTML = this.events.map((event) => {
      const title = this.escapeHtml(event.title);
      const titleForJs = this.escapeForSingleQuotedJs(event.title);
      const description = this.escapeHtml(event.description);
      const location = this.escapeHtml(event.location || "N/A");
      const date = this.escapeHtml(this.formatDate(event.date));
      const time = this.escapeHtml(event.time || "N/A");

      return `
      <div class="event-card">
        <h3>${title}</h3>
        <div class="event-details">
          <div class="event-detail-row">
            <strong>Datum:</strong>
            <span>${date}</span>
          </div>
          <div class="event-detail-row">
            <strong>Uhrzeit:</strong>
            <span>${time}</span>
          </div>
          <div class="event-detail-row">
            <strong>Ort:</strong>
            <span>${location}</span>
          </div>
          <div class="event-detail-row">
            <strong>Kapazität:</strong>
            <span>${event.capacity} Plätze</span>
          </div>
        </div>
        <p>${description}</p>
        <div id="available-${event.id}" class="available-tickets">
          Verfügbare Tickets werden geladen...
        </div>
        <button id="book-btn-${event.id}" class="btn btn-primary btn-block" onclick="bookingManager.openBookingModal('${event.id}', '${titleForJs}')">
          Ticket buchen
        </button>
      </div>
    `;
    }).join("");

    // Load available tickets for each event
    for (const event of this.events) {
      const available = await this.getAvailableTickets(event.id);
      const ticketDiv = document.getElementById(`available-${event.id}`);
      const bookBtn = document.getElementById(`book-btn-${event.id}`);
      if (ticketDiv) {
        let ticketClass = "available-tickets";
        if (available === 0) ticketClass += " full";
        else if (available < 5) ticketClass += " low";
        ticketDiv.className = ticketClass;
        ticketDiv.textContent = available === 0
          ? "⚠️ Ausverkauft"
          : `✓ ${available} Tickets verfügbar`;
      }

      if (bookBtn && available <= 0) {
        bookBtn.disabled = true;
        bookBtn.textContent = "Ausverkauft";
      }
    }
  }

  // Get Event by ID
  async getEventById(eventId) {
    try {
      const doc = await db.collection("events").doc(eventId).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    } catch (error) {
      console.error("Error getting event by ID:", error);
      return null;
    }
  }
}

// Initialize Events Manager
const eventsManager = new EventsManager();
