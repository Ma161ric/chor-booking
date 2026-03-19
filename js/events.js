// Events Management Module
class EventsManager {
  constructor() {
    this.events = [];
    this.loadEvents();
  }

  // Load Events from Firestore
  async loadEvents() {
    try {
      const snapshot = await db.collection("events").orderBy("date", "asc").get();
      this.events = [];
      snapshot.forEach((doc) => {
        this.events.push({ id: doc.id, ...doc.data() });
      });
      return this.events;
    } catch (error) {
      console.error("Error loading events:", error);
      return [];
    }
  }

  // Create New Event (Admin Only)
  async createEvent(eventData) {
    if (!authManager.isAdmin) {
      authManager.showAlert("Nur Admins können Events erstellen.", "error");
      return null;
    }

    try {
      const newEvent = {
        title: eventData.title,
        description: eventData.description,
        date: new Date(eventData.date),
        time: eventData.time,
        capacity: parseInt(eventData.capacity),
        location: eventData.location || "",
        createdAt: new Date(),
        bookingCount: 0
      };

      const docRef = await db.collection("events").add(newEvent);
      authManager.showAlert("Event erfolgreich erstellt!", "success");
      this.loadEvents();
      return docRef.id;
    } catch (error) {
      console.error("Error creating event:", error);
      authManager.showAlert("Fehler beim Erstellen des Events.", "error");
      return null;
    }
  }

  // Update Event (Admin Only)
  async updateEvent(eventId, eventData) {
    if (!authManager.isAdmin) {
      authManager.showAlert("Nur Admins können Events bearbeiten.", "error");
      return false;
    }

    try {
      const updatedEvent = {
        title: eventData.title,
        description: eventData.description,
        date: new Date(eventData.date),
        time: eventData.time,
        capacity: parseInt(eventData.capacity),
        location: eventData.location || "",
        updatedAt: new Date()
      };

      await db.collection("events").doc(eventId).update(updatedEvent);
      authManager.showAlert("Event erfolgreich aktualisiert!", "success");
      this.loadEvents();
      return true;
    } catch (error) {
      console.error("Error updating event:", error);
      authManager.showAlert("Fehler beim Aktualisieren des Events.", "error");
      return false;
    }
  }

  // Delete Event (Admin Only)
  async deleteEvent(eventId) {
    if (!authManager.isAdmin) {
      authManager.showAlert("Nur Admins können Events löschen.", "error");
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

      const batch = db.batch();
      bookingsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });

      // Delete event
      batch.delete(db.collection("events").doc(eventId));
      await batch.commit();

      authManager.showAlert("Event und alle Buchungen gelöscht!", "success");
      this.loadEvents();
      return true;
    } catch (error) {
      console.error("Error deleting event:", error);
      authManager.showAlert("Fehler beim Löschen des Events.", "error");
      return false;
    }
  }

  // Get Available Tickets for Event
  async getAvailableTickets(eventId) {
    try {
      const eventDoc = await db.collection("events").doc(eventId).get();
      if (!eventDoc.exists) return 0;

      const capacity = eventDoc.data().capacity;
      const bookingsSnapshot = await db.collection("bookings")
        .where("eventId", "==", eventId)
        .where("status", "==", "confirmed")
        .get();

      const booked = bookingsSnapshot.size;
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

    container.innerHTML = this.events.map((event) => `
      <div class="event-card">
        <h3>${event.title}</h3>
        <div class="event-details">
          <div class="event-detail-row">
            <strong>Datum:</strong>
            <span>${this.formatDate(event.date)}</span>
          </div>
          <div class="event-detail-row">
            <strong>Uhrzeit:</strong>
            <span>${event.time || "N/A"}</span>
          </div>
          <div class="event-detail-row">
            <strong>Ort:</strong>
            <span>${event.location || "N/A"}</span>
          </div>
          <div class="event-detail-row">
            <strong>Kapazität:</strong>
            <span>${event.capacity} Plätze</span>
          </div>
        </div>
        <p>${event.description}</p>
        <div id="available-${event.id}" class="available-tickets">
          Verfügbare Tickets werden geladen...
        </div>
        <button class="btn btn-primary btn-block" onclick="bookingManager.openBookingModal('${event.id}', '${event.title}')">
          Ticket buchen
        </button>
      </div>
    `).join("");

    // Load available tickets for each event
    for (const event of this.events) {
      const available = await this.getAvailableTickets(event.id);
      const ticketDiv = document.getElementById(`available-${event.id}`);
      if (ticketDiv) {
        let ticketClass = "available-tickets";
        if (available === 0) ticketClass += " full";
        else if (available < 5) ticketClass += " low";
        ticketDiv.className = ticketClass;
        ticketDiv.textContent = available === 0
          ? "⚠️ Ausverkauft"
          : `✓ ${available} Tickets verfügbar`;
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
