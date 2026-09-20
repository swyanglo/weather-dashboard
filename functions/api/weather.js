// GET /api/weather?lat=..&lon=..
//
// 기상청(KMA) 공공데이터포털 API 조합:
//  - 단기예보(getVilageFcst): 오늘~+2일, 3시간 간격, 위경도 임의 지점(격자좌표 변환) 지원
//  - 중기예보(getMidLandFcst / getMidTa): +3일~+7일, 지역구역코드 단위(격자 아님)
//
// 환경변수 KMA_SERVICE_KEY 필요 — 공공데이터포털에서 발급받은 "Encoding" 인증키를
// 그대로 넣을 것 (URLSearchParams로 다시 인코딩하면 이중 인코딩되어 인증 실패함).
//
// ⚠️ 중기예보는 지역구역코드 기준이라 여기서는 서울(MID_LAND_REG/MID_TA_REG)로
//    하드코딩되어 있음. 다른 지역이면 이 두 값만 바꾸면 됨.
//    (단기예보 쪽은 위경도 어디든 자동 변환되므로 오늘~모레는 정확히 위치 반영됨)

const MID_LAND_REG = "11B00000"; // 서울·인천·경기도 육상예보 구역
const MID_TA_REG = "11B10101"; // 서울 기온구역

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const lat = parseFloat(url.searchParams.get("lat"));
  const lon = parseFloat(url.searchParams.get("lon"));

  if (!lat || !lon) {
    return json({ error: "lat, lon required" }, 400);
  }
  if (!env.KMA_SERVICE_KEY) {
    return json({ error: "server not configured" }, 500);
  }

  const kst = nowKST();
  const today = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));

  try {
    const [shortTerm, midLand, midTa] = await Promise.all([
      fetchShortTerm(env.KMA_SERVICE_KEY, lat, lon, kst),
      fetchMid(env.KMA_SERVICE_KEY, "getMidLandFcst", MID_LAND_REG, kst),
      fetchMid(env.KMA_SERVICE_KEY, "getMidTa", MID_TA_REG, kst),
    ]);

    const shortDaily = buildShortDaily(shortTerm, today);
    const covered = new Set(shortDaily.map((d) => d.offset));
    const midDaily = buildMidDaily(midLand, midTa, today).filter((d) => !covered.has(d.offset));

    const daily = [...shortDaily, ...midDaily]
      .sort((a, b) => a.offset - b.offset)
      .slice(0, 8)
      .map(({ offset, ...rest }) => rest);

    const current = shortDaily.length
      ? { temp: shortDaily[0].nowTemp, description: shortDaily[0].description }
      : { temp: daily[0]?.high ?? null, description: daily[0]?.description ?? "" };

    return json({ current, daily }, 200, { "cache-control": "public, max-age=600" });
  } catch (err) {
    return json({ error: String(err) }, 502);
  }
}

// ---------- 시간 유틸 (KST) ----------

function nowKST() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function fmtDate(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}
function addDays(d, n) {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function vilageBase(kst) {
  const slots = [2, 5, 8, 11, 14, 17, 20, 23];
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  let d = new Date(kst);
  for (let i = slots.length - 1; i >= 0; i--) {
    if (h > slots[i] || (h === slots[i] && m >= 40)) {
      return { base_date: fmtDate(d), base_time: pad(slots[i]) + "00" };
    }
  }
  d = addDays(d, -1);
  return { base_date: fmtDate(d), base_time: "2300" };
}

function midTmFc(kst) {
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  let d = new Date(kst);
  let hh;
  if (h > 18 || (h === 18 && m >= 40)) hh = 18;
  else if (h > 6 || (h === 6 && m >= 40)) hh = 6;
  else {
    d = addDays(d, -1);
    hh = 18;
  }
  return `${fmtDate(d)}${pad(hh)}00`;
}

// ---------- 위경도 → 기상청 격자좌표(nx, ny) 변환 (LCC 투영, KMA 공개 공식) ----------

function latLonToGrid(lat, lon) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  const ra0 = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  const ra = (re * sf) / Math.pow(ra0, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

// ---------- 단기예보 ----------

async function fetchShortTerm(key, lat, lon, kst) {
  const { nx, ny } = latLonToGrid(lat, lon);
  const { base_date, base_time } = vilageBase(kst);
  const endpoint = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";
  const qs = `serviceKey=${key}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`;
  const res = await fetch(`${endpoint}?${qs}`);
  if (!res.ok) throw new Error(`vilageFcst ${res.status}`);
  const data = await res.json();
  return data?.response?.body?.items?.item ?? [];
}

function skyDesc(sky, pty) {
  const ptyMap = { 1: "비", 2: "비/눈", 3: "눈", 4: "소나기", 5: "빗방울", 6: "빗방울눈날림", 7: "눈날림" };
  if (pty && pty !== "0" && ptyMap[pty]) return ptyMap[pty];
  const skyMap = { 1: "맑음", 3: "구름많음", 4: "흐림" };
  return skyMap[sky] ?? "-";
}

function buildShortDaily(items, today) {
  const byDate = new Map();
  for (const it of items) {
    if (!byDate.has(it.fcstDate)) byDate.set(it.fcstDate, []);
    byDate.get(it.fcstDate).push(it);
  }

  const nowH = parseInt(pad(nowKST().getUTCHours()) + "00", 10);
  const days = [];

  for (const [fcstDate, entries] of byDate) {
    const y = fcstDate.slice(0, 4), m = fcstDate.slice(4, 6), d = fcstDate.slice(6, 8);
    const dateObj = new Date(Date.UTC(+y, +m - 1, +d));
    const offset = Math.round((dateObj - today) / 86400000);
    if (offset < 0) continue;

    const byCat = (cat) => entries.filter((e) => e.category === cat);
    const tmp = byCat("TMP").map((e) => parseFloat(e.fcstValue));
    const pop = byCat("POP").map((e) => parseFloat(e.fcstValue));
    const skyEntries = byCat("SKY");
    const ptyEntries = byCat("PTY");

    const closestToNoon = (arr) =>
      arr.length
        ? arr.reduce((a, b) => (Math.abs(+a.fcstTime - 1200) < Math.abs(+b.fcstTime - 1200) ? a : b)).fcstValue
        : null;

    const sky = closestToNoon(skyEntries);
    const pty = closestToNoon(ptyEntries);

    const nowTemp = tmp.length
      ? entries
          .filter((e) => e.category === "TMP")
          .reduce((a, b) => (Math.abs(+a.fcstTime - nowH) < Math.abs(+b.fcstTime - nowH) ? a : b)).fcstValue
      : null;

    days.push({
      offset,
      dt: Math.floor(dateObj.getTime() / 1000),
      high: tmp.length ? Math.max(...tmp) : null,
      low: tmp.length ? Math.min(...tmp) : null,
      pop: pop.length ? Math.max(...pop) / 100 : 0,
      description: skyDesc(sky, pty),
      nowTemp: nowTemp ? parseFloat(nowTemp) : null,
    });
  }

  return days.sort((a, b) => a.offset - b.offset);
}

// ---------- 중기예보 (+3일 ~ +7일) ----------

async function fetchMid(key, operation, regId, kst) {
  const tmFc = midTmFc(kst);
  const endpoint = `https://apis.data.go.kr/1360000/MidFcstInfoService/${operation}`;
  const qs = `serviceKey=${key}&pageNo=1&numOfRows=10&dataType=JSON&regId=${regId}&tmFc=${tmFc}`;
  const res = await fetch(`${endpoint}?${qs}`);
  if (!res.ok) throw new Error(`${operation} ${res.status}`);
  const data = await res.json();
  const item = data?.response?.body?.items?.item?.[0];
  return { item, tmFcDate: tmFc.slice(0, 8) };
}

function buildMidDaily(midLand, midTa, today) {
  const days = [];
  const landItem = midLand.item;
  const taItem = midTa.item;
  if (!landItem && !taItem) return days;

  const baseDate = new Date(
    Date.UTC(+midTa.tmFcDate.slice(0, 4), +midTa.tmFcDate.slice(4, 6) - 1, +midTa.tmFcDate.slice(6, 8))
  );

  for (let n = 3; n <= 7; n++) {
    const dateObj = addDays(baseDate, n);
    const offset = Math.round((dateObj - today) / 86400000);

    const high = taItem?.[`taMax${n}`];
    const low = taItem?.[`taMin${n}`];
    const wf = landItem?.[`wf${n}Pm`] ?? landItem?.[`wf${n}Am`] ?? landItem?.[`wf${n}`];
    const rnAm = landItem?.[`rnSt${n}Am`];
    const rnPm = landItem?.[`rnSt${n}Pm`];
    const pop = Math.max(rnAm ?? 0, rnPm ?? 0) / 100;

    days.push({
      offset,
      dt: Math.floor(dateObj.getTime() / 1000),
      high: high != null ? Number(high) : null,
      low: low != null ? Number(low) : null,
      pop,
      description: wf ?? "-",
    });
  }
  return days;
}

function json(obj, status, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}
