// public/js/database-helpers.js
// Firebase: Text data (songs, movies, memories metadata)
// Cloudinary: Images
// Auth is handled entirely by safetyCode.js (Firebase Auth state) — no sessionStorage

console.log("🔧 Loading database-helpers.js...");

// ===== FAVOURITE SONGS =====

async function addFavouriteSong(songData) {
  try {
    const docRef = await db.collection("songs").add({
      name: songData.name,
      artist: songData.artist || "",
      spotifyUrl: songData.spotifyUrl || "",
      artwork: songData.artwork || "",
      previewUrl: songData.previewUrl || "",
      trackId: songData.trackId || "",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    console.log("✅ Song added:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("❌ Error adding song:", error);
    throw error;
  }
}

async function getAllSongs() {
  try {
    const snapshot = await db
      .collection("songs")
      .orderBy("createdAt", "desc")
      .get();

    const songs = [];
    snapshot.forEach((doc) => {
      songs.push({
        id: doc.id,
        name: doc.data().name,
        artist: doc.data().artist,
        spotifyUrl: doc.data().spotifyUrl,
        artwork: doc.data().artwork || "",
        previewUrl: doc.data().previewUrl || "",
        trackId: doc.data().trackId || "",
        type: "song",
      });
    });

    return songs;
  } catch (error) {
    console.error("❌ Error getting songs:", error);
    return [];
  }
}

async function deleteSong(songId) {
  try {
    await db.collection("songs").doc(songId).delete();
    console.log("✅ Song deleted");
  } catch (error) {
    console.error("❌ Error deleting song:", error);
    throw error;
  }
}

// ===== FAVOURITE MOVIES =====

async function addFavouriteMovie(movieData) {
  try {
    let posterUrl = "";

    if (movieData.posterFile) {
      console.log("📤 Uploading movie poster to Cloudinary...");
      posterUrl = await uploadImageToCloudinary(
        movieData.posterFile,
        "movie-posters",
      );
    }

    const docRef = await db.collection("movies").add({
      name: movieData.name,
      year: movieData.year || null,
      posterUrl: posterUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    console.log("✅ Movie added:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("❌ Error adding movie:", error);
    throw error;
  }
}

async function getAllMovies() {
  try {
    const snapshot = await db
      .collection("movies")
      .orderBy("createdAt", "desc")
      .get();

    const movies = [];
    snapshot.forEach((doc) => {
      movies.push({
        id: doc.id,
        name: doc.data().name,
        year: doc.data().year,
        posterUrl: doc.data().posterUrl,
        type: "movie",
      });
    });

    return movies;
  } catch (error) {
    console.error("❌ Error getting movies:", error);
    return [];
  }
}

// ===== TIMELINE MEMORIES =====

async function addMemory(memoryData) {
  console.log("📝 addMemory called");
  console.log("   Data received:", memoryData);

  try {
    let imageUrl = "";

    if (memoryData.image) {
      console.log("📤 Uploading image to Cloudinary...");
      imageUrl = await uploadImageToCloudinary(memoryData.image, "memories");
      console.log("✅ Image uploaded:", imageUrl);
    }

    const memoryDoc = {
      title: memoryData.title || "Untitled",
      date: memoryData.date || new Date().toISOString().split("T")[0],
      imageUrl: imageUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if (memoryData.city) memoryDoc.city = memoryData.city;
    if (memoryData.place) memoryDoc.place = memoryData.place;
    if (memoryData.country) memoryDoc.country = memoryData.country;
    if (memoryData.description) memoryDoc.description = memoryData.description;

    console.log("💾 Saving to Firebase:", memoryDoc);

    const docRef = await db.collection("memories").add(memoryDoc);
    console.log("✅ Memory saved with ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("❌ Error in addMemory:", error);
    throw error;
  }
}

async function getAllMemoriesByCreated() {
  try {
    const snapshot = await db
      .collection("memories")
      .orderBy("createdAt", "asc")
      .get();

    const memories = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      memories.push({
        id: doc.id,
        title: data.title || "Untitled",
        city: data.city || "",
        place: data.place || "",
        country: data.country || "",
        description: data.description || "",
        date: data.date || "",
        imageUrl: data.imageUrl || "",
      });
    });

    console.log(`✅ Retrieved ${memories.length} memories`);
    return memories;
  } catch (error) {
    console.error("❌ Error getting memories:", error);
    return [];
  }
}

async function getAllMemoriesByDate(ascending = true) {
  try {
    const snapshot = await db
      .collection("memories")
      .orderBy("date", ascending ? "asc" : "desc")
      .get();

    const memories = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      memories.push({
        id: doc.id,
        title: data.title || "Untitled",
        city: data.city || "",
        place: data.place || "",
        country: data.country || "",
        description: data.description || "",
        date: data.date || "",
        imageUrl: data.imageUrl || "",
      });
    });

    console.log(`✅ Retrieved ${memories.length} memories`);
    return memories;
  } catch (error) {
    console.error("❌ Error getting memories:", error);
    return [];
  }
}

// Legacy alias
async function getAllMemories() {
  return await getAllMemoriesByCreated();
}

async function deleteMemory(memoryId) {
  try {
    await db.collection("memories").doc(memoryId).delete();
    console.log("✅ Memory deleted");
  } catch (error) {
    console.error("❌ Error deleting memory:", error);
    throw error;
  }
}

// ===== COMBINED FUNCTIONS =====

async function getAllFavourites() {
  try {
    const [songs, movies] = await Promise.all([getAllSongs(), getAllMovies()]);
    return [...songs, ...movies];
  } catch (error) {
    console.error("❌ Error getting all favourites:", error);
    return [];
  }
}

console.log("✅ Database helpers loaded!");
console.log("   Text data → Firebase");
console.log("   Images → Cloudinary");
