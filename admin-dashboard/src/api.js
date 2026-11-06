// All calls to the Express admin API live here.

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3000/api").replace(/\/$/, "");
const TOKEN_KEY = "fb_admin_token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: token lives only for this page load */
  }
}

// Called by the app when any request says the admin token is no longer valid.
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code || "error");
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "مش قادر أوصل للسيرفر");
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    if (res.status === 401 && path !== "/admin/login") {
      setToken("");
      onUnauthorized();
    }
    if (!data.code) {
      // Not one of our JSON errors (e.g. Express "Cannot POST" page)
      const msg =
        res.status === 404
          ? "السيرفر مش لاقي الطلب ده (404). غالباً السيرفر لسه شغال بالنسخة القديمة: اعمل push و redeploy"
          : `السيرفر رد بخطأ ${res.status}`;
      throw new ApiError(res.status, "HTTP_" + res.status, msg);
    }
    throw new ApiError(res.status, data.code, data.message);
  }
  return data;
}

const qs = (params) =>
  "?" +
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "" && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

export const api = {
  async login(password) {
    const data = await request("POST", "/admin/login", { password });
    setToken(data.token);
    return data;
  },
  logout() {
    setToken("");
  },
  games: () => request("GET", "/admin/games"),
  createGame: (gameId, name) => request("POST", "/admin/games", { gameId, name }),
  updateGame: (gameId, changes) => request("PATCH", `/admin/games/${encodeURIComponent(gameId)}`, changes),
  deleteGame: (gameId) => request("DELETE", `/admin/games/${encodeURIComponent(gameId)}`),
  stats: (gameId, type) => request("GET", "/admin/stats" + qs({ gameId, type })),
  users: (params) => request("GET", "/admin/users" + qs(params)),
  createUser: (data) => request("POST", "/admin/users", data),
  user: (id) => request("GET", `/admin/users/${id}`),
  setNote: (id, note) => request("PATCH", `/admin/users/${id}`, { note }),
  resetDevice: (id) => request("POST", `/admin/users/${id}/reset-device`, {}),
  kick: (id) => request("POST", `/admin/users/${id}/kick`, {}),
  ban: (id, reason) => request("POST", `/admin/users/${id}/ban`, { reason }),
  unban: (id) => request("POST", `/admin/users/${id}/unban`, {}),
  setSubscription: (id, startsAt, months) => request("POST", `/admin/users/${id}/subscription`, { startsAt, months }),
  setPassword: (id, newPassword) => request("POST", `/admin/users/${id}/password`, { newPassword }),
  remove: (id) => request("DELETE", `/admin/users/${id}`),
  clearAlert: (id) => request("POST", `/admin/users/${id}/clear-alert`, {}),
  clearBuildAlert: (id) => request("POST", `/admin/users/${id}/clear-build-alert`, {}),
  builds: (gameId) => request("GET", "/admin/builds" + qs({ gameId })),
  addBuild: (gameId, hash, label) => request("POST", "/admin/builds", { gameId, hash, label }),
  removeBuild: (id) => request("DELETE", `/admin/builds/${id}`, {}),
};

// Arabic messages for the error codes the server returns.
const MESSAGES = {
  NETWORK: "مش قادر أوصل للسيرفر",
  WRONG_PASSWORD: "الباسورد غلط",
  TOO_MANY_ATTEMPTS: "محاولات كتير غلط، استنى 5 دقايق",
  ADMIN_DISABLED: "الداش بورد مقفولة: حط ADMIN_PASSWORD في .env بتاع السيرفر",
  INVALID_INPUT: "البيانات مش صح",
  NOT_FOUND: "الحساب مش موجود",
  USERNAME_TAKEN: "اليوزر ده موجود قبل كده",
  UNKNOWN_GAME: "اللعبة دي مش موجودة",
  GAME_DISABLED: "اللعبة دي موقوفة: شغّلها الأول",
  GAME_EXISTS: "فيه لعبة بالـ gameId ده قبل كده",
  GAME_HAS_USERS: "اللعبة عليها حسابات: وقّفها بدل ما تمسحها، أو امسح حساباتها الأول",
  BUILD_EXISTS: "الـ hash ده متسجل قبل كده لنفس اللعبة",
  BUILD_MISMATCH: "نسخة اللعبة دي مش معروفة",
  SERVER_ERROR: "حصل خطأ في السيرفر",
  NO_SUBSCRIPTION: "الحساب مالوش اشتراك",
  SUBSCRIPTION_NOT_STARTED: "الاشتراك لسه مابدأش",
  SUBSCRIPTION_EXPIRED: "الاشتراك خلص",
};

export function errorText(err) {
  return MESSAGES[err && err.code] || (err && err.message) || "حصل خطأ";
}
