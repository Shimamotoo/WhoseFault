import { User } from "../user.js";

export interface IUserRepository {
  upsert(user: {
    firebaseUid: string;
    email?: string | null;
    name?: string | null;
    isAnonymous: boolean;
  }): Promise<User>;
  findByFirebaseUid(firebaseUid: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findExpiredGuests(olderThan: Date): Promise<User[]>;
  deleteMany(ids: string[]): Promise<number>;
}
