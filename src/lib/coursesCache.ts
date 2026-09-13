import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

// Course catalog metadata (title/department/level/etc.) changes rarely - an admin editing
// it a few times a month, at most. There's no reason for every visit to the Dashboard home
// page to hold a live listener on the whole collection just to power an optional search box.
// This caches one snapshot in memory per browser tab for a short window so repeat visits
// within that window cost zero additional reads.
const TTL_MS = 5 * 60 * 1000;

let cache: { data: any[]; fetchedAt: number } | null = null;
let inFlight: Promise<any[]> | null = null;

export async function getAllCoursesCached(): Promise<any[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.data;
  }
  if (inFlight) {
    return inFlight;
  }

  inFlight = getDocs(collection(db, 'courses'))
    .then(snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((c: any) => !c.isDeleted);
      cache = { data: docs, fetchedAt: Date.now() };
      return docs;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
