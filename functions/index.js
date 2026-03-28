// v2 - eur3 region fix - 28032026
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();

const SENDER_DISPLAY = { mikica: "Микица", kikica: "Кикица" };

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
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: "chat_messages",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: `${senderName} 💌`,
              body,
            },
            sound: "default",
            badge: 1,
          },
        },
        headers: {
          "apns-priority": "10",
          "apns-push-type": "alert",
        },
      },
    };

    try {
      const response = await admin.messaging().send(payload);
      console.log("✅ Push sent successfully:", response);
    } catch (err) {
      console.error("❌ FCM send error:", err.code, err.message);
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