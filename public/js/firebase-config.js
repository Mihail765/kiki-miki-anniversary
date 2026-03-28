// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBAFE26kDmBhZaF9nFP1h8RtKVzXq-7E8s",
  authDomain: "kikimikianniversary.firebaseapp.com",
  projectId: "kikimikianniversary",
  storageBucket: "kikimikianniversary.firebasestorage.app",
  messagingSenderId: "841345372926",
  appId: "1:841345372926:web:3a41d189f65a7dc14b8baf",
  measurementId: "G-8PPWFSHJLJ",
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Firestore Database
const db = firebase.firestore();

console.log("Firebase initialized successfully!");
