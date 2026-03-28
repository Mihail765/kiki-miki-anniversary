const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();

const SENDER_DISPLAY = { mikica: "Микица", kikica: "Кикица" };

exports.sendChatNotification = onDocumentCreated(
  "chats/mikica_kikica_chat/messages/{msgId}",
  async (event) => {
    const msg = event.data.data();
    const partner = msg.sender === "mikica" ? "kikica" : "mikica";

    const tokenDoc = await admin
      .firestore()
      .collection("fcmTokens")
      .doc(partner)
      .get();

    if (!tokenDoc.exists || !tokenDoc.data().token) {
      console.log(`No FCM token for ${partner}, skipping push`);
      return null;
    }

    const token = tokenDoc.data().token;
    const senderName = SENDER_DISPLAY[msg.sender] || msg.sender;
    const body =
      msg.text ||
      (msg.imageUrls?.length ? "📷 Sent a photo" : "💌 New message");

    const payload = {
      token,
      notification: {
        title: `${senderName} 💌`,
        body,
      },
      webpush: {
        notification: {
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: "chat-message",
          renotify: true,
        },
        fcmOptions: { link: "/chat.html" },
      },
      android: { priority: "high" },
    };

    try {
      const response = await admin.messaging().send(payload);
      console.log("Push sent successfully:", response);
    } catch (err) {
      console.error("FCM send error:", err.code, err.message);
      if (
        err.code === "messaging/registration-token-not-registered" ||
        err.code === "messaging/invalid-registration-token"
      ) {
        await admin.firestore().collection("fcmTokens").doc(partner).delete();
        console.log(`Deleted stale token for ${partner}`);
      }
    }

    return null;
  },
);
