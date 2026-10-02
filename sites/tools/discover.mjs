// Разведка публичных страниц (только GET): node sites/tools/discover.mjs
import { writeFileSync, mkdirSync } from "node:fs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
mkdirSync("sites/raw", { recursive: true });
for (const s of ["granitline.ru", "kub-lesa.ru"]) {
  for (const p of ["/", "/robots.txt", "/sitemap.xml"]) {
    const t0 = Date.now();
    try {
      const r = await fetch("https://" + s + p, { headers: { "User-Agent": UA }, redirect: "follow" });
      const b = await r.text();
      writeFileSync(`sites/raw/${s}${p === "/" ? "-home.html" : "-" + p.slice(1)}`, b);
      console.log(s, p, r.status, b.length, "B", Date.now() - t0, "ms", r.url, r.headers.get("server"), r.headers.get("content-encoding"));
      if (p === "/") {
        const links = [...new Set([...b.matchAll(/href="([^"#]+)"/g)].map(m => m[1]))]
          .filter(h => !/\.(css|js|png|jpe?g|webp|svg|ico|woff2?)(\?|$)/i.test(h));
        console.log("  links:", links.length); console.log("  " + links.slice(0, 120).join("\n  "));
      }
      if (p === "/robots.txt") console.log("  " + b.split("\n").filter(l => /sitemap|disallow/i.test(l)).slice(0, 15).join("\n  "));
      if (p === "/sitemap.xml") { const l = [...b.matchAll(/<loc>([^<]+)/g)].map(m => m[1]); console.log("  loc:", l.length, l.slice(0, 10).join(" ")); }
    } catch (e) { console.log(s, p, "ERR", e.message); }
  }
}
