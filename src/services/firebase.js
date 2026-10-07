// Firebase is only needed for the Firestore reads behind the recommendation
// endpoints. Loading `firebase/app` + `firebase/firestore` eagerly put ~400 kB
// of JS on the critical path of every page, including ones that never touch
// Firestore. Both modules are now pulled in on first use and the resulting
// handle is cached, so the SDK downloads in parallel with the first render
// instead of blocking it.
const firebaseConfig = {
  apiKey: "AIzaSyAlTTKUZdyzH2sw8qi8O2HFkQo_3eJb5Mk",
  authDomain: "twse-3120a.firebaseapp.com",
  projectId: "twse-3120a",
  storageBucket: "twse-3120a.firebasestorage.app",
  messagingSenderId: "387373983022",
  appId: "1:387373983022:web:982369c4f27a710d7786bf",
  measurementId: "G-23WL903VWW"
};

let firestorePromise = null;

/**
 * Resolves to `{ db, doc, getDoc }`. The underlying import happens at most
 * once per session — concurrent callers share the same in-flight promise.
 */
export function getFirestoreClient() {
  if (!firestorePromise) {
    firestorePromise = (async () => {
      const [{ initializeApp }, { getFirestore, doc, getDoc }] = await Promise.all([
        import('firebase/app'),
        import('firebase/firestore'),
      ]);
      return { db: getFirestore(initializeApp(firebaseConfig)), doc, getDoc };
    })().catch((err) => {
      // Don't cache a failed load — a transient network error shouldn't
      // permanently break every later Firestore read.
      firestorePromise = null;
      throw err;
    });
  }
  return firestorePromise;
}
