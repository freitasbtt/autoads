import { DbStorage } from "./db.storage";
import { MemStorage } from "./memory.storage";

export * from "./types";
export { DbStorage, MemStorage };

export const storage =
  process.env.NODE_ENV === "test" ? new MemStorage() : new DbStorage();
