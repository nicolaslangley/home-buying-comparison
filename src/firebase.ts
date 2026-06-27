import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import type { WAIncome, GlobalSettings, Property } from './types';

export interface AppState {
  income: WAIncome;
  settings: GlobalSettings;
  properties: Property[];
  nextId: number;
}

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

const auth = getAuth(app);
const db = getFirestore(app);
const householdDoc = doc(db, 'households', 'main');

const allowedEmails: string[] = (import.meta.env.VITE_ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e: string) => e.trim())
  .filter(Boolean);

// Returns true if the email is on the configured allowlist.
export function isAllowedUser(email: string): boolean {
  return allowedEmails.includes(email);
}

// Opens a Google OAuth popup and signs in with Firebase.
export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, new GoogleAuthProvider());
}

// Signs the current user out of Firebase.
export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

// Subscribes to auth state and calls cb with an allowed user, or null on sign-out or disallowed sign-in.
export function onAuthChanged(
  cb: (user: { email: string; displayName: string } | null) => void,
): void {
  onAuthStateChanged(auth, (user: User | null) => {
    if (user?.email && isAllowedUser(user.email)) {
      cb({ email: user.email, displayName: user.displayName ?? user.email });
    } else {
      if (user) signOut(auth); // signed in but not on allowlist — boot them
      cb(null);
    }
  });
}

// Tracks writes we initiated so Firestore's echo snapshot can be skipped, avoiding spurious re-renders that cause image flicker.
let pendingOwnSnapshots = 0;

// Writes the full app state to the shared Firestore document.
export async function saveToFirestore(state: AppState): Promise<void> {
  pendingOwnSnapshots++;
  try {
    await setDoc(householdDoc, state);
  } catch {
    pendingOwnSnapshots--;
  }
}

// Reads the shared Firestore document, returning null if it does not exist yet.
export async function loadFromFirestore(): Promise<AppState | null> {
  const snap = await getDoc(householdDoc);
  return snap.exists() ? (snap.data() as AppState) : null;
}

// Subscribes to remote changes and calls cb, skipping echoes of our own writes to avoid spurious re-renders.
export function subscribeToFirestore(cb: (state: AppState) => void): () => void {
  return onSnapshot(householdDoc, (snap) => {
    if (pendingOwnSnapshots > 0) { pendingOwnSnapshots--; return; }
    if (snap.exists()) cb(snap.data() as AppState);
  });
}
