// v5 - custom token auth - secret date never touches the client
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
admin.initializeApp();

const SENDER_DISPLAY = { mikica: "Микица", kikica: "Кикица" };

// ===== VERIFY SECRET DATE → returns a Firebase custom token =====
exports.verifySecretDate = onCall(
  { region: "europe-west1" },
  async (request) => {
    const { day, month, year, time, who } = request.data;

    const correctDay = 26;
    const correctMonth = 4;
    const correctYear = 2024;
    const correctTimes = ["21:50", "21:51"];
    const validWho = ["mikica", "kikica"];

    const dateValid =
      parseInt(day) === correctDay &&
      parseInt(month) === correctMonth &&
      parseInt(year) === correctYear &&
      correctTimes.includes(time);

    if (!dateValid) {
      throw new HttpsError("permission-denied", "Wrong date.");
    }

    // who is optional at date-check stage — only required at token stage
    if (who !== undefined && !validWho.includes(who)) {
      throw new HttpsError("invalid-argument", "Invalid identity.");
    }

    // If who is provided, mint the full auth token
    if (who) {
      const uid = `mk_${who}`;
      const token = await admin.auth().createCustomToken(uid, {
        verified: true,
        who,
      });
      return { token };
    }

    // Date-only check (step 1) — just confirm it's correct
    return { valid: true };
  },
);

// ===== CHAT PUSH NOTIFICATIONS =====
exports.sendChatNotification = onDocumentCreated(
  {
    document: "chats/mikica_kikica_chat/messages/{msgId}",
    region: "europe-west1",
  },
  async (event) => {
    const msg = event.data.data();
    if (!msg || !msg.sender) return null;

    const partner = msg.sender === "mikica" ? "kikica" : "mikica";

    const tokenDoc = await admin
      .firestore()
      .collection("fcmTokens")
      .doc(partner)
      .get();

    if (!tokenDoc.exists || !tokenDoc.data().tokens?.length) {
      console.log(`No FCM tokens for ${partner}, skipping push`);
      return null;
    }

    const tokens = tokenDoc.data().tokens;
    const senderName = SENDER_DISPLAY[msg.sender] || msg.sender;
    const body =
      msg.text ||
      (msg.imageUrls?.length ? "📷 Sent a photo" : "💌 New message");

    const sendPromises = tokens.map((token) => {
      const payload = {
        token,
        notification: { title: `${senderName} 💌`, body },
        webpush: {
          notification: {
            icon: "/favicon.ico",
            badge: "/favicon.ico",
            tag: "chat-message",
            renotify: true,
          },
          fcmOptions: { link: "/chat.html" },
        },
        android: {
          priority: "high",
          notification: { sound: "default", channelId: "chat_messages" },
        },
        apns: {
          payload: {
            aps: {
              alert: { title: `${senderName} 💌`, body },
              sound: "default",
              badge: 1,
            },
          },
          headers: { "apns-priority": "10", "apns-push-type": "alert" },
        },
      };
      return admin
        .messaging()
        .send(payload)
        .then((response) => ({ success: true, token, response }))
        .catch((err) => ({ success: false, token, err }));
    });

    const results = await Promise.all(sendPromises);

    const staleTokens = results
      .filter(
        (r) =>
          !r.success &&
          (r.err.code === "messaging/registration-token-not-registered" ||
            r.err.code === "messaging/invalid-registration-token"),
      )
      .map((r) => r.token);

    if (staleTokens.length > 0) {
      const updatedTokens = tokens.filter((t) => !staleTokens.includes(t));
      await admin.firestore().collection("fcmTokens").doc(partner).set({
        tokens: updatedTokens,
        user: partner,
      });
      console.log(
        `Removed ${staleTokens.length} stale token(s) for ${partner}`,
      );
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(
      `✅ Push sent to ${successCount}/${tokens.length} devices for ${partner}`,
    );
    return null;
  },
);
