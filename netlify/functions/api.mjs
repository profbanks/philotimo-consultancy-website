import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

const STORE_NAME = "philotimo-consultancy";
const STATE_KEY = "portal-state";
const SESSION_HOURS = 8;

const defaultState = () => ({
  teachers: [],
  students: [],
  allocations: [],
  jobseekers: [],
  employerRequests: [],
  jobPlacements: [],
  contacts: [],
});

const publicState = (state) => ({
  teachers: state.teachers,
  students: state.students,
  allocations: state.allocations,
  jobseekers: state.jobseekers,
  employerRequests: state.employerRequests,
  jobPlacements: state.jobPlacements,
  contacts: state.contacts,
});

const normalizeState = (state = {}) => {
  const fallback = defaultState();
  return Object.fromEntries(
    Object.keys(fallback).map((key) => [key, Array.isArray(state[key]) ? state[key] : fallback[key]]),
  );
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  },
  });

const badRequest = (message) => json(400, { message });
const unauthorized = () => json(401, { message: "Administrator access is required." });

const readJsonBody = async (request) => {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
};

const store = () => getStore(STORE_NAME);

const readState = async () => {
  const saved = await store().get(STATE_KEY, { type: "json" });
  return normalizeState(saved || {});
};

const writeState = async (state) => {
  const normalized = normalizeState(state);
  await store().setJSON(STATE_KEY, normalized);
  return normalized;
};

const clean = (value) => String(value ?? "").trim();
const cleanArray = (value) => (Array.isArray(value) ? value.map(clean).filter(Boolean) : []);

const requireFields = (payload, fields) => {
  const missing = fields.filter((field) => {
    const value = payload[field];
    return Array.isArray(value) ? value.length === 0 : !clean(value);
  });
  if (missing.length) throw new Error(`Missing required field${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`);
};

const configuredAdminCode = () =>
  process.env.ADMIN_ACCESS_CODE || process.env.ADMIN_PASSWORD || process.env.PHILOTIMO_ADMIN_CODE || "PHILOTIMO-ADMIN";

const sessionSecret = () =>
  process.env.ADMIN_SESSION_SECRET || `${configuredAdminCode()}|philotimo-consultancy-session`;

const sign = (body) => createHmac("sha256", sessionSecret()).update(body).digest("base64url");

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const issueToken = () => {
  const payload = {
    role: "admin",
    nonce: randomUUID(),
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
};

const verifyToken = (request) => {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [body, signature] = token.split(".");
  if (!body || !signature || !safeEqual(sign(body), signature)) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.role === "admin" && Number(payload.exp) > Date.now();
  } catch {
    return false;
  }
};

const splitSubjects = (teacher) =>
  [teacher.primarySubject, teacher.otherSubjects]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((subject) => subject.trim().toLowerCase())
    .filter(Boolean);

const scoreTeacherForStudent = (teacher, student) => {
  const subjects = splitSubjects(teacher);
  const requestedSubject = clean(student.requestedSubject).toLowerCase();
  let score = 0;

  if (clean(teacher.primarySubject).toLowerCase() === requestedSubject) score += 60;
  if (subjects.includes(requestedSubject)) score += 30;
  if ((teacher.classLevels || []).includes(student.studentClass)) score += 25;
  if (teacher.teachingMode === student.preferredMode || teacher.teachingMode === "Hybrid lesson") score += 15;
  if (Number(teacher.experienceYears) >= 5) score += 8;

  return score;
};

const getTeacherMatches = (state, student) =>
  state.teachers
    .filter((teacher) => teacher.status === "approved")
    .map((teacher) => ({ teacher, score: scoreTeacherForStudent(teacher, student) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.teacher.experienceYears) - Number(a.teacher.experienceYears));

const hasTextMatch = (haystack, needle) => {
  const cleanNeedle = clean(needle).toLowerCase();
  if (!cleanNeedle) return false;
  return clean(haystack).toLowerCase().includes(cleanNeedle);
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

const getJobseekerMatches = (state, request) =>
  state.jobseekers
    .filter((jobseeker) => jobseeker.status === "approved")
    .map((jobseeker) => ({ jobseeker, score: scoreJobseekerForRequest(jobseeker, request) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.jobseeker.jobExperienceYears) - Number(a.jobseeker.jobExperienceYears));

const createTeacher = (payload) => {
  requireFields(payload, ["teacherName", "teacherPhone", "teacherEmail", "workplace", "qualification", "experienceYears", "primarySubject", "teachingMode", "coverage", "classLevels"]);
  return {
    id: randomUUID(),
    teacherName: clean(payload.teacherName),
    teacherPhone: clean(payload.teacherPhone),
    teacherEmail: clean(payload.teacherEmail),
    workplace: clean(payload.workplace),
    qualification: clean(payload.qualification),
    experienceYears: clean(payload.experienceYears),
    primarySubject: clean(payload.primarySubject),
    otherSubjects: clean(payload.otherSubjects),
    teachingMode: clean(payload.teachingMode),
    coverage: clean(payload.coverage),
    classLevels: cleanArray(payload.classLevels),
    experienceSummary: clean(payload.experienceSummary),
    profileLink: clean(payload.profileLink),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
};

const createStudent = (payload) => {
  requireFields(payload, ["guardianName", "studentName", "guardianPhone", "studentClass", "requestedSubject", "preferredMode", "lessonLocation"]);
  return {
    id: randomUUID(),
    guardianName: clean(payload.guardianName),
    studentName: clean(payload.studentName),
    guardianPhone: clean(payload.guardianPhone),
    guardianEmail: clean(payload.guardianEmail),
    schoolName: clean(payload.schoolName),
    studentClass: clean(payload.studentClass),
    examTarget: clean(payload.examTarget),
    requestedSubject: clean(payload.requestedSubject),
    otherRequestedSubjects: clean(payload.otherRequestedSubjects),
    preferredMode: clean(payload.preferredMode),
    lessonLocation: clean(payload.lessonLocation),
    preferredSchedule: clean(payload.preferredSchedule),
    learningNeed: clean(payload.learningNeed),
    status: "open",
    createdAt: new Date().toISOString(),
  };
};

const createJobseeker = (payload) => {
  requireFields(payload, ["jobName", "jobPhone", "jobEmail", "jobLocation", "jobCategory", "preferredRole", "jobQualification", "jobExperienceYears", "availability", "employmentType", "coreSkills"]);
  return {
    id: randomUUID(),
    jobName: clean(payload.jobName),
    jobPhone: clean(payload.jobPhone),
    jobEmail: clean(payload.jobEmail),
    jobLocation: clean(payload.jobLocation),
    jobCategory: clean(payload.jobCategory),
    preferredRole: clean(payload.preferredRole),
    jobQualification: clean(payload.jobQualification),
    jobExperienceYears: clean(payload.jobExperienceYears),
    currentWorkplace: clean(payload.currentWorkplace),
    availability: clean(payload.availability),
    employmentType: clean(payload.employmentType),
    cvLink: clean(payload.cvLink),
    coreSkills: clean(payload.coreSkills),
    workSummary: clean(payload.workSummary),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
};

const createEmployerRequest = (payload) => {
  requireFields(payload, ["institutionName", "contactPerson", "employerPhone", "employerEmail", "institutionType", "employerLocation", "roleNeeded", "categoryNeeded", "experienceNeeded", "requestEmploymentType"]);
  return {
    id: randomUUID(),
    institutionName: clean(payload.institutionName),
    contactPerson: clean(payload.contactPerson),
    employerPhone: clean(payload.employerPhone),
    employerEmail: clean(payload.employerEmail),
    institutionType: clean(payload.institutionType),
    employerLocation: clean(payload.employerLocation),
    roleNeeded: clean(payload.roleNeeded),
    categoryNeeded: clean(payload.categoryNeeded),
    minimumQualification: clean(payload.minimumQualification),
    experienceNeeded: clean(payload.experienceNeeded),
    requestEmploymentType: clean(payload.requestEmploymentType),
    startDate: clean(payload.startDate),
    requestNotes: clean(payload.requestNotes),
    status: "open",
    createdAt: new Date().toISOString(),
  };
};

const createContact = (payload) => {
  requireFields(payload, ["name", "email", "service", "message"]);
  return {
    id: randomUUID(),
    name: clean(payload.name),
    email: clean(payload.email),
    service: clean(payload.service),
    message: clean(payload.message),
    status: "new",
    createdAt: new Date().toISOString(),
  };
};

const findById = (items, id) => items.find((item) => item.id === id);

const applyAdminAction = (state, payload) => {
  const { action, id, selectedId } = payload;
  if (!action || !id) throw new Error("Action and record ID are required.");

  if (["approve-teacher", "reject-teacher", "reopen-teacher"].includes(action)) {
    const teacher = findById(state.teachers, id);
    if (!teacher) throw new Error("Teacher application not found.");
    teacher.status = action === "approve-teacher" ? "approved" : action === "reject-teacher" ? "rejected" : "pending";
    return `${teacher.teacherName} is now ${teacher.status}.`;
  }

  if (["approve-jobseeker", "reject-jobseeker", "reopen-jobseeker"].includes(action)) {
    const jobseeker = findById(state.jobseekers, id);
    if (!jobseeker) throw new Error("Jobseeker profile not found.");
    jobseeker.status = action === "approve-jobseeker" ? "approved" : action === "reject-jobseeker" ? "rejected" : "pending";
    return `${jobseeker.jobName} is now ${jobseeker.status}.`;
  }

  if (action === "allocate-student") {
    const student = findById(state.students, id);
    const teacher = findById(state.teachers, selectedId);
    if (!student || !teacher) throw new Error("Student request or selected teacher was not found.");
    state.allocations = state.allocations.filter((allocation) => allocation.studentId !== student.id);
    state.allocations.unshift({
      id: randomUUID(),
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
    return `${student.studentName} has been allocated to ${teacher.teacherName}.`;
  }

  if (action === "place-jobseeker") {
    const request = findById(state.employerRequests, id);
    const jobseeker = findById(state.jobseekers, selectedId);
    if (!request || !jobseeker) throw new Error("Employer request or selected jobseeker was not found.");
    state.jobPlacements = state.jobPlacements.filter((placement) => placement.requestId !== request.id);
    state.jobPlacements.unshift({
      id: randomUUID(),
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
    return `${jobseeker.jobName} has been matched to ${request.institutionName}.`;
  }

  if (action === "clear-allocation") {
    const student = findById(state.students, id);
    state.allocations = state.allocations.filter((allocation) => allocation.studentId !== id);
    if (student) student.status = "open";
    return "Allocation has been reopened.";
  }

  if (action === "clear-job-placement") {
    const request = findById(state.employerRequests, id);
    state.jobPlacements = state.jobPlacements.filter((placement) => placement.requestId !== id);
    if (request) request.status = "open";
    return "Jobseeker match has been reopened.";
  }

  throw new Error("Unsupported admin action.");
};

const routeFromRequest = (request) => {
  const path = new URL(request.url).pathname;
  return path
    .replace(/^\/api/, "")
    .replace(/^\/\.netlify\/functions\/api/, "")
    .replace(/\/$/, "") || "/";
};

export default async function handler(request) {
  if (request.method === "OPTIONS") return json(200, { ok: true });

  try {
    const route = routeFromRequest(request);
    const method = request.method;

    if (route === "/health" && method === "GET") {
      return json(200, { ok: true, service: "Philotimo backend" });
    }

    if (route === "/admin/login" && method === "POST") {
      const payload = await readJsonBody(request);
      const submittedCode = clean(payload.adminCode || payload.password);
      if (!submittedCode || submittedCode !== configuredAdminCode()) return unauthorized();
      return json(200, { token: issueToken(), expiresInHours: SESSION_HOURS });
    }

    if (route === "/admin/state" && method === "GET") {
      if (!verifyToken(request)) return unauthorized();
      return json(200, publicState(await readState()));
    }

    if (route === "/admin/action" && method === "POST") {
      if (!verifyToken(request)) return unauthorized();
      const state = await readState();
      const message = applyAdminAction(state, await readJsonBody(request));
      const saved = await writeState(state);
      return json(200, { message, state: publicState(saved) });
    }

    if (route === "/teachers" && method === "POST") {
      const state = await readState();
      const teacher = createTeacher(await readJsonBody(request));
      state.teachers.unshift(teacher);
      await writeState(state);
      return json(201, { message: `${teacher.teacherName}'s application has been submitted for admin approval.`, record: teacher });
    }

    if (route === "/students" && method === "POST") {
      const state = await readState();
      const student = createStudent(await readJsonBody(request));
      state.students.unshift(student);
      const matchCount = getTeacherMatches(state, student).length;
      await writeState(state);
      return json(201, { message: `${student.studentName}'s request has been saved.`, record: student, matchCount });
    }

    if (route === "/jobseekers" && method === "POST") {
      const state = await readState();
      const jobseeker = createJobseeker(await readJsonBody(request));
      state.jobseekers.unshift(jobseeker);
      await writeState(state);
      return json(201, { message: `${jobseeker.jobName}'s profile has been submitted for admin vetting.`, record: jobseeker });
    }

    if (route === "/employer-requests" && method === "POST") {
      const state = await readState();
      const employerRequest = createEmployerRequest(await readJsonBody(request));
      state.employerRequests.unshift(employerRequest);
      const matchCount = getJobseekerMatches(state, employerRequest).length;
      await writeState(state);
      return json(201, { message: `${employerRequest.institutionName}'s request has been saved.`, record: employerRequest, matchCount });
    }

    if (route === "/contacts" && method === "POST") {
      const state = await readState();
      const contact = createContact(await readJsonBody(request));
      state.contacts.unshift(contact);
      await writeState(state);
      return json(201, { message: `Thank you, ${contact.name}. Your enquiry has been submitted.`, record: contact });
    }

    return json(404, { message: "API route not found." });
  } catch (error) {
    return badRequest(error.message || "Request could not be processed.");
  }
}

export const config = {
  path: "/api/*",
};
