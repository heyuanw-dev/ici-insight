import assert from "node:assert/strict";
import { test } from "node:test";
import { fileTypes, validateFileInput } from "../../src/lib/files/config";
import { validateFileContent } from "../../src/lib/files/validate-content";
import { pdfBytes, powerpointBytes, pptxParts, zip } from "../fixtures/slides";

test("file metadata validation handles boundaries, filenames, extensions and OS MIME values", () => {
  const limit = 50 * 1024 * 1024;
  for (const mime of [
    "",
    "application/octet-stream",
    fileTypes.powerpoint.mime,
  ])
    assert.equal(
      validateFileInput("powerpoint", "幻灯片.PPTX", limit, mime, limit),
      null,
    );
  for (const name of [
    "../slides.pdf",
    "slides\n.pdf",
    "slides\\preview.pdf",
    "a".repeat(201) + ".pdf",
    "slides.pdf.exe",
  ])
    assert.ok(validateFileInput("pdf", name, 10, "application/pdf", limit));
  for (const size of [0, -1, 0.5, NaN, Infinity, limit + 1])
    assert.ok(
      validateFileInput("pdf", "slides.pdf", size, "application/pdf", limit),
    );
  assert.ok(validateFileInput("pdf", "slides.pdf", 10, "text/html", limit));
  assert.equal(
    validateFileInput("pdf", "slides.pdf", limit, "application/pdf", limit),
    null,
  );
});
test("content validation accepts real PDF and PowerPoint containers", async () => {
  await validateFileContent("pdf", pdfBytes());
  await validateFileContent("powerpoint", powerpointBytes());
});
test("content validation rejects renamed HTML, truncated PDF/ZIP, and unrelated ZIP containers", async () => {
  for (const [kind, bytes] of [
    ["pdf", Buffer.from("<html>not slides</html>")],
    ["pdf", pdfBytes().subarray(0, 200)],
    ["powerpoint", pdfBytes()],
    ["powerpoint", powerpointBytes().subarray(0, 200)],
    ["powerpoint", zip({ "test.txt": "not PowerPoint" })],
    [
      "powerpoint",
      zip({
        ...pptxParts,
        "[Content_Types].xml": pptxParts["[Content_Types].xml"].replace(
          "presentation.main+xml",
          "macroEnabled.main+xml",
        ),
      }),
    ],
  ] as const)
    await assert.rejects(validateFileContent(kind, bytes));
});
test("PowerPoint validation rejects oversized decompressed XML and unsafe ZIP paths", async () => {
  await assert.rejects(
    validateFileContent(
      "powerpoint",
      zip({
        ...pptxParts,
        "ppt/presentation.xml": "x".repeat(2 * 1024 * 1024 + 1),
      }),
    ),
  );
  await assert.rejects(
    validateFileContent("powerpoint", zip({ ...pptxParts, "../escape": "x" })),
  );
});
