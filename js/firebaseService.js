// Firebase initialization and thin wrappers.
// Relies on global `firebase` from the compat CDN scripts in index.html.

import { firebaseConfig } from "./firebaseConfig.js";
import { appLogger } from "./logger.js";

let app;
let auth;
let db;

export function initFirebase() {
  if (!window.firebase) {
    appLogger.error("firebase_not_loaded", {
      message: "Firebase CDN scripts missing",
    });
    throw new Error("Firebase scripts not loaded");
  }
  if (!app) {
    app = window.firebase.initializeApp(firebaseConfig);
    auth = window.firebase.auth();
    db = window.firebase.firestore();
    appLogger.info("firebase_initialized", { projectId: firebaseConfig.projectId });
  }
  return { app, auth, db };
}

export function getAuth() {
  if (!auth) initFirebase();
  return auth;
}

export function getDb() {
  if (!db) initFirebase();
  return db;
}

export function onAuthStateChanged(callback) {
  const a = getAuth();
  return a.onAuthStateChanged((user) => {
    appLogger.info("auth_state_changed", {
      uid: user ? user.uid : null,
      email: user ? user.email : null,
    });
    callback(user);
  });
}

export async function signUpWithEmail(email, password) {
  const a = getAuth();
  appLogger.info("auth_sign_up_attempt", { email });
  const cred = await a.createUserWithEmailAndPassword(email, password);
  appLogger.info("auth_sign_up_success", { email, uid: cred.user.uid });
  return cred.user;
}

export async function signInWithEmail(email, password) {
  const a = getAuth();
  appLogger.info("auth_sign_in_attempt", { email });
  const cred = await a.signInWithEmailAndPassword(email, password);
  appLogger.info("auth_sign_in_success", { email, uid: cred.user.uid });
  return cred.user;
}

export async function signOut() {
  const a = getAuth();
  appLogger.info("auth_sign_out");
  await a.signOut();
}

export function getUsersCollection() {
  return getDb().collection("users");
}

export function getMembersCollection() {
  return getDb().collection("members");
}

export function getBillsCollection() {
  return getDb().collection("bills");
}

export function getNotificationsCollection() {
  return getDb().collection("notifications");
}

export function getSupplementsCollection() {
  return getDb().collection("supplements");
}

export function getDietsCollection() {
  return getDb().collection("diets");
}

export function getLogsCollection() {
  return getDb().collection("logs");
}


