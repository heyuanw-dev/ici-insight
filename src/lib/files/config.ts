export const slidesBucket = "presentation-slides";
export const fileTypes = {
  powerpoint: {
    label: "PowerPoint",
    extension: ".pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  pdf: { label: "PDF preview", extension: ".pdf", mime: "application/pdf" },
} as const;
export type FileKind = keyof typeof fileTypes;
export function isFileKind(value: unknown): value is FileKind {
  return value === "powerpoint" || value === "pdf";
}
export function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.ceil(bytes / 1024))} KB`
    : `${Number((bytes / 1024 / 1024).toFixed(1))} MB`;
}
export function validateFileInput(
  kind: FileKind,
  name: string,
  size: number,
  mime: string,
  limit: number,
) {
  if (!name || [...name].length > 200 || /[\x00-\x1f\x7f/\\]/.test(name))
    return "Use a filename of at most 200 characters without slashes or control characters.";
  if (!name.toLowerCase().endsWith(fileTypes[kind].extension))
    return `Choose a ${fileTypes[kind].extension} file.`;
  // Some operating systems leave File.type empty. The server still validates
  // the real bytes and supplies a canonical MIME type to private Storage.
  if (
    mime &&
    mime !== fileTypes[kind].mime &&
    mime !== "application/octet-stream"
  )
    return `Choose a valid ${fileTypes[kind].label} file.`;
  if (!Number.isSafeInteger(size) || size <= 0 || size > limit)
    return `Choose a non-empty file no larger than ${formatFileSize(limit)}.`;
  return null;
}

export type SlideFile = {
  id: string;
  kind: FileKind;
  filename: string;
  size: number;
};
