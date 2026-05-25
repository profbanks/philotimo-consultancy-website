const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const contactForm = document.querySelector("#contact-form");
const formStatus = document.querySelector("#form-status");
const faqButtons = document.querySelectorAll(".faq-item");
const leaderTabs = document.querySelectorAll(".leader-tab");
const leaderPanels = document.querySelectorAll(".leader-panel");
const metricValues = document.querySelectorAll("[data-count]");

navToggle?.addEventListener("click", () => {
  const isOpen = siteNav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

siteNav?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    siteNav.classList.remove("is-open");
    navToggle?.setAttribute("aria-expanded", "false");
  }
});

contactForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(contactForm);
  const name = data.get("name")?.toString().trim() || "there";
  formStatus.textContent = `Thank you, ${name}. Your enquiry is ready to send.`;
  contactForm.reset();
});

faqButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const answer = button.nextElementSibling;
    const isOpen = button.getAttribute("aria-expanded") === "true";

    button.setAttribute("aria-expanded", String(!isOpen));
    button.querySelector("strong").textContent = isOpen ? "+" : "-";
    answer?.classList.toggle("is-open", !isOpen);
  });
});

leaderTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.panel;

    leaderTabs.forEach((item) => {
      const isActive = item === tab;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", String(isActive));
    });

    leaderPanels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === target);
    });
  });
});

const animateMetrics = () => {
  metricValues.forEach((metric) => {
    const target = Number(metric.dataset.count);
    if (!Number.isFinite(target) || metric.dataset.animated === "true") return;

    metric.dataset.animated = "true";
    const start = performance.now();
    const duration = 900;

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      metric.textContent = String(Math.round(target * progress));
      if (progress < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  });
};

if ("IntersectionObserver" in window && metricValues.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        animateMetrics();
        observer.disconnect();
      }
    },
    { threshold: 0.35 },
  );

  observer.observe(metricValues[0]);
} else {
  animateMetrics();
}

