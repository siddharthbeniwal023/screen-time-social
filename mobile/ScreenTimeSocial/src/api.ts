import {clearStoredSession, loadSession, saveSession} from './session';
import {Platform} from 'react-native';

export type ApiUser = {
  id: string;
  displayName: string;
  username: string;
  createdAt: string;
  shareAppBreakdown: boolean;
};

type AuthResponse = {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: ApiUser;
};

type RegisterInput = {
  displayName: string;
  username: string;
  email: string;
  password: string;
};

export type FriendshipResponse = {
  id: string;
  requester: ApiUser;
  addressee: ApiUser;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
  updatedAt: string;
};

export type ApiUsage = {
  date: string;
  totalMinutes: number;
  pickups: number;
  apps: {appId: string; displayName: string; minutes: number}[];
  syncedAt: string;
};

export type CircleMember = {
  userId: string;
  displayName: string;
  username: string;
  usage?: ApiUsage;
  appBreakdownShared: boolean;
};

export type ComparisonGroupMember = {
  userId: string;
  displayName: string;
  username: string;
  role: 'OWNER' | 'MEMBER';
  joinedAt: string;
  usage?: ApiUsage;
  appBreakdownShared: boolean;
};

export type ComparisonGroup = {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  members: ComparisonGroupMember[];
  createdAt: string;
  updatedAt: string;
};

type DailyUsageInput = {
  totalMinutes: number;
  pickups: number;
  apps: {id?: string; name: string; minutes: number}[];
};

const API_ORIGIN = __DEV__
  ? Platform.select({
      android: 'http://10.0.2.2:8080',
      default: 'http://localhost:8080',
    })!
  : 'https://screen-time-social-production.up.railway.app';

const API_URL = `${API_ORIGIN}/api/v1`;
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<void> | null = null;
let sessionExpiredHandler: (() => void) | null = null;
const REQUEST_TIMEOUT_MS = 15_000;

function localDate() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super('Your session expired. Please sign in again.');
    this.name = 'SessionExpiredError';
  }
}

async function request(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {...init, signal: controller.signal});
  } catch (caught) {
    if (controller.signal.aborted) {
      throw new Error('The request timed out. Check your connection and try again.');
    }
    if (caught instanceof Error && caught.message) {
      throw new Error(`Could not reach the server. ${caught.message}`);
    }
    throw new Error('Could not reach the server. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
      fields?: Record<string, string>;
    };
    const fieldMessage = error.fields
      ? Object.entries(error.fields).map(([field, message]) => `${field} ${message}`).join(', ')
      : '';
    throw new ApiError(
      fieldMessage || error.message || `Request failed with status ${response.status}`,
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

async function applyAuth(auth: AuthResponse) {
  accessToken = auth.accessToken;
  refreshToken = auth.refreshToken;
  await saveSession({
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    user: auth.user,
  });
}

async function persistCurrentUser(user: ApiUser) {
  if (accessToken && refreshToken) {
    await saveSession({accessToken, refreshToken, user});
  }
  return user;
}

async function authenticate(path: string, input: object): Promise<ApiUser> {
  const response = await request(`${API_URL}${path}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(input),
  });
  const auth = await parseResponse<AuthResponse>(response);
  await applyAuth(auth);
  return auth.user;
}

async function refreshAccessToken() {
  if (!refreshToken) {
    throw new Error('Please sign in again');
  }
  if (!refreshPromise) {
    const currentRefreshToken = refreshToken;
    refreshPromise = (async () => {
      const response = await request(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({refreshToken: currentRefreshToken}),
      });
      const auth = await parseResponse<AuthResponse>(response);
      await applyAuth(auth);
    })().finally(() => {
      refreshPromise = null;
    });
  }
  await refreshPromise;
}

async function authorizedFetch(path: string, init: RequestInit = {}, canRetry = true) {
  if (!accessToken) {
    throw new Error('Please sign in again');
  }
  const response = await request(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (response.status === 401 && canRetry && refreshToken) {
    try {
      await refreshAccessToken();
      return authorizedFetch(path, init, false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        await expireSession();
        throw new SessionExpiredError();
      }
      throw caught;
    }
  }
  if (response.status === 401) {
    await expireSession();
    throw new SessionExpiredError();
  }
  return response;
}

async function expireSession() {
  accessToken = null;
  refreshToken = null;
  await clearStoredSession().catch(() => undefined);
  sessionExpiredHandler?.();
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler;
}

export function register(input: RegisterInput) {
  return authenticate('/auth/register', input);
}

export function login(email: string, password: string) {
  return authenticate('/auth/login', {email, password});
}

export async function restoreSession(): Promise<ApiUser | null> {
  const stored = await loadSession();
  if (!stored) {
    return null;
  }
  accessToken = stored.accessToken;
  refreshToken = stored.refreshToken;
  try {
    const response = await authorizedFetch('/me');
    return persistCurrentUser(await parseResponse<ApiUser>(response));
  } catch (caught) {
    if (caught instanceof SessionExpiredError) {
      return null;
    }
    return stored.user
      ? {...stored.user, shareAppBreakdown: stored.user.shareAppBreakdown ?? true}
      : null;
  }
}

export async function getProfile(): Promise<ApiUser> {
  const response = await authorizedFetch('/me');
  return persistCurrentUser(await parseResponse<ApiUser>(response));
}

export async function clearSession() {
  const tokenToRevoke = refreshToken;
  accessToken = null;
  refreshToken = null;
  await clearStoredSession();
  if (tokenToRevoke) {
    await request(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({refreshToken: tokenToRevoke}),
    }).catch(() => undefined);
  }
}

export async function deleteAccount() {
  const response = await authorizedFetch('/me', {method: 'DELETE'});
  if (!response.ok) {
    await parseResponse(response);
  }
  accessToken = null;
  refreshToken = null;
  await clearStoredSession().catch(() => undefined);
}

export async function findUser(username: string): Promise<ApiUser | null> {
  const response = await authorizedFetch(
    `/users/search?username=${encodeURIComponent(username)}`,
  );
  if (response.status === 404) {
    return null;
  }
  return parseResponse<ApiUser>(response);
}

export async function sendFriendRequest(addresseeUsername: string) {
  const response = await authorizedFetch('/friend-requests', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({addresseeUsername}),
  });
  await parseResponse(response);
}

export async function changeUsername(username: string): Promise<ApiUser> {
  const response = await authorizedFetch('/me/username', {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({username}),
  });
  return persistCurrentUser(await parseResponse<ApiUser>(response));
}

export async function changePrivacy(shareAppBreakdown: boolean): Promise<ApiUser> {
  const response = await authorizedFetch('/me/privacy', {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({shareAppBreakdown}),
  });
  return persistCurrentUser(await parseResponse<ApiUser>(response));
}

export async function getCircle(): Promise<CircleMember[]> {
  const response = await authorizedFetch(`/me/circle?date=${localDate()}`);
  return parseResponse<CircleMember[]>(response);
}

export async function getComparisonGroups(): Promise<ComparisonGroup[]> {
  const response = await authorizedFetch(`/me/groups?date=${localDate()}`);
  return parseResponse<ComparisonGroup[]>(response);
}

export async function createComparisonGroup(name: string, memberUserIds: string[]) {
  const response = await authorizedFetch('/groups', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({name, memberUserIds}),
  });
  return parseResponse<ComparisonGroup>(response);
}

export async function joinComparisonGroup(inviteCode: string) {
  const response = await authorizedFetch('/groups/join', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({inviteCode}),
  });
  return parseResponse<ComparisonGroup>(response);
}

export async function getPendingFriendRequests(): Promise<FriendshipResponse[]> {
  const response = await authorizedFetch('/me/friend-requests');
  return parseResponse<FriendshipResponse[]>(response);
}

export async function acceptFriendRequest(friendshipId: string) {
  const response = await authorizedFetch(
    `/friend-requests/${encodeURIComponent(friendshipId)}/accept`,
    {method: 'POST'},
  );
  return parseResponse<FriendshipResponse>(response);
}

export async function declineFriendRequest(friendshipId: string) {
  const response = await authorizedFetch(
    `/friend-requests/${encodeURIComponent(friendshipId)}/decline`,
    {method: 'POST'},
  );
  return parseResponse<FriendshipResponse>(response);
}

export async function removeFriend(friendUserId: string) {
  const response = await authorizedFetch(
    `/friends/${encodeURIComponent(friendUserId)}`,
    {method: 'DELETE'},
  );
  if (!response.ok) {
    await parseResponse(response);
  }
}

export async function leaveComparisonGroup(groupId: string) {
  const response = await authorizedFetch(
    `/groups/${encodeURIComponent(groupId)}`,
    {method: 'DELETE'},
  );
  if (!response.ok) {
    await parseResponse(response);
  }
}

export async function syncDailyUsage(usage: DailyUsageInput) {
  const date = localDate();
  const response = await authorizedFetch('/me/usage', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      date,
      totalMinutes: usage.totalMinutes,
      pickups: usage.pickups,
      apps: usage.apps.map(app => ({
        appId: app.id ?? app.name.toLowerCase().replace(/[^a-z0-9]+/g, '.'),
        displayName: app.name,
        minutes: app.minutes,
      })),
    }),
  });
  await parseResponse(response);
}
