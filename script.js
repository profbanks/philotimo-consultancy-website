const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const contactForm = document.querySelector("#contact-form");
const formStatus = document.querySelector("#form-status");
const faqButtons = document.querySelectorAll(".faq-item");
const leaderTabs = document.querySelectorAll(".leader-tab");
const leaderPanels = document.querySelectorAll(".leader-panel");
const metricValues = document.querySelectorAll("[data-count]");
const teacherApplicationForm = document.querySelector("#teacher-application-form");
const studentRequestForm = document.querySelector("#student-request-form");
const adminAccessForm = document.querySelector("#admin-access-form");
const teacherApplicationStatus = document.querySelector("#teacher-application-status");
const studentRequestStatus = document.querySelector("#student-request-status");
const adminStatus = document.querySelector("#admin-status");
const adminWorkspace = document.querySelector("#admin-workspace");
const pendingTeachersList = document.querySelector("#pending-teachers");
const approvedTeachersList = document.querySelector("#approved-teachers");
const studentRequestsList = document.querySelector("#student-requests");
const allocationBoard = document.querySelector("#allocation-board");
const pendingCount = document.querySelector("#pending-count");
const approvedCount = document.querySelector("#approved-count");
const studentCount = document.querySelector("#student-count");
const allocationCount = document.querySelector("#allocation-count");

const PORTAL_STORAGE_KEY = "philotimo-consultancy-portal";
const ADMIN_CODE = "PHILOTIMO-ADMIN";

const createId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const loadPortalData = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(PORTAL_STORAGE_KEY));
    return {
      teachers: Array.isArray(saved?.teachers) ? saved.teachers : [],
      students: Array.isArray(saved?.students) ? saved.students : [],
      allocations: Array.isArray(saved?.allocations) ? saved.allocations : [],
    };
  } catch {
    return { teachers: [], students: [], allocations: [] };
  }
};

let portalData = loadPortalData();
let adminUnlocked = false;

const savePortalData = () => {
  localStorage.setItem(PORTAL_STORAGE_KEY, JSON.stringify(portalData));
};

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatDate = (value) =>
  new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(value));

const splitSubjects = (teacher) =>
  [teacher.primarySubject, teacher.otherSubjects]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((subject) => subject.trim().toLowerCase())
    .filter(Boolean);

const scoreTeacherForStudent = (teacher, student) => {
  const subjects = splitSubjects(teacher);
  const requestedSubject = student.requestedSubject.toLowerCase();
  let score = 0;

  if (teacher.primarySubject.toLowerCase() === requestedSubject) score += 60;
  if (subjects.includes(requestedSubject)) score += 30;
  if (teacher.classLevels.includes(student.studentClass)) score += 25;
  if (teacher.teachingMode === student.preferredMode || teacher.teachingMode === "Hybrid lesson") score += 15;
  if (Number(teacher.experienceYears) >= 5) score += 8;

  return score;
};

const getApprovedTeachers = () => portalData.teachers.filter((teacher) => teacher.status === "approved");

const getTeacherMatches = (student) =>
  getApprovedTeachers()
    .map((teacher) => ({ teacher, score: scoreTeacherForStudent(teacher, student) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.teacher.experienceYears) - Number(a.teacher.experienceYears));

const renderTeacherCard = (teacher, mode) => {
  const statusClass = teacher.status === "approved" ? "approved" : teacher.status === "rejected" ? "rejected" : "pending";
  const actions =
    mode === "pending"
      ? `
        <div class="record-actions">
          <button class="mini-button" type="button" data-portal-action="approve-teacher" data-id="${teacher.id}">Approve</button>
          <button class="mini-button warn" type="button" data-portal-action="reject-teacher" data-id="${teacher.id}">Reject</button>
        </div>`
      : `
        <div class="record-actions">
          <button class="mini-button secondary" type="button" data-portal-action="reopen-teacher" data-id="${teacher.id}">Move to pending</button>
        </div>`;

  return `
    <article class="portal-record">
      <header>
        <div>
          <h5>${escapeHtml(teacher.teacherName)}</h5>
          <p>${escapeHtml(teacher.primarySubject)} teacher at ${escapeHtml(teacher.workplace)}</p>
        </div>
        <span class="status-pill ${statusClass}">${escapeHtml(teacher.status)}</span>
      </header>
      <div class="portal-meta">
        <span>${escapeHtml(teacher.experienceYears)} years</span>
        <span>${escapeHtml(teacher.qualification)}</span>
        <span>${escapeHtml(teacher.teachingMode)}</span>
        <span>${escapeHtml(teacher.coverage)}</span>
      </div>
      <p>${escapeHtml(teacher.experienceSummary)}</p>
      <p><strong>Classes:</strong> ${escapeHtml(teacher.classLevels.join(", "))}</p>
      <p><strong>Contact:</strong> ${escapeHtml(teacher.teacherPhone)} | ${escapeHtml(teacher.teacherEmail)}</p>
      ${actions}
    </article>`;
};

const renderStudentCard = (student) => {
  const matches = getTeacherMatches(student);
  const allocated = portalData.allocations.find((allocation) => allocation.studentId === student.id);
  const allocationText = allocated
    ? `<p class="match-note">Allocated to ${escapeHtml(allocated.teacherName)} for ${escapeHtml(allocated.subject)}.</p>`
    : "";
  const selectOptions = matches.length
    ? matches
        .map(
          ({ teacher, score }) =>
            `<option value="${teacher.id}">${escapeHtml(teacher.teacherName)} | ${escapeHtml(teacher.primarySubject)} | ${score}% match</option>`,
        )
        .join("")
    : `<option value="">No approved teacher match yet</option>`;
  const allocationTools = allocated
    ? `<button class="mini-button secondary" type="button" data-portal-action="clear-allocation" data-id="${student.id}">Change allocation</button>`
    : `
      <div class="allocation-tools">
        <select class="allocation-select" data-allocation-select="${student.id}" ${matches.length ? "" : "disabled"}>
          ${selectOptions}
        </select>
        <button class="mini-button" type="button" data-portal-action="allocate-student" data-id="${student.id}" ${matches.length ? "" : "disabled"}>Allocate</button>
      </div>`;

  return `
    <article class="portal-record">
      <header>
        <div>
          <h5>${escapeHtml(student.studentName)}</h5>
          <p>${escapeHtml(student.studentClass)} | ${escapeHtml(student.requestedSubject)} | ${escapeHtml(student.preferredMode)}</p>
        </div>
        <span class="status-pill ${allocated ? "approved" : "pending"}">${allocated ? "allocated" : "open"}</span>
      </header>
      <div class="portal-meta">
        <span>${escapeHtml(student.lessonLocation)}</span>
        <span>${escapeHtml(student.guardianPhone)}</span>
        <span>${formatDate(student.createdAt)}</span>
      </div>
      <p>${escapeHtml(student.learningNeed)}</p>
      ${allocationText}
      ${allocationTools}
    </article>`;
};

const renderAllocationCard = (allocation) => `
  <article class="portal-record">
    <header>
      <div>
        <h5>${escapeHtml(allocation.studentName)} -> ${escapeHtml(allocation.teacherName)}</h5>
        <p>${escapeHtml(allocation.subject)} | ${escapeHtml(allocation.studentClass)}</p>
      </div>
      <span class="status-pill approved">confirmed</span>
    </header>
    <div class="portal-meta">
      <span>${escapeHtml(allocation.mode)}</span>
      <span>${escapeHtml(allocation.location)}</span>
      <span>${formatDate(allocation.createdAt)}</span>
    </div>
  </article>`;

const emptyState = (message) => `<p class="empty-state">${message}</p>`;

const renderPortal = () => {
  const pendingTeachers = portalData.teachers.filter((teacher) => teacher.status === "pending");
  const approvedTeachers = getApprovedTeachers();

  if (pendingCount) pendingCount.textContent = String(pendingTeachers.length);
  if (approvedCount) approvedCount.textContent = String(approvedTeachers.length);
  if (studentCount) studentCount.textContent = String(portalData.students.length);
  if (allocationCount) allocationCount.textContent = String(portalData.allocations.length);

  if (!adminUnlocked) return;

  pendingTeachersList.innerHTML = pendingTeachers.length
    ? pendingTeachers.map((teacher) => renderTeacherCard(teacher, "pending")).join("")
    : emptyState("No teacher applications are awaiting approval.");

  approvedTeachersList.innerHTML = approvedTeachers.length
    ? approvedTeachers.map((teacher) => renderTeacherCard(teacher, "approved")).join("")
    : emptyState("No subject teacher has been approved yet.");

  studentRequestsList.innerHTML = portalData.students.length
    ? portalData.students.map(renderStudentCard).join("")
    : emptyState("No student request has been submitted yet.");

  allocationBoard.innerHTML = portalData.allocations.length
    ? portalData.allocations.map(renderAllocationCard).join("")
    : emptyState("No confirmed allocation yet.");
};

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

teacherApplicationForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(teacherApplicationForm);
  const classLevels = data.getAll("classLevels").map((value) => value.toString());

  if (!classLevels.length) {
    teacherApplicationStatus.textContent = "Please select at least one class level.";
    return;
  }

  const teacher = {
    id: createId(),
    teacherName: data.get("teacherName").toString().trim(),
    teacherPhone: data.get("teacherPhone").toString().trim(),
    teacherEmail: data.get("teacherEmail").toString().trim(),
    workplace: data.get("workplace").toString().trim(),
    qualification: data.get("qualification").toString().trim(),
    experienceYears: data.get("experienceYears").toString().trim(),
    primarySubject: data.get("primarySubject").toString(),
    otherSubjects: data.get("otherSubjects").toString().trim(),
    teachingMode: data.get("teachingMode").toString(),
    coverage: data.get("coverage").toString().trim(),
    classLevels,
    experienceSummary: data.get("experienceSummary").toString().trim(),
    profileLink: data.get("profileLink").toString().trim(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  portalData.teachers.unshift(teacher);
  savePortalData();
  teacherApplicationForm.reset();
  teacherApplicationStatus.textContent = `${teacher.teacherName}'s application has been submitted for admin approval.`;
  renderPortal();
});

studentRequestForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(studentRequestForm);
  const student = {
    id: createId(),
    studentName: data.get("studentName").toString().trim(),
    guardianPhone: data.get("guardianPhone").toString().trim(),
    studentClass: data.get("studentClass").toString(),
    requestedSubject: data.get("requestedSubject").toString(),
    preferredMode: data.get("preferredMode").toString(),
    lessonLocation: data.get("lessonLocation").toString().trim(),
    learningNeed: data.get("learningNeed").toString().trim(),
    status: "open",
    createdAt: new Date().toISOString(),
  };

  portalData.students.unshift(student);
  savePortalData();
  studentRequestForm.reset();
  const matches = getTeacherMatches(student);
  studentRequestStatus.textContent = matches.length
    ? `${student.studentName}'s request has been saved with ${matches.length} teacher match${matches.length === 1 ? "" : "es"}.`
    : `${student.studentName}'s request has been saved. Admin can allocate once a matching teacher is approved.`;
  renderPortal();
});

adminAccessForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(adminAccessForm);
  const code = data.get("adminCode")?.toString().trim();

  if (code !== ADMIN_CODE) {
    adminStatus.textContent = "Admin code not recognised.";
    return;
  }

  adminUnlocked = true;
  adminWorkspace.hidden = false;
  adminStatus.textContent = "Admin desk unlocked.";
  adminAccessForm.reset();
  renderPortal();
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-portal-action]");
  if (!(button instanceof HTMLButtonElement)) return;

  const action = button.dataset.portalAction;
  const id = button.dataset.id;
  if (!action || !id) return;

  if (action === "approve-teacher" || action === "reject-teacher" || action === "reopen-teacher") {
    const teacher = portalData.teachers.find((item) => item.id === id);
    if (!teacher) return;
    teacher.status = action === "approve-teacher" ? "approved" : action === "reject-teacher" ? "rejected" : "pending";
    adminStatus.textContent = `${teacher.teacherName} is now ${teacher.status}.`;
    savePortalData();
    renderPortal();
  }

  if (action === "allocate-student") {
    const student = portalData.students.find((item) => item.id === id);
    const select = document.querySelector(`[data-allocation-select="${id}"]`);
    const teacher = portalData.teachers.find((item) => item.id === select?.value);
    if (!student || !teacher) return;

    portalData.allocations = portalData.allocations.filter((allocation) => allocation.studentId !== student.id);
    portalData.allocations.unshift({
      id: createId(),
      studentId: student.id,
      teacherId: teacher.id,
      studentName: student.studentName,
      teacherName: teacher.teacherName,
      subject: student.requestedSubject,
      studentClass: student.studentClass,
      mode: student.preferredMode,
      location: student.lessonLocation,
      createdAt: new Date().toISOString(),
    });
    student.status = "allocated";
    adminStatus.textContent = `${student.studentName} has been allocated to ${teacher.teacherName}.`;
    savePortalData();
    renderPortal();
  }

  if (action === "clear-allocation") {
    const student = portalData.students.find((item) => item.id === id);
    portalData.allocations = portalData.allocations.filter((allocation) => allocation.studentId !== id);
    if (student) student.status = "open";
    adminStatus.textContent = "Allocation has been reopened.";
    savePortalData();
    renderPortal();
  }
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

renderPortal();

