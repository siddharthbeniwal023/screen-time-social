import {clearStoredSession, loadSession, saveSession} from './session';

export type ApiUser = {
  id: string;
  displayName: string;
  username: string;
  createdAt: string;
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
};

export type ComparisonGroupMember = {
  userId: string;
  displayName: string;
  username: string;
  role: 'OWNER' | 'MEMBER';
  joinedAt: string;
  usage?: ApiUsage;
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
  apps: {name: string; minutes: number}[];
};

const API_ORIGIN = 'https://screen-time-social-production.up.railway.app';

const API_URL = `${API_ORIGIN}/api/v1`;
let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {message?: string};
    throw new Error(error.message ?? `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function applyAuth(auth: AuthResponse) {
  accessToken = auth.accessToken;
  refreshToken = auth.refreshToken;
  await saveSession({accessToken: auth.accessToken, refreshToken: auth.refreshToken});
}

async function authenticate(path: string, input: object): Promise<ApiUser> {
  const response = await fetch(`${API_URL}${path}`, {
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
      const response = await fetch(`${API_URL}/auth/refresh`, {
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
  const response = await fetch(`${API_URL}${path}`, {
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
    } catch {
      accessToken = null;
      refreshToken = null;
      await clearStoredSession();
      throw new Error('Your session expired. Please sign in again.');
    }
  }
  return response;
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
    return await parseResponse<ApiUser>(response);
  } catch {
    accessToken = null;
    refreshToken = null;
    await clearStoredSession();
    return null;
  }
}

export async function clearSession() {
  const tokenToRevoke = refreshToken;
  accessToken = null;
  refreshToken = null;
  await clearStoredSession();
  if (tokenToRevoke) {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({refreshToken: tokenToRevoke}),
    }).catch(() => undefined);
  }
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
  return parseResponse<ApiUser>(response);
}

export async function getCircle(): Promise<CircleMember[]> {
  const response = await authorizedFetch('/me/circle');
  return parseResponse<CircleMember[]>(response);
}

export async function getComparisonGroups(): Promise<ComparisonGroup[]> {
  const response = await authorizedFetch('/me/groups');
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

export async function syncDailyUsage(usage: DailyUsageInput) {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const response = await authorizedFetch('/me/usage', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      date,
      totalMinutes: usage.totalMinutes,
      pickups: usage.pickups,
      apps: usage.apps.map(app => ({
        appId: app.name.toLowerCase().replace(/[^a-z0-9]+/g, '.'),
        displayName: app.name,
        minutes: app.minutes,
      })),
    }),
  });
  await parseResponse(response);
}
