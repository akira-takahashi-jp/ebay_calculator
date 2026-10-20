// 利益計算エンジン。「計算詳細」「エコノミー送料」「FedEx 送料」「DHL 送料」シートの数式を移植。
// 文字列はExcelでのメッセージ（"発送不可" 等）、NaN はExcelのエラー値に相当する。
(function (root) {
  "use strict";

  const DEFAULT_SETTINGS = {
    // 設定シート
    usdjpy: 158.158, // B4
    fxFee: 0.0135, // B5 海外決済手数料
    payoneer: 0.025, // B6
    plRate: 0, // B7 広告料率（PL）
    extra3: "On", // B8 手数料の追加3%
    stampDisc: 0.1, // B9 日本郵便 切手割引
    usDutyRate: 0.125, // B10
    fedexMpfSimple: 2.77, // B11 FedEx US MPF（USD・簡易）
    zonosRate: 0.1, // B13
    zonosFixedUsd: 2, // B14
    zonosFixedJpy: 254, // B15
    cpassRate: 0.021, // B16 CPaSS 関税処理率
    cpassEcoFixed: 245, // B17
    extraRate: 0.03, // B18 追加手数料率
    consTax: 0.1, // B19 仕入 消費税率
    volA: 8000, // B20 体積重量A 除数
    volB: 5000, // B21 体積重量B 除数
    euZonosFixed: 818, // B26
    euCountry: "イタリア", // B27
    euDutyPerClass: 555, // B28
    euFedexShipOverride: null, // B30
    euFedexExtra: 0, // C30
    euDhlShipOverride: null, // B31
    euDhlExtra: 0, // C31
    eurjpy: 176.865, // B42
    euZonosDutyEur: 3, // B43
    euDutyClasses: 1, // B45
    euEcoExtra: 0, // B46
    usEcoDutyOverride: null, // B47
    usFedexExtra: 0, // B48
    usDhlExtra: 0, // B49
    euDutyOverride: null, // B50
    usClearance: "自動", // B51
    mpfRate: 0.003464, // B52
    mpfMin: 34.58, // B53
    mpfMax: 670.86, // B54
    dhlRegUsd: 1.38, // B55
    dhlFormalJpy: 1500, // B56
    usFedexDutyOverride: null, // B57
    usDhlDutyOverride: null, // B58
    dhlDtpRate: 0.02, // B59
    dhlDtpMin: 850, // B60
    // エコノミー送料シート
    ecoUsRegion: "本土48州", // G2
    ecoFuel: 0.145, // G11
    ecoUsDim: 2475, // G13 US寸法割増
    ecoEuBulky: 2520, // G14 EUバルキー
    ecoEuPeak: 34, // G15 EU混雑時料金
    ecoEuPeakOn: 0, // G16
    ecoExtra: 0, // G17
    // FedEx 送料シート
    fxFuel: 0.5125, // D3
    fxUsSur: 242, // E3
    fxCpass: 0, // F3
    fxEuSur: 200, // G3
    fxEuHMDisc: 0.5, // H3
    fxSurMin: 37, // I3
    fxUsZone: "E（西部）", // K5
    fxPack: "独自梱包", // K8
    fxExtra: 0, // K9
    fxUsRemote: "通常", // K11
    fxEuRemote: "通常", // K12
    fxZip: null, // P2
    fxSpecial: 0, // P11
    // DHL 送料シート
    dhFuel: 0.3975, // D3
    dhFuelDisc: 0.25, // E3
    dhUsSur: 243, // F3
    dhCpass: 0, // G3
    dhEuSur: 207, // H3
    dhReg: 1, // I3
    dhDtp: 1, // J3
    dhExtra: 0, // K9
  };

  const isNum = (v) => typeof v === "number" && isFinite(v);
  const n0 = (v) => (isNum(v) ? v : 0); // 空欄セルの参照は0
  // Excel ROUND（0.5は0から遠い方へ）。浮動小数の誤差は15桁で丸めてから処理。
  const round = (x, d = 0) => {
    if (!isNum(x)) return NaN;
    const p = Math.pow(10, d);
    const v = Number((Math.abs(x) * p).toPrecision(15));
    return (Math.sign(x) * Math.round(v)) / p;
  };
  const roundup0 = (x) => {
    const v = Number(Math.abs(x).toPrecision(15));
    return Math.sign(x) * Math.ceil(v);
  };
  const ceilTo = (x, s) => Math.ceil(Number((x / s).toPrecision(15))) * s;
  // INDEX(価格, COUNTIF(重量,"<"&w)+1)：w以上の最初の段
  const lookupCeil = (rows, w, idx = 1) => {
    const r = rows.find((row) => row[0] >= w);
    return r ? r[idx] : NaN;
  };
  // INDEX(価格, MATCH(w, 重量, 0))：完全一致
  const lookupExact = (rows, w, idx) => {
    const r = rows.find((row) => row[0] === w);
    return r ? r[idx] : "料金表該当なし";
  };
  const dimStats = (a) => {
    const max = Math.max(...a);
    const min = Math.min(...a);
    const sum = a[0] + a[1] + a[2];
    return { max, min, sum, mid: sum - max - min, girth: 2 * sum - max, prod: a[0] * a[1] * a[2] };
  };
  const dateOnly = (y, m, d) => new Date(y, m - 1, d).getTime();

  function categoryFee(data, catNo, price) {
    const id = String(catNo == null ? "" : catNo).trim();
    // 列ごとにCOUNTIF＝1の最初の列（重複登録の列は一致扱いにならない）
    const col = data.categories.find((c) => c.ids.filter((x) => x === id).length === 1);
    if (!col) return { fee: "カテゴリ未登録", col: null };
    let fee;
    if (col.t1 == null) fee = col.base;
    else if (isNum(col.t2) && isNum(col.r2) && price >= col.t2) fee = col.r2;
    else fee = price >= col.t1 ? col.r1 : col.base;
    return { fee, col };
  }

  function calc(input, s, data, today) {
    const t = today ? new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() : Date.now();
    const B2 = n0(s.usdjpy);
    const C2 = n0(input.buyerShip);
    const B4 = isNum(input.price) ? input.price : NaN;
    const C4 = isNum(input.cost) ? input.cost : NaN;
    const D4 = n0(input.weight);
    const dims = [n0(input.length), n0(input.width), n0(input.height)];
    const ds = dimStats(dims);
    const rdims = dims.map(roundup0);
    const rs = dimStats(rdims);
    const cat = categoryFee(data, input.category, B4);
    const E4 = cat.fee;
    const G4 = n0(s.fxFee), H4 = n0(s.payoneer), I4 = n0(s.plRate), K4 = n0(s.stampDisc), L4 = n0(s.usDutyRate);
    const extra = s.extra3 === "On" ? n0(s.extraRate) : 0;
    const B16 = n0(s.cpassRate);
    const B42 = s.eurjpy;

    const country = data.euCountries.find((c) => c.name === s.euCountry);
    const Q1 = country ? country.code : NaN;
    const Q2 = country ? country.ficp : NaN;

    // 重量
    const F8 = (ds.prod / n0(s.volA)) * 1000;
    const G8 = (ds.prod / n0(s.volB)) * 1000;
    const B8 = Math.max(D4, F8);
    const P12 = s.fxPack === "FedEx Box" ? 1000 : s.fxPack === "FedEx Tube" ? 4000 : 0;
    const fedexOversize = rs.max > 121 || rs.mid > 76 || rs.girth > 266 || rs.prod > 169901;
    const H8 = Math.max(roundup0(D4), roundup0((rs.prod / n0(s.volB)) * 1000), fedexOversize ? 18000 : 0, P12);
    const H9 = roundup0(Math.max(D4, G8));
    const Q9 = H8 <= 20000 ? ceilTo(H8, 500) : ceilTo(H8, 1000);
    const Q10 = H9 <= 20000 ? ceilTo(H9, 500) : ceilTo(H9, 1000);
    const Q11 = roundup0(B8);

    // 通関・関税
    const Q3 = s.usClearance === "自動" ? (C4 / B2 > 2500 ? "正式" : "簡易") : s.usClearance;
    const formalMpf = Math.min(n0(s.mpfMax), Math.max(n0(s.mpfMin), (C4 / B2) * n0(s.mpfRate)));
    const Q4 = C4 / B42;
    const Q5 = isNum(s.euDutyOverride) ? s.euDutyOverride : Q4 > 150 ? "EU関税額を入力" : round(n0(s.euDutyPerClass) * n0(s.euDutyClasses));
    const Q6 = isNum(s.usEcoDutyOverride) ? s.usEcoDutyOverride : round(C4 * L4);
    const Q7 = isNum(s.usFedexDutyOverride) ? s.usFedexDutyOverride : round(C4 * L4);
    const Q8 = isNum(s.usDhlDutyOverride) ? s.usDhlDutyOverride : round(C4 * L4);
    const Q12 = round((Q3 === "正式" ? formalMpf : n0(s.fedexMpfSimple)) * B2);
    const Q13 = Q3 === "簡易" && s.dhReg == 1 ? round(n0(s.dhlRegUsd) * B2) : 0;
    const Q14 = Q3 === "正式" ? round(formalMpf * B2) : 0;
    const Q15 = s.dhDtp == 1 && Q8 > 0 ? round(Math.max(Q8 * n0(s.dhlDtpRate), n0(s.dhlDtpMin))) : 0;
    const Q16 = Q3 === "正式" ? n0(s.dhlFormalJpy) : 0;
    const Q17 = Q12 + n0(s.usFedexExtra);
    const Q18 = Q13 + Q14 + Q15 + Q16 + n0(s.usDhlExtra);
    const Q19 = Q7 + Q17 + round((Q7 + Q17) * B16);
    const Q20 = Q8 + Q18 + round((Q8 + Q18) * B16);
    const Q21 = isNum(Q5) ? Q5 + n0(s.euEcoExtra) + round((Q5 + n0(s.euEcoExtra)) * B16) : Q5;
    const Q22 = isNum(Q5) ? Q5 + n0(s.euFedexExtra) + round((Q5 + n0(s.euFedexExtra)) * B16) : Q5;
    const Q23 = isNum(Q5) ? (Q5 > 0 ? round(Math.max(Q5 * n0(s.dhlDtpRate), n0(s.dhlDtpMin))) : 0) : Q5;
    const Q24 = isNum(Q5) ? Q5 + Q23 + n0(s.euDhlExtra) + round((Q5 + Q23 + n0(s.euDhlExtra)) * B16) : Q5;

    // 受取額
    const recvCheck = !isNum(B4) ? "販売価格未入力" : !isNum(C4) ? "仕入価格未入力" : B2 <= 0 ? "為替未設定" : null;
    const B20 = recvCheck || (isNum(E4) ? (B4 + C2) * B2 * (1 - (E4 + G4 + H4 + I4 + extra)) : E4);
    const B21 = recvCheck || (isNum(E4) ? (B4 + C2) * (1 - (E4 + G4 + I4 + extra)) * (1 - H4) * B2 : E4);
    const B22 = isNum(C4) ? (C4 / (1 + n0(s.consTax))) * n0(s.consTax) : "仕入価格未入力";

    // 日本郵便
    const jp = (rows) =>
      D4 <= 0 ? "重量未入力" : D4 > Math.max(...rows.map((r) => r[0])) ? "発送不可" : lookupCeil(rows, D4) * (1 - K4);
    const C16 = jp(data.airUS);
    const D16 = jp(data.airEU);
    const E16 = jp(data.ems);
    const F16 = jp(data.print);
    const G16 = jp(data.letter);

    // エコノミー（US）
    let I16;
    if (D4 <= 0) I16 = "重量未入力";
    else if (ds.min <= 0) I16 = "サイズ未入力";
    else if (ds.max > 66 || ds.girth > 274 || C4 / B2 > 1200) I16 = "発送不可";
    else if (s.ecoUsRegion === "本土48州以外") I16 = Q11 > 15000 ? "発送不可" : lookupCeil(data.ecoUSOther, Q11);
    else I16 = Q11 > 25000 ? "発送不可" : lookupCeil(data.ecoUS, Q11);
    const I8 = isNum(I16) ? Q6 + round(Q6 * B16) + n0(s.cpassEcoFixed) : I16;
    const G11 = n0(s.ecoFuel);
    const ecoUsDimSur = ds.max > 55.88 || ds.prod > 55000 ? n0(s.ecoUsDim) : 0;
    const ecoG6 = isNum(I16)
      ? isNum(I8)
        ? I16 + round(I16 * G11) + ecoUsDimSur + n0(s.ecoExtra) + I8
        : "関税未計算"
      : I16;

    // エコノミー（EU）
    let ecoG4;
    if (D4 <= 0) ecoG4 = "重量未入力";
    else if (ds.min <= 0) ecoG4 = "サイズ未入力";
    else if (Q4 > 150) ecoG4 = "150 EUR超";
    else if (ds.max > 120 || ds.mid > (Q1 === "DE" ? 60 : 40) || ds.prod > 180000) ecoG4 = "発送不可";
    else if (Q11 > 20000) ecoG4 = "料金表上限超過";
    else ecoG4 = lookupCeil(data.ecoEU.rows, Q11, data.ecoEU.codes.indexOf(Q1) + 1);
    const ecoEuBulky = ds.max < 15 || ds.mid < 11 || ds.min < 1 ? n0(s.ecoEuBulky) : 0;
    const ecoG5 = isNum(ecoG4)
      ? isNum(Q21)
        ? ecoG4 + round(ecoG4 * G11) + ecoEuBulky + n0(s.ecoEuPeak) * n0(s.ecoEuPeakOn) + n0(s.ecoExtra) + Q21
        : "関税未計算"
      : ecoG4;

    // FedEx
    const fx = fedex(s, data, { D4, ds, rs, Q9, Q2, t });
    const J16 = fx.B12;
    // DHL
    const dh = dhl(s, data, { D4, ds, H9, Q10 });
    const K16 = dh.B12;

    // 利益
    const profit = (ship, recv, ...costs) =>
      isNum(ship) ? (isNum(recv) ? recv - C4 - ship - costs.reduce((a, b) => a + b, 0) : recv) : ship;
    const plusRefund = (v) => (isNum(v) ? v + B22 : v);
    const C13 = profit(C16, B20);
    const D13 = profit(D16, B20);
    const E13 = profit(E16, B21);
    const F13 = profit(F16, B21);
    const G13 = profit(G16, B21);
    const I13 = profit(ecoG6, B20);
    const J13 = profit(J16, B20, Q19);
    const K13 = profit(K16, B20, Q20);

    const M21 = C4 * L4 * (1 + n0(s.zonosRate)) + n0(s.zonosFixedUsd) * B2 + n0(s.zonosFixedJpy);
    const M16 = isNum(C13) ? C13 - M21 : C13;
    const N16 = isNum(C13) ? C13 - (C4 * L4 * n0(s.zonosRate) + n0(s.zonosFixedUsd) * B2 + n0(s.zonosFixedJpy)) : C13;
    const O21 =
      isNum(B42) && B42 > 0
        ? isNum(s.euZonosFixed) && s.euZonosFixed >= 0 && isNum(s.euZonosDutyEur) && s.euZonosDutyEur >= 0
          ? s.euZonosFixed + s.euZonosDutyEur * B42
          : "EU費用未設定"
        : "為替取得不可";
    const O16 = isNum(D13) ? (isNum(O21) ? D13 - O21 : O21) : D13;

    const Q25 = profit(ecoG5, B20);
    const euFxShip = isNum(s.euFedexShipOverride) ? s.euFedexShipOverride : fx.M3;
    const Q27 = isNum(euFxShip) ? (isNum(Q22) ? profit(euFxShip, B20, Q22) : Q22) : fx.M3;
    const euDhShip = isNum(s.euDhlShipOverride) ? s.euDhlShipOverride : dh.M6;
    const Q29 = isNum(euDhShip) ? (isNum(Q24) ? profit(euDhShip, B20, Q24) : Q24) : dh.M6;

    const row = (key, name, p, ship, note) => ({ key, name, profit: p, refund: plusRefund(p), ship, note });

    return {
      groups: [
        {
          title: "Zonos",
          rows: [
            row("zonosUS", "Zonos", M16, C16),
            row("zonosUSExempt", "Zonos(関税対象外)", N16, C16, "CD/DVD/Blu-ray/レコード/書籍/漫画/雑誌/ポスター等"),
            row("zonosEU", "Zonos(EU)", O16, D16),
          ],
        },
        {
          title: "CPaSS（エコノミー・FedEx・DHL）",
          rows: [
            row("ecoUS", "エコノミー(US)", I13, ecoG6),
            row("ecoEU", "エコノミー(EU)", Q25, ecoG5),
            row("fedexUS", "FedEx(US)", J13, J16),
            row("fedexEU", "FedEx(EU)", Q27, euFxShip),
            row("dhlUS", "DHL(US)", K13, K16),
            row("dhlEU", "DHL(EU)", Q29, euDhShip),
          ],
        },
        {
          title: "日本郵便",
          rows: [
            row("airUS", "エアパケ(US)", C13, C16),
            row("airEU", "エアパケ(EU)", D13, D16),
            row("ems", "EMS(US)", E13, E16),
            row("print", "印刷物書留", F13, F16),
            row("letter", "書状書留", G13, G16),
          ],
        },
      ],
      detail: {
        categoryFee: E4,
        categoryCol: cat.col ? cat.col.col : null,
        volA: F8,
        volB: G8,
        ecoWeight: Q11,
        fedexWeight: Q9,
        dhlWeight: Q10,
        usClearance: Q3,
        recvAdd: B20,
        recvPayoneerAfter: B21,
        refund: B22,
        ecoUsDuty: I8,
        fedexUsDuty: Q19,
        dhlUsDuty: Q20,
        zonosCost: M21,
        euZonosCost: O21,
        euDeclaredEur: Q4,
        euDuty: Q5,
        euEcoDuty: Q21,
        euFedexDuty: Q22,
        euDhlDuty: Q24,
        fedexMpf: Q12,
        dhlUsFees: Q18,
        euCountryCode: Q1,
        fedexUsZone: fx.P3,
        fedexEuZone: Q2,
        fedex: fx,
        dhl: dh,
      },
    };
  }

  function fedex(s, data, { D4, ds, rs, Q9, Q2, t }) {
    const z = data.fedex.zones;
    const zip = s.fxZip;
    const inWest = (p) =>
      (p >= 83200 && p <= 83999) || (p >= 84000 && p <= 84799) || (p >= 85000 && p <= 86599) ||
      (p >= 89000 && p <= 89899) || (p >= 90000 && p <= 96699) || (p >= 97000 && p <= 97999) || (p >= 98000 && p <= 99499);
    const P3 = isNum(zip) ? (inWest(zip) ? "E" : "F") : String(s.fxUsZone || "").charAt(0);
    const base = (zone) => {
      if (D4 <= 0) return "重量未入力";
      if (ds.min <= 0) return "サイズ未入力";
      if (rs.max > 274 || rs.girth > 330 || Q9 > 68000) return "発送不可";
      const zi = z.indexOf(zone);
      if (zi < 0) return "ゾーン不明";
      return lookupExact(data.fedex.rows, Q9, zi + 1);
    };
    const kg = Q9 / 1000;
    const remote = (cls, zone) => {
      if (cls === "通常" || cls === "A") return 0;
      if (cls === "B") return ["H", "I", "M"].includes(zone) ? 0 : Math.max(2990, kg * 58);
      return ["H", "M"].includes(zone) ? 0 : Math.max(3890, kg * 80);
    };
    const K9 = n0(s.fxExtra);
    const K10 =
      rs.max > 243 || rs.girth > 330 || D4 > 50000 || rs.prod > 283168
        ? 8800
        : rs.max > 121 || rs.mid > 76 || rs.girth > 266 || rs.prod > 169901 || D4 > 25000 || s.fxSpecial == 1
          ? 3390
          : 0;
    const P6 = remote(s.fxUsRemote, P3);
    const P7 = remote(s.fxEuRemote, Q2);
    const P8 = K10 > 0 ? 770 * (1 - (t >= dateOnly(2026, 9, 21) && t <= dateOnly(2027, 3, 31) ? 1 : 0)) : 0;
    const D3 = n0(s.fxFuel), F3 = n0(s.fxCpass);

    const B3 = base(P3);
    const E4 = isNum(B3) ? Math.max(n0(s.fxSurMin), kg * n0(s.fxUsSur)) : B3;
    const P9 = isNum(B3) ? B3 + E4 + K9 + K10 + P6 + P8 : B3;
    const B6 = isNum(P9) ? round(P9 * D3) : P9;
    const B9 = isNum(B3) ? -round((B3 + B6) * F3) : B3;
    const B12 = isNum(B3) ? B3 + B6 + B9 + E4 + K9 + K10 + P6 + P8 : B3;

    const J3 = base(Q2);
    const hmDisc = (Q2 === "H" || Q2 === "M") && t >= dateOnly(2026, 9, 21) && t <= dateOnly(2026, 11, 1) ? n0(s.fxEuHMDisc) : 0;
    const K3 = isNum(J3) ? Math.max(n0(s.fxSurMin), kg * n0(s.fxEuSur)) * (1 - hmDisc) : J3;
    const P10 = isNum(J3) ? J3 + K3 + K9 + K10 + P7 + P8 : J3;
    const L3 = isNum(P10) ? round(P10 * D3) : P10;
    const M3 = isNum(J3) ? J3 + K3 + L3 + K9 + K10 + P7 + P8 - round((J3 + L3) * F3) : J3;

    return { P3, B3, E4, B6, B9, B12, J3, K3, L3, M3, K10, P6, P7, P8 };
  }

  function dhl(s, data, { D4, ds, H9, Q10 }) {
    const base = (idx) => {
      if (D4 <= 0) return "重量未入力";
      if (ds.min <= 0) return "サイズ未入力";
      if (D4 > 70000 || ds.max > 120 || ds.mid > 80 || H9 > 153600) return "発送不可";
      return lookupExact(data.dhl, Q10, idx);
    };
    const kg = Q10 / 1000;
    const K9 = n0(s.dhExtra);
    const K10 = H9 > 70000 ? 17000 : ds.max > 100 || D4 > 25000 ? 3300 : 0;
    const fuel = n0(s.dhFuel) * (1 - n0(s.dhFuelDisc));
    const G3 = n0(s.dhCpass);

    const B3 = base(1);
    const F4 = isNum(B3) ? kg * n0(s.dhUsSur) : B3;
    const B6 = isNum(B3) ? round((B3 + F4 + K9 + K10) * fuel) : B3;
    const B9 = isNum(B3) ? -round((B3 + B6) * G3) : B3;
    const B12 = isNum(B3) ? B3 + B6 + B9 + F4 + K9 + K10 : B3;

    const J6 = base(2);
    const K6 = isNum(J6) ? kg * n0(s.dhEuSur) : J6;
    const L6 = isNum(J6) ? round((J6 + K6 + K9 + K10) * fuel) : J6;
    const M6 = isNum(J6) ? J6 + K6 + L6 + K9 + K10 - round((J6 + L6) * G3) : J6;

    return { B3, F4, B6, B9, B12, J6, K6, L6, M6, K10 };
  }

  const api = { calc, categoryFee, DEFAULT_SETTINGS, isNum, round };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ProfitCalc = api;
})(typeof window !== "undefined" ? window : globalThis);
