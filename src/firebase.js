// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            "AIzaSyDE4ilaMj-zUKGTv3ZBhACVqD6a6E7fb4Q",
  authDomain:        "kcdl-1063a.firebaseapp.com",
  projectId:         "kcdl-1063a",
  storageBucket:     "kcdl-1063a.firebasestorage.app",
  messagingSenderId: "510504868252",
  appId:             "1:510504868252:web:1ecd87b6c7842ec1dcd059",
  measurementId:     "G-QVNLB3K4YZ",
};

const app = initializeApp(firebaseConfig);

// Offline persistence — writes are queued locally and sync automatically when online
export const db      = initializeFirestore(app, { localCache: persistentLocalCache() });
export const auth    = getAuth(app);
export const storage = getStorage(app);
