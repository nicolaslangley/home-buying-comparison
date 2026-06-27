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

export function isAllowedUser(email: string): boolean {
  return allowedEmails.includes(email);
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

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

// Counts writes we initiated that haven't been echoed back yet.
// Each saveToFirestore increments; the first non-pending snapshot decrements and skips.
let pendingOwnSnapshots = 0;

export async function saveToFirestore(state: AppState): Promise<void> {
  pendingOwnSnapshots++;
  try {
    await setDoc(householdDoc, state);
  } catch {
    pendingOwnSnapshots--;
  }
}

export async function loadFromFirestore(): Promise<AppState | null> {
  const snap = await getDoc(householdDoc);
  return snap.exists() ? (snap.data() as AppState) : null;
}

// Returns an unsubscribe function. Skips snapshots caused by our own writes.
export function subscribeToFirestore(cb: (state: AppState) => void): () => void {
  return onSnapshot(householdDoc, (snap) => {
    if (pendingOwnSnapshots > 0) { pendingOwnSnapshots--; return; }
    if (snap.exists()) cb(snap.data() as AppState);
  });
}
