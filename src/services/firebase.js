import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAlTTKUZdyzH2sw8qi8O2HFkQo_3eJb5Mk",
  authDomain: "twse-3120a.firebaseapp.com",
  projectId: "twse-3120a",
  storageBucket: "twse-3120a.firebasestorage.app",
  messagingSenderId: "387373983022",
  appId: "1:387373983022:web:982369c4f27a710d7786bf",
  measurementId: "G-23WL903VWW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
