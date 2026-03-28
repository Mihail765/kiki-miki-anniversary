// v3 - multi-device token support - 28032026
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
              alert: { title: `${senderName} 💌`, body },
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
      return admin
        .messaging()
        .send(payload)
        .then((response) => ({ success: true, token, response }))
        .catch((err) => ({ success: false, token, err }));
    });

    const results = await Promise.all(sendPromises);

    // Remove any stale/invalid tokens
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
