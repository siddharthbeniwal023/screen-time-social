/**
 * @format
 */

import * as Keychain from 'react-native-keychain';
import {getCircle, register} from '../src/api';

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly'},
  getGenericPassword: jest.fn().mockResolvedValue(false),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
  setGenericPassword: jest.fn().mockResolvedValue(true),
}));

const user = {
  id: '9eef1bf7-8a2e-4283-b4e9-d06a44885e64',
  displayName: 'Maya',
  username: 'maya',
  createdAt: '2026-11-15T12:00:00Z',
  shareAppBreakdown: true,
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    json: jest.fn().mockResolvedValue(body),
    ok: status >= 200 && status < 300,
    status,
  } as unknown as Response;
}

test('stores a session, refreshes once on 401, and retries the protected request', async () => {
  const firstAuth = {
    accessToken: 'access-one',
    expiresInSeconds: 3600,
    refreshToken: 'refresh-one',
    refreshTokenExpiresAt: '2026-12-15T12:00:00Z',
    user,
  };
  const rotatedAuth = {
    ...firstAuth,
    accessToken: 'access-two',
    refreshToken: 'refresh-two',
  };
  const fetchMock = jest.fn()
    .mockResolvedValueOnce(jsonResponse(201, firstAuth))
    .mockResolvedValueOnce(jsonResponse(401, {}))
    .mockResolvedValueOnce(jsonResponse(200, rotatedAuth))
    .mockResolvedValueOnce(jsonResponse(200, []));
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  await expect(register({
    displayName: 'Maya',
    username: 'maya',
    email: 'maya@example.com',
    password: 'correct-horse-battery-staple',
  })).resolves.toEqual(user);
  await expect(getCircle()).resolves.toEqual([]);

  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(fetchMock.mock.calls[0][0]).toEqual(expect.stringContaining('/api/v1/auth/register'));
  expect(fetchMock.mock.calls[2][0]).toEqual(expect.stringContaining('/api/v1/auth/refresh'));
  expect(fetchMock.mock.calls[3][1]).toEqual(expect.objectContaining({
    headers: expect.objectContaining({Authorization: 'Bearer access-two'}),
  }));
  expect(Keychain.setGenericPassword).toHaveBeenLastCalledWith(
    'session',
    expect.stringContaining('refresh-two'),
    expect.any(Object),
  );
});
