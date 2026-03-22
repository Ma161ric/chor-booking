const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

if (!admin.apps.length) {
	admin.initializeApp();
}

const logger = functions.logger;
const REGION = "europe-west1";
const BOOKING_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_BOOKING_ATTEMPTS_PER_WINDOW = 6;
const CANCELLATION_WINDOW_HOURS = 24;

function readSecret(name, fallback = "") {
	const value = process.env[name];
	if (typeof value !== "string") {
		return fallback;
	}

	return value.trim();
}

function escapeHtml(value) {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function formatEventDate(rawDate) {
	if (!rawDate) {
		return "wird noch bekanntgegeben";
	}

	const date = rawDate.toDate ? rawDate.toDate() : new Date(rawDate);
	if (Number.isNaN(date.getTime())) {
		return "wird noch bekanntgegeben";
	}

	return new Intl.DateTimeFormat("de-DE", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric"
	}).format(date);
}

function parseAdminAllowList() {
	const csv = readSecret("ADMIN_EMAILS", "");
	return new Set(
		csv
			.split(",")
			.map((entry) => entry.trim().toLowerCase())
			.filter(Boolean)
	);
}

function toMillis(value) {
	if (!value) {
		return null;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? null : parsed;
	}

	if (typeof value.toMillis === "function") {
		const millis = value.toMillis();
		return Number.isFinite(millis) ? millis : null;
	}

	if (value instanceof Date) {
		const millis = value.getTime();
		return Number.isFinite(millis) ? millis : null;
	}

	return null;
}

function normalizeName(rawName, fallbackEmail) {
	const value = String(rawName || fallbackEmail || "Gast").trim();
	if (!value) {
		return "Gast";
	}

	return value.slice(0, 120);
}

function generateTicketNumber() {
	const timestamp = Date.now().toString(36).toUpperCase();
	const random = Math.random().toString(36).slice(2, 8).toUpperCase();
	return `${timestamp}-${random}`;
}

function generateQrCodeUrl(ticketNumber) {
	return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(ticketNumber)}`;
}

function createHttpsError(code, message) {
	return new functions.https.HttpsError(code, message);
}

function isAllowedAdminEmail(email) {
	if (!email) {
		return false;
	}

	const allowList = parseAdminAllowList();
	return allowList.has(String(email).toLowerCase());
}

async function syncAdminClaim(uid, email) {
	const shouldBeAdmin = isAllowedAdminEmail(email);
	const user = await admin.auth().getUser(uid);
	const currentClaims = user.customClaims || {};

	if (currentClaims.admin === shouldBeAdmin) {
		return { updated: false, admin: shouldBeAdmin };
	}

	await admin.auth().setCustomUserClaims(uid, {
		...currentClaims,
		admin: shouldBeAdmin
	});

	return { updated: true, admin: shouldBeAdmin };
}

function createTransporter() {
	const host = readSecret("MAIL_HOST");
	const port = Number.parseInt(readSecret("MAIL_PORT", "587"), 10);
	const secure = readSecret("MAIL_SECURE", "false") === "true";
	const user = readSecret("MAIL_USER");
	const pass = readSecret("MAIL_PASSWORD");

	if (!host || !user || !pass || Number.isNaN(port)) {
		throw new Error("Mail configuration incomplete. Required secrets: MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASSWORD.");
	}

	return nodemailer.createTransport({
		host,
		port,
		secure,
		auth: {
			user,
			pass
		}
	});
}

exports.syncAdminClaimOnCreate = functions
	.region(REGION)
	.runWith({
		secrets: ["ADMIN_EMAILS"]
	})
	.auth.user()
	.onCreate(async (user) => {
		try {
			const result = await syncAdminClaim(user.uid, user.email || "");
			logger.info("Admin claim sync on create completed", {
				uid: user.uid,
				updated: result.updated,
				admin: result.admin
			});
		} catch (error) {
			logger.error("Admin claim sync on create failed", {
				uid: user.uid,
				message: error.message
			});
		}
	});

exports.bootstrapAdminRole = functions
	.region(REGION)
	.runWith({
		secrets: ["ADMIN_EMAILS"]
	})
	.https.onCall(async (_data, context) => {
		if (!context.auth || !context.auth.token.email) {
			throw new functions.https.HttpsError("unauthenticated", "Authentifizierung erforderlich.");
		}

		const email = String(context.auth.token.email).toLowerCase();
		if (!isAllowedAdminEmail(email)) {
			throw new functions.https.HttpsError(
				"permission-denied",
				"Diese Email ist nicht in der Admin-Allowlist hinterlegt."
			);
		}

		const result = await syncAdminClaim(context.auth.uid, email);
		logger.info("Admin bootstrap completed", {
			uid: context.auth.uid,
			updated: result.updated,
			admin: result.admin
		});

		return {
			success: true,
			updated: result.updated,
			admin: result.admin
		};
	});

exports.createBooking = functions
	.region(REGION)
	.https.onCall(async (data, context) => {
		if (!context.auth || !context.auth.uid || !context.auth.token.email) {
			throw createHttpsError("unauthenticated", "AUTH_REQUIRED");
		}

		const eventId = String(data?.eventId || "").trim();
		if (!eventId) {
			throw createHttpsError("invalid-argument", "EVENT_ID_REQUIRED");
		}

		const uid = context.auth.uid;
		const userEmail = String(context.auth.token.email || "").trim();
		const userName = normalizeName(data?.userName, userEmail);
		const now = admin.firestore.Timestamp.now();
		const nowMs = Date.now();

		const db = admin.firestore();
		const eventRef = db.collection("events").doc(eventId);
		const bookingRef = db.collection("bookings").doc();
		const userRef = db.collection("users").doc(uid);
		const rateLimitRef = db.collection("bookingRateLimits").doc(uid);

		try {
			const attemptCount = await db.runTransaction(async (transaction) => {
				const rateLimitDoc = await transaction.get(rateLimitRef);
				const attemptsRaw = rateLimitDoc.exists && Array.isArray(rateLimitDoc.data()?.attempts)
					? rateLimitDoc.data().attempts
					: [];
				const attemptsRecent = attemptsRaw
					.map((entry) => toMillis(entry))
					.filter((millis) => millis !== null && nowMs - millis <= BOOKING_ATTEMPT_WINDOW_MS);

				attemptsRecent.push(nowMs);
				transaction.set(rateLimitRef, {
					uid,
					attempts: attemptsRecent,
					updatedAt: now
				}, { merge: true });

				return attemptsRecent.length;
			});

			if (attemptCount > MAX_BOOKING_ATTEMPTS_PER_WINDOW) {
				throw createHttpsError("resource-exhausted", "RATE_LIMIT_EXCEEDED");
			}

			const booking = await db.runTransaction(async (transaction) => {
				const [eventDoc, userDoc] = await Promise.all([
					transaction.get(eventRef),
					transaction.get(userRef)
				]);

				if (!eventDoc.exists) {
					throw createHttpsError("not-found", "EVENT_NOT_FOUND");
				}

				const eventData = eventDoc.data() || {};
				const capacity = Number.parseInt(eventData.capacity, 10) || 0;
				const bookingCount = Number.parseInt(eventData.bookingCount, 10) || 0;

				if (capacity < 1) {
					throw createHttpsError("failed-precondition", "EVENT_INVALID_CAPACITY");
				}

				if (bookingCount >= capacity) {
					throw createHttpsError("failed-precondition", "EVENT_SOLD_OUT");
				}

				const ticketNumber = generateTicketNumber();
				const cancellationDeadlineMs = nowMs + (CANCELLATION_WINDOW_HOURS * 60 * 60 * 1000);
				const bookingPayload = {
					eventId,
					userId: uid,
					userEmail,
					userName,
					ticketNumber,
					qrCodeUrl: generateQrCodeUrl(ticketNumber),
					status: "confirmed",
					createdAt: now,
					checkedIn: false,
					checkedInAt: null,
					emailStatus: "pending",
					cancellationDeadline: admin.firestore.Timestamp.fromMillis(cancellationDeadlineMs)
				};

				transaction.set(bookingRef, bookingPayload);
				transaction.update(eventRef, {
					bookingCount: bookingCount + 1,
					updatedAt: now
				});

				if (userDoc.exists) {
					transaction.update(userRef, {
						bookings: admin.firestore.FieldValue.arrayUnion(bookingRef.id),
						updatedAt: now
					});
				} else {
					transaction.set(userRef, {
						uid,
						email: userEmail,
						name: userName,
						role: "user",
						createdAt: now,
						updatedAt: now,
						bookings: [bookingRef.id]
					}, { merge: true });
				}

				return {
					id: bookingRef.id,
					...bookingPayload,
					eventTitle: eventData.title || "Event",
					eventDate: eventData.date || null,
					eventTime: eventData.time || "",
					eventLocation: eventData.location || ""
				};
			});

			return {
				success: true,
				booking
			};
		} catch (error) {
			if (error instanceof functions.https.HttpsError) {
				throw error;
			}

			logger.error("createBooking failed", {
				uid,
				eventId,
				message: error.message
			});

			throw createHttpsError("internal", "BOOKING_CREATE_FAILED");
		}
	});

exports.cancelBooking = functions
	.region(REGION)
	.https.onCall(async (data, context) => {
		if (!context.auth || !context.auth.uid) {
			throw createHttpsError("unauthenticated", "AUTH_REQUIRED");
		}

		const bookingId = String(data?.bookingId || "").trim();
		if (!bookingId) {
			throw createHttpsError("invalid-argument", "BOOKING_ID_REQUIRED");
		}

		const uid = context.auth.uid;
		const isAdmin = context.auth.token.admin === true;
		const nowMs = Date.now();
		const now = admin.firestore.Timestamp.now();

		const db = admin.firestore();
		const bookingRef = db.collection("bookings").doc(bookingId);

		try {
			await db.runTransaction(async (transaction) => {
				const bookingDoc = await transaction.get(bookingRef);
				if (!bookingDoc.exists) {
					throw createHttpsError("not-found", "BOOKING_NOT_FOUND");
				}

				const booking = bookingDoc.data() || {};
				if (!isAdmin && booking.userId !== uid) {
					throw createHttpsError("permission-denied", "BOOKING_FORBIDDEN");
				}

				if (!isAdmin) {
					const deadlineSource = booking.cancellationDeadline || booking.createdAt;
					const deadlineMsRaw = toMillis(deadlineSource);
					const deadlineMs = deadlineMsRaw === null
						? null
						: deadlineSource === booking.createdAt
							? deadlineMsRaw + (CANCELLATION_WINDOW_HOURS * 60 * 60 * 1000)
							: deadlineMsRaw;

					if (deadlineMs !== null && nowMs > deadlineMs) {
						throw createHttpsError("failed-precondition", "CANCELLATION_WINDOW_EXPIRED");
					}
				}

				const eventId = String(booking.eventId || "").trim();
				const bookingOwnerId = String(booking.userId || "").trim();
				const eventRef = eventId ? db.collection("events").doc(eventId) : null;
				const userRef = bookingOwnerId ? db.collection("users").doc(bookingOwnerId) : null;

				const [eventDoc, userDoc] = await Promise.all([
					eventRef ? transaction.get(eventRef) : Promise.resolve(null),
					userRef ? transaction.get(userRef) : Promise.resolve(null)
				]);

				if (eventRef && eventDoc && eventDoc.exists) {
					const eventData = eventDoc.data() || {};
					const currentCount = Number.parseInt(eventData.bookingCount, 10) || 0;
					transaction.update(eventRef, {
						bookingCount: Math.max(0, currentCount - 1),
						updatedAt: now
					});
				}

				if (userRef && userDoc && userDoc.exists) {
					transaction.update(userRef, {
						bookings: admin.firestore.FieldValue.arrayRemove(bookingId),
						updatedAt: now
					});
				}

				transaction.delete(bookingRef);
			});

			return { success: true };
		} catch (error) {
			if (error instanceof functions.https.HttpsError) {
				throw error;
			}

			logger.error("cancelBooking failed", {
				uid,
				bookingId,
				message: error.message
			});

			throw createHttpsError("internal", "BOOKING_CANCEL_FAILED");
		}
	});

exports.sendBookingEmail = functions
	.region(REGION)
	.runWith({
		timeoutSeconds: 60,
		memory: "256MB",
		secrets: ["MAIL_HOST", "MAIL_PORT", "MAIL_SECURE", "MAIL_USER", "MAIL_PASSWORD", "MAIL_FROM"]
	})
	.firestore.document("bookings/{bookingId}")
	.onCreate(async (snap, context) => {
		const booking = snap.data();
		const bookingRef = snap.ref;
		const bookingId = context.params.bookingId;

		try {
			if (!booking || !booking.userEmail || !booking.eventId) {
				throw new Error("Booking data incomplete.");
			}

			const eventDoc = await admin.firestore().collection("events").doc(booking.eventId).get();
			if (!eventDoc.exists) {
				throw new Error("Event for booking not found.");
			}

			const event = eventDoc.data();
			const appConfigDoc = await admin.firestore().collection("appConfig").doc("public").get();
			const appConfig = appConfigDoc.exists ? appConfigDoc.data() : {};

			const mailUser = readSecret("MAIL_USER");
			const mailFromFallback = readSecret("MAIL_FROM", mailUser);
			const mailFromName = appConfig.mailFromName || "Chor Konzert Team";
			const supportEmail = appConfig.supportEmail || mailUser;
			const fromAddress = `${mailFromName} <${mailFromFallback}>`;

			const transporter = createTransporter();

			const safeUserName = escapeHtml(booking.userName || booking.userEmail);
			const safeEventTitle = escapeHtml(event.title || "Event");
			const safeEventTime = escapeHtml(event.time || "");
			const safeEventLocation = escapeHtml(event.location || "wird noch bekanntgegeben");
			const safeTicketNumber = escapeHtml(booking.ticketNumber || bookingId);
			const safeQrCodeUrl = escapeHtml(booking.qrCodeUrl || "");
			const safeSupportEmail = escapeHtml(supportEmail);
			const eventDate = formatEventDate(event.date);

			const subject = `Buchungsbestaetigung: ${event.title || "Event"} - Ticket ${booking.ticketNumber || bookingId}`;
			const text = [
				`Hallo ${booking.userName || booking.userEmail},`,
				"",
				"dein Ticket wurde erfolgreich gebucht.",
				"",
				`Event: ${event.title || "Event"}`,
				`Datum: ${eventDate}`,
				`Uhrzeit: ${event.time || ""}`,
				`Ort: ${event.location || ""}`,
				`Ticketnummer: ${booking.ticketNumber || bookingId}`,
				"",
				"Bitte bringe den QR-Code zum Einlass mit.",
				"",
				`Support: ${supportEmail}`
			].join("\n");

			const html = `
				<div style="font-family: Arial, sans-serif; background: #f9fafb; padding: 24px;">
					<div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 10px; padding: 24px; border: 1px solid #e5e7eb;">
						<h1 style="margin-top: 0; color: #1f2937;">Buchungsbestaetigung</h1>
						<p>Hallo ${safeUserName},</p>
						<p>dein Ticket wurde erfolgreich gebucht.</p>

						<div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 18px 0;">
							<p style="margin: 0 0 8px;"><strong>Event:</strong> ${safeEventTitle}</p>
							<p style="margin: 0 0 8px;"><strong>Datum:</strong> ${escapeHtml(eventDate)}</p>
							<p style="margin: 0 0 8px;"><strong>Uhrzeit:</strong> ${safeEventTime}</p>
							<p style="margin: 0;"><strong>Ort:</strong> ${safeEventLocation}</p>
						</div>

						<div style="background: #ecfdf5; border-left: 4px solid #10b981; border-radius: 8px; padding: 14px; margin: 18px 0;">
							<p style="margin: 0;"><strong>Ticketnummer:</strong> <span style="font-family: monospace; letter-spacing: 1px;">${safeTicketNumber}</span></p>
						</div>

						${safeQrCodeUrl ? `<div style="text-align: center; margin: 24px 0;"><img src="${safeQrCodeUrl}" alt="QR Code" style="max-width: 260px; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px;"/></div>` : ""}

						<p>Bitte bringe den QR-Code zum Einlass mit.</p>
						<p style="color: #6b7280; font-size: 14px; margin-top: 24px;">Support: <a href="mailto:${safeSupportEmail}">${safeSupportEmail}</a></p>
					</div>
				</div>
			`;

			await transporter.sendMail({
				from: fromAddress,
				to: booking.userEmail,
				subject,
				text,
				html
			});

			await bookingRef.set(
				{
					emailStatus: "sent",
					emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
					emailError: null
				},
				{ merge: true }
			);

			logger.info("Booking email sent", {
				bookingId,
				to: booking.userEmail
			});

			return null;
		} catch (error) {
			const message = String(error.message || "Unknown error").slice(0, 500);
			logger.error("Booking email failed", {
				bookingId,
				message
			});

			await bookingRef.set(
				{
					emailStatus: "failed",
					emailError: message,
					emailFailedAt: admin.firestore.FieldValue.serverTimestamp()
				},
				{ merge: true }
			);

			return null;
		}
	});

exports.sendTestEmail = functions
	.region(REGION)
	.runWith({
		timeoutSeconds: 60,
		memory: "256MB",
		secrets: ["MAIL_HOST", "MAIL_PORT", "MAIL_SECURE", "MAIL_USER", "MAIL_PASSWORD", "MAIL_FROM"]
	})
	.https.onCall(async (data, context) => {
		if (!context.auth) {
			throw new functions.https.HttpsError("unauthenticated", "Authentifizierung erforderlich.");
		}

		if (!context.auth.token.admin) {
			throw new functions.https.HttpsError("permission-denied", "Nur Admins duerfen Testmails senden.");
		}

		const recipient = String(data?.testEmail || context.auth.token.email || "").trim();
		if (!recipient) {
			throw new functions.https.HttpsError("invalid-argument", "testEmail ist erforderlich.");
		}

		const transporter = createTransporter();
		const mailUser = readSecret("MAIL_USER");
		const fromAddress = readSecret("MAIL_FROM", mailUser);

		await transporter.sendMail({
			from: fromAddress,
			to: recipient,
			subject: "Testmail Chor Booking",
			text: "Wenn diese Mail ankommt, ist das Mail-System korrekt konfiguriert.",
			html: "<p>Wenn diese Mail ankommt, ist das Mail-System korrekt konfiguriert.</p>"
		});

		logger.info("Test email sent", {
			uid: context.auth.uid,
			to: recipient
		});

		return {
			success: true,
			to: recipient
		};
	});
