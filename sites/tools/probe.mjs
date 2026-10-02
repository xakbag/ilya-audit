// Проверка доступности кандидатов-конкурентов: node sites/tools/probe.mjs host1 host2 ...
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
await Promise.all(process.argv.slice(2).map(async h => {
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 12000);
    const r = await fetch("https://" + h + "/", { headers: { "User-Agent": UA }, signal: c.signal });
    const b = await r.text();
    const t = (b.match(/<title[^>]*>([^<]*)/i) || [])[1] || "";
    console.log(h, r.status, Math.round(b.length / 1024) + "KB", r.url, "|", t.trim().slice(0, 90));
  } catch (e) { console.log(h, "ERR", e.name, e.cause?.code || e.cause?.message || ""); }
}));
