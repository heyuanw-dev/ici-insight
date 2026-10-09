import { fromBuffer, type Entry } from "yauzl";
import type { FileKind } from "./config";

// Inspect only the small required XML parts; never extract slides or media.
// yauzl checks entry sizes/paths and permits bounded, lazy ZIP traversal.
async function validatePowerPoint(buffer: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip)
          return reject(new Error("Invalid PowerPoint archive."));
        let count = 0;
        const required = new Map<string, string>();
        const seen = new Set<string>();
        let failed = false;
        const fail = () => {
          if (failed) return;
          failed = true;
          zip.close();
          reject(new Error("Choose a valid, unencrypted .pptx file."));
        };
        zip.on("error", fail);
        zip.on("entry", (entry: Entry) => {
          if (
            ++count > 20000 ||
            seen.has(entry.fileName) ||
            entry.isEncrypted()
          )
            return fail();
          seen.add(entry.fileName);
          if (
            !["[Content_Types].xml", "ppt/presentation.xml"].includes(
              entry.fileName,
            )
          ) {
            zip.readEntry();
            return;
          }
          if (entry.uncompressedSize > 2 * 1024 * 1024) return fail();
          zip.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) return fail();
            const chunks: Buffer[] = [];
            let size = 0;
            stream.on("error", fail);
            stream.on("data", (chunk: Buffer) => {
              size += chunk.length;
              if (size > 2 * 1024 * 1024) {
                stream.destroy();
                fail();
              } else chunks.push(chunk);
            });
            stream.on("end", () => {
              if (failed) return;
              required.set(
                entry.fileName,
                Buffer.concat(chunks).toString("utf8"),
              );
              zip.readEntry();
            });
          });
        });
        zip.on("end", () => {
          if (failed) return;
          const content = required.get("[Content_Types].xml") ?? "";
          const presentation = required.get("ppt/presentation.xml") ?? "";
          if (
            !content.includes(
              "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
            ) ||
            !/PartName\s*=\s*["']\/ppt\/presentation\.xml["']/.test(content) ||
            !/<(?:[\w-]+:)?presentation[\s>]/.test(presentation) ||
            ![
              "http://schemas.openxmlformats.org/presentationml/2006/main",
              "http://purl.oclc.org/ooxml/presentationml/main",
            ].some((namespace) => presentation.includes(namespace)) ||
            /macroEnabled|vbaProject/i.test(content)
          )
            return fail();
          resolve();
        });
        zip.readEntry();
      },
    );
  });
}

export async function validateFileContent(kind: FileKind, buffer: Buffer) {
  if (kind === "pdf") {
    // Check a PDF header and final EOF marker; no PDF content is executed here.
    if (
      !/^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)/.test(
        buffer.subarray(0, 16).toString("ascii"),
      ) ||
      !/%%EOF\s*$/.test(
        buffer.subarray(Math.max(0, buffer.length - 1024)).toString("ascii"),
      )
    )
      throw new Error("Choose a valid PDF file exported from your slides.");
  } else {
    await validatePowerPoint(buffer);
  }
}
