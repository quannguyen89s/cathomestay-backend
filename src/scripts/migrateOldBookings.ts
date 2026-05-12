/**
 * Migration script: back-fill missing fields on legacy booking documents.
 *
 * Run once with:
 *   npx ts-node src/scripts/migrateOldBookings.ts
 *
 * Safe to run multiple times — only updates documents where fields are missing.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error("❌  MONGO_URI not set in .env");
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI as string);
  console.log("✅  Connected to MongoDB");

  const db = mongoose.connection.db!;
  const col = db.collection("bookings");

  const cursor = col.find({});
  let updated = 0;
  let skipped = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) continue;

    const patch: Record<string, unknown> = {};

    // Status
    if (!doc.status) patch.status = "confirmed";

    // Price fields — cascade: finalPrice → totalPrice → originalPrice → 0
    const fp =
      doc.finalPrice != null
        ? doc.finalPrice
        : doc.totalPrice != null
          ? doc.totalPrice
          : doc.originalPrice != null
            ? doc.originalPrice
            : 0;

    if (doc.finalPrice == null) patch.finalPrice = fp;
    if (doc.totalPrice == null) patch.totalPrice = fp;
    if (doc.originalPrice == null) patch.originalPrice = fp;
    if (doc.extraGuestFee == null) patch.extraGuestFee = 0;

    // Guests
    if (doc.guests == null || doc.guests < 1) patch.guests = 1;

    // Hours — derive from checkIn / checkOut when missing
    if ((doc.hours == null || doc.hours < 1) && doc.checkIn && doc.checkOut) {
      const ms =
        new Date(doc.checkOut).getTime() - new Date(doc.checkIn).getTime();
      patch.hours = Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));
    }
    if (doc.hours == null && !patch.hours) patch.hours = 1;

    // String fields
    if (doc.adminNote == null) patch.adminNote = "";
    if (doc.note == null) patch.note = "";
    if (doc.customerInfo == null)
      patch.customerInfo = { name: "", phone: "", email: "" };

    if (Object.keys(patch).length > 0) {
      await col.updateOne({ _id: doc._id }, { $set: patch });
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(
    `✅  Migration complete — ${updated} documents updated, ${skipped} already up-to-date`,
  );
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("❌  Migration failed:", err);
  process.exit(1);
});
