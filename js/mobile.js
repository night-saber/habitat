/* Verde — mobile & field-ready enhancements.
 *
 * Provides:
 *  1. Service worker registration (offline support)
 *  2. PWA install prompt handling
 *  3. Touch gesture support (swipe left/right on task cards)
 *  4. Pull-to-refresh on task lists
 *  5. Camera/photo capture flow optimization
 *  6. Floating action button (FAB) for quick task creation
 *  7. Touch target enforcement (min 44x44px)
 *  8. Haptic feedback via navigator.vibrate()
 *  9. Map view mobile optimization
 * 10. Mobile bottom navigation bar
 */
"use strict";

/* ----------------------------------------------------------- helpers */
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || (window.matchMedia("(max-width: 680px)").matches && "ontouchstart" in window);
};

const vibrate = (pattern) => {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch { /* unsupported */ }
  }
};

/* ------------------------------------------- 1. service worker */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}

/* ------------------------------------------- 2. PWA install prompt */
let deferredPrompt = null;
function setupPWAInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton();
  });
}

function showInstallButton() {
  if (!deferredPrompt) return;
  const btn = document.createElement("button");
  btn.className = "btn ghost sm install-btn";
  btn.textContent = "📲 Install Verde";
  btn.onclick = async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      btn.remove();
      deferredPrompt = null;
    }
  };
  const topbar = document.querySelector(".top-right");
  if (topbar && !document.querySelector(".install-btn")) {
    topbar.appendChild(btn);
  }
}

/* ------------------------------------------- 3. touch gestures */
function initTouchGestures() {
  if (!isMobile()) return;

  // Swipe left/right on task cards
  const taskList = document.getElementById("taskList");
  if (!taskList) return;

  let startX = 0, startY = 0, startTime = 0;
  let currentCard = null;
  let swipeThreshold = 80;

  taskList.addEventListener("touchstart", (e) => {
    const card = e.target.closest(".task-card");
    if (!card) return;
    currentCard = card;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
  }, { passive: true });

  taskList.addEventListener("touchmove", (e) => {
    if (!currentCard) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    // Only respond to horizontal swipes
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      currentCard.style.transform = `translateX(${dx * 0.3}px)`;
      currentCard.style.transition = "none";
    }
  }, { passive: true });

  taskList.addEventListener("touchend", (e) => {
    if (!currentCard) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    const dt = Date.now() - startTime;

    currentCard.style.transform = "";
    currentCard.style.transition = "";

    // Fast horizontal swipe
    if (Math.abs(dx) > swipeThreshold && Math.abs(dy) < 60 && dt < 500) {
      const taskId = currentCard.dataset.taskId;
      if (!taskId) return;

      if (dx < 0) {
        // Swipe left → quick complete
        quickCompleteTask(taskId, currentCard);
      } else {
        // Swipe right → cycle status
        cycleTaskStatus(taskId, currentCard);
      }
    }
    currentCard = null;
  }, { passive: true });
}

function quickCompleteTask(taskId, card) {
  vibrate([30, 50, 30]);
  card.style.transform = "translateX(-120%)";
  card.style.opacity = "0";
  setTimeout(() => {
    // Dispatch a custom event that app.js can listen for
    document.dispatchEvent(new CustomEvent("verde:quickComplete", { detail: { taskId } }));
  }, 200);
}

function cycleTaskStatus(taskId, card) {
  vibrate(20);
  card.style.transform = "translateX(120%)";
  card.style.opacity = "0";
  setTimeout(() => {
    document.dispatchEvent(new CustomEvent("verde:cycleStatus", { detail: { taskId } }));
  }, 200);
}

/* ------------------------------------------- 4. pull-to-refresh */
function initPullToRefresh() {
  if (!isMobile()) return;

  const main = document.querySelector(".main");
  if (!main) return;

  let startY = 0;
  let pulling = false;
  let threshold = 80;
  let ptrIndicator = null;

  // Create pull-to-refresh indicator
  ptrIndicator = document.createElement("div");
  ptrIndicator.className = "ptr-indicator";
  ptrIndicator.innerHTML = "<span>↓ Pull to refresh</span>";
  ptrIndicator.style.cssText = `
    position: absolute; top: -50px; left: 50%; transform: translateX(-50%);
    padding: 8px 16px; background: var(--panel2); border: 1px solid var(--line);
    border-radius: 20px; font-size: 13px; color: var(--muted);
    transition: top 0.2s; z-index: 50; white-space: nowrap;
  `;
  main.style.position = "relative";
  main.appendChild(ptrIndicator);

  main.addEventListener("touchstart", (e) => {
    if (main.scrollTop <= 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  main.addEventListener("touchmove", (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0 && main.scrollTop <= 0) {
      ptrIndicator.style.top = `${Math.min(dy * 0.4, threshold) - 50}px`;
      if (dy > threshold) {
        ptrIndicator.innerHTML = "<span>↑ Release to refresh</span>";
      }
    }
  }, { passive: true });

  main.addEventListener("touchend", () => {
    if (!pulling) return;
    pulling = false;
    const dy = event.changedTouches[0].clientY - startY;
    if (dy > threshold && main.scrollTop <= 0) {
      vibrate(15);
      ptrIndicator.innerHTML = "<span>⟳ Refreshing…</span>";
      ptrIndicator.style.top = "10px";
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent("verde:refresh"));
        ptrIndicator.style.top = "-50px";
        ptrIndicator.innerHTML = "<span>↓ Pull to refresh</span>";
      }, 400);
    } else {
      ptrIndicator.style.top = "-50px";
    }
  });
}

/* ------------------------------------------- 5. camera optimization */
function initCameraOptimization() {
  if (!isMobile()) return;

  // Enhance all file inputs with capture attribute
  document.addEventListener("click", (e) => {
    const input = e.target.closest('input[type="file"][accept="image/*"]');
    if (input && !input.hasAttribute("data-mobile-enhanced")) {
      input.setAttribute("data-mobile-enhanced", "1");
      // Ensure capture attribute is set for mobile camera
      if (!input.hasAttribute("capture")) {
        input.setAttribute("capture", "environment");
      }
    }
  }, true);

  // Full-screen camera overlay for better mobile experience
  document.addEventListener("click", (e) => {
    const input = e.target.closest('input[type="file"][accept="image/*"]');
    if (!input) return;

    // On mobile, show a brief loading indicator
    if (isMobile()) {
      const overlay = document.createElement("div");
      overlay.className = "camera-overlay";
      overlay.innerHTML = `
        <div class="camera-overlay-content">
          <div class="camera-spinner"></div>
          <p>Opening camera…</p>
        </div>
      `;
      overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.85);
        display: grid; place-items: center; z-index: 9999;
        color: var(--text); font-size: 16px;
      `;
      document.body.appendChild(overlay);
      setTimeout(() => overlay.remove(), 1500);
    }
  }, true);
}

/* ------------------------------------------- 6. floating action button */
function initFAB() {
  if (!isMobile()) return;

  const fab = document.createElement("button");
  fab.className = "fab";
  fab.innerHTML = "+";
  fab.setAttribute("aria-label", "Quick add");
  fab.style.cssText = `
    position: fixed; bottom: 80px; right: 20px;
    width: 56px; height: 56px; border-radius: 50%;
    background: linear-gradient(135deg, var(--green), var(--green2));
    color: #04150f; border: none; font-size: 28px; font-weight: 700;
    box-shadow: 0 8px 24px -6px rgba(52,211,153,.5);
    z-index: 90; display: grid; place-items: center;
    cursor: pointer; transition: transform .15s, box-shadow .15s;
  `;
  fab.onclick = () => {
    vibrate(15);
    // Show quick action menu
    showQuickActionMenu();
  };
  document.body.appendChild(fab);
}

function showQuickActionMenu() {
  const existing = document.querySelector(".fab-menu");
  if (existing) { existing.remove(); return; }

  const menu = document.createElement("div");
  menu.className = "fab-menu";
  menu.style.cssText = `
    position: fixed; bottom: 148px; right: 20px;
    background: var(--panel2); border: 1px solid var(--line);
    border-radius: 14px; padding: 8px; z-index: 95;
    display: grid; gap: 4px; min-width: 180px;
    box-shadow: var(--shadow); animation: pop .2s ease;
  `;

  const actions = [
    { icon: "📋", label: "New task", action: () => go("tasks") },
    { icon: "📷", label: "Take photo", action: () => go("photos") },
    { icon: "📍", label: "View map", action: () => go("map") },
  ];

  actions.forEach((a) => {
    const btn = document.createElement("button");
    btn.className = "fab-menu-item";
    btn.innerHTML = `<span>${a.icon}</span> ${a.label}`;
    btn.style.cssText = `
      display: flex; align-items: center; gap: 10px;
      padding: 12px 14px; border: none; background: none;
      color: var(--text); font-size: 14.5px; border-radius: 10px;
      cursor: pointer; text-align: left; width: 100%;
    `;
    btn.onclick = () => { menu.remove(); a.action(); };
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  setTimeout(() => {
    document.addEventListener("click", function close(e) {
      if (!menu.contains(e.target) && !e.target.closest(".fab")) {
        menu.remove();
        document.removeEventListener("click", close);
      }
    });
  }, 100);
}

/* ------------------------------------------- 7. touch target enforcement */
function enforceTouchTargets() {
  if (!isMobile()) return;

  const style = document.createElement("style");
  style.textContent = `
    @media (max-width: 680px) {
      .btn, .navbtn, .chip, .link, .x, .toast-action,
      .swatch, .assign-row, .photo-cell, .thumb,
      .fab-menu-item, .map-controls select, .map-controls button {
        min-height: 44px !important;
        min-width: 44px !important;
      }
      .btn.sm { min-height: 44px !important; padding: 10px 14px !important; }
      .chip { min-height: 44px !important; padding: 10px 16px !important; }
      .navbtn { min-height: 44px !important; padding: 10px 14px !important; }
      .x { min-height: 44px !important; min-width: 44px !important; }
      .toast-action { min-height: 44px !important; }
      .swatch { min-height: 44px !important; min-width: 44px !important; }
      .assign-row { min-height: 44px !important; }
      .photo-cell { min-height: 100px !important; }
      .thumb { min-height: 84px !important; min-width: 84px !important; }
      .map-controls select, .map-controls button { min-height: 44px !important; }
      .comment-form input { min-height: 44px !important; }
      .comment-form button { min-height: 44px !important; }
      .field input, .field select, .field textarea { min-height: 44px !important; }
      .modal-actions .btn { min-height: 44px !important; }
      .card-actions .btn { min-height: 44px !important; }
      .inline-row button { min-height: 44px !important; }
    }
  `;
  document.head.appendChild(style);
}

/* ------------------------------------------- 8. haptic feedback */
function initHaptics() {
  if (!isMobile()) return;

  // Add haptic feedback to key actions
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    // Strong feedback for primary actions
    if (btn.classList.contains("btn") && !btn.classList.contains("ghost")) {
      vibrate(10);
    }
    // Light feedback for navigation
    if (btn.classList.contains("navbtn") || btn.classList.contains("chip")) {
      vibrate(5);
    }
  });

  // Haptic on task status changes
  document.addEventListener("verde:quickComplete", () => vibrate([30, 50, 30]));
  document.addEventListener("verde:cycleStatus", () => vibrate(20));
  document.addEventListener("verde:refresh", () => vibrate(15));
}

/* ------------------------------------------- 9. map mobile optimization */
function initMapMobile() {
  if (!isMobile()) return;

  // Wait for map to be initialized
  const observer = new MutationObserver(() => {
    const mapCanvas = document.getElementById("mapCanvas");
    if (mapCanvas && window.L) {
      observer.disconnect();
      enhanceMapForMobile();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function enhanceMapForMobile() {
  const style = document.createElement("style");
  style.textContent = `
    @media (max-width: 680px) {
      .map { height: 50vh !important; }
      .leaflet-popup-content-wrapper {
        max-width: 260px !important;
        border-radius: 12px !important;
      }
      .leaflet-popup-content {
        font-size: 14px !important;
        line-height: 1.5 !important;
        margin: 12px 14px !important;
      }
      .leaflet-control-zoom {
        margin-top: 10px !important;
        margin-right: 10px !important;
      }
      .leaflet-control-zoom a {
        width: 44px !important;
        height: 44px !important;
        line-height: 44px !important;
        font-size: 20px !important;
      }
      .leaflet-control-attribution {
        font-size: 10px !important;
        padding: 2px 6px !important;
      }
      .map-legend {
        flex-direction: column !important;
        gap: 6px !important;
        padding: 10px 12px !important;
      }
      .map-controls {
        flex-direction: column !important;
        align-items: stretch !important;
      }
      .map-controls select {
        width: 100% !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/* ------------------------------------------- 10. bottom navigation */
function initBottomNav() {
  if (!isMobile()) return;

  const bottomNav = document.createElement("nav");
  bottomNav.className = "bottom-nav";
  bottomNav.setAttribute("role", "navigation");
  bottomNav.setAttribute("aria-label", "Main navigation");
  bottomNav.style.cssText = `
    position: fixed; bottom: 0; left: 0; right: 0;
    background: rgba(8,17,14,.95); backdrop-filter: blur(16px);
    border-top: 1px solid var(--line);
    display: flex; justify-content: space-around;
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
    z-index: 80;
  `;

  const items = [
    { view: "dashboard", icon: "🏠", label: "Home" },
    { view: "tasks", icon: "📋", label: "Tasks" },
    { view: "map", icon: "🗺️", label: "Map" },
    { view: "photos", icon: "📷", label: "Scan" },
    { view: "settings", icon: "⚙️", label: "More" },
  ];

  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "bottom-nav-item";
    btn.innerHTML = `
      <span class="bn-icon">${item.icon}</span>
      <span class="bn-label">${item.label}</span>
    `;
    btn.style.cssText = `
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      background: none; border: none; color: var(--muted);
      padding: 6px 12px; min-width: 56px; min-height: 44px;
      cursor: pointer; border-radius: 10px;
      transition: color .15s;
    `;
    btn.onclick = () => {
      vibrate(5);
      go(item.view);
      updateBottomNav(item.view);
    };
    btn.dataset.view = item.view;
    bottomNav.appendChild(btn);
  });

  document.body.appendChild(bottomNav);

  // Add padding to main content so it's not hidden behind bottom nav
  const main = document.querySelector(".main");
  if (main) {
    main.style.paddingBottom = "80px";
  }

  // Set initial active state
  updateBottomNav("dashboard");
}

function updateBottomNav(activeView) {
  document.querySelectorAll(".bottom-nav-item").forEach((btn) => {
    const isActive = btn.dataset.view === activeView;
    btn.style.color = isActive ? "var(--green)" : "var(--muted)";
    btn.style.background = isActive ? "rgba(52,211,153,.08)" : "none";
  });
}

/* ----------------------------------------------------------- init */
function initMobile() {
  registerServiceWorker();
  setupPWAInstall();
  initTouchGestures();
  initPullToRefresh();
  initCameraOptimization();
  initFAB();
  enforceTouchTargets();
  initHaptics();
  initMapMobile();
  initBottomNav();

  // Listen for view changes to update bottom nav
  const origGo = window.go;
  if (origGo) {
    window.go = function(v) {
      origGo(v);
      updateBottomNav(v);
    };
  }
}

// Export for app.js
export { initMobile, isMobile, vibrate };

// Auto-init if DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMobile);
} else {
  initMobile();
}
