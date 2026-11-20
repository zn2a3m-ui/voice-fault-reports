import { cp, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("../www/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ["index.html", "manifest.webmanifest", "icon.svg"]) {
  await cp(new URL(file, root), new URL(file, output));
}
console.log("Prepared local web assets for the Android application.");
