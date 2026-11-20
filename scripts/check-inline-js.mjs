import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
if (scripts.length === 0) throw new Error("No inline application script was found.");
for (const [index, match] of scripts.entries()) {
  try { new Function(match[1]); }
  catch (error) { throw new Error(\`Inline script \${index + 1} has a syntax error: \${error.message}\`); }
}
if (/headers:\s*authHeaders\(authSession\.access_token\),\s*body:\s*form/.test(html)) {
  throw new Error("Audio upload must not send the JSON Content-Type header with FormData.");
}
if (!html.includes('headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+authSession.access_token},body:form')) {
  throw new Error("Expected multipart audio request headers were not found.");
}
if (!html.includes("lastRewrittenInput=textIn")) throw new Error("Polished report persistence check failed.");
console.log(\`Validated \${scripts.length} inline script(s), multipart audio headers, and report persistence hooks.\`);
