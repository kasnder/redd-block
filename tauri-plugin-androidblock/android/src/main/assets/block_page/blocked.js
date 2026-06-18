(() => {
  const params = new URLSearchParams(location.search);
  const domain = params.get("domain") || "This site";
  const blocklistName = params.get("name") || "";
  const emoji = params.get("emoji");
  const color = params.get("color");
  const source = params.get("source");
  const browserPkg = params.get("browser");
  const endsAt = parseIntOrNull(params.get("endsAt"));
  const startedAt = parseIntOrNull(params.get("startedAt"));

  function parseIntOrNull(raw) {
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  const subtitle = document.getElementById("subtitle");
  if (subtitle) {
    if (source === "schedule") {
      subtitle.textContent = `${domain} is on your current schedule.`;
    } else {
      subtitle.textContent = `${domain} is on your current blocklist.`;
    }
  }

  const siteValue = document.getElementById("site-value");
  if (siteValue) siteValue.textContent = domain;

  const blocklistValue = document.getElementById("blocklist-value");
  if (blocklistValue) blocklistValue.textContent = blocklistName;

  const heroIcon = document.getElementById("hero-icon");
  const heroFallback = document.getElementById("hero-fallback");

  function showHeroIcon() {
    if (heroFallback) {
      heroFallback.hidden = true;
      heroFallback.style.display = "none";
    }
    if (heroIcon) heroIcon.hidden = false;
  }

  function showHeroFallback() {
    if (heroIcon) heroIcon.hidden = true;
    if (heroFallback) {
      heroFallback.hidden = false;
      heroFallback.style.display = "";
    }
  }

  if (browserPkg && heroIcon) {
    showHeroIcon();
    heroIcon.onload = showHeroIcon;
    heroIcon.onerror = showHeroFallback;
    heroIcon.src = `/blocked-icon?pkg=${encodeURIComponent(browserPkg)}`;
  }

  const pill = document.getElementById("pill");
  const pillName = document.getElementById("pill-name");
  const pillEmoji = document.getElementById("pill-emoji");
  if (pill && pillName && blocklistName) {
    pillName.textContent = blocklistName;
    if (emoji) {
      pillEmoji.textContent = emoji;
    } else {
      pillEmoji.remove();
    }
    if (color) {
      pill.style.setProperty("--pill-bg", color);
      pill.style.setProperty("--pill-text", textColorFor(color));
    }
    pill.hidden = false;
  }

  function textColorFor(hex) {
    try {
      const rgb = hexToRgb(hex);
      if (!rgb) return "#ffffff";
      const l = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
      return l > 150 ? "#1e2d3e" : "#ffffff";
    } catch {
      return "#ffffff";
    }
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }

  function formatHms(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.round(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
    return `${s}s`;
  }

  function formatClock(unixMs) {
    try {
      return new Date(unixMs).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  const countdownEl = document.getElementById("countdown");
  const endsAtSuffix = document.getElementById("ends-at-suffix");
  const endsRow = document.getElementById("row-ends");

  if (endsAt && countdownEl && endsAtSuffix && endsRow) {
    endsRow.hidden = false;
    const renderCountdown = () => {
      const remainingMs = endsAt - Date.now();
      if (remainingMs <= 0) {
        countdownEl.textContent = "now";
        endsAtSuffix.textContent = "";
        return;
      }
      countdownEl.textContent = formatHms(remainingMs);
      endsAtSuffix.textContent = ` · at ${formatClock(endsAt)}`;
    };
    renderCountdown();
    setInterval(renderCountdown, 1000);
  }

  const startedValue = document.getElementById("started-value");
  const startedRow = document.getElementById("row-started");
  if (startedAt && source === "schedule" && startedValue && startedRow) {
    startedValue.textContent = formatClock(startedAt);
    startedRow.hidden = false;
  }
})();
