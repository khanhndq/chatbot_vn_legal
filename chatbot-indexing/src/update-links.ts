/**
 * One-time script to patch existing Pinecone law vectors with source URLs.
 *
 * Reads path.txt from each laws-source/ subfolder and updates the `link`
 * metadata field on all matching vectors. Skips TODO entries.
 *
 * Usage:
 *   npx ts-node src/update-links.ts              # Live update
 *   npx ts-node src/update-links.ts --dry-run    # Preview only
 */

import * as dotenv from "dotenv";
import * as path from "path";
import { Pinecone } from "@pinecone-database/pinecone";
import { buildLinkMap } from "./parsers/law-parser";

dotenv.config();

/** Sanitize ID prefix the same way the indexing pipeline does */
function sanitizePrefix(docName: string): string {
  return `law:${docName}:`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đ]/g, "d")
    .replace(/[Đ]/g, "D")
    .replace(/[^a-zA-Z0-9:_\-\.]/g, "_");
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const lawsSourceDir = path.join(__dirname, "..", "dataset", "raw", "laws-source");

  console.log("═══════════════════════════════════════════════════════");
  console.log("  🔗 Patch Pinecone Law Vectors with Source URLs");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Mode: ${dryRun ? "🔍 DRY RUN" : "🚀 LIVE UPDATE"}`);
  console.log("");

  // Build link map
  const linkMap = buildLinkMap(lawsSourceDir);
  console.log(`  Found ${linkMap.size} documents with source URLs`);
  console.log("");

  if (linkMap.size === 0) {
    console.log("  Nothing to update.");
    return;
  }

  if (dryRun) {
    console.log("  Documents to update:");
    for (const [docName, url] of linkMap) {
      console.log(`    ${docName} → ${url}`);
    }
    console.log("");
    console.log("  🔍 Dry run complete. No vectors were modified.");
    return;
  }

  // Initialize Pinecone
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error("PINECONE_API_KEY is required. Set it in .env or environment.");
  }
  const pinecone = new Pinecone({ apiKey });
  const indexName = process.env.PINECONE_INDEX || "chatbot-vn-legal";
  const index = pinecone.index(indexName);

  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const [docName, url] of linkMap) {
    const prefix = sanitizePrefix(docName);
    console.log(`  📄 ${docName} (prefix: "${prefix}")`);

    // List all vector IDs with this prefix
    const vectorIds: string[] = [];
    let paginationToken: string | undefined;

    do {
      const listResult = await index.listPaginated({
        prefix,
        paginationToken,
      });

      if (listResult.vectors) {
        for (const v of listResult.vectors) {
          if (v.id) vectorIds.push(v.id);
        }
      }

      paginationToken = listResult.pagination?.next;
    } while (paginationToken);

    if (vectorIds.length === 0) {
      console.log(`     ⚠️  No vectors found, skipping`);
      totalSkipped++;
      continue;
    }

    console.log(`     Found ${vectorIds.length} vectors, updating...`);

    // Update each vector's metadata
    for (const id of vectorIds) {
      await index.update({
        id,
        metadata: { link: url },
      });
    }

    totalUpdated += vectorIds.length;
    console.log(`     ✅ Updated ${vectorIds.length} vectors`);
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  ✅ Update Complete!");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Documents processed: ${linkMap.size}`);
  console.log(`  Vectors updated:     ${totalUpdated}`);
  console.log(`  Documents skipped:   ${totalSkipped}`);
}

main().catch((err) => {
  console.error("❌ Update failed:", err);
  process.exit(1);
});
