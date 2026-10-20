(function () {
  "use strict";

  const { calc, categoryFee, DEFAULT_SETTINGS, isNum } = window.ProfitCalc;
  const DATA = window.RATE_DATA;
  const KEY_SETTINGS = "ebaycalc.settings.v1";
  const KEY_INPUTS = "ebaycalc.inputs.v1";
  const APP_DEFAULTS = { ...DEFAULT_SETTINGS, autoFx: "Off", fxUpdatedAt: null };
  const SAMPLE_INPUTS = { price: 82.98, cost: 5800, weight: 1500, length: 20, width: 20, height: 20, buyerShip: 0, category: "69528" };
  const INPUT_KEYS = ["price", "cost", "weight", "length", "width", "height", "buyerShip", "category"];

  const $ = (id) => document.getElementById(id);
  const store = {
    get(key) {
      try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { return null; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 保存不可（プライベートモード等） */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (e) { /* noop */ }
    },
  };

  // ---------- 設定項目の定義 ----------
  const yesNo = [{ v: 1, t: "適用（1）" }, { v: 0, t: "なし（0）" }];
  const SECTIONS = [
    {
      title: "為替",
      open: true,
      fields: [
        { key: "usdjpy", label: "USD/JPY", type: "num", unit: "円" },
        { key: "eurjpy", label: "EUR/JPY", type: "num", unit: "円", note: "EU Zonos 関税（EUR）と EU申告額（150 EUR判定）に使用。" },
        { key: "autoFx", label: "起動時に自動取得", type: "select", options: ["On", "Off"], note: "Onにするとアプリを開くたびに最新レート（ECB参考値）を取得します。" },
      ],
    },
    {
      title: "eBay・決済手数料",
      open: true,
      fields: [
        { key: "fxFee", label: "海外決済手数料", type: "pct" },
        { key: "payoneer", label: "Payoneer手数料", type: "pct" },
        { key: "plRate", label: "広告料率（PL）", type: "pct" },
        { key: "extra3", label: "手数料の追加3%", type: "select", options: ["On", "Off"] },
        { key: "extraRate", label: "追加手数料率", type: "pct", note: "追加3%がOnのとき適用。" },
        { key: "stampDisc", label: "日本郵便 切手割引", type: "pct", note: "日本郵便送料に適用。" },
        { key: "consTax", label: "仕入 消費税率", type: "pct", note: "税込仕入価格から還付額を計算。" },
      ],
    },
    {
      title: "US 関税・通関",
      fields: [
        { key: "usDutyRate", label: "US 関税率", type: "pct", note: "US見積率。関税額の個別上書きは下の各欄。" },
        { key: "usClearance", label: "US通関方式", type: "select", options: ["自動", "簡易", "正式"], note: "自動＝申告額2,500 USD超で正式。" },
        { key: "usEcoDutyOverride", label: "US Economy関税額上書き", type: "num", unit: "円", nullable: true, note: "空欄なら仕入価格×US関税率。0円も上書き可。" },
        { key: "usFedexDutyOverride", label: "US FedEx関税額上書き", type: "num", unit: "円", nullable: true, note: "空欄なら仕入価格×US関税率。" },
        { key: "usDhlDutyOverride", label: "US DHL関税額上書き", type: "num", unit: "円", nullable: true, note: "空欄なら仕入価格×US関税率。" },
        { key: "usFedexExtra", label: "US FedEx追加通関費", type: "num", unit: "円", note: "MPF以外の税金・通関費。" },
        { key: "usDhlExtra", label: "US DHL追加通関費", type: "num", unit: "円", note: "既定のDDP費用以外の税金・通関費。" },
        { key: "fedexMpfSimple", label: "FedEx US MPF（簡易）", type: "num", unit: "USD", note: "FedEx資料40頁：2.77 USD。" },
        { key: "mpfRate", label: "正式通関MPF率", type: "pct", note: "税関申告価額の0.3464%。" },
        { key: "mpfMin", label: "正式通関MPF最低", type: "num", unit: "USD" },
        { key: "mpfMax", label: "正式通関MPF最高", type: "num", unit: "USD" },
        { key: "cpassRate", label: "CPaSS 関税処理率", type: "pct", note: "関税・税金・対象通関費の合計に掛ける処理率。" },
        { key: "cpassEcoFixed", label: "CPaSS Economy 固定費", type: "num", unit: "円", note: "Economy US輸入通関手数料。" },
      ],
    },
    {
      title: "Zonos",
      fields: [
        { key: "zonosRate", label: "Zonos 関税処理率", type: "pct", note: "仕入価格×関税率×(1＋この率)。" },
        { key: "zonosFixedUsd", label: "Zonos 固定手数料", type: "num", unit: "USD" },
        { key: "zonosFixedJpy", label: "Zonos 固定費", type: "num", unit: "円" },
        { key: "euZonosFixed", label: "EU Zonos 固定手数料", type: "num", unit: "円", note: "1配送につき。US Zonosとは別設定。" },
        { key: "euZonosDutyEur", label: "EU Zonos 関税", type: "num", unit: "EUR", note: "1配送につき。EUR/JPYを掛けて控除。" },
      ],
    },
    {
      title: "EU 配送",
      fields: [
        { key: "euCountry", label: "EU配送先", type: "select", options: DATA.euCountries.map((c) => c.name), note: "Economy・FedEx・DHLのEU送料が連動。" },
        { key: "euDutyPerClass", label: "EU関税（1分類）", type: "num", unit: "円" },
        { key: "euDutyClasses", label: "EU関税分類数", type: "num", note: "同じ分類の数量ではなく、分類の種類数。" },
        { key: "euDutyOverride", label: "EU関税額上書き", type: "num", unit: "円", nullable: true, note: "空欄なら関税×分類数。150 EUR超のFedEx/DHLは入力必須。" },
        { key: "euEcoExtra", label: "EU Economy追加通関費", type: "num", unit: "円" },
        { key: "euFedexShipOverride", label: "EU FedEx 送料上書き", type: "num", unit: "円", nullable: true, note: "空欄で自動送料。" },
        { key: "euFedexExtra", label: "EU FedEx 追加通関費", type: "num", unit: "円" },
        { key: "euDhlShipOverride", label: "EU DHL 送料上書き", type: "num", unit: "円", nullable: true, note: "空欄で自動送料。" },
        { key: "euDhlExtra", label: "EU DHL 追加通関費", type: "num", unit: "円" },
      ],
    },
    {
      title: "容積重量",
      fields: [
        { key: "volA", label: "体積重量A 除数（Economy）", type: "num", unit: "cm³/kg" },
        { key: "volB", label: "体積重量B 除数（FedEx/DHL）", type: "num", unit: "cm³/kg" },
      ],
    },
    {
      title: "CPaSS Economy",
      fields: [
        { key: "ecoUsRegion", label: "US地域", type: "select", options: ["本土48州", "本土48州以外"] },
        { key: "ecoFuel", label: "燃油サーチャージ", type: "pct", note: "2026-10-01発効14.5%。" },
        { key: "ecoUsDim", label: "US寸法割増", type: "num", unit: "円" },
        { key: "ecoEuBulky", label: "EUバルキー", type: "num", unit: "円" },
        { key: "ecoEuPeak", label: "EU混雑時料金", type: "num", unit: "円" },
        { key: "ecoEuPeakOn", label: "EU混雑時適用", type: "select", options: yesNo },
        { key: "ecoExtra", label: "追加送料", type: "num", unit: "円" },
      ],
    },
    {
      title: "FedEx",
      fields: [
        { key: "fxFuel", label: "燃油率", type: "pct", note: "2026-10-05～11の公表値51.25%。割増・対象追加送料にも適用。" },
        { key: "fxUsSur", label: "US割増", type: "num", unit: "円/kg" },
        { key: "fxEuSur", label: "EU割増", type: "num", unit: "円/kg" },
        { key: "fxSurMin", label: "割増最低", type: "num", unit: "円" },
        { key: "fxEuHMDisc", label: "EU H/M割引", type: "pct", note: "2026-09-21～11-01に適用。" },
        { key: "fxCpass", label: "CPaSS割引", type: "pct" },
        { key: "fxUsZone", label: "US料金ゾーン", type: "select", options: ["E（西部）", "F（東部・その他）"], note: "郵便番号が空欄のとき使用。" },
        { key: "fxZip", label: "US郵便番号（任意）", type: "num", nullable: true, note: "入力するとゾーンを自動判定。" },
        { key: "fxUsRemote", label: "US地域外配達", type: "select", options: ["通常", "A", "B", "C"] },
        { key: "fxEuRemote", label: "EU地域外配達", type: "select", options: ["通常", "A", "B", "C"] },
        { key: "fxPack", label: "梱包", type: "select", options: ["独自梱包", "FedEx Box", "FedEx Tube", "FedEx Pak／Envelope"] },
        { key: "fxSpecial", label: "特別取扱（梱包）", type: "select", options: yesNo },
        { key: "fxExtra", label: "追加送料", type: "num", unit: "円" },
      ],
    },
    {
      title: "DHL",
      fields: [
        { key: "dhFuel", label: "燃油率", type: "pct", note: "参考値39.75%。" },
        { key: "dhFuelDisc", label: "燃油割引", type: "pct" },
        { key: "dhUsSur", label: "US割増", type: "num", unit: "円/kg" },
        { key: "dhEuSur", label: "EU割増", type: "num", unit: "円/kg" },
        { key: "dhCpass", label: "CPaSS割引", type: "pct" },
        { key: "dhReg", label: "US規制料適用", type: "select", options: yesNo },
        { key: "dhDtp", label: "US元払い適用", type: "select", options: yesNo },
        { key: "dhlRegUsd", label: "DHL US規制手数料（簡易）", type: "num", unit: "USD" },
        { key: "dhlFormalJpy", label: "DHL正式通関処理料", type: "num", unit: "円" },
        { key: "dhlDtpRate", label: "DHL税金元払い請求率", type: "pct", note: "関税・税金の2%。" },
        { key: "dhlDtpMin", label: "DHL税金元払い最低額", type: "num", unit: "円", note: "US・EU共通。" },
        { key: "dhExtra", label: "追加送料", type: "num", unit: "円" },
      ],
    },
  ];
  const FIELD = {};
  SECTIONS.forEach((s) => s.fields.forEach((f) => (FIELD[f.key] = f)));

  // ---------- 状態 ----------
  let settings = { ...APP_DEFAULTS, ...(store.get(KEY_SETTINGS) || {}) };
  let inputs = store.get(KEY_INPUTS) || { ...SAMPLE_INPUTS };

  function saveSettings() {
    // 初期値から変更した項目だけ保存（アプリ更新で初期値が変わっても追従できるように）
    const diff = {};
    for (const k of Object.keys(settings)) if (settings[k] !== APP_DEFAULTS[k]) diff[k] = settings[k];
    store.set(KEY_SETTINGS, diff);
  }

  // ---------- 表示ユーティリティ ----------
  const yen = (v) => (isNum(v) ? Math.round(v).toLocaleString("ja-JP") + "円" : v == null ? "—" : String(v));
  const pct = (v) => (isNum(v) ? +(v * 100).toFixed(4) + "%" : String(v));
  const g = (v) => (isNum(v) ? Math.round(v).toLocaleString("ja-JP") + " g" : String(v));
  const signClass = (v) => (isNum(v) ? (Math.round(v) < 0 ? "neg" : "pos") : "");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function renderFxInfo() {
    $("fxInfo").innerHTML = `USD/JPY ${isNum(settings.usdjpy) ? settings.usdjpy.toFixed(2) : "—"}<br>EUR/JPY ${isNum(settings.eurjpy) ? settings.eurjpy.toFixed(2) : "—"}`;
    $("fxStatus").textContent = settings.fxUpdatedAt
      ? `最終取得：${new Date(settings.fxUpdatedAt).toLocaleString("ja-JP")}（ECB参考値・frankfurter.dev）`
      : "未取得（初期値または手入力の値を使用中）";
  }

  // ---------- 計算画面 ----------
  function readInputs() {
    for (const k of INPUT_KEYS) {
      const el = $("in-" + k);
      if (k === "category") inputs[k] = el.value.trim();
      else inputs[k] = el.value === "" ? null : Number(el.value);
    }
    store.set(KEY_INPUTS, inputs);
  }

  function writeInputs() {
    for (const k of INPUT_KEYS) $("in-" + k).value = inputs[k] == null ? "" : inputs[k];
  }

  function render() {
    const r = calc(inputs, settings, DATA, new Date());
    const d = r.detail;

    // 最も利益の高い配送（関税対象外は商品が限られるため除外）
    let best = null;
    for (const grp of r.groups)
      for (const row of grp.rows)
        if (row.key !== "zonosUSExempt" && isNum(row.profit) && (!best || row.profit > best.profit)) best = row;

    $("results").innerHTML = r.groups
      .map(
        (grp) => `<div class="group-title">${esc(grp.title)}</div><div class="methods">${grp.rows
          .map((row) => {
            const isBest = best && best.key === row.key;
            const main = isNum(row.profit)
              ? `<div class="profit ${signClass(row.profit)}">${yen(row.profit)}</div>`
              : `<div class="msg">${esc(row.profit)}</div>`;
            return `<div class="method${isBest ? " best" : ""}">
              ${isBest ? '<span class="badge">最大</span>' : ""}
              <div class="name">${esc(row.name)}</div>
              ${main}
              <dl><dt>還付込み</dt><dd class="${signClass(row.refund)}">${esc(yen(row.refund))}</dd>
              <dt>送料</dt><dd>${esc(yen(row.ship))}</dd></dl>
              ${row.note ? `<div class="note">${esc(row.note)}</div>` : ""}
            </div>`;
          })
          .join("")}</div>`
      )
      .join("");

    // カテゴリ・重量のヒント
    const cat = categoryFee(DATA, inputs.category, inputs.price);
    const ch = $("catHint");
    if (isNum(cat.fee)) {
      ch.className = "hint";
      ch.textContent = `適用eBay手数料 ${pct(cat.fee)}`;
    } else {
      ch.className = "hint warn";
      ch.textContent = "カテゴリ未登録のNoです（利益は計算されません）";
    }
    $("weightHint").textContent =
      `体積重量 A ${g(d.volA)}／B ${g(d.volB)}・課金重量 Economy ${g(d.ecoWeight)}／FedEx ${g(d.fedexWeight)}／DHL ${g(d.dhlWeight)}`;

    // 内訳
    const rows = [
      ["受取額・手数料"],
      ["適用eBay手数料", isNum(d.categoryFee) ? `${pct(d.categoryFee)}（列${d.categoryCol}）` : d.categoryFee],
      ["販売後受取額（料率加算方式）", yen(d.recvAdd)],
      ["販売後受取額（Payoneer後掛け）", yen(d.recvPayoneerAfter)],
      ["仕入 消費税還付額", yen(d.refund)],
      ["重量"],
      ["体積重量A（Economy）", g(d.volA)],
      ["体積重量B（FedEx/DHL）", g(d.volB)],
      ["Economy 課金重量", g(d.ecoWeight)],
      ["FedEx 課金重量", g(d.fedexWeight)],
      ["DHL 課金重量", g(d.dhlWeight)],
      ["US 関税・通関"],
      ["US通関方式", d.usClearance],
      ["CPaSS Economy 関税等", yen(d.ecoUsDuty)],
      ["FedEx US MPF", yen(d.fedexMpf)],
      ["FedEx US 関税等", yen(d.fedexUsDuty)],
      ["DHL US 通関費", yen(d.dhlUsFees)],
      ["DHL US 関税等", yen(d.dhlUsDuty)],
      ["Zonos 関税・手数料合計", yen(d.zonosCost)],
      ["EU"],
      ["EU配送先", `${settings.euCountry}（${d.euCountryCode}・FedExゾーン${d.fedexEuZone}）`],
      ["EU申告額", isNum(d.euDeclaredEur) ? d.euDeclaredEur.toFixed(2) + " EUR" : "—"],
      ["EU関税・税金", yen(d.euDuty)],
      ["EU Economy 関税コスト", yen(d.euEcoDuty)],
      ["EU FedEx 関税コスト", yen(d.euFedexDuty)],
      ["EU DHL 関税コスト", yen(d.euDhlDuty)],
      ["EU Zonos 手数料・関税", yen(d.euZonosCost)],
      ["FedEx 送料内訳"],
      ["USゾーン", d.fedexUsZone],
      ["US 基本送料", yen(d.fedex.B3)],
      ["US 割増", yen(d.fedex.E4)],
      ["US 燃油", yen(d.fedex.B6)],
      ["CPaSS割引", yen(d.fedex.B9)],
      ["特別取扱料", yen(d.fedex.K10)],
      ["US 地域外配達料", yen(d.fedex.P6)],
      ["EU 基本送料", yen(d.fedex.J3)],
      ["EU 割増", yen(d.fedex.K3)],
      ["EU 燃油", yen(d.fedex.L3)],
      ["DHL 送料内訳"],
      ["US 基本送料", yen(d.dhl.B3)],
      ["US 割増", yen(d.dhl.F4)],
      ["US 燃油（割引込み）", yen(d.dhl.B6)],
      ["特別取扱料", yen(d.dhl.K10)],
      ["EU 基本送料", yen(d.dhl.J6)],
      ["EU 割増", yen(d.dhl.K6)],
      ["EU 燃油（割引込み）", yen(d.dhl.L6)],
    ];
    $("detailTable").innerHTML = rows
      .map((r) => (r.length === 1 ? `<tr class="sub"><td colspan="2">${esc(r[0])}</td></tr>` : `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`))
      .join("");
  }

  // ---------- 設定画面 ----------
  function fieldValueForInput(f, v) {
    if (v == null || v === "") return "";
    if (f.type === "pct") return isNum(v) ? String(+(v * 100).toFixed(10)) : "";
    return String(v);
  }

  function buildSettingsForm() {
    const root = $("settingsForm");
    root.innerHTML = "";
    for (const sec of SECTIONS) {
      if (sec.title === "為替") {
        // 為替は上部カードに配置
        const card = $("fetchFx").closest(".card");
        sec.fields.forEach((f) => card.insertBefore(buildField(f), card.querySelector(".hint")));
        continue;
      }
      const card = document.createElement("details");
      card.className = "card settings-section";
      if (sec.open) card.open = true;
      card.innerHTML = `<summary>${esc(sec.title)}</summary>`;
      sec.fields.forEach((f) => card.appendChild(buildField(f)));
      root.appendChild(card);
    }
  }

  function buildField(f) {
    const wrap = document.createElement("div");
    wrap.className = "setting";
    wrap.dataset.key = f.key;
    const id = "set-" + f.key;
    let control;
    if (f.type === "select") {
      const opts = f.options.map((o) => (typeof o === "object" ? o : { v: o, t: o }));
      control = `<select id="${id}">${opts.map((o) => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("")}</select>`;
    } else {
      control = `<input id="${id}" type="number" inputmode="decimal" step="any"${f.nullable ? ' placeholder="空欄＝自動"' : ""}>`;
    }
    const unit = f.type === "pct" ? "%" : f.unit || "";
    wrap.innerHTML = `<label class="lbl" for="${id}">${esc(f.label)}</label>
      <div class="unit-wrap">${control}<span class="unit">${esc(unit)}</span></div>
      ${f.note ? `<div class="note">${esc(f.note)}</div>` : ""}`;
    const el = wrap.querySelector("#" + id);
    el.addEventListener(f.type === "select" ? "change" : "input", () => {
      let v;
      if (f.type === "select") {
        const opt = f.options.map((o) => (typeof o === "object" ? o.v : o)).find((o) => String(o) === el.value);
        v = opt;
      } else if (el.value === "") {
        v = f.nullable ? null : 0;
      } else {
        v = Number(el.value);
        if (!isFinite(v)) return;
        if (f.type === "pct") v = +(v / 100).toPrecision(12);
      }
      settings[f.key] = v;
      if (f.key === "usdjpy" || f.key === "eurjpy") renderFxInfo();
      saveSettings();
      markChanged(f.key);
      render();
    });
    return wrap;
  }

  function markChanged(key) {
    const w = document.querySelector(`.setting[data-key="${key}"]`);
    if (w) w.classList.toggle("changed", settings[key] !== APP_DEFAULTS[key] && key !== "usdjpy" && key !== "eurjpy");
  }

  function fillSettingsForm() {
    for (const key of Object.keys(FIELD)) {
      const el = $("set-" + key);
      if (el) el.value = fieldValueForInput(FIELD[key], settings[key]);
      markChanged(key);
    }
    renderFxInfo();
  }

  // ---------- 為替取得 ----------
  async function fetchFx(silent) {
    const btn = $("fetchFx");
    btn.disabled = true;
    try {
      const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY,EUR", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      const usdjpy = j.rates.JPY;
      const eurjpy = j.rates.JPY / j.rates.EUR;
      if (!isNum(usdjpy) || !isNum(eurjpy)) throw new Error("bad data");
      settings.usdjpy = +usdjpy.toFixed(4);
      settings.eurjpy = +eurjpy.toFixed(4);
      settings.fxUpdatedAt = new Date().toISOString();
      saveSettings();
      fillSettingsForm();
      render();
      if (!silent) toast(`為替を更新しました（${j.date}）`);
    } catch (e) {
      if (!silent) toast("為替を取得できませんでした。保存済みの値を使います。");
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- 設定の書き出し・読み込み ----------
  function exportSettings() {
    const blob = new Blob([JSON.stringify({ app: "ebay-profit-calc", version: 1, settings }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ebay-calc-settings.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importSettings(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const j = JSON.parse(reader.result);
        const src = j.settings || j;
        const next = { ...APP_DEFAULTS };
        for (const k of Object.keys(APP_DEFAULTS)) if (k in src) next[k] = src[k];
        settings = next;
        saveSettings();
        fillSettingsForm();
        render();
        toast("設定を読み込みました");
      } catch (e) {
        toast("読み込めないファイルです");
      }
    };
    reader.readAsText(file);
  }

  // ---------- 初期化 ----------
  function initTabs() {
    const tabs = document.querySelectorAll("nav.tabs button");
    const show = (name) => {
      tabs.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === name)));
      document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "view-" + name));
      window.scrollTo(0, 0);
      try { sessionStorage.setItem("ebaycalc.tab", name); } catch (e) { /* noop */ }
    };
    tabs.forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
    let last = null;
    try { last = sessionStorage.getItem("ebaycalc.tab"); } catch (e) { /* noop */ }
    if (last) show(last);
  }

  function init() {
    writeInputs();
    for (const k of INPUT_KEYS) $("in-" + k).addEventListener("input", () => { readInputs(); render(); });
    $("clearInputs").addEventListener("click", () => {
      inputs = { price: null, cost: null, weight: null, length: null, width: null, height: null, buyerShip: 0, category: inputs.category };
      writeInputs();
      store.set(KEY_INPUTS, inputs);
      render();
      $("in-price").focus();
    });
    buildSettingsForm();
    fillSettingsForm();
    $("fetchFx").addEventListener("click", () => fetchFx(false));
    $("exportSettings").addEventListener("click", exportSettings);
    $("importSettings").addEventListener("click", () => $("importFile").click());
    $("importFile").addEventListener("change", (e) => {
      if (e.target.files[0]) importSettings(e.target.files[0]);
      e.target.value = "";
    });
    $("resetSettings").addEventListener("click", () => {
      if (!confirm("すべての設定を初期値に戻しますか？")) return;
      settings = { ...APP_DEFAULTS };
      store.remove(KEY_SETTINGS);
      fillSettingsForm();
      render();
      toast("初期値に戻しました");
    });
    initTabs();
    render();
    if (settings.autoFx === "On" && navigator.onLine !== false) fetchFx(true);

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  init();
})();
