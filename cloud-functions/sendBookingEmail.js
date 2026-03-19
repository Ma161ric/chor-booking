// Cloud Function: Send Booking Email
// Deploy mit: firebase deploy --only functions:sendBookingEmail

const functions = require("firebase-functions");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendBookingEmail = functions.firestore
  .document("bookings/{bookingId}")
  .onCreate(async (snap, context) => {
    const booking = snap.data();
    const bookingId = context.params.bookingId;

    try {
      // Get admin config
      const adminDoc = await admin.firestore().collection("admin").doc("config").get();
      if (!adminDoc.exists) {
        console.error("Admin config not found");
        return;
      }

      const adminConfig = adminDoc.data();
      const senderEmail = adminConfig.senderEmail;
      const senderPassword = adminConfig.senderPassword;

      // Get event details
      const eventDoc = await admin.firestore().collection("events").doc(booking.eventId).get();
      const event = eventDoc.data();

      // Configure email transportation
      const transporter = nodemailer.createTransport({
        service: "gmail", // Or use custom SMTP
        auth: {
          user: senderEmail,
          pass: senderPassword
        }
      });

      // Email template
      const emailHtml = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; background: #f9fafb; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; }
              h1 { color: #6366f1; }
              .event-details { background: #f0fdf4; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
              .ticket-box { background: #fef2f2; padding: 1rem; border-left: 4px solid #ef4444; margin: 1rem 0; }
              .qr-code { text-align: center; margin: 2rem 0; }
              .qr-code img { max-width: 300px; border: 2px solid #ddd; padding: 1rem; }
              .footer { text-align: center; color: #6b7280; font-size: 0.9rem; margin-top: 2rem; border-top: 1px solid #e5e7eb; padding-top: 1rem; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🎵 Booking Confirmation</h1>
              <p>Hallo ${booking.userName},</p>
              <p>dein Ticket wurde erfolgreich gebucht! Hier sind deine Buchungsdetails:</p>

              <div class="event-details">
                <h3 style="margin-top: 0;">${event.title}</h3>
                <p><strong>Datum:</strong> ${event.date.toDate().toLocaleDateString("de-DE")}</p>
                <p><strong>Uhrzeit:</strong> ${event.time}</p>
                <p><strong>Ort:</strong> ${event.location}</p>
              </div>

              <div class="ticket-box">
                <h3 style="margin-top: 0;">Deine Ticketnummer:</h3>
                <p style="font-family: monospace; font-size: 1.2rem; letter-spacing: 2px; margin: 0;">${booking.ticketNumber}</p>
              </div>

              <div class="qr-code">
                <p><strong>QR-Code - Zeige diesen Code beim Event vor:</strong></p>
                <img src="${booking.qrCodeUrl}" alt="QR Code" />
              </div>

              <p>Bitte speichere diese Email oder den QR-Code. Du benötigst ihn beim Einchecken am Event.</p>

              <div class="footer">
                <p>Fragen? Kontaktiere uns: <a href="mailto:${senderEmail}">${senderEmail}</a></p>
                <p>Wir freuen uns auf dich! 🎶</p>
              </div>
            </div>
          </body>
        </html>
      `;

      // Send email
      await transporter.sendMail({
        from: senderEmail,
        to: booking.userEmail,
        subject: `Bestätigung: ${event.title} - Ticketnummer ${booking.ticketNumber}`,
        html: emailHtml
      });

      console.log(`Email sent successfully to ${booking.userEmail}`);
      return { success: true, email: booking.userEmail };
    } catch (error) {
      console.error("Error sending email:", error);
      // Don't throw - we don't want the function to fail
      return { success: false, error: error.message };
    }
  });

// Alternative: Callable Function (for testing)
exports.sendTestEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Not authenticated");
  }

  try {
    const adminDoc = await admin.firestore().collection("admin").doc("config").get();
    if (!adminDoc.exists) {
      throw new Error("Admin config not found");
    }

    const adminConfig = adminDoc.data();
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: adminConfig.senderEmail,
        pass: adminConfig.senderPassword
      }
    });

    await transporter.sendMail({
      from: adminConfig.senderEmail,
      to: data.testEmail,
      subject: "Test Email - Chor-Konzert Buchungssystem",
      html: "<h1>🧪 Test Email</h1><p>Wenn du diese Email siehst, funktioniert das Email-System!</p>"
    });

    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError("internal", error.message);
  }
});
