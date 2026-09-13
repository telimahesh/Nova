import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "firebase/auth";
import { initializeFirestore, doc, getDocFromServer } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";
import firebaseConfig from "../../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Analytics if supported
isSupported().then(yes => yes && getAnalytics(app));

// Initialize Firestore with long polling to bypass potential WebSocket issues in some environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId || "(default)");

// Test Firestore connection
async function testConnection() {
  try {
    // Try to fetch a document to verify connection
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connected successfully");
  } catch (error) {
    console.warn("Initial Firestore connection test failed (this is normal if the DB is still provisioning):", error);
  }
}
testConnection();

export const signInAnon = () => signInAnonymously(auth);
export const signOut = () => auth.signOut();
