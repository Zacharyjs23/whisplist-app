// firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDVBdi1qJOtOPX6-jGOZgj8uwh9tM7uomc",
  authDomain: "whisplist-f6b0d.firebaseapp.com",
  projectId: "whisplist-f6b0d",
  storageBucket: "whisplist-f6b0d.appspot.com",
  messagingSenderId: "344114970536",
  appId: "1:344114970536:web:bcd483704259e26881279d",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
export { db, storage };
