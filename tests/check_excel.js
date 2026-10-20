// Excelの保存値（2026-10-13 計算時）と照合する。node tests/check_excel.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../data.js"), "utf8"), ctx);
const { calc, DEFAULT_SETTINGS } = require("../calc.js");
const input = { price: 82.98, cost: 5800, weight: 1500, length: 20, width: 20, height: 20, buyerShip: 0, category: "69528" };
const r = calc(input, DEFAULT_SETTINGS, ctx.window.RATE_DATA, new Date(2026, 9, 13));
const expected = {
  zonosUS: [-335.5975492, 191.6751781, 3726], zonosUSExempt: [389.4024508, 916.6751781, 3726], zonosEU: [349.6234508, 876.8961781, 3060],
  ecoUS: [-347.7815492, 179.4911781, 5106], ecoEU: [-1440.781549, -913.5088219, 6199],
  fedexUS: [-1790.781549, -1263.508822, 5362], fedexEU: [-892.7815492, -365.5088219, 5084],
  dhlUS: [-2071.781549, -1544.508822, 4999], dhlEU: [-2209.781549, -1682.508822, 5533],
  airUS: [1032.218451, 1559.491178, 3726], airEU: [1698.218451, 2225.491178, 3060], ems: [-1125.840709, -598.5679815, 5940],
  print: [1016.159291, 1543.432019, 3798], letter: [-99.84070876, 427.4320185, 4914],
};
let fail = 0;
for (const g of r.groups) for (const row of g.rows) {
  const e = expected[row.key];
  const got = [row.profit, row.refund, row.ship];
  const ok = e.every((v, i) => Math.abs(v - got[i]) < 1e-4);
  if (!ok) fail++;
  console.log(ok ? "OK  " : "NG  ", row.name.padEnd(16), got.map((v) => (typeof v === "number" ? v.toFixed(4) : v)).join(" / "), ok ? "" : " expected " + e.join(" / "));
}
console.log(fail ? `${fail} 件不一致` : "全件一致");
process.exit(fail ? 1 : 0);
