import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIPv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
}

function isPrivateIPv6(ip: string) {
  const value = ip.toLowerCase().split("%")[0];
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
    /^fe[89ab]/.test(value) || value.startsWith("::ffff:") || value.startsWith("2001:db8:");
}

export async function validatePublicHttpsUrl(input: string) {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") throw new Error("Only public HTTPS URLs on the standard port are allowed.");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) throw new Error("Private hostnames are not allowed.");
  const addressType = isIP(hostname);
  if (addressType === 4 && isPrivateIPv4(hostname)) throw new Error("Private IP addresses are not allowed.");
  if (addressType === 6 && isPrivateIPv6(hostname)) throw new Error("Private IP addresses are not allowed.");
  if (!addressType) {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => entry.family === 4 ? isPrivateIPv4(entry.address) : isPrivateIPv6(entry.address))) throw new Error("The hostname must resolve only to public IP addresses.");
  }
  url.hash = "";
  return url;
}

export async function fetchPublicDocument(input: string) {
  const url = await validatePublicHttpsUrl(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { redirect: "error", signal: controller.signal, headers: { "User-Agent": "ProoflayerDocImporter/1.0", Accept: "text/html,text/plain,application/xhtml+xml" }, cache: "no-store" });
    if (!response.ok) throw new Error(`Documentation server returned HTTP ${response.status}.`);
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!(type.includes("text/html") || type.includes("text/plain") || type.includes("application/xhtml+xml"))) throw new Error("Only HTML and plain-text documentation pages are supported.");
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > 1_500_000) throw new Error("The document is too large to import (maximum 1.5 MB).");
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 1_500_000) throw new Error("The document is too large to import (maximum 1.5 MB).");
    return { url: url.toString(), contentType: type, html: text };
  } finally {
    clearTimeout(timeout);
  }
}
