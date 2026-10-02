// Короткая сводка замеров: node sites/tools/summarize.mjs sites/shots/own.json [имя-фильтр] [поля через запятую]
import { readFileSync } from "node:fs";
const d = JSON.parse(readFileSync(process.argv[2], "utf8"));
const f = process.argv[3] || "", fields = (process.argv[4] || "title,h1,totalKb,byType,nImgs,lcp,cls,hscroll,nLow,nSmall,tel,forms,jsonld,ext").split(",");
for (const m of d.filter(x => x.name.includes(f))) {
  console.log("==", m.name);
  for (const k of fields) console.log(" ", k + ":", JSON.stringify(m[k]));
}
