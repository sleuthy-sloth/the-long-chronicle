// Re-pointed at Stream A's canonical Dexie instance (src/db/database.ts).
//
// This file used to be a standalone shim so Stream B could build before
// Stream A landed. It now re-exports the shared `db` so the whole app uses
// ONE Dexie instance on the 'long-chronicle' database — two live instances on
// the same database cause version/blocked errors. Keep importing from here;
// the exports below are the stable surface for Stream B's libs and pages.
export {
  ChronicleDB,
  LocalChronicleDb,
  db,
  getActiveChronicle,
  getSettings,
  resetDb,
  resetLocalDb,
  saveSettings,
  setActiveChronicleId,
} from '../db/database'
