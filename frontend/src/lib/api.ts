import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("pp_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — clear stale token and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const isLoginPage = window.location.pathname === "/login" || window.location.pathname === "/register";
      if (!isLoginPage) {
        localStorage.removeItem("pp_token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (email: string, password: string, fullName?: string) =>
    api.post("/api/auth/register", { email, password, full_name: fullName }),

  login: (email: string, password: string) => {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    return api.post("/api/auth/login", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },

  me: () => api.get("/api/auth/me"),
  
  getMastery: () => api.get("/api/auth/mastery"),

  logout: () => api.post("/api/auth/logout"),

  updateProfile: (data: { full_name?: string; target_role?: string; target_company?: string; exam_date?: string }) =>
    api.put("/api/auth/profile", data),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

export const testsApi = {
  generate: (topic: string, difficulty: string, style?: string) =>
    api.post("/api/tests/generate", { topic, difficulty, style }),

  get: (testId: string) => api.get(`/api/tests/${testId}`),
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const sessionsApi = {
  create: (testId: string) => api.post("/api/sessions/", { test_id: testId }),

  get: (sessionId: string) => api.get(`/api/sessions/${sessionId}`),

  list: () => api.get("/api/sessions/"),

  submit: (sessionId: string, antiCheat?: { tab_switches: number, paste_bursts: number }) =>
    api.post(`/api/sessions/${sessionId}/submit`, antiCheat || { tab_switches: 0, paste_bursts: 0 }),
};

// ─── Submissions ──────────────────────────────────────────────────────────────

export const submissionsApi = {
  submitCode: (sessionId: string, problemId: string, code: string, language: string, is_run: boolean = false, customInput?: string) =>
    api.post("/api/submissions/code", {
      session_id: sessionId,
      problem_id: problemId,
      code,
      language,
      is_run,
      ...(customInput !== undefined && { custom_input: customInput }),
    }),

  submitMcq: (sessionId: string, mcqId: string, chosenOption: string) =>
    api.post("/api/submissions/mcq", {
      session_id: sessionId,
      mcq_id: mcqId,
      chosen_option: chosenOption,
    }),
};

// ─── Reports ──────────────────────────────────────────────────────────────────

export const reportsApi = {
  get: (sessionId: string) => api.get(`/api/reports/${sessionId}`),
};

// ─── Scheduled Events ─────────────────────────────────────────────────────────

export const eventsApi = {
  create: (testId: string, title: string, scheduledStart: string, joinWindowMinutes: number, maxParticipants?: number) =>
    api.post("/api/events/", { 
      test_id: testId, 
      title, 
      scheduled_start: scheduledStart, 
      join_window_minutes: joinWindowMinutes,
      max_participants: maxParticipants
    }),
  list: () =>
    api.get("/api/events/"),
  getPublicInfo: (slug: string) =>
    api.get(`/api/events/${slug}`),
  join: (slug: string) =>
    api.post(`/api/events/${slug}/join`),
  leaderboard: (slug: string) =>
    api.get(`/api/events/${slug}/leaderboard`),
};
