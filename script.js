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
const pendingCount = document.querySelector("#pending-count");
const approvedCount = document.querySelector("#approved-count");
const studentCount = document.querySelector("#student-count");
const allocationCount = document.querySelector("#allocation-count");
const pendingJobseekerCount = document.querySelector("#pending-jobseeker-count");
const approvedJobseekerCount = document.querySelector("#approved-jobseeker-count");
const employerRequestCount = document.querySelector("#employer-request-count");
const jobPlacementCount = document.querySelector("#job-placement-count");

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
      jobseekers: Array.isArray(saved?.jobseekers) ? saved.jobseekers : [],
      employerRequests: Array.isArray(saved?.employerRequests) ? saved.employerRequests : [],
      jobPlacements: Array.isArray(saved?.jobPlacements) ? saved.jobPlacements : [],
    };
  } catch {
    return { teachers: [], students: [], allocations: [], jobseekers: [], employerRequests: [], jobPlacements: [] };
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

jobseekerRegistrationForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(jobseekerRegistrationForm);
  const jobseeker = {
    id: createId(),
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
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  portalData.jobseekers.unshift(jobseeker);
  savePortalData();
  jobseekerRegistrationForm.reset();
  jobseekerStatus.textContent = `${jobseeker.jobName}'s profile has been submitted for admin vetting.`;
  renderPortal();
});

employerRequestForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(employerRequestForm);
  const request = {
    id: createId(),
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
    status: "open",
    createdAt: new Date().toISOString(),
  };

  portalData.employerRequests.unshift(request);
  savePortalData();
  employerRequestForm.reset();
  const matches = getJobseekerMatches(request);
  employerRequestStatus.textContent = matches.length
    ? `${request.institutionName}'s request has been saved with ${matches.length} candidate match${matches.length === 1 ? "" : "es"}.`
    : `${request.institutionName}'s request has been saved. Admin can match once a suitable jobseeker is approved.`;
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

  if (action === "approve-jobseeker" || action === "reject-jobseeker" || action === "reopen-jobseeker") {
    const jobseeker = portalData.jobseekers.find((item) => item.id === id);
    if (!jobseeker) return;
    jobseeker.status =
      action === "approve-jobseeker" ? "approved" : action === "reject-jobseeker" ? "rejected" : "pending";
    adminStatus.textContent = `${jobseeker.jobName} is now ${jobseeker.status}.`;
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

  if (action === "place-jobseeker") {
    const request = portalData.employerRequests.find((item) => item.id === id);
    const select = document.querySelector(`[data-job-placement-select="${id}"]`);
    const jobseeker = portalData.jobseekers.find((item) => item.id === select?.value);
    if (!request || !jobseeker) return;

    portalData.jobPlacements = portalData.jobPlacements.filter((placement) => placement.requestId !== request.id);
    portalData.jobPlacements.unshift({
      id: createId(),
      requestId: request.id,
      jobseekerId: jobseeker.id,
      institutionName: request.institutionName,
      jobName: jobseeker.jobName,
      roleNeeded: request.roleNeeded,
      categoryNeeded: request.categoryNeeded,
      employmentType: request.requestEmploymentType,
      location: request.employerLocation,
      createdAt: new Date().toISOString(),
    });
    request.status = "matched";
    adminStatus.textContent = `${jobseeker.jobName} has been matched to ${request.institutionName}.`;
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

  if (action === "clear-job-placement") {
    const request = portalData.employerRequests.find((item) => item.id === id);
    portalData.jobPlacements = portalData.jobPlacements.filter((placement) => placement.requestId !== id);
    if (request) request.status = "open";
    adminStatus.textContent = "Jobseeker match has been reopened.";
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

