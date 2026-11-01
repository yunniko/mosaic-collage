"use client";

/** Offers bytes as a download. Used for saves and exports; every browser supports it. */
export function downloadBytes(bytes: Uint8Array | Blob, fileName: string, mime: string) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Asks the user for one file. Resolves to null when the dialog is cancelled. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

/** A file name safe on every OS, from the mosaic's name. */
export function safeFileName(name: string, ext: string): string {
  const base =
    name
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
      .trim()
      .slice(0, 80) || "mosaic";
  return `${base}${ext}`;
}
