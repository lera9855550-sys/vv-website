const motionOK = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;

// Expose the scrollbar width so --pad-x can center content precisely (no scrollbar offset)
const setScrollbarWidth = () => {
  const sbw = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty("--sbw", Math.max(0, sbw) + "px");
};
setScrollbarWidth();
window.addEventListener("resize", setScrollbarWidth);

// In-page anchor links: smooth-scroll to the section (the wheel-damping module sets
// scroll-behavior:auto, which would otherwise make these jump instantly). Bare "#"
// placeholder links do nothing instead of jerking the page to the top.
document.addEventListener("click", (e) => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;
  const href = link.getAttribute("href");
  if (href === "#") { e.preventDefault(); return; } // placeholder — don't jump to top
  const target = document.querySelector(href);
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: motionOK ? "smooth" : "auto", block: "start" });
  history.replaceState(null, "", href);
});

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

// Services: pinned section — scroll steps through services, highlighting each and swapping the photo
const servicesWrap = document.querySelector(".services");
const serviceItems = document.querySelectorAll(".services__list li");
const serviceImgs = document.querySelectorAll(".services__media img");

if (servicesWrap && serviceItems.length) {
  let currentService = 0;

  const setService = (i) => {
    if (i === currentService) return;
    currentService = i;
    serviceItems.forEach((li, n) => li.classList.toggle("is-active", n === i));
    serviceImgs.forEach((img, n) => img.classList.toggle("is-visible", n === i));
    // mobile draws the active image on the list ::after via this custom property.
    // Use the absolute .src (not the relative attribute) — a relative url() inside a custom
    // property resolves against the stylesheet (/css/), which would 404 on assets/…
    const src = serviceImgs[i]?.src;
    if (src) servicesWrap.style.setProperty("--svc-img", `url("${src}")`);
  };

  // runs on both desktop and mobile — the section pins and cycles services on scroll
  const onServicesScroll = () => {
    const total = servicesWrap.offsetHeight - window.innerHeight;
    const passed = -servicesWrap.getBoundingClientRect().top;
    const p = Math.min(1, Math.max(0, passed / total));
    setService(Math.min(serviceItems.length - 1, Math.floor(p * serviceItems.length)));
  };

  window.addEventListener("scroll", onServicesScroll, { passive: true });
  onServicesScroll();
}

// Mobile menu (full-screen overlay, Figma "Menu Mob")
const toggle = document.querySelector(".menu-toggle");
const mobileMenu = document.querySelector(".mobile-menu");

const setMenu = (open) => {
  mobileMenu?.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
  toggle?.setAttribute("aria-expanded", String(open));
  mobileMenu?.setAttribute("aria-hidden", String(!open));
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

// Services: preview image drifts toward the cursor (blend-difference makes it pop)
const servicesSection = document.querySelector(".services");
const servicesMedia = document.querySelector(".services__media");
if (servicesSection && servicesMedia && motionOK && finePointer) {
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const tick = () => {
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    servicesMedia.style.transform = `translate(${cx}px, calc(-50% + ${cy}px))`;
    if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.4) raf = requestAnimationFrame(tick);
    else raf = null;
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  servicesSection.addEventListener("mousemove", (e) => {
    if (window.innerWidth <= 900) return;
    const r = servicesSection.getBoundingClientRect();
    tx = clamp((e.clientX - r.left - r.width * 0.72) * 0.3, -320, 60);
    ty = clamp((e.clientY - r.top - r.height * 0.5) * 0.25, -140, 140);
    kick();
  });
  servicesSection.addEventListener("mouseleave", () => {
    tx = 0;
    ty = 0;
    kick();
  });
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

// Pixel cursor follower
if (motionOK && finePointer) {
  const dot = document.createElement("div");
  dot.className = "cursor-dot";
  document.body.appendChild(dot);
  let mx = -100, my = -100, dx = -100, dy = -100;

  window.addEventListener("mousemove", (e) => {
    mx = e.clientX;
    my = e.clientY;
    dot.classList.add("is-visible");
  });
  document.addEventListener("mouseleave", () => dot.classList.remove("is-visible"));
  document.addEventListener("mouseover", (e) => {
    dot.classList.toggle("is-active", !!e.target.closest("a, button, summary, select, input, textarea"));
  });

  const follow = () => {
    dx += (mx - dx) * 0.22;
    dy += (my - dy) * 0.22;
    dot.style.transform = `translate3d(${dx}px, ${dy}px, 0) translate(-50%, -50%)`;
    requestAnimationFrame(follow);
  };
  follow();
}

// Gentle smooth scrolling — a light damping of the wheel (desktop only), so the page
// eases into place instead of snapping. Touch, keyboard and scrollbar stay native.
if (motionOK && finePointer && !("ontouchstart" in window)) {
  const root = document.documentElement;
  root.style.scrollBehavior = "auto"; // our rAF loop drives the position; CSS smooth would fight it
  const EASE = 0.14; // lower = slower/smoother glide
  const FACTOR = 0.9; // <1 = a touch less distance per wheel notch
  let target = window.scrollY;
  let raf = null;

  const maxScroll = () => root.scrollHeight - window.innerHeight;
  const run = () => {
    const cur = window.scrollY;
    const diff = target - cur;
    if (Math.abs(diff) < 0.5) {
      window.scrollTo(0, target);
      raf = null;
      return;
    }
    window.scrollTo(0, cur + diff * EASE);
    raf = requestAnimationFrame(run);
  };

  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey || e.defaultPrevented) return; // let pinch-zoom through
      if (e.target.closest("textarea, select, .mobile-menu")) return; // native scroll inside these
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; // lines → px
      else if (e.deltaMode === 2) dy *= window.innerHeight; // pages → px
      e.preventDefault();
      target = Math.max(0, Math.min(maxScroll(), (raf ? target : window.scrollY) + dy * FACTOR));
      if (!raf) raf = requestAnimationFrame(run);
    },
    { passive: false }
  );

  // resync when the page is scrolled by any other means (scrollbar drag, etc.)
  window.addEventListener("scroll", () => { if (!raf) target = window.scrollY; }, { passive: true });
  // let keyboard scrolling run natively
  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Spacebar"].includes(e.key)) {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    }
  });
}

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
    if (!link || link.target === "_blank" || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    fade.classList.remove("is-out");
    setTimeout(() => (window.location.href = link.href), 380);
  });
}
