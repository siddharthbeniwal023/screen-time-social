import * as Keychain from 'react-native-keychain';

export type StoredSession = {
  accessToken: string;
  refreshToken: string;
};

const SESSION_SERVICE = 'com.screentimesocial.session';

export async function saveSession(session: StoredSession) {
  await Keychain.setGenericPassword('session', JSON.stringify(session), {
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    service: SESSION_SERVICE,
  });
}

export async function loadSession(): Promise<StoredSession | null> {
  const credentials = await Keychain.getGenericPassword({
    service: SESSION_SERVICE,
  });
  if (!credentials) {
    return null;
  }

  try {
    const session = JSON.parse(credentials.password) as Partial<StoredSession>;
    if (
      typeof session.accessToken !== 'string' ||
      typeof session.refreshToken !== 'string'
    ) {
      await clearStoredSession();
      return null;
    }
    return session as StoredSession;
  } catch {
    await clearStoredSession();
    return null;
  }
}

export async function clearStoredSession() {
  await Keychain.resetGenericPassword({service: SESSION_SERVICE});
}
