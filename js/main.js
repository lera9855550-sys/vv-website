const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

// Expose the scrollbar width so --pad-x can center content precisely (no scrollbar offset)
const setScrollbarWidth = () => {
  const sbw = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty("--sbw", Math.max(0, sbw) + "px");
};
setScrollbarWidth();
window.addEventListener("resize", setScrollbarWidth);

// ── Smooth-scroll controller: ONE rAF loop shared by the wheel damping and the anchor/header
// links. Previously each had its own loop with its own target, so a nav-link scroll and the wheel
// scroller fought and the wheel target (stuck near 0) yanked the page back to the hero. ──
const smoothScroll = (() => {
  const root = document.documentElement;
  const desktop = motionOK && finePointer && !("ontouchstart" in window);
  if (motionOK) root.style.scrollBehavior = "auto"; // we drive scrolling; CSS smooth would double up
  const EASE = 0.14; // wheel follow damping
  const FACTOR = 0.9; // <1 = a touch less distance per wheel notch
  const DUR = 600; // anchor glide duration (ms)
  const maxScroll = () => root.scrollHeight - window.innerHeight;
  const clampY = (y) => Math.max(0, Math.min(maxScroll(), y));
  const setY = (y) => window.scrollTo({ top: y, behavior: "instant" }); // bypass CSS smooth

  let target = window.scrollY, raf = null, mode = "idle";
  let aFrom = 0, aTo = 0, aStart = 0;

  const wheelRun = () => {
    const cur = window.scrollY, diff = target - cur;
    if (Math.abs(diff) < 0.5) { setY(target); raf = null; mode = "idle"; return; }
    setY(cur + diff * EASE);
    raf = requestAnimationFrame(wheelRun);
  };
  const anchorRun = (ts) => {
    if (!aStart) aStart = ts;
    const p = Math.min(1, (ts - aStart) / DUR);
    setY(aFrom + (aTo - aFrom) * (1 - Math.pow(1 - p, 3))); // easeOutCubic
    if (p < 1) raf = requestAnimationFrame(anchorRun);
    else { raf = null; mode = "idle"; target = aTo; } // leave the shared target at the landing spot
  };

  if (desktop) {
    window.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.defaultPrevented) return; // let pinch-zoom through
      if (e.target.closest("textarea, select, .mobile-menu")) return; // native scroll inside these
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= window.innerHeight;
      e.preventDefault();
      if (mode !== "wheel") { if (raf) cancelAnimationFrame(raf); raf = null; target = window.scrollY; } // take over from an anchor glide
      mode = "wheel";
      target = clampY(target + dy * FACTOR);
      if (!raf) raf = requestAnimationFrame(wheelRun);
    }, { passive: false });
    // resync target when scrolled by any other means (scrollbar drag, etc.)
    window.addEventListener("scroll", () => { if (!raf) target = window.scrollY; }, { passive: true });
    // keyboard scrolling runs natively — stop the loop so it doesn't fight
    window.addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Spacebar"].includes(e.key)) {
        if (raf) { cancelAnimationFrame(raf); raf = null; mode = "idle"; }
      }
    });
  }

  return {
    to(y) {
      y = clampY(y);
      target = y; // keep the shared target in sync so the wheel loop never yanks back
      if (!motionOK) { setY(y); return; }
      if (raf) cancelAnimationFrame(raf);
      mode = "anchor"; aFrom = window.scrollY; aTo = y; aStart = 0;
      raf = requestAnimationFrame(anchorRun);
    },
  };
})();

// In-page anchor links (header nav, footer nav): smooth-scroll to the section via the shared
// controller. Bare "#" placeholder links do nothing instead of jerking the page to the top.
document.addEventListener("click", (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;
  const href = link.getAttribute("href");
  if (href === "#") { e.preventDefault(); return; }
  const target = document.querySelector(href);
  if (!target) return;
  e.preventDefault();
  history.replaceState(null, "", href);
  const go = () => smoothScroll.to(Math.round(target.getBoundingClientRect().top + window.scrollY));
  // Tapped inside the mobile menu: it closes on click (0.3s fade), so wait for it — otherwise the
  // page scrolls behind an opaque full-screen overlay and the motion is invisible.
  if (link.closest(".mobile-menu")) setTimeout(go, 320);
  else go();
});

// Header: hides while scrolling down, comes back on the first upward scroll. Near the very top
// it returns to its original transparent state; below that it gets the .is-stuck backdrop so the
// white logo/nav stay readable over the light sections.
(() => {
  const header = document.querySelector(".header");
  if (!header) return;

  // the intro animation is fill:forwards and would outrank the hide transform — retire it once played
  const ready = () => header.classList.add("is-ready");
  header.addEventListener("animationend", ready, { once: true });
  setTimeout(ready, 1200); // fallback (reduced-motion never fires animationend)

  const TOP_ZONE = 90; // above this we're "at the top": always shown
  const DELTA = 6; // ignore sub-pixel jitter / rubber-banding
  const PROBE = 40; // point (px from top) where we sample which section sits under the bar
  const lightSections = [...document.querySelectorAll(".section-light")];
  let lastY = window.scrollY;
  let queued = false;

  const update = () => {
    queued = false;
    const y = Math.max(0, window.scrollY);
    const diff = y - lastY;

    // invert colours when a light section is behind the bar (black on light, white on dark)
    const onLight = lightSections.some((s) => {
      const r = s.getBoundingClientRect();
      return r.top <= PROBE && r.bottom >= PROBE;
    });
    header.classList.toggle("header--on-light", onLight);

    if (document.body.classList.contains("menu-open")) { // mobile menu open — keep it put
      header.classList.remove("is-hidden");
      lastY = y;
      return;
    }
    if (y <= TOP_ZONE) header.classList.remove("is-hidden");
    else if (Math.abs(diff) > DELTA) header.classList.toggle("is-hidden", diff > 0);
    lastY = y;
  };

  window.addEventListener("scroll", () => {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();

// Sliders ([ 01 / 04 ] counter + prev/next arrows + progress rule)
document.querySelectorAll(".side-panel").forEach((panel) => {
  const slidesWrap = panel.querySelector("[data-slides]");
  if (!slidesWrap) return;

  const slides = Array.from(slidesWrap.children);
  const counter = panel.querySelector("[data-counter]");
  const rule = panel.querySelector(".side-panel__rule");
  let index = 0;

  const show = (i) => {
    index = (i + slides.length) % slides.length;
    slides.forEach((s, n) => (s.hidden = n !== index));
    if (counter) counter.textContent = String(index + 1).padStart(2, "0");
    rule?.style.setProperty("--progress", ((index + 1) / slides.length) * 100 + "%");
  };

  panel.querySelector("[data-prev]")?.addEventListener("click", () => show(index - 1));
  panel.querySelector("[data-next]")?.addEventListener("click", () => show(index + 1));
  show(0);
});

// Services: hovering a service highlights it and reveals its photo (normal scroll, no pin)
const servicesWrap = document.querySelector(".services");
const serviceItems = document.querySelectorAll(".services__list li");
const serviceImgs = document.querySelectorAll(".services__media img");

if (servicesWrap && serviceItems.length) {
  const showService = (i) => {
    serviceItems.forEach((li, n) => li.classList.toggle("is-active", n === i));
    serviceImgs.forEach((img, n) => img.classList.toggle("is-visible", n === i));
    // mobile draws the active image on the list ::after via this custom property.
    // Use the absolute .src (not the relative attribute) — a relative url() inside a custom
    // property resolves against the stylesheet (/css/), which would 404 on assets/…
    const src = serviceImgs[i]?.src;
    if (src) servicesWrap.style.setProperty("--svc-img", `url("${src}")`);
  };
  const clearService = () => {
    serviceItems.forEach((li) => li.classList.remove("is-active"));
    serviceImgs.forEach((img) => img.classList.remove("is-visible"));
  };

  // mobile ::after has no hover — seed it with the first (absolute) image so it isn't blank
  if (serviceImgs[0]?.src) servicesWrap.style.setProperty("--svc-img", `url("${serviceImgs[0].src}")`);

  serviceItems.forEach((li, i) => li.addEventListener("mouseenter", () => showService(i)));
  const servicesList = document.querySelector(".services__list");
  if (servicesList) servicesList.addEventListener("mouseleave", clearService);

  // Touch has no hover: without an active item the names sit unreadable under the
  // difference-blended image. Activate the first service by default and let taps switch.
  if (window.matchMedia("(hover: none)").matches) {
    showService(0);
    serviceItems.forEach((li, i) => li.addEventListener("click", () => showService(i)));
  }
}

// Mobile menu (full-screen overlay, Figma "Menu Mob")
const toggle = document.querySelector(".menu-toggle");
const mobileMenu = document.querySelector(".mobile-menu");

const setMenu = (open) => {
  mobileMenu?.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
  toggle?.setAttribute("aria-expanded", String(open));
  mobileMenu?.setAttribute("aria-hidden", String(!open));
  if (open) startMenuScene(); // spin up the animated background the first time the menu opens
};

toggle?.addEventListener("click", () => setMenu(!mobileMenu?.classList.contains("is-open")));
mobileMenu?.querySelector(".mobile-menu__close")?.addEventListener("click", () => setMenu(false));
mobileMenu?.querySelectorAll(".mobile-menu__links a, .btn").forEach((link) =>
  link.addEventListener("click", () => setMenu(false))
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setMenu(false);
});

// FAQ: smooth accordion via CSS grid-rows (0fr↔1fr). Keep <details> natively open so the
// content is always in flow; the collapse is purely the grid transition off .is-open.
// Single-open: opening one question closes any other that's open.
const faqItems = [...document.querySelectorAll(".faq__item")];
faqItems.forEach((item, idx) => {
  const summary = item.querySelector("summary");
  const answer = item.querySelector(".faq__answer");
  if (!summary || !answer) return;

  // two wrappers: a padding-free clipper (the grid item that collapses to 0) + a padded body
  if (!answer.querySelector(".faq__answer-clip")) {
    const clip = document.createElement("div");
    clip.className = "faq__answer-clip";
    const inner = document.createElement("div");
    inner.className = "faq__answer-inner";
    while (answer.firstChild) inner.appendChild(answer.firstChild);
    clip.appendChild(inner);
    answer.appendChild(clip);
  }

  // start with only the first item open (max one at a time)
  item.classList.toggle("is-open", idx === 0);
  item.open = true; // keep content laid out; visibility is controlled by .is-open only

  summary.addEventListener("click", (e) => {
    e.preventDefault();
    const willOpen = !item.classList.contains("is-open");
    faqItems.forEach((other) => other.classList.remove("is-open")); // close everything
    if (willOpen) item.classList.add("is-open"); // then open the clicked one (if it was closed)
    syncFaqAria();
  });
});

// a11y: hide collapsed answers from screen readers so they don't announce every answer,
// and reflect the open/closed state on each question button.
function syncFaqAria() {
  faqItems.forEach((item) => {
    const open = item.classList.contains("is-open");
    const summary = item.querySelector("summary");
    const answer = item.querySelector(".faq__answer");
    summary?.setAttribute("aria-expanded", String(open));
    answer?.setAttribute("aria-hidden", String(!open));
  });
}
syncFaqAria();

// Contact page: the mobile sticky submit button tucks away once the form is scrolled
// past (the testimonial panel comes into view), so it doesn't cover the footer/testimonial.
const stickySubmit = document.querySelector(".contact-form .btn");
const contactAside = document.querySelector(".contact-aside");
if (stickySubmit && contactAside) {
  const updateSticky = () => {
    // tuck the button away as the testimonial panel starts entering from the bottom
    const asideTop = contactAside.getBoundingClientRect().top;
    stickySubmit.classList.toggle("is-tucked", asideTop < window.innerHeight - 40);
  };
  window.addEventListener("scroll", updateSticky, { passive: true });
  window.addEventListener("resize", updateSticky);
  updateSticky();
}

// Live Kyiv clock in the footer
const timeEl = document.querySelector("[data-kyiv-time]");
const dateEl = document.querySelector("[data-kyiv-date]");

function updateClock() {
  const now = new Date();
  if (timeEl) {
    const time = now.toLocaleTimeString("en-US", {
      timeZone: "Europe/Kyiv",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    timeEl.textContent = `Kyiv City ${time}`;
  }
  if (dateEl) {
    const date = now.toLocaleDateString("en-US", {
      timeZone: "Europe/Kyiv",
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const offsetName =
      new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Kyiv", timeZoneName: "longOffset" })
        .formatToParts(now)
        .find((p) => p.type === "timeZoneName")?.value ?? "GMT+02:00";
    const offset = offsetName.replace("GMT", "GMT ").replace(":00", "");
    dateEl.textContent = `${date} (${offset})`;
  }
}

if (timeEl || dateEl) {
  updateClock();
  setInterval(updateClock, 1000);
}

/* ============ Animations ============ */

// Scroll reveal: JS adds the hiding class, so content stays visible without JS
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add("in-view");
        io.unobserve(en.target);
      }
    });
  },
  { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
);

const prep = (selector, { stagger = 0, cls = "anim-item" } = {}) => {
  document.querySelectorAll(selector).forEach((el, i) => {
    el.classList.add(cls);
    if (stagger) el.style.transitionDelay = (i % 12) * stagger + "ms";
    io.observe(el);
  });
};

if (motionOK) {
  prep(".section-title");
  prep(".statement .side-panel");
  prep(".statement__body .person");
  prep(".work-card", { stagger: 120 });
  prep(".services .side-panel");
  prep(".services__list li", { stagger: 90 });
  prep(".process-step", { cls: "anim-lines" });
  prep(".process-step__label");
  prep(".process-step__info");
  prep(".process-step__media");
  prep(".pricing__intro");
  prep(".price-card", { stagger: 120 });
  prep(".faq__item", { stagger: 70 });
  prep(".cta__title", { cls: "anim-words" });
  prep(".cta .btn");
  prep(".footer__nav a", { stagger: 80 });
  prep(".footer__links-col", { stagger: 100 });
  prep(".footer__contact");
  prep(".contact-intro__heading");
  prep(".contact-form .field", { stagger: 70 });
  // note: .contact-form .btn is intentionally NOT revealed — on mobile it's a fixed
  // bottom button, and the reveal's opacity/translate would fight the fixed positioning
  prep(".contact-aside");
}

// Split a text node into word spans
const splitWords = (el) => {
  const words = el.textContent.split(/\s+/).filter(Boolean);
  el.innerHTML = words.map((w) => `<span class="word">${w}</span>`).join(" ");
  return el.querySelectorAll(".word");
};

// Manifest: gray base text with a gradient overlay that reveals word-by-word on scroll
const manifest = document.querySelector(".statement__text");
if (manifest) {
  // gradient copy sits on top of the plain gray text; its words fade in as you scroll
  const fill = document.createElement("span");
  fill.className = "statement__fill";
  fill.setAttribute("aria-hidden", "true");
  // split on regular spaces only so non-breaking spaces (e.g. "3D — ") stay inside a token
  // and both layers wrap identically
  fill.innerHTML = manifest.textContent
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => `<span class="word">${w}</span>`)
    .join(" ");
  manifest.appendChild(fill);
  const words = fill.querySelectorAll(".word");

  if (!motionOK) {
    words.forEach((w) => w.classList.add("is-on"));
  } else {
    const onScroll = () => {
      const r = manifest.getBoundingClientRect();
      const vh = window.innerHeight;
      // Drive the reveal off the block's own travel: start when its BOTTOM enters at
      // ~95% of the viewport, finish when its TOP reaches the vertical center. That way
      // every word (incl. the last line) is lit while the text sits comfortably centered,
      // not only once it has scrolled up near the top edge.
      const startAt = vh * 0.9; // r.top at which the first word lights (block enters)
      const endAt = vh * 0.4; // r.top at which the last word lights (block comfortably in view)
      const p = Math.min(1, Math.max(0, (startAt - r.top) / (startAt - endAt)));
      const n = Math.ceil(p * words.length); // ceil guarantees the final word fills at p = 1
      words.forEach((w, i) => w.classList.toggle("is-on", i < n));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
}

// CTA title: staggered word blur-in when it enters the viewport
const ctaTitle = document.querySelector(".cta__title");
if (ctaTitle && motionOK) {
  splitWords(ctaTitle).forEach((w, i) => (w.style.transitionDelay = i * 40 + "ms"));
}

// Count-up for stats and prices
const countUp = (el) => {
  if (el.dataset.counted) return;
  el.dataset.counted = "1";
  const m = el.textContent.trim().match(/^([^0-9]*)(\d+)(.*)$/);
  if (!m) return;
  const target = parseInt(m[2], 10);
  const t0 = performance.now();
  const dur = 1100;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = m[1] + Math.round(target * eased) + m[3];
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

if (motionOK) {
  const ioCount = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          countUp(en.target);
          ioCount.unobserve(en.target);
        }
      });
    },
    { threshold: 0.6 }
  );
  document.querySelectorAll(".stat__value, .price-card__price").forEach((el) => ioCount.observe(el));
}

// Hero: background parallax
const hero = document.querySelector(".hero");
if (hero && motionOK) {
  window.addEventListener(
    "scroll",
    () => {
      hero.style.backgroundPosition = `center calc(50% + ${window.scrollY * 0.18}px)`;
    },
    { passive: true }
  );
}

// Touch devices: scroll-driven "hover" for work cards — a card crossing the middle band
// of the viewport gets .is-hovered (blur + preview panel + caption), released on exit.
if (window.matchMedia("(hover: none)").matches) {
  const workCards = document.querySelectorAll(".work-card");
  if (workCards.length) {
    const ioHover = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => en.target.classList.toggle("is-hovered", en.isIntersecting));
      },
      { rootMargin: "-38% 0px -38% 0px", threshold: 0 } // active while inside the middle ~24% of the screen
    );
    workCards.forEach((c) => ioHover.observe(c));
  }
}

// Crosshair cursor: viewport-wide hairlines tracking the pointer
if (motionOK && finePointer) {
  const cross = document.createElement("div");
  cross.className = "cursor-cross";
  cross.innerHTML =
    '<span class="cursor-cross__x"></span>' +
    '<span class="cursor-cross__y"></span>';
  document.body.appendChild(cross);
  const lineX = cross.querySelector(".cursor-cross__x");
  const lineY = cross.querySelector(".cursor-cross__y");

  let mx = -100, my = -100, cx = -100, cy = -100;

  window.addEventListener("mousemove", (e) => {
    mx = e.clientX;
    my = e.clientY;
    cross.classList.add("is-visible");
  });
  document.addEventListener("mouseleave", () => cross.classList.remove("is-visible"));

  const follow = () => {
    cx += (mx - cx) * 0.35;
    cy += (my - cy) * 0.35;
    lineX.style.transform = `translateY(${cy}px)`;
    lineY.style.transform = `translateX(${cx}px)`;
    requestAnimationFrame(follow);
  };
  follow();
}

// (Wheel damping now lives in the shared smoothScroll controller near the top of this file.)

// Page transition fade
if (motionOK) {
  const fade = document.createElement("div");
  fade.className = "page-fade";
  document.body.appendChild(fade);
  requestAnimationFrame(() => requestAnimationFrame(() => fade.classList.add("is-out")));

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) fade.classList.add("is-out");
  });

  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href$=".html"], a[href*=".html#"]');
    // let the browser handle new-window/new-tab/download intents natively
    if (!link || link.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    fade.classList.remove("is-out");
    setTimeout(() => (window.location.href = link.href), 380);
  });
}

// Contact form → serverless endpoint (Vercel function `api/lead.js` forwards it to Telegram).
// After deploying the function on Vercel, paste its URL below.
const leadForm = document.getElementById("lead-form");
if (leadForm) {
  const LEAD_ENDPOINT = "https://vv-website-delta.vercel.app/api/lead";
  const statusEl = leadForm.querySelector("[data-form-status]");
  const submitBtn = leadForm.querySelector("button[type=submit]");
  const btnLabel = submitBtn && submitBtn.querySelector("span");

  const setStatus = (msg, ok) => {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.toggle("is-ok", ok === true);
    statusEl.classList.toggle("is-err", ok === false);
  };

  leadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("", null);
    const data = Object.fromEntries(new FormData(leadForm));

    if (!leadForm.consent || !leadForm.consent.checked)
      return setStatus("Please agree to the processing of your data.", false);
    if (!data.email || !data.email.includes("@"))
      return setStatus("Please enter a valid email.", false);

    submitBtn.disabled = true;
    const original = btnLabel && btnLabel.textContent;
    if (btnLabel) btnLabel.textContent = "Sending…";

    try {
      const res = await fetch(LEAD_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out.ok) throw new Error();
      leadForm.reset();
      setStatus("Thanks! Your message has been sent — we'll be in touch.", true);
    } catch {
      setStatus("Couldn't send. Please try again, or email hello@email.com.", false);
    } finally {
      submitBtn.disabled = false;
      if (btnLabel && original) btnLabel.textContent = original;
    }
  });
}

// Process videos: ship without src/autoplay (poster only). Fetch + play a clip only while it's
// near/in the viewport, pause it when it leaves — so the ~1MB of loops never loads on first paint
// and never burns CPU/battery offscreen. Reduced-motion users just keep the static posters.
const lazyVideos = document.querySelectorAll("video[data-src]");
if (motionOK && lazyVideos.length && "IntersectionObserver" in window) {
  const videoIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        const v = en.target;
        if (en.isIntersecting) {
          if (!v.src) v.src = v.dataset.src; // fetch only now
          const p = v.play();
          if (p && p.catch) p.catch(() => {}); // ignore autoplay-policy rejections
        } else if (!v.paused) {
          v.pause();
        }
      });
    },
    { rootMargin: "200px 0px" } // warm up just before it scrolls into view
  );
  lazyVideos.forEach((v) => videoIO.observe(v));
}

// Animated Unicorn Studio backgrounds (hero + footer), each over a dark base. Progressive
// enhancement: skipped entirely for reduced-motion. The WebGL SDK is loaded once on demand so it
// never blocks first paint; a lighter render scale is used on phones/tablets. The hero starts
// immediately (above the fold); the footer lazy-loads only when scrolled near, to save GPU and
// keep the second scene off the network until it's actually needed. pointer-events:none lets
// clicks/scroll pass through.
const sceneTargets = [
  { id: "hero-bg", lazy: false },
  { id: "footer-bg", lazy: true },
].filter((t) => document.getElementById(t.id));

if (sceneTargets.length && motionOK) {
  const startScenes = () => {
    if (!window.UnicornStudio || !window.UnicornStudio.addScene) return;
    sceneTargets.forEach((t) => {
      const el = document.getElementById(t.id);
      window.UnicornStudio.addScene({
        elementId: t.id,
        filePath: "assets/hero-scene.json", // self-hosted scene — no dependency on Unicorn's servers/subscription
        scale: finePointer ? 1 : 0.6, // lower internal resolution on touch devices
        dpi: 1.5,
        fps: 60,
        lazyLoad: t.lazy,
        production: true,
      })
        .then(() => el.classList.add("is-ready"))
        .catch(() => {}); // on failure the dark base / hero poster just stays
    });
  };

  if (window.UnicornStudio && window.UnicornStudio.addScene) {
    startScenes();
  } else {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.2.8/dist/unicornStudio.umd.js";
    s.async = true;
    s.onload = startScenes;
    document.head.appendChild(s);
  }
}

// The mobile menu shares the hero's animated background, but it's only initialised the first time
// the menu opens — no point running a third WebGL scene while the menu is closed. Reuses the SDK if
// the hero already loaded it, otherwise loads it on demand. Skipped under reduced-motion.
let menuSceneStarted = false;
function startMenuScene() {
  if (menuSceneStarted || !motionOK) return;
  const el = document.getElementById("menu-bg");
  if (!el) return;
  const add = () => {
    if (!window.UnicornStudio || !window.UnicornStudio.addScene) return;
    menuSceneStarted = true;
    window.UnicornStudio.addScene({
      elementId: "menu-bg",
      filePath: "assets/hero-scene.json",
      scale: finePointer ? 1 : 0.6,
      dpi: 1.5,
      fps: 60,
      lazyLoad: false,
      production: true,
    })
      .then(() => el.classList.add("is-ready"))
      .catch(() => {});
  };
  if (window.UnicornStudio && window.UnicornStudio.addScene) {
    add();
  } else {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.2.8/dist/unicornStudio.umd.js";
    s.async = true;
    s.onload = add;
    document.head.appendChild(s);
  }
}
