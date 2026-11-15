import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  changeUsername,
  clearSession,
  acceptFriendRequest,
  findUser,
  getCircle,
  getPendingFriendRequests,
  login,
  register,
  restoreSession,
  sendFriendRequest,
  syncDailyUsage,
} from './src/api';
import type {ApiUser, FriendshipResponse} from './src/api';
import {getTodayUsage, openUsageAccessSettings} from './src/screenTime';
import type {AppUsage, Friend, UsageSummary} from './src/types';

const colors = {
  ink: '#17211B',
  muted: '#667068',
  canvas: '#F4F1E8',
  surface: '#FFFDF7',
  border: '#DFDDD2',
  lime: '#DDF970',
  green: '#205C3B',
  lavender: '#D9D3FF',
  white: '#FFFFFF',
  danger: '#9B3A2F',
};

const demoApps: AppUsage[] = [
  {name: 'Instagram', minutes: 74, color: '#E985B4'},
  {name: 'YouTube', minutes: 52, color: '#FF786E'},
  {name: 'WhatsApp', minutes: 39, color: '#70C99A'},
  {name: 'Chrome', minutes: 28, color: '#7EA7F7'},
];

const initialFriends: Friend[] = [];

const demoUsage: UsageSummary = {
  totalMinutes: 252,
  pickups: 67,
  changePercent: -12,
  apps: demoApps,
};

type Tab = 'today' | 'friends' | 'profile';

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours > 0 ? `${hours}h ${remaining}m` : `${remaining}m`;
}

function Avatar({friend, size = 44}: {friend: Friend; size?: number}) {
  return (
    <View
      style={[
        styles.avatar,
        {backgroundColor: friend.color, height: size, width: size, borderRadius: size / 2},
      ]}>
      <Text style={[styles.avatarText, {fontSize: size * 0.32}]}>{friend.initials}</Text>
    </View>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('today');
  const [usage, setUsage] = useState<UsageSummary>(demoUsage);
  const [isDemo, setIsDemo] = useState(true);
  const [friends, setFriends] = useState(initialFriends);
  const [pendingRequests, setPendingRequests] = useState<FriendshipResponse[]>([]);
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  useEffect(() => {
    let mounted = true;
    restoreSession()
      .then(user => {
        if (mounted) {
          setCurrentUser(user);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsRestoringSession(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const refreshSocial = useCallback(async () => {
    if (!currentUser) {
      return;
    }
    const [circle, pending] = await Promise.all([
      getCircle(),
      getPendingFriendRequests(),
    ]);
    const palette = ['#D9D3FF', '#FFCF99', '#BDE3D0', '#E985B4'];
    setFriends(
      circle
        .filter(member => member.userId !== currentUser.id)
        .map((member, index) => ({
          id: member.userId,
          name: member.displayName,
          username: member.username,
          minutes: member.usage?.totalMinutes ?? 0,
          initials: member.displayName
            .split(' ')
            .map(part => part.charAt(0))
            .join('')
            .slice(0, 2)
            .toUpperCase(),
          color: palette[index % palette.length],
        })),
    );
    setPendingRequests(pending);
  }, [currentUser]);

  useEffect(() => {
    refreshSocial().catch(() => {
      // The authenticated shell remains usable while the API reconnects.
    });
  }, [refreshSocial]);

  const connectScreenTime = async () => {
    if (Platform.OS === 'android') {
      const deviceUsage = await getTodayUsage();
      if (!deviceUsage.hasPermission) {
        Alert.alert(
          'Allow Usage Access',
          'On the next screen, choose Screen Time Social and turn on usage access.',
          [
            {text: 'Not now', style: 'cancel'},
            {text: 'Open settings', onPress: openUsageAccessSettings},
          ],
        );
        return;
      }

      const connectedUsage = {
        totalMinutes: deviceUsage.totalMinutes,
        pickups: 0,
        changePercent: usage.changePercent,
        apps: deviceUsage.apps.slice(0, 4),
      };
      setUsage(connectedUsage);
      setIsDemo(false);
      if (connectedUsage.apps.length > 0) {
        try {
          await syncDailyUsage(connectedUsage);
          await refreshSocial();
        } catch {
          Alert.alert(
            'Saved on this device only',
            'Screen time could not be synced to the server. Try again when the API is available.',
          );
        }
      }
      return;
    }

    Alert.alert(
      'iOS setup required',
      'Screen Time access will become available after the Family Controls entitlement and native Device Activity report are configured.',
    );
  };

  if (isRestoringSession) {
    return (
      <View style={[styles.app, styles.sessionLoading]}>
        <View style={styles.brandMark}>
          <View style={styles.brandDot} />
          <View style={[styles.brandDot, styles.brandDotOffset]} />
        </View>
        <Text style={styles.sessionLoadingText}>Restoring your circle…</Text>
      </View>
    );
  }

  if (!currentUser) {
    return (
      <View style={[styles.app, {paddingTop: insets.top, paddingBottom: insets.bottom}]}>
        <AuthScreen onAuthenticated={setCurrentUser} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.app}>
      <View style={[styles.app, {paddingTop: insets.top}]}>
        {tab === 'today' && (
          <TodayScreen
            currentUser={currentUser}
            usage={usage}
            friends={friends}
            isDemo={isDemo}
            onConnect={connectScreenTime}
            onShowFriends={() => setTab('friends')}
          />
        )}
        {tab === 'friends' && (
          <FriendsScreen
            friends={friends}
            pendingRequests={pendingRequests}
            onSocialChange={refreshSocial}
          />
        )}
        {tab === 'profile' && (
          <ProfileScreen
            isDemo={isDemo}
            user={currentUser}
            onUserChange={setCurrentUser}
            onLogout={() => {
              setCurrentUser(null);
              setTab('today');
              clearSession().catch(() => undefined);
            }}
          />
        )}
        <BottomNav tab={tab} onChange={setTab} bottomInset={insets.bottom} />
      </View>
    </KeyboardAvoidingView>
  );
}

function AuthScreen({onAuthenticated}: {onAuthenticated: (user: ApiUser) => void}) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const user = mode === 'register'
        ? await register({displayName, username, email, password})
        : await login(email, password);
      onAuthenticated(user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to authenticate');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.authPage}>
      <ScrollView
        contentContainerStyle={styles.authContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.authBrandMark}>
          <View style={styles.brandDot} />
          <View style={[styles.brandDot, styles.brandDotOffset]} />
        </View>
        <Text style={styles.authEyebrow}>SCREEN TIME, TOGETHER</Text>
        <Text style={styles.authTitle}>
          {mode === 'register' ? 'Join your circle.' : 'Welcome back.'}
        </Text>
        <Text style={styles.authIntro}>
          Share intentionally with the friends you accept—never with strangers.
        </Text>

        <View style={styles.authCard}>
          {mode === 'register' && (
            <>
              <AuthField
                autoCapitalize="words"
                label="Name"
                onChangeText={setDisplayName}
                placeholder="Your name"
                value={displayName}
              />
              <AuthField
                autoCapitalize="none"
                label="Username"
                onChangeText={setUsername}
                placeholder="your_unique_name"
                value={username}
              />
            </>
          )}
          <AuthField
            autoCapitalize="none"
            keyboardType="email-address"
            label="Email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            value={email}
          />
          <AuthField
            autoCapitalize="none"
            label="Password"
            onChangeText={setPassword}
            placeholder={mode === 'register' ? 'At least 10 characters' : 'Your password'}
            secureTextEntry
            value={password}
          />
          {error.length > 0 && <Text style={styles.authError}>{error}</Text>}
          <Pressable
            disabled={loading}
            onPress={submit}
            style={[styles.authButton, loading && styles.authButtonDisabled]}>
            <Text style={styles.authButtonText}>
              {loading ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => {
            setMode(current => current === 'register' ? 'login' : 'register');
            setError('');
          }}>
          <Text style={styles.authSwitch}>
            {mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function AuthField({
  label,
  ...inputProps
}: React.ComponentProps<typeof TextInput> & {label: string}) {
  return (
    <View style={styles.authField}>
      <Text style={styles.authLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        autoCorrect={false}
        placeholderTextColor="#9A9E96"
        style={styles.authInput}
      />
    </View>
  );
}

function ScreenHeader({eyebrow, title}: {eyebrow: string; title: string}) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.brandMark}>
        <View style={styles.brandDot} />
        <View style={[styles.brandDot, styles.brandDotOffset]} />
      </View>
    </View>
  );
}

function TodayScreen({
  currentUser,
  usage,
  friends,
  isDemo,
  onConnect,
  onShowFriends,
}: {
  currentUser: ApiUser;
  usage: UsageSummary;
  friends: Friend[];
  isDemo: boolean;
  onConnect: () => void;
  onShowFriends: () => void;
}) {
  const maxAppMinutes = Math.max(...usage.apps.map(app => app.minutes), 1);
  const leaderboard = useMemo(
    () => [
      ...friends,
      {
        id: 'me',
        name: 'You',
        username: currentUser.username,
        minutes: usage.totalMinutes,
        initials: currentUser.displayName
          .split(' ')
          .map(part => part.charAt(0))
          .join('')
          .slice(0, 2),
        color: colors.lime,
      },
    ].sort((a, b) => a.minutes - b.minutes),
    [currentUser, friends, usage.totalMinutes],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>
      <ScreenHeader eyebrow="TODAY" title="Good morning" />

      {isDemo && (
        <Pressable style={styles.permissionCard} onPress={onConnect}>
          <View style={styles.permissionIcon}>
            <Text style={styles.permissionIconText}>↗</Text>
          </View>
          <View style={styles.permissionCopy}>
            <Text style={styles.permissionTitle}>Connect your screen time</Text>
            <Text style={styles.permissionText}>
              You are viewing demo data. Tap to use this device.
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}

      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <Text style={styles.cardLabel}>TODAY'S SCREEN TIME</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{isDemo ? 'DEMO' : 'LIVE'}</Text>
          </View>
        </View>
        <Text style={styles.heroNumber}>{formatDuration(usage.totalMinutes)}</Text>
        <Text style={styles.trendText}>
          ↓ {Math.abs(usage.changePercent)}% from your daily average
        </Text>
        <View style={styles.weekChart}>
          {[46, 63, 52, 79, 67, 91, 72].map((height, index) => (
            <View key={index} style={styles.chartColumn}>
              <View
                style={[
                  styles.chartBar,
                  index === 6 ? styles.chartBarActive : styles.chartBarInactive,
                  {height},
                ]}
              />
              <Text style={[styles.chartDay, index === 6 && styles.chartDayActive]}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.metricRow}>
        <View style={[styles.metricCard, styles.metricCardGap]}>
          <Text style={styles.metricLabel}>PICKUPS</Text>
          <Text style={styles.metricNumber}>{usage.pickups}</Text>
          <Text style={styles.metricHint}>First at 7:42 AM</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>TOP APP</Text>
          <Text style={styles.metricNumber}>{usage.apps[0]?.name ?? '—'}</Text>
          <Text style={styles.metricHint}>
            {usage.apps[0] ? formatDuration(usage.apps[0].minutes) : 'No usage yet'}
          </Text>
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Most used</Text>
        <Text style={styles.sectionMeta}>TODAY</Text>
      </View>
      <View style={styles.card}>
        {usage.apps.map((app, index) => (
          <View
            key={app.name}
            style={[styles.appRow, index < usage.apps.length - 1 && styles.rowBorder]}>
            <View style={[styles.appIcon, {backgroundColor: app.color}]}>
              <Text style={styles.appIconText}>{app.name.charAt(0)}</Text>
            </View>
            <View style={styles.appInfo}>
              <View style={styles.appTitleRow}>
                <Text style={styles.appName}>{app.name}</Text>
                <Text style={styles.appTime}>{formatDuration(app.minutes)}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {width: `${Math.round((app.minutes / maxAppMinutes) * 100)}%`, backgroundColor: app.color},
                  ]}
                />
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Your circle</Text>
        <Pressable onPress={onShowFriends}>
          <Text style={styles.textButton}>See all</Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        {leaderboard.map((friend, index) => (
          <View
            key={friend.id}
            style={[styles.friendRow, index < leaderboard.length - 1 && styles.rowBorder]}>
            <Text style={styles.rank}>{index + 1}</Text>
            <Avatar friend={friend} />
            <View style={styles.friendCopy}>
              <Text style={styles.friendName}>{friend.name}</Text>
              <Text style={styles.username}>@{friend.username}</Text>
            </View>
            <Text style={styles.friendTime}>{formatDuration(friend.minutes)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function FriendsScreen({
  friends,
  pendingRequests,
  onSocialChange,
}: {
  friends: Friend[];
  pendingRequests: FriendshipResponse[];
  onSocialChange: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ApiUser | null>(null);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const normalizedQuery = query.trim().replace(/^@/, '').toLowerCase();

  const search = async () => {
    if (normalizedQuery.length < 3) {
      return;
    }
    setLoading(true);
    setSearched(false);
    setResult(null);
    try {
      setResult(await findUser(normalizedQuery));
      setSearched(true);
    } catch {
      Alert.alert(
        'API unavailable',
        'Start the Spring Boot server on port 8080 and try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const accept = async (friendshipId: string) => {
    setAcceptingId(friendshipId);
    try {
      await acceptFriendRequest(friendshipId);
      await onSocialChange();
    } catch (error) {
      Alert.alert(
        'Could not accept request',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setAcceptingId(null);
    }
  };

  const addFriend = async () => {
    if (!result) {
      return;
    }
    setLoading(true);
    try {
      await sendFriendRequest(result.username);
      setRequestSent(true);
    } catch (error) {
      Alert.alert(
        'Could not add friend',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <ScreenHeader eyebrow="YOUR PEOPLE" title="Friends" />
      <Text style={styles.introText}>
        Find someone by their exact, unique username. They will join your circle after accepting.
      </Text>

      <View style={styles.searchBox}>
        <Text style={styles.searchAt}>@</Text>
        <TextInput
          accessibilityLabel="Search by username"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={value => {
            setQuery(value);
            setRequestSent(false);
            setResult(null);
            setSearched(false);
          }}
          onSubmitEditing={search}
          placeholder="username"
          placeholderTextColor="#9A9E96"
          returnKeyType="search"
          style={styles.searchInput}
          value={query}
        />
        <Pressable disabled={loading || normalizedQuery.length < 3} onPress={search}>
          <Text style={styles.searchAction}>{loading ? '...' : 'Find'}</Text>
        </Pressable>
      </View>

      {result && (
        <View style={styles.searchResult}>
          <Avatar
            friend={{
              id: 'result',
              name: result.displayName,
              username: result.username,
              minutes: 0,
              initials: result.displayName
                .split(' ')
                .map(part => part.charAt(0))
                .join('')
                .slice(0, 2),
              color: colors.lavender,
            }}
            size={50}
          />
          <View style={styles.friendCopy}>
            <Text style={styles.friendName}>{result.displayName}</Text>
            <Text style={styles.username}>@{result.username}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={requestSent}
            onPress={addFriend}
            style={[styles.addButton, requestSent && styles.addButtonSent]}>
            <Text style={styles.addButtonText}>{requestSent ? 'Sent' : 'Add'}</Text>
          </Pressable>
        </View>
      )}
      {searched && !result && (
        <Text style={styles.emptySearch}>No user found for @{normalizedQuery}</Text>
      )}

      {pendingRequests.length > 0 && (
        <>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Requests</Text>
            <Text style={styles.sectionMeta}>{pendingRequests.length} NEW</Text>
          </View>
          <View style={styles.card}>
            {pendingRequests.map((request, index) => (
              <View
                key={request.id}
                style={[
                  styles.friendRow,
                  index < pendingRequests.length - 1 && styles.rowBorder,
                ]}>
                <Avatar
                  friend={{
                    id: request.requester.id,
                    name: request.requester.displayName,
                    username: request.requester.username,
                    minutes: 0,
                    initials: request.requester.displayName
                      .split(' ')
                      .map(part => part.charAt(0))
                      .join('')
                      .slice(0, 2),
                    color: colors.lavender,
                  }}
                />
                <View style={styles.friendCopy}>
                  <Text style={styles.friendName}>{request.requester.displayName}</Text>
                  <Text style={styles.username}>@{request.requester.username}</Text>
                </View>
                <Pressable
                  disabled={acceptingId !== null}
                  onPress={() => accept(request.id)}
                  style={styles.addButton}>
                  <Text style={styles.addButtonText}>
                    {acceptingId === request.id ? '...' : 'Accept'}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Your circle</Text>
        <Text style={styles.sectionMeta}>{friends.length} FRIENDS</Text>
      </View>
      <View style={styles.card}>
        {friends.length === 0 && (
          <Text style={styles.emptyFriends}>
            Your circle is empty. Search for a username to invite your first friend.
          </Text>
        )}
        {friends.map((friend, index) => (
          <View
            key={friend.id}
            style={[styles.friendRow, index < friends.length - 1 && styles.rowBorder]}>
            <Avatar friend={friend} size={48} />
            <View style={styles.friendCopy}>
              <Text style={styles.friendName}>{friend.name}</Text>
              <Text style={styles.username}>@{friend.username}</Text>
            </View>
            <View style={styles.timeStack}>
              <Text style={styles.friendTime}>{formatDuration(friend.minutes)}</Text>
              <Text style={styles.todayLabel}>today</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        style={styles.inviteCard}
        onPress={() => Alert.alert('Invite link copied', 'Share it with a friend to grow your circle.')}>
        <View>
          <Text style={styles.inviteTitle}>Bring a friend along</Text>
          <Text style={styles.inviteText}>Share your invite link</Text>
        </View>
        <Text style={styles.inviteArrow}>↗</Text>
      </Pressable>
    </ScrollView>
  );
}

function ProfileScreen({
  isDemo,
  user,
  onUserChange,
  onLogout,
}: {
  isDemo: boolean;
  user: ApiUser;
  onUserChange: (user: ApiUser) => void;
  onLogout: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(user.username);
  const [saving, setSaving] = useState(false);

  const saveUsername = async () => {
    const normalized = draft.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (normalized.length < 3) {
      Alert.alert('Username too short', 'Use at least 3 letters, numbers, dots, or underscores.');
      return;
    }
    setSaving(true);
    try {
      const updated = await changeUsername(normalized);
      onUserChange(updated);
      setDraft(updated.username);
      setEditing(false);
    } catch (error) {
      Alert.alert(
        'Could not update username',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  const initials = user.displayName
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <ScreenHeader eyebrow="YOUR ACCOUNT" title="You" />
      <View style={styles.profileHero}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileInitials}>{initials}</Text>
        </View>
        <Text style={styles.profileName}>{user.displayName}</Text>
        <Text style={styles.profileUsername}>@{user.username}</Text>
      </View>

      <Text style={styles.settingsLabel}>PROFILE</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingTitle}>Unique username</Text>
            {editing ? (
              <View style={styles.usernameEditor}>
                <Text style={styles.editorAt}>@</Text>
                <TextInput
                  autoCapitalize="none"
                  autoFocus
                  onChangeText={setDraft}
                  style={styles.usernameInput}
                  value={draft}
                />
              </View>
            ) : (
              <Text style={styles.settingHint}>@{user.username}</Text>
            )}
          </View>
          <Pressable
            disabled={saving}
            onPress={editing ? saveUsername : () => setEditing(true)}>
            <Text style={styles.textButton}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Edit'}
            </Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.settingsLabel}>PRIVACY & DATA</Text>
      <View style={styles.card}>
        <SettingRow
          title="Screen time access"
          hint={isDemo ? 'Demo data' : 'Connected'}
          tone={isDemo ? colors.danger : colors.green}
        />
        <View style={styles.rowBorder} />
        <SettingRow title="Who sees my activity" hint="Friends only" />
        <View style={styles.rowBorder} />
        <SettingRow title="Share app breakdown" hint="On" />
      </View>

      <Text style={styles.privacyNote}>
        Your activity is private by default. Only accepted friends can see the totals and app details you choose to share.
      </Text>
      <Pressable onPress={onLogout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function SettingRow({title, hint, tone}: {title: string; hint: string; tone?: string}) {
  return (
    <Pressable style={styles.settingRow}>
      <Text style={styles.settingTitle}>{title}</Text>
      <View style={styles.settingValue}>
        <Text style={[styles.settingHint, tone ? {color: tone} : undefined]}>{hint}</Text>
        <Text style={styles.settingChevron}>›</Text>
      </View>
    </Pressable>
  );
}

function BottomNav({
  tab,
  onChange,
  bottomInset,
}: {
  tab: Tab;
  onChange: (tab: Tab) => void;
  bottomInset: number;
}) {
  const items: {id: Tab; label: string; icon: string}[] = [
    {id: 'today', label: 'Today', icon: '◉'},
    {id: 'friends', label: 'Friends', icon: '◎'},
    {id: 'profile', label: 'You', icon: '●'},
  ];

  return (
    <View style={[styles.bottomNav, {paddingBottom: Math.max(bottomInset, 10)}]}>
      {items.map(item => {
        const active = tab === item.id;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{selected: active}}
            key={item.id}
            onPress={() => onChange(item.id)}
            style={styles.navItem}>
            <Text style={[styles.navIcon, active && styles.navActive]}>{item.icon}</Text>
            <Text style={[styles.navLabel, active && styles.navActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  app: {backgroundColor: colors.canvas, flex: 1},
  sessionLoading: {alignItems: 'center', justifyContent: 'center'},
  sessionLoadingText: {color: colors.muted, fontSize: 13, fontWeight: '700', marginTop: 16},
  authPage: {backgroundColor: colors.canvas, flex: 1},
  authContent: {flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 36},
  authBrandMark: {alignSelf: 'flex-start', backgroundColor: colors.ink, borderRadius: 24, height: 48, marginBottom: 24, position: 'relative', width: 48},
  authEyebrow: {color: colors.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.5},
  authTitle: {color: colors.ink, fontSize: 38, fontWeight: '900', letterSpacing: -1.6, marginTop: 7},
  authIntro: {color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 330},
  authCard: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 24, borderWidth: 1, marginTop: 24, padding: 20},
  authField: {marginBottom: 15},
  authLabel: {color: colors.ink, fontSize: 12, fontWeight: '800', marginBottom: 7},
  authInput: {backgroundColor: colors.canvas, borderColor: colors.border, borderRadius: 13, borderWidth: 1, color: colors.ink, fontSize: 15, height: 50, paddingHorizontal: 14},
  authError: {color: colors.danger, fontSize: 12, lineHeight: 17, marginBottom: 12},
  authButton: {alignItems: 'center', backgroundColor: colors.ink, borderRadius: 14, marginTop: 3, paddingVertical: 15},
  authButtonDisabled: {opacity: 0.6},
  authButtonText: {color: colors.white, fontSize: 14, fontWeight: '800'},
  authSwitch: {color: colors.green, fontSize: 13, fontWeight: '800', marginTop: 18, paddingVertical: 8, textAlign: 'center'},
  scrollContent: {paddingHorizontal: 20, paddingBottom: 120},
  header: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 22, paddingTop: 18},
  eyebrow: {color: colors.green, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 3},
  title: {color: colors.ink, fontSize: 30, fontWeight: '800', letterSpacing: -1},
  brandMark: {backgroundColor: colors.ink, borderRadius: 22, height: 44, position: 'relative', width: 44},
  brandDot: {backgroundColor: colors.lime, borderRadius: 7, height: 14, left: 10, position: 'absolute', top: 9, width: 14},
  brandDotOffset: {left: 20, top: 21},
  permissionCard: {alignItems: 'center', backgroundColor: colors.lavender, borderRadius: 18, flexDirection: 'row', marginBottom: 16, padding: 15},
  permissionIcon: {alignItems: 'center', backgroundColor: colors.ink, borderRadius: 13, height: 38, justifyContent: 'center', width: 38},
  permissionIconText: {color: colors.white, fontSize: 19, fontWeight: '700'},
  permissionCopy: {flex: 1, marginHorizontal: 12},
  permissionTitle: {color: colors.ink, fontSize: 14, fontWeight: '800'},
  permissionText: {color: '#57556B', fontSize: 12, marginTop: 2},
  chevron: {color: colors.ink, fontSize: 28, fontWeight: '400'},
  heroCard: {backgroundColor: colors.ink, borderRadius: 26, padding: 22},
  heroTopRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  cardLabel: {color: '#AAB7AE', fontSize: 11, fontWeight: '800', letterSpacing: 1.25},
  livePill: {alignItems: 'center', backgroundColor: '#2B3A31', borderRadius: 12, flexDirection: 'row', paddingHorizontal: 9, paddingVertical: 5},
  liveDot: {backgroundColor: colors.lime, borderRadius: 3, height: 6, marginRight: 5, width: 6},
  liveText: {color: colors.lime, fontSize: 9, fontWeight: '800', letterSpacing: 1},
  heroNumber: {color: colors.white, fontSize: 49, fontWeight: '800', letterSpacing: -2, marginTop: 13},
  trendText: {color: colors.lime, fontSize: 13, fontWeight: '600', marginTop: 2},
  weekChart: {alignItems: 'flex-end', flexDirection: 'row', height: 124, justifyContent: 'space-between', marginTop: 15},
  chartColumn: {alignItems: 'center', height: 114, justifyContent: 'flex-end', width: 28},
  chartBar: {borderRadius: 6, marginBottom: 7, width: 17},
  chartBarActive: {backgroundColor: colors.lime},
  chartBarInactive: {backgroundColor: '#365344'},
  chartDay: {color: '#7C8A81', fontSize: 10, fontWeight: '700'},
  chartDayActive: {color: colors.white},
  metricRow: {flexDirection: 'row', marginTop: 12},
  metricCard: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flex: 1, minHeight: 130, padding: 17},
  metricCardGap: {marginRight: 10},
  metricLabel: {color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2},
  metricNumber: {color: colors.ink, fontSize: 25, fontWeight: '800', letterSpacing: -0.6, marginTop: 16},
  metricHint: {color: colors.muted, fontSize: 11, marginTop: 5},
  sectionHeading: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 11, marginTop: 27},
  sectionTitle: {color: colors.ink, fontSize: 20, fontWeight: '800', letterSpacing: -0.4},
  sectionMeta: {color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.2},
  card: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 21, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 16},
  appRow: {alignItems: 'center', flexDirection: 'row', paddingVertical: 14},
  rowBorder: {borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth},
  appIcon: {alignItems: 'center', borderRadius: 13, height: 43, justifyContent: 'center', width: 43},
  appIconText: {color: colors.ink, fontSize: 16, fontWeight: '900'},
  appInfo: {flex: 1, marginLeft: 13},
  appTitleRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  appName: {color: colors.ink, fontSize: 14, fontWeight: '700'},
  appTime: {color: colors.ink, fontSize: 13, fontWeight: '700'},
  progressTrack: {backgroundColor: '#E8E7E0', borderRadius: 3, height: 5, marginTop: 8, overflow: 'hidden'},
  progressFill: {borderRadius: 3, height: 5},
  textButton: {color: colors.green, fontSize: 13, fontWeight: '800'},
  friendRow: {alignItems: 'center', flexDirection: 'row', minHeight: 72},
  rank: {color: colors.muted, fontSize: 12, fontWeight: '800', textAlign: 'left', width: 25},
  avatar: {alignItems: 'center', justifyContent: 'center'},
  avatarText: {color: colors.ink, fontWeight: '900'},
  friendCopy: {flex: 1, marginLeft: 12},
  friendName: {color: colors.ink, fontSize: 14, fontWeight: '800'},
  username: {color: colors.muted, fontSize: 12, marginTop: 2},
  friendTime: {color: colors.ink, fontSize: 14, fontWeight: '800'},
  todayLabel: {color: colors.muted, fontSize: 10, marginTop: 2, textAlign: 'right'},
  timeStack: {alignItems: 'flex-end'},
  introText: {color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 17, marginTop: -8, maxWidth: 340},
  searchBox: {alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 17, borderWidth: 1, flexDirection: 'row', height: 58, paddingHorizontal: 16},
  searchAt: {color: colors.green, fontSize: 21, fontWeight: '800'},
  searchInput: {color: colors.ink, flex: 1, fontSize: 17, fontWeight: '600', height: 58, paddingHorizontal: 5},
  searchAction: {color: colors.green, fontSize: 13, fontWeight: '800', paddingLeft: 12, paddingVertical: 12},
  emptySearch: {color: colors.muted, fontSize: 13, paddingHorizontal: 8, paddingTop: 12},
  emptyFriends: {color: colors.muted, fontSize: 13, lineHeight: 19, paddingVertical: 20, textAlign: 'center'},
  searchResult: {alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 19, borderWidth: 1, flexDirection: 'row', marginTop: 12, padding: 14},
  addButton: {backgroundColor: colors.ink, borderRadius: 12, minWidth: 61, paddingHorizontal: 16, paddingVertical: 11},
  addButtonSent: {backgroundColor: colors.green},
  addButtonText: {color: colors.white, fontSize: 12, fontWeight: '800', textAlign: 'center'},
  inviteCard: {alignItems: 'center', backgroundColor: colors.lime, borderRadius: 21, flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, padding: 19},
  inviteTitle: {color: colors.ink, fontSize: 16, fontWeight: '800'},
  inviteText: {color: '#4E5C35', fontSize: 12, marginTop: 4},
  inviteArrow: {color: colors.ink, fontSize: 25, fontWeight: '700'},
  profileHero: {alignItems: 'center', paddingBottom: 26, paddingTop: 4},
  profileAvatar: {alignItems: 'center', backgroundColor: colors.lime, borderColor: colors.ink, borderRadius: 42, borderWidth: 2, height: 84, justifyContent: 'center', width: 84},
  profileInitials: {color: colors.ink, fontSize: 25, fontWeight: '900'},
  profileName: {color: colors.ink, fontSize: 21, fontWeight: '800', marginTop: 12},
  profileUsername: {color: colors.muted, fontSize: 13, marginTop: 3},
  settingsLabel: {color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginBottom: 9, marginTop: 21},
  settingRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 64, paddingVertical: 11},
  settingCopy: {flex: 1},
  settingTitle: {color: colors.ink, fontSize: 14, fontWeight: '700'},
  settingHint: {color: colors.muted, fontSize: 12, marginTop: 3},
  settingValue: {alignItems: 'center', flexDirection: 'row'},
  settingChevron: {color: colors.muted, fontSize: 22, marginLeft: 8},
  usernameEditor: {alignItems: 'center', flexDirection: 'row', marginTop: 4},
  editorAt: {color: colors.green, fontSize: 14, fontWeight: '800'},
  usernameInput: {borderBottomColor: colors.green, borderBottomWidth: 1, color: colors.ink, fontSize: 13, minWidth: 100, padding: 1},
  privacyNote: {color: colors.muted, fontSize: 12, lineHeight: 18, paddingHorizontal: 8, paddingTop: 14, textAlign: 'center'},
  logoutButton: {alignItems: 'center', borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginTop: 24, paddingVertical: 13},
  logoutText: {color: colors.danger, fontSize: 13, fontWeight: '800'},
  bottomNav: {backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, flexDirection: 'row', left: 0, paddingTop: 10, position: 'absolute', right: 0},
  navItem: {alignItems: 'center', flex: 1, minHeight: 48},
  navIcon: {color: '#9CA099', fontSize: 18, fontWeight: '800'},
  navLabel: {color: '#8A8F88', fontSize: 10, fontWeight: '700', marginTop: 3},
  navActive: {color: colors.green},
});

export default App;
