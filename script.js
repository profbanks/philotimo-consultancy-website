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
const jobseekerRegistrationForm = document.querySelector("#jobseeker-registration-form");
const employerRequestForm = document.querySelector("#employer-request-form");
const adminAccessForm = document.querySelector("#admin-access-form");
const teacherApplicationStatus = document.querySelector("#teacher-application-status");
const studentRequestStatus = document.querySelector("#student-request-status");
const jobseekerStatus = document.querySelector("#jobseeker-status");
const employerRequestStatus = document.querySelector("#employer-request-status");
const adminStatus = document.querySelector("#admin-status");
const adminWorkspace = document.querySelector("#admin-workspace");
const pendingTeachersList = document.querySelector("#pending-teachers");
const approvedTeachersList = document.querySelector("#approved-teachers");
const studentRequestsList = document.querySelector("#student-requests");
const allocationBoard = document.querySelector("#allocation-board");
const pendingJobseekersList = document.querySelector("#pending-jobseekers");
const approvedJobseekersList = document.querySelector("#approved-jobseekers");
const employerRequestsList = document.querySelector("#employer-requests");
const jobPlacementBoard = document.querySelector("#job-placement-board");
const contactEnquiriesList = document.querySelector("#contact-enquiries");
const pendingCount = document.querySelector("#pending-count");
const approvedCount = document.querySelector("#approved-count");
const studentCount = document.querySelector("#student-count");
const allocationCount = document.querySelector("#allocation-count");
const pendingJobseekerCount = document.querySelector("#pending-jobseeker-count");
const approvedJobseekerCount = document.querySelector("#approved-jobseeker-count");
const employerRequestCount = document.querySelector("#employer-request-count");
const jobPlacementCount = document.querySelector("#job-placement-count");
const contactCount = document.querySelector("#contact-count");

const API_BASE = "/api";
const ADMIN_TOKEN_KEY = "philotimo-admin-token";
const EMPTY_PORTAL_DATA = {
  teachers: [],
  students: [],
  allocations: [],
  jobseekers: [],
  employerRequests: [],
  jobPlacements: [],
  contacts: [],
};

const createId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

let portalData = { ...EMPTY_PORTAL_DATA };
let adminUnlocked = Boolean(sessionStorage.getItem(ADMIN_TOKEN_KEY));

const getAdminToken = () => sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";

const setAdminToken = (token) => {
  if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
  else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
};

const hydratePortalData = (data = {}) => {
  portalData = Object.fromEntries(
    Object.keys(EMPTY_PORTAL_DATA).map((key) => [key, Array.isArray(data[key]) ? data[key] : []]),
  );
};

const apiRequest = async (path, options = {}) => {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "The backend could not process this request.");
  return payload;
};

const setBusy = (form, busy) => {
  form?.querySelectorAll("button, input, select, textarea").forEach((control) => {
    control.disabled = busy;
  });
};

const refreshAdminState = async (message = "") => {
  if (!adminUnlocked) {
    renderPortal();
    return;
  }

  try {
    const state = await apiRequest("/admin/state");
    hydratePortalData(state);
    if (adminWorkspace) adminWorkspace.hidden = false;
    renderPortal();
    if (message && adminStatus) adminStatus.textContent = message;
  } catch (error) {
    adminUnlocked = false;
    setAdminToken("");
    if (adminWorkspace) adminWorkspace.hidden = true;
    if (adminStatus) adminStatus.textContent = error.message;
    renderPortal();
  }
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
  if ((teacher.classLevels || []).includes(student.studentClass)) score += 25;
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

const getApprovedJobseekers = () => portalData.jobseekers.filter((jobseeker) => jobseeker.status === "approved");

const hasTextMatch = (haystack, needle) => {
  const cleanNeedle = String(needle || "").trim().toLowerCase();
  if (!cleanNeedle) return false;
  return String(haystack || "").toLowerCase().includes(cleanNeedle);
};

const scoreJobseekerForRequest = (jobseeker, request) => {
  let score = 0;

  if (jobseeker.jobCategory === request.categoryNeeded) score += 30;
  if (hasTextMatch(jobseeker.preferredRole, request.roleNeeded)) score += 34;
  if (hasTextMatch(jobseeker.coreSkills, request.roleNeeded)) score += 24;
  if (jobseeker.employmentType === request.requestEmploymentType) score += 14;
  if (Number(jobseeker.jobExperienceYears) >= Number(request.experienceNeeded || 0)) score += 12;
  if (hasTextMatch(jobseeker.jobLocation, request.employerLocation) || hasTextMatch(request.employerLocation, jobseeker.jobLocation)) score += 8;
  if (jobseeker.availability === "Immediate") score += 5;

  return score;
};

const getJobseekerMatches = (request) =>
  getApprovedJobseekers()
    .map((jobseeker) => ({ jobseeker, score: scoreJobseekerForRequest(jobseeker, request) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.jobseeker.jobExperienceYears) - Number(a.jobseeker.jobExperienceYears));

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

const renderJobseekerCard = (jobseeker, mode) => {
  const statusClass =
    jobseeker.status === "approved" ? "approved" : jobseeker.status === "rejected" ? "rejected" : "pending";
  const actions =
    mode === "pending"
      ? `
        <div class="record-actions">
          <button class="mini-button" type="button" data-portal-action="approve-jobseeker" data-id="${jobseeker.id}">Approve</button>
          <button class="mini-button warn" type="button" data-portal-action="reject-jobseeker" data-id="${jobseeker.id}">Reject</button>
        </div>`
      : `
        <div class="record-actions">
          <button class="mini-button secondary" type="button" data-portal-action="reopen-jobseeker" data-id="${jobseeker.id}">Move to pending</button>
        </div>`;

  return `
    <article class="portal-record">
      <header>
        <div>
          <h5>${escapeHtml(jobseeker.jobName)}</h5>
          <p>${escapeHtml(jobseeker.preferredRole)} | ${escapeHtml(jobseeker.jobCategory)}</p>
        </div>
        <span class="status-pill ${statusClass}">${escapeHtml(jobseeker.status)}</span>
      </header>
      <div class="portal-meta">
        <span>${escapeHtml(jobseeker.jobExperienceYears)} years</span>
        <span>${escapeHtml(jobseeker.jobQualification)}</span>
        <span>${escapeHtml(jobseeker.employmentType)}</span>
        <span>${escapeHtml(jobseeker.jobLocation)}</span>
      </div>
      <p>${escapeHtml(jobseeker.coreSkills)}</p>
      <p>${escapeHtml(jobseeker.workSummary)}</p>
      <p><strong>Current/last workplace:</strong> ${escapeHtml(jobseeker.currentWorkplace)}</p>
      <p><strong>Contact:</strong> ${escapeHtml(jobseeker.jobPhone)} | ${escapeHtml(jobseeker.jobEmail)}</p>
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
        <span>${escapeHtml(student.guardianName || "Guardian")}</span>
        <span>${escapeHtml(student.lessonLocation)}</span>
        <span>${escapeHtml(student.guardianPhone)}</span>
        <span>${escapeHtml(student.examTarget || "Lesson support")}</span>
        <span>${formatDate(student.createdAt)}</span>
      </div>
      <p>${escapeHtml(student.learningNeed)}</p>
      <p><strong>School:</strong> ${escapeHtml(student.schoolName || "Not supplied")}</p>
      <p><strong>Schedule:</strong> ${escapeHtml(student.preferredSchedule || "To be agreed")}</p>
      ${allocationText}
      ${allocationTools}
    </article>`;
};

const renderEmployerRequestCard = (request) => {
  const matches = getJobseekerMatches(request);
  const placement = portalData.jobPlacements.find((item) => item.requestId === request.id);
  const selectOptions = matches.length
    ? matches
        .map(
          ({ jobseeker, score }) =>
            `<option value="${jobseeker.id}">${escapeHtml(jobseeker.jobName)} | ${escapeHtml(jobseeker.preferredRole)} | ${score}% match</option>`,
        )
        .join("")
    : `<option value="">No approved candidate match yet</option>`;
  const placementText = placement
    ? `<p class="match-note">Matched to ${escapeHtml(placement.jobName)} for ${escapeHtml(placement.roleNeeded)}.</p>`
    : "";
  const placementTools = placement
    ? `<button class="mini-button secondary" type="button" data-portal-action="clear-job-placement" data-id="${request.id}">Change candidate</button>`
    : `
      <div class="allocation-tools">
        <select class="allocation-select" data-job-placement-select="${request.id}" ${matches.length ? "" : "disabled"}>
          ${selectOptions}
        </select>
        <button class="mini-button" type="button" data-portal-action="place-jobseeker" data-id="${request.id}" ${matches.length ? "" : "disabled"}>Match candidate</button>
      </div>`;

  return `
    <article class="portal-record">
      <header>
        <div>
          <h5>${escapeHtml(request.institutionName)}</h5>
          <p>${escapeHtml(request.roleNeeded)} | ${escapeHtml(request.categoryNeeded)} | ${escapeHtml(request.requestEmploymentType)}</p>
        </div>
        <span class="status-pill ${placement ? "approved" : "pending"}">${placement ? "matched" : "open"}</span>
      </header>
      <div class="portal-meta">
        <span>${escapeHtml(request.institutionType)}</span>
        <span>${escapeHtml(request.employerLocation)}</span>
        <span>${escapeHtml(request.experienceNeeded)}+ years</span>
        <span>${formatDate(request.createdAt)}</span>
      </div>
      <p>${escapeHtml(request.requestNotes)}</p>
      <p><strong>Contact:</strong> ${escapeHtml(request.contactPerson)} | ${escapeHtml(request.employerPhone)} | ${escapeHtml(request.employerEmail)}</p>
      ${placementText}
      ${placementTools}
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

const renderJobPlacementCard = (placement) => `
  <article class="portal-record">
    <header>
      <div>
        <h5>${escapeHtml(placement.institutionName)} -> ${escapeHtml(placement.jobName)}</h5>
        <p>${escapeHtml(placement.roleNeeded)} | ${escapeHtml(placement.categoryNeeded)}</p>
      </div>
      <span class="status-pill approved">matched</span>
    </header>
    <div class="portal-meta">
      <span>${escapeHtml(placement.employmentType)}</span>
      <span>${escapeHtml(placement.location)}</span>
      <span>${formatDate(placement.createdAt)}</span>
    </div>
  </article>`;

const renderContactCard = (contact) => `
  <article class="portal-record">
    <header>
      <div>
        <h5>${escapeHtml(contact.name)}</h5>
        <p>${escapeHtml(contact.service)}</p>
      </div>
      <span class="status-pill pending">${escapeHtml(contact.status || "new")}</span>
    </header>
    <div class="portal-meta">
      <span>${escapeHtml(contact.email)}</span>
      <span>${formatDate(contact.createdAt)}</span>
    </div>
    <p>${escapeHtml(contact.message)}</p>
  </article>`;

const emptyState = (message) => `<p class="empty-state">${message}</p>`;

const renderPortal = () => {
  const pendingTeachers = portalData.teachers.filter((teacher) => teacher.status === "pending");
  const approvedTeachers = getApprovedTeachers();
  const pendingJobseekers = portalData.jobseekers.filter((jobseeker) => jobseeker.status === "pending");
  const approvedJobseekers = getApprovedJobseekers();

  if (pendingCount) pendingCount.textContent = String(pendingTeachers.length);
  if (approvedCount) approvedCount.textContent = String(approvedTeachers.length);
  if (studentCount) studentCount.textContent = String(portalData.students.length);
  if (allocationCount) allocationCount.textContent = String(portalData.allocations.length);
  if (pendingJobseekerCount) pendingJobseekerCount.textContent = String(pendingJobseekers.length);
  if (approvedJobseekerCount) approvedJobseekerCount.textContent = String(approvedJobseekers.length);
  if (employerRequestCount) employerRequestCount.textContent = String(portalData.employerRequests.length);
  if (jobPlacementCount) jobPlacementCount.textContent = String(portalData.jobPlacements.length);
  if (contactCount) contactCount.textContent = String(portalData.contacts.length);

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

  pendingJobseekersList.innerHTML = pendingJobseekers.length
    ? pendingJobseekers.map((jobseeker) => renderJobseekerCard(jobseeker, "pending")).join("")
    : emptyState("No jobseeker profile is awaiting vetting.");

  approvedJobseekersList.innerHTML = approvedJobseekers.length
    ? approvedJobseekers.map((jobseeker) => renderJobseekerCard(jobseeker, "approved")).join("")
    : emptyState("No jobseeker has been approved yet.");

  employerRequestsList.innerHTML = portalData.employerRequests.length
    ? portalData.employerRequests.map(renderEmployerRequestCard).join("")
    : emptyState("No school, institution, or company request has been submitted yet.");

  jobPlacementBoard.innerHTML = portalData.jobPlacements.length
    ? portalData.jobPlacements.map(renderJobPlacementCard).join("")
    : emptyState("No confirmed jobseeker match yet.");

  contactEnquiriesList.innerHTML = portalData.contacts.length
    ? portalData.contacts.map(renderContactCard).join("")
    : emptyState("No contact enquiry has been submitted yet.");
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

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(contactForm);
  const enquiry = {
    name: data.get("name")?.toString().trim(),
    email: data.get("email")?.toString().trim(),
    service: data.get("service")?.toString(),
    message: data.get("message")?.toString().trim(),
  };

  try {
    setBusy(contactForm, true);
    const response = await apiRequest("/contacts", {
      method: "POST",
      body: JSON.stringify(enquiry),
    });
    formStatus.textContent = response.message;
    contactForm.reset();
    if (adminUnlocked) await refreshAdminState();
  } catch (error) {
    formStatus.textContent = error.message;
  } finally {
    setBusy(contactForm, false);
  }
});

teacherApplicationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(teacherApplicationForm);
  const classLevels = data.getAll("classLevels").map((value) => value.toString());

  if (!classLevels.length) {
    teacherApplicationStatus.textContent = "Please select at least one class level.";
    return;
  }

  const teacher = {
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
  };

  try {
    setBusy(teacherApplicationForm, true);
    const response = await apiRequest("/teachers", {
      method: "POST",
      body: JSON.stringify(teacher),
    });
    teacherApplicationForm.reset();
    teacherApplicationStatus.textContent = response.message;
    if (adminUnlocked) await refreshAdminState();
  } catch (error) {
    teacherApplicationStatus.textContent = error.message;
  } finally {
    setBusy(teacherApplicationForm, false);
  }
});

studentRequestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(studentRequestForm);
  const student = {
    guardianName: data.get("guardianName").toString().trim(),
    studentName: data.get("studentName").toString().trim(),
    guardianPhone: data.get("guardianPhone").toString().trim(),
    guardianEmail: data.get("guardianEmail").toString().trim(),
    schoolName: data.get("schoolName").toString().trim(),
    studentClass: data.get("studentClass").toString(),
    examTarget: data.get("examTarget").toString(),
    requestedSubject: data.get("requestedSubject").toString(),
    otherRequestedSubjects: data.get("otherRequestedSubjects").toString().trim(),
    preferredMode: data.get("preferredMode").toString(),
    lessonLocation: data.get("lessonLocation").toString().trim(),
    preferredSchedule: data.get("preferredSchedule").toString().trim(),
    learningNeed: data.get("learningNeed").toString().trim(),
  };

  try {
    setBusy(studentRequestForm, true);
    const response = await apiRequest("/students", {
      method: "POST",
      body: JSON.stringify(student),
    });
    studentRequestForm.reset();
    studentRequestStatus.textContent = response.matchCount
      ? `${student.studentName}'s request has been saved with ${response.matchCount} teacher match${response.matchCount === 1 ? "" : "es"}.`
      : `${student.studentName}'s request has been saved. Admin can allocate once a matching teacher is approved.`;
    if (adminUnlocked) await refreshAdminState();
  } catch (error) {
    studentRequestStatus.textContent = error.message;
  } finally {
    setBusy(studentRequestForm, false);
  }
});

jobseekerRegistrationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(jobseekerRegistrationForm);
  const jobseeker = {
    jobName: data.get("jobName").toString().trim(),
    jobPhone: data.get("jobPhone").toString().trim(),
    jobEmail: data.get("jobEmail").toString().trim(),
    jobLocation: data.get("jobLocation").toString().trim(),
    jobCategory: data.get("jobCategory").toString(),
    preferredRole: data.get("preferredRole").toString().trim(),
    jobQualification: data.get("jobQualification").toString().trim(),
    jobExperienceYears: data.get("jobExperienceYears").toString().trim(),
    currentWorkplace: data.get("currentWorkplace").toString().trim(),
    availability: data.get("availability").toString(),
    employmentType: data.get("employmentType").toString(),
    cvLink: data.get("cvLink").toString().trim(),
    coreSkills: data.get("coreSkills").toString().trim(),
    workSummary: data.get("workSummary").toString().trim(),
  };

  try {
    setBusy(jobseekerRegistrationForm, true);
    const response = await apiRequest("/jobseekers", {
      method: "POST",
      body: JSON.stringify(jobseeker),
    });
    jobseekerRegistrationForm.reset();
    jobseekerStatus.textContent = response.message;
    if (adminUnlocked) await refreshAdminState();
  } catch (error) {
    jobseekerStatus.textContent = error.message;
  } finally {
    setBusy(jobseekerRegistrationForm, false);
  }
});

employerRequestForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(employerRequestForm);
  const request = {
    institutionName: data.get("institutionName").toString().trim(),
    contactPerson: data.get("contactPerson").toString().trim(),
    employerPhone: data.get("employerPhone").toString().trim(),
    employerEmail: data.get("employerEmail").toString().trim(),
    institutionType: data.get("institutionType").toString(),
    employerLocation: data.get("employerLocation").toString().trim(),
    roleNeeded: data.get("roleNeeded").toString().trim(),
    categoryNeeded: data.get("categoryNeeded").toString(),
    minimumQualification: data.get("minimumQualification").toString().trim(),
    experienceNeeded: data.get("experienceNeeded").toString().trim(),
    requestEmploymentType: data.get("requestEmploymentType").toString(),
    startDate: data.get("startDate").toString().trim(),
    requestNotes: data.get("requestNotes").toString().trim(),
  };

  try {
    setBusy(employerRequestForm, true);
    const response = await apiRequest("/employer-requests", {
      method: "POST",
      body: JSON.stringify(request),
    });
    employerRequestForm.reset();
    employerRequestStatus.textContent = response.matchCount
      ? `${request.institutionName}'s request has been saved with ${response.matchCount} candidate match${response.matchCount === 1 ? "" : "es"}.`
      : `${request.institutionName}'s request has been saved. Admin can match once a suitable jobseeker is approved.`;
    if (adminUnlocked) await refreshAdminState();
  } catch (error) {
    employerRequestStatus.textContent = error.message;
  } finally {
    setBusy(employerRequestForm, false);
  }
});

adminAccessForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(adminAccessForm);
  const code = data.get("adminCode")?.toString().trim();

  try {
    setBusy(adminAccessForm, true);
    const response = await apiRequest("/admin/login", {
      method: "POST",
      body: JSON.stringify({ adminCode: code }),
    });
    setAdminToken(response.token);
    adminUnlocked = true;
    adminAccessForm.reset();
    await refreshAdminState("Admin desk unlocked. Backend records are now connected.");
  } catch (error) {
    adminUnlocked = false;
    setAdminToken("");
    adminStatus.textContent = error.message;
  } finally {
    setBusy(adminAccessForm, false);
  }
});

const runAdminAction = async (action, id, selectedId = "") => {
  if (!adminUnlocked) {
    adminStatus.textContent = "Please unlock the admin desk first.";
    return;
  }

  try {
    const response = await apiRequest("/admin/action", {
      method: "POST",
      body: JSON.stringify({ action, id, selectedId }),
    });
    hydratePortalData(response.state);
    renderPortal();
    adminStatus.textContent = response.message || "Admin action completed.";
  } catch (error) {
    adminStatus.textContent = error.message;
  }
};

document.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-portal-action]");
  if (!(button instanceof HTMLButtonElement)) return;

  const action = button.dataset.portalAction;
  const id = button.dataset.id;
  if (!action || !id) return;

  if (action === "approve-teacher" || action === "reject-teacher" || action === "reopen-teacher") {
    await runAdminAction(action, id);
  }

  if (action === "approve-jobseeker" || action === "reject-jobseeker" || action === "reopen-jobseeker") {
    await runAdminAction(action, id);
  }

  if (action === "allocate-student") {
    const select = document.querySelector(`[data-allocation-select="${id}"]`);
    if (!select?.value) {
      adminStatus.textContent = "Please choose an approved teacher before allocating.";
      return;
    }
    await runAdminAction(action, id, select.value);
  }

  if (action === "place-jobseeker") {
    const select = document.querySelector(`[data-job-placement-select="${id}"]`);
    if (!select?.value) {
      adminStatus.textContent = "Please choose an approved jobseeker before matching.";
      return;
    }
    await runAdminAction(action, id, select.value);
  }

  if (action === "clear-allocation") {
    await runAdminAction(action, id);
  }

  if (action === "clear-job-placement") {
    await runAdminAction(action, id);
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

if (adminUnlocked) {
  refreshAdminState("Admin session restored.");
} else {
  renderPortal();
}
