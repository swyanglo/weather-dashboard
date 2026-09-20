// 기본 위치: 서울 (위치 권한 거부 시 폴백)
const FALLBACK = { lat: 37.5665, lon: 126.9780, name: "서울" };

const $ = (id) => document.getElementById(id);

const dayFmt = new Intl.DateTimeFormat("ko-KR", { weekday: "short" });

// ---------- 날씨 아이콘 (라인 아이콘, currentColor 사용) ----------

const ICONS = {
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.3"/><path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/></svg>`,
  cloud: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.1 9.5 4 4 0 0 0 7 18Z"/></svg>`,
  rain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 14.5h10a4 4 0 0 0 .4-7.98A5.5 5.5 0 0 0 6.6 6a4 4 0 0 0-.1 8.5Z"/><path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2"/></svg>`,
  snow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 13.5h10a4 4 0 0 0 .4-7.98A5.5 5.5 0 0 0 6.6 5a4 4 0 0 0-.1 8.5Z"/><path d="M8 17.5v3M8 17.5l-1.2 1M8 17.5l1.2 1M12 17.5v3M12 17.5l-1.2 1M12 17.5l1.2 1M16 17.5v3M16 17.5l-1.2 1M16 17.5l1.2 1"/></svg>`,
};

function iconKeyFor(desc) {
  if (!desc) return "cloud";
  if (desc.includes("눈")) return "snow";
  if (desc.includes("비") || desc.includes("소나기") || desc.includes("빗방울")) return "rain";
  if (desc.includes("맑음")) return "sun";
  return "cloud"; // 구름많음, 흐림, 그 외
}

function iconSvg(desc, cls) {
  const key = iconKeyFor(desc);
  return `<span class="wicon wicon-${key} ${cls || ""}">${ICONS[key]}</span>`;
}

function showError(msg) {
  const el = $("errorMsg");
  el.textContent = msg;
  el.hidden = false;
}

function renderToday(data) {
  const desc = data.current.description;
  $("todayIcon").innerHTML = iconSvg(desc, "today-icon-svg");
  $("todayTemp").textContent = `${Math.round(data.current.temp)}°`;
  $("todayDesc").textContent = desc;
  $("todayHigh").textContent = `${Math.round(data.daily[0].high)}°`;
  $("todayLow").textContent = `${Math.round(data.daily[0].low)}°`;

  const today = $("today");
  today.className = `today cond-${iconKeyFor(desc)}`;
}

function renderWeek(daily) {
  const list = $("weekList");
  list.innerHTML = "";
  daily.forEach((d, i) => {
    const li = document.createElement("li");
    const label = i === 0 ? "오늘" : dayFmt.format(new Date(d.dt * 1000));
    li.innerHTML = `
      <span class="day-name">${label}</span>
      ${iconSvg(d.description, "day-icon-svg")}
      <span class="day-desc">${d.description}</span>
      <span class="day-rain">${Math.round(d.pop * 100)}%</span>
      <span class="day-temps">
        <span class="day-high">${Math.round(d.high)}°</span><span class="day-low">${Math.round(d.low)}°</span>
      </span>`;
    list.appendChild(li);
  });
}

async function loadWeather(lat, lon, name) {
  $("locName").textContent = name;
  try {
    const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    renderToday(data);
    renderWeek(data.daily);
  } catch (err) {
    showError("날씨 정보를 불러오지 못했습니다.");
    console.error(err);
  }
}

function init() {
  const toggle = $("toggleWeek");
  const week = $("week");
  toggle.addEventListener("click", () => {
    const open = week.classList.toggle("open");
    week.hidden = false;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "주간 예보 접기" : "주간 예보 보기";
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => loadWeather(pos.coords.latitude, pos.coords.longitude, "현재 위치"),
      () => loadWeather(FALLBACK.lat, FALLBACK.lon, FALLBACK.name),
      { timeout: 6000 }
    );
  } else {
    loadWeather(FALLBACK.lat, FALLBACK.lon, FALLBACK.name);
  }
}

init();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
