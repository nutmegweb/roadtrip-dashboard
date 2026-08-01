/* ==========================================================================
   ROAD TRIP DASHBOARD — script.js
   Vanilla JS, no dependencies. Organized into small modules:
   i18n → storage → toast/sheet helpers → car (save/find) → stops grid →
   emergency → status widgets (network/battery) → install prompt → boot.
   ========================================================================== */

(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   * 1. i18n
   * ------------------------------------------------------------------ */

  const STRINGS = {
    en: {
      appName: "Road Trip",
      "car.title": "Your Car",
      "car.notSaved": "No location saved yet",
      "btn.save": "Save Car",
      "btn.saving": "Locating…",
      "btn.find": "Find Car",
      "btn.clear": "Clear Parking Location",
      "toast.cleared": "Saved location cleared",
      "section.quickStops": "Quick Stops",
      "toast.saved": "Car location saved",
      "toast.saveError": "Couldn't get your location",
      "toast.findError": "No saved location yet",
      "permission.title": "Before we save your spot",
      "permission.body": "We'll ask for your location just once, right now. It's stored only on this phone, never sent anywhere.",
      "permission.cta": "Allow & Save",
      "emergency.title": "Emergency numbers",
      "emergency.subtitle": "Morocco · tap to call",
      "emergency.short": "SOS",
      "install.title": "Install Road Trip",
      "install.body": "Add this to your home screen for one-tap access, even offline.",
      "install.cta": "Install",
      "install.iosBody": "Tap the Share icon in Safari, then \"Add to Home Screen.\"",
      "install.iosCta": "Got it",
      "status.online": "Online",
      "status.offline": "Offline",
      "banner.offline": "You're offline. This dashboard still works.",
      "denied.title": "Location access is off",
      "denied.body": "Turn on location for this site in your phone settings, then try again.",
      "denied.retry": "Try Again",
      justNow: "just now",
      minAgo: (n) => `${n} min ago`,
      hrAgo: (n) => `${n} hr ${n === 1 ? "" : ""}ago`,
      dayAgo: (n) => `${n} day${n === 1 ? "" : "s"} ago`,
    },
    fr: {
      appName: "Road Trip",
      "car.title": "Ta Voiture",
      "car.notSaved": "Aucun emplacement enregistré",
      "btn.save": "Enregistrer",
      "btn.saving": "Localisation…",
      "btn.find": "Retrouver",
      "btn.clear": "Effacer l'Emplacement",
      "toast.cleared": "Emplacement effacé",
      "section.quickStops": "Arrêts Rapides",
      "toast.saved": "Emplacement enregistré",
      "toast.saveError": "Impossible d'obtenir ta position",
      "toast.findError": "Aucun emplacement enregistré",
      "permission.title": "Avant d'enregistrer ta position",
      "permission.body": "On te demande ta position une seule fois, maintenant. Elle reste uniquement sur ce téléphone.",
      "permission.cta": "Autoriser",
      "emergency.title": "Numéros d'urgence",
      "emergency.subtitle": "Maroc · appuie pour appeler",
      "emergency.short": "SOS",
      "install.title": "Installer Road Trip",
      "install.body": "Ajoute l'app à ton écran d'accueil pour un accès instantané, même hors ligne.",
      "install.cta": "Installer",
      "install.iosBody": "Appuie sur Partager dans Safari, puis \"Sur l'écran d'accueil\".",
      "install.iosCta": "Compris",
      "status.online": "En ligne",
      "status.offline": "Hors ligne",
      "banner.offline": "Tu es hors ligne. Le tableau de bord fonctionne quand même.",
      "denied.title": "Localisation désactivée",
      "denied.body": "Active la localisation pour ce site dans les réglages, puis réessaie.",
      "denied.retry": "Réessayer",
      justNow: "à l'instant",
      minAgo: (n) => `il y a ${n} min`,
      hrAgo: (n) => `il y a ${n} h`,
      dayAgo: (n) => `il y a ${n} j`,
    },
  };

  let lang = localStorage.getItem("rt_lang") || (navigator.language || "en").slice(0, 2);
  if (!STRINGS[lang]) lang = "en";

  /** Translate a single key, optionally with a formatter arg. */
  const t = (key) => STRINGS[lang][key] ?? STRINGS.en[key] ?? key;

  /** Walk the DOM once and apply every data-i18n string. */
  function applyTranslations() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      const val = t(key);
      if (typeof val === "string") el.textContent = val;
    });
    document.getElementById("langCode").textContent = lang.toUpperCase();
    renderStops();       // labels are language-dependent
    renderEmergency();
    refreshCarStatus();  // relative time strings are language-dependent
    updateInstallSheetText(); // iOS copy isn't driven by data-i18n, see §7
  }

  document.getElementById("langToggle").addEventListener("click", () => {
    lang = lang === "en" ? "fr" : "en";
    localStorage.setItem("rt_lang", lang);
    applyTranslations();
    buzz(8);
  });

  /* ------------------------------------------------------------------ *
   * 2. Small utilities: haptics, toast, bottom sheets
   * ------------------------------------------------------------------ */

  /** Fire a short haptic pulse where supported; silently no-ops elsewhere. */
  function buzz(ms = 12) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  const toastEl = document.getElementById("toast");
  let toastTimer = null;
  function showToast(message) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2600);
  }

  const backdrop = document.getElementById("sheetBackdrop");
  let openSheetEl = null;

  function openSheet(id) {
    closeSheet(); // only one at a time
    const el = document.getElementById(id);
    el.hidden = false;
    backdrop.hidden = false;
    requestAnimationFrame(() => {
      el.classList.add("is-visible");
      backdrop.classList.add("is-visible");
    });
    openSheetEl = el;
    document.addEventListener("keydown", onSheetKeydown);
  }

  function closeSheet() {
    if (!openSheetEl) return;
    const el = openSheetEl;
    el.classList.remove("is-visible");
    backdrop.classList.remove("is-visible");
    setTimeout(() => {
      el.hidden = true;
      backdrop.hidden = true;
    }, 300);
    openSheetEl = null;
    document.removeEventListener("keydown", onSheetKeydown);
  }

  function onSheetKeydown(e) {
    if (e.key === "Escape") closeSheet();
  }

  backdrop.addEventListener("click", closeSheet);

  /* ------------------------------------------------------------------ *
   * 3. Car: save current location / find saved location
   * ------------------------------------------------------------------ */

  const heroCard = document.getElementById("heroCard");
  const heroSub = document.getElementById("heroSub");
  const heroCoords = document.getElementById("heroCoords");
  const saveBtn = document.getElementById("saveBtn");
  const findBtn = document.getElementById("findBtn");
  const clearBtn = document.getElementById("clearBtn");

  const CAR_KEY = "rt_car_location";
  const PRIMED_KEY = "rt_geo_primed";

  function getSavedCar() {
    try {
      return JSON.parse(localStorage.getItem(CAR_KEY));
    } catch {
      return null;
    }
  }

  /** Format seconds-ago into a short localized relative string. */
  function formatRelativeTime(savedAtMs) {
    const diffSec = Math.max(0, Math.round((Date.now() - savedAtMs) / 1000));
    if (diffSec < 60) return t("justNow");
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return t("minAgo")(diffMin);
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return t("hrAgo")(diffHr);
    const diffDay = Math.round(diffHr / 24);
    return t("dayAgo")(diffDay);
  }

  /** Repaints the hero card from whatever is currently in storage. */
  function refreshCarStatus() {
    const car = getSavedCar();
    if (!car) {
      heroCard.dataset.state = "empty";
      heroSub.textContent = t("car.notSaved");
      heroCoords.hidden = true;
      findBtn.disabled = true;
      clearBtn.hidden = true;
      return;
    }

    const ageMin = (Date.now() - car.time) / 60000;
    heroCard.dataset.state = ageMin < 15 ? "fresh" : ageMin < 180 ? "aging" : "stale";
    heroSub.textContent = formatRelativeTime(car.time);
    heroCoords.hidden = false;
    heroCoords.textContent = `${car.lat.toFixed(5)}, ${car.lng.toFixed(5)}`;
    findBtn.disabled = false;
    clearBtn.hidden = false;
  }

  /** Core geolocation call, shared by the direct and permission-primed paths. */
  function requestAndSaveLocation() {
    saveBtn.classList.add("is-loading");
    saveBtn.disabled = true;
    saveBtn.querySelector("span").textContent = t("btn.saving");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const car = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          time: Date.now(),
        };
        localStorage.setItem(CAR_KEY, JSON.stringify(car));
        localStorage.setItem(PRIMED_KEY, "1");
        resetSaveButton();
        refreshCarStatus();
        showToast(t("toast.saved"));
        buzz([10, 40, 10]);
      },
      (error) => {
        resetSaveButton();
        if (error.code === error.PERMISSION_DENIED) {
          openSheet("deniedSheet");
        } else {
          showToast(t("toast.saveError"));
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  function resetSaveButton() {
    saveBtn.classList.remove("is-loading");
    saveBtn.disabled = false;
    saveBtn.querySelector("span").textContent = t("btn.save");
  }

  saveBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showToast(t("toast.saveError"));
      return;
    }
    buzz();
    // First-ever save gets a one-time plain-language explainer before the
    // native OS permission prompt appears, so the ask isn't a surprise.
    if (!localStorage.getItem(PRIMED_KEY)) {
      openSheet("permissionSheet");
    } else {
      requestAndSaveLocation();
    }
  });

  document.getElementById("permissionCta").addEventListener("click", () => {
    closeSheet();
    requestAndSaveLocation();
  });

  document.getElementById("deniedRetry").addEventListener("click", () => {
    closeSheet();
    requestAndSaveLocation();
  });

  findBtn.addEventListener("click", () => {
    const car = getSavedCar();
    if (!car) {
      showToast(t("toast.findError"));
      return;
    }
    buzz();
    window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${car.lat},${car.lng}`;
  });

  clearBtn.addEventListener("click", () => {
    localStorage.removeItem(CAR_KEY);
    refreshCarStatus();
    showToast(t("toast.cleared"));
    buzz(8);
  });

  // Keep the "X min ago" text fresh without a full re-render.
  setInterval(refreshCarStatus, 30000);

  /* ------------------------------------------------------------------ *
   * 4. Quick stops grid — data-driven, no duplicated markup
   * ------------------------------------------------------------------ */

  const ICONS = {
    fuel: '<path d="M4 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15"/><path d="M4 11h8"/><path d="M14 8h2.5L19 10.7V17a1.5 1.5 0 0 1-3 0v-2a1 1 0 0 0-1-1h-1"/><path d="M2 21h14"/>',
    food: '<path d="M7 3v6a2 2 0 0 0 4 0V3M9 9v12M17 3c-1.5 1.4-2 3-2 5s1 3 2 3 2-1 2-3-.5-3.6-2-5Zm0 8v9"/>',
    cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M3 4h2l2.4 11.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 8H6.2"/>',
    parking: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9.5 16V8h3.2a2.6 2.6 0 0 1 0 5.2H9.5"/>',
    toilet: '<circle cx="12" cy="5" r="2"/><path d="M9 22v-7H7l1.2-6.2a2 2 0 0 1 2-1.8h3.6a2 2 0 0 1 2 1.8L17 15h-2v7"/><path d="M9 18h6"/>',
    coffee: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M7 3.5c-.6.7-.6 1.3 0 2M11 3.5c-.6.7-.6 1.3 0 2"/>',
    hospital: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M12 8v8M8 12h8"/>',
    rest: '<path d="M3 21V10l9-6 9 6v11"/><path d="M9 21v-6h6v6"/>',
  };

  // Query terms stay in English: Maps category search understands them
  // globally and "near me" resolves against wherever the phone is right now.
  const STOPS = [
    { key: "gas", icon: "fuel", query: "gas station near me", en: "Gas Station", fr: "Station-service" },
    { key: "halal", icon: "food", query: "halal restaurant near me", en: "Halal Food", fr: "Resto Halal" },
    { key: "market", icon: "cart", query: "supermarket near me", en: "Supermarket", fr: "Supermarché" },
    { key: "parking", icon: "parking", query: "parking near me", en: "Parking", fr: "Parking" },
    { key: "toilet", icon: "toilet", query: "public toilet near me", en: "Toilets", fr: "Toilettes" },
    { key: "coffee", icon: "coffee", query: "coffee near me", en: "Coffee", fr: "Café" },
    { key: "hospital", icon: "hospital", query: "hospital near me", en: "Hospital", fr: "Hôpital" },
    { key: "rest", icon: "rest", query: "rest area near me", en: "Rest Area", fr: "Aire de Repos" },
  ];

  const stopsGrid = document.getElementById("stopsGrid");

  function renderStops() {
    stopsGrid.innerHTML = STOPS.map((stop, i) => `
      <a class="stop-tile" style="animation-delay:${i * 35}ms"
         href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.query)}"
         target="_blank" rel="noopener"
         aria-label="${stop[lang] || stop.en}">
        <span class="stop-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[stop.icon]}</svg></span>
        <span class="stop-label">${stop[lang] || stop.en}</span>
      </a>
    `).join("");

    stopsGrid.querySelectorAll(".stop-tile").forEach((tile) => {
      tile.addEventListener("click", () => buzz());
    });
  }

  /* ------------------------------------------------------------------ *
   * 5. Emergency numbers
   * ------------------------------------------------------------------ */

  const EMERGENCY = [
    { en: "Police", fr: "Police", number: "19" },
    { en: "Ambulance / Fire", fr: "Ambulance / Pompiers", number: "15" },
    { en: "Highway Assistance", fr: "Assistance Autoroute", number: "150" },
    { en: "Royal Gendarmerie", fr: "Gendarmerie Royale", number: "177" },
  ];

  const emergencyList = document.getElementById("emergencyList");

  function renderEmergency() {
    emergencyList.innerHTML = EMERGENCY.map((row) => `
      <a class="emergency-row" href="tel:${row.number}">
        <span class="emergency-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4c-1.5 0-3 .6-4.2 1.7L9 7 4 12l1.3 1.3C6.4 12.1 8 10.5 9.5 9L11 7.5 14.5 4Z"/><path d="M17.7 19.5 19 18l-5-5-1.3 1.3C11.2 15.7 12.8 17.3 14 18.5L15.3 19.7A2 2 0 0 0 17.7 19.5Z"/></svg>
        </span>
        <span class="emergency-name">${row[lang] || row.en}</span>
        <span class="emergency-number">${row.number}</span>
      </a>
    `).join("");
  }

  document.getElementById("emergencyBtn").addEventListener("click", () => {
    buzz();
    openSheet("emergencySheet");
  });

  /* ------------------------------------------------------------------ *
   * 6. Status widgets: network + battery
   * ------------------------------------------------------------------ */

  const networkDot = document.getElementById("networkDot");
  const networkText = document.getElementById("networkText");
  const offlineBanner = document.getElementById("offlineBanner");

  function updateNetworkStatus() {
    const online = navigator.onLine;
    networkDot.classList.toggle("is-off", !online);
    networkText.textContent = online ? t("status.online") : t("status.offline");
    offlineBanner.classList.toggle("is-visible", !online);
    offlineBanner.hidden = false; // stays in DOM, slides via transform
  }
  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);

  const batteryPill = document.getElementById("batteryPill");
  const batteryText = document.getElementById("batteryText");
  const batteryFillRect = document.getElementById("batteryFillRect");

  // Battery Status API is only available on some Chromium browsers; feature
  // detect and simply hide the pill everywhere else rather than fake data.
  if ("getBattery" in navigator) {
    navigator.getBattery().then((battery) => {
      const paint = () => {
        const pct = Math.round(battery.level * 100);
        batteryText.textContent = `${pct}%`;
        batteryFillRect.setAttribute("width", Math.max(1, (pct / 100) * 9));
        batteryPill.hidden = false;
      };
      paint();
      battery.addEventListener("levelchange", paint);
    });
  }

  /* ------------------------------------------------------------------ *
   * 7. Install prompt (Android/Chromium native, iOS manual instructions)
   * ------------------------------------------------------------------ */

  const installBtn = document.getElementById("installBtn");
  const installSheet = document.getElementById("installSheet");
  const installBody = document.getElementById("installBody");
  const installCta = document.getElementById("installCta");
  let deferredInstallPrompt = null;

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  // installBody/installCta carry data-i18n attributes for the generic
  // (Android/desktop) copy. iOS needs different copy, so this re-applies
  // it on top of the generic pass every time applyTranslations() runs
  // (initial load + every language toggle) rather than fighting it once.
  function updateInstallSheetText() {
    if (!isIOS) return;
    installBody.textContent = t("install.iosBody");
    installCta.textContent = t("install.iosCta");
  }

  if (!isStandalone) {
    if (isIOS) {
      // iOS Safari has no beforeinstallprompt; show the button and, on tap,
      // plain instructions for the manual Add to Home Screen flow.
      installBtn.hidden = false;
      installCta.addEventListener("click", closeSheet);
      installBtn.addEventListener("click", () => openSheet("installSheet"));
    } else {
      window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        installBtn.hidden = false;
      });
      installBtn.addEventListener("click", () => openSheet("installSheet"));
      installCta.addEventListener("click", async () => {
        closeSheet();
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        installBtn.hidden = true;
      });
    }
  }

  window.addEventListener("appinstalled", () => {
    installBtn.hidden = true;
  });

  /* ------------------------------------------------------------------ *
   * 8. Service worker registration (offline app shell)
   * ------------------------------------------------------------------ */

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {
        /* offline-first is a progressive enhancement; ignore failures */
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * 9. Boot
   * ------------------------------------------------------------------ */

  applyTranslations();
  updateNetworkStatus();
})();
