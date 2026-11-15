import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
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
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  createComparisonGroup,
  changeUsername,
  clearSession,
  acceptFriendRequest,
  findUser,
  getCircle,
  getComparisonGroups,
  getPendingFriendRequests,
  joinComparisonGroup,
  login,
  register,
  restoreSession,
  sendFriendRequest,
  syncDailyUsage,
} from './src/api';
import type {
  ApiUsage,
  ApiUser,
  CircleMember,
  ComparisonGroup,
  ComparisonGroupMember,
  FriendshipResponse,
} from './src/api';
import {
  getTodayUsage,
  getWeeklyUsage,
  openUsageAccessSettings,
} from './src/screenTime';
import type {
  AppUsage,
  Friend,
  UsageSummary,
  WeeklyUsageDay,
  WeeklyUsageSummary,
} from './src/types';

const colors = {
  ink: '#14201A',
  muted: '#68736C',
  canvas: '#F4F6F3',
  surface: '#FFFFFF',
  border: '#E1E6E1',
  lime: '#C7F36B',
  green: '#176B4D',
  lavender: '#E8E5FF',
  white: '#FFFFFF',
  danger: '#9B3A2F',
};

const fonts = {
  regular: Platform.OS === 'android' ? 'sans-serif' : 'System',
  medium: Platform.OS === 'android' ? 'sans-serif-medium' : 'System',
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

type Tab = 'compare' | 'today' | 'friends' | 'profile';

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours > 0 ? `${hours}h ${remaining}m` : `${remaining}m`;
}

function formatCompactDuration(minutes: number) {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours}h`;
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
  const [tab, setTab] = useState<Tab>('compare');
  const [usage, setUsage] = useState<UsageSummary>(demoUsage);
  const [isDemo, setIsDemo] = useState(true);
  const [friends, setFriends] = useState(initialFriends);
  const [circleMembers, setCircleMembers] = useState<CircleMember[]>([]);
  const [groups, setGroups] = useState<ComparisonGroup[]>([]);
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
    const [circle, pending, comparisonGroups] = await Promise.all([
      getCircle(),
      getPendingFriendRequests(),
      getComparisonGroups().catch(() => []),
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
    setCircleMembers(circle);
    setGroups(comparisonGroups);
    setPendingRequests(pending);
  }, [currentUser]);

  useEffect(() => {
    refreshSocial().catch(() => {
      // The authenticated shell remains usable while the API reconnects.
    });
  }, [refreshSocial]);

  const refreshAndroidUsage = useCallback(
    async (promptForPermission: boolean, showSyncError: boolean) => {
      const deviceUsage = await getTodayUsage();
      if (!deviceUsage.hasPermission) {
        if (!promptForPermission) {
          return;
        }
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

      const connectedUsage: UsageSummary = {
        totalMinutes: deviceUsage.totalMinutes,
        pickups: deviceUsage.pickups,
        changePercent: usage.changePercent,
        apps: deviceUsage.apps.slice(0, 12),
      };
      setUsage(connectedUsage);
      setIsDemo(false);
      if (connectedUsage.apps.length > 0) {
        try {
          await syncDailyUsage(connectedUsage);
          await refreshSocial();
        } catch {
          if (showSyncError) {
            Alert.alert(
              'Saved on this device only',
              'Screen time could not be synced to the server. Try again when the API is available.',
            );
          }
        }
      }
    },
    [refreshSocial, usage.changePercent],
  );

  const connectScreenTime = async () => {
    if (Platform.OS === 'android') {
      await refreshAndroidUsage(true, true);
      return;
    }

    Alert.alert(
      'iOS setup required',
      'Screen Time access will become available after the Family Controls entitlement and native Device Activity report are configured.',
    );
  };

  useEffect(() => {
    if (Platform.OS !== 'android' || !currentUser) {
      return;
    }

    const refreshSilently = () => {
      refreshAndroidUsage(false, false).catch(() => {
        // Keep the previous reading if Android usage data is temporarily unavailable.
      });
    };

    refreshSilently();
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        refreshSilently();
      }
    });
    return () => subscription.remove();
  }, [currentUser, refreshAndroidUsage]);

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
        {tab === 'compare' && (
          <CompareScreen
            circleMembers={circleMembers}
            currentUser={currentUser}
            friends={friends}
            groups={groups}
            onGroupsChange={refreshSocial}
            onManageFriends={() => setTab('friends')}
            pendingCount={pendingRequests.length}
            usage={usage}
          />
        )}
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
              setTab('compare');
              setGroups([]);
              setCircleMembers([]);
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

type ComparePerson = {
  id: string;
  name: string;
  username: string;
  initials: string;
  color: string;
  usage?: UsageSummary;
  isMe: boolean;
};

const personColors = ['#DCEBDD', '#E8E5FF', '#F7DFC8', '#DDEAF8', '#F3DCE8'];

function initialsFor(name: string) {
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function colorForIdentity(identity: string) {
  const hash = Array.from(identity).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return personColors[hash % personColors.length];
}

function usageFromApi(usage?: ApiUsage): UsageSummary | undefined {
  if (!usage) {
    return undefined;
  }
  const palette = ['#E8C4D7', '#F5C9A8', '#BDE3D0', '#BFD3F7', '#D4CFF7'];
  return {
    totalMinutes: usage.totalMinutes,
    pickups: usage.pickups,
    changePercent: 0,
    apps: usage.apps.map((app, index) => ({
      name: app.displayName,
      minutes: app.minutes,
      color: palette[index % palette.length],
    })),
  };
}

function CompareScreen({
  circleMembers,
  currentUser,
  friends,
  groups,
  onGroupsChange,
  onManageFriends,
  pendingCount,
  usage,
}: {
  circleMembers: CircleMember[];
  currentUser: ApiUser;
  friends: Friend[];
  groups: ComparisonGroup[];
  onGroupsChange: () => Promise<void>;
  onManageFriends: () => void;
  pendingCount: number;
  usage: UsageSummary;
}) {
  const [groupComposerMode, setGroupComposerMode] = useState<'create' | 'join' | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ComparisonGroup | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<ComparePerson | null>(null);

  const everyone = useMemo<ComparePerson[]>(() => {
    const people: ComparePerson[] = [{
      id: currentUser.id,
      name: 'You',
      username: currentUser.username,
      initials: initialsFor(currentUser.displayName),
      color: colors.lime,
      usage,
      isMe: true,
    }];
    circleMembers
      .filter(member => member.userId !== currentUser.id)
      .forEach(member => {
        people.push({
          id: member.userId,
          name: member.displayName,
          username: member.username,
          initials: initialsFor(member.displayName),
          color: colorForIdentity(member.userId),
          usage: usageFromApi(member.usage),
          isMe: false,
        });
      });
    return people.sort((first, second) => {
      const firstMinutes = first.usage?.totalMinutes ?? Number.MAX_SAFE_INTEGER;
      const secondMinutes = second.usage?.totalMinutes ?? Number.MAX_SAFE_INTEGER;
      return firstMinutes - secondMinutes;
    });
  }, [circleMembers, currentUser, usage]);

  const personFromGroupMember = (member: ComparisonGroupMember): ComparePerson => ({
    id: member.userId,
    name: member.userId === currentUser.id ? 'You' : member.displayName,
    username: member.username,
    initials: initialsFor(member.displayName),
    color: member.userId === currentUser.id ? colors.lime : colorForIdentity(member.userId),
    usage: member.userId === currentUser.id ? usage : usageFromApi(member.usage),
    isMe: member.userId === currentUser.id,
  });

  return (
    <>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <ScreenHeader eyebrow="YOUR CIRCLES" title="Compare" />

        <View style={styles.compareIntroCard}>
          <View style={styles.compareIntroCopy}>
            <Text style={styles.compareIntroEyebrow}>TODAY, TOGETHER</Text>
            <Text style={styles.compareIntroTitle}>Less scrolling. More living.</Text>
            {/* <Text style={styles.compareIntroText}>
              Compare privately with people you trust. Lowest screen time leads.
            </Text> */}
          </View>
          <View style={styles.compareIntroMark}>
            <Text style={styles.compareIntroMarkText}>{everyone.length}</Text>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Groups</Text>
          <Pressable onPress={() => setGroupComposerMode('create')}>
            <Text style={styles.textButton}>New group</Text>
          </Pressable>
        </View>

        {groups.length > 0 ? (
          <ScrollView
            contentContainerStyle={styles.groupCarousel}
            horizontal
            showsHorizontalScrollIndicator={false}>
            {groups.map(group => (
              <GroupCard
                currentUserId={currentUser.id}
                group={group}
                key={group.id}
                onPress={() => setSelectedGroup(group)}
                usage={usage}
              />
            ))}
          </ScrollView>
        ) : (
          <Pressable
            onPress={() => setGroupComposerMode('create')}
            style={styles.emptyGroupCard}>
            <View style={styles.emptyGroupIcon}>
              <Text style={styles.emptyGroupIconText}>+</Text>
            </View>
            <View style={styles.emptyGroupCopy}>
              <Text style={styles.emptyGroupTitle}>Create your first group</Text>
              {/* <Text style={styles.emptyGroupText}>
                Pick friends and start a private comparison.
              </Text> */}
            </View>
            <Text style={styles.settingChevron}>›</Text>
          </Pressable>
        )}

        <Pressable onPress={() => setGroupComposerMode('join')} style={styles.joinCodeButton}>
          <Text style={styles.joinCodeIcon}>⌁</Text>
          <Text style={styles.joinCodeText}>Join a group with an invite code</Text>
          <Text style={styles.settingChevron}>›</Text>
        </Pressable>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Everyone</Text>
            {/* <Text style={styles.compareSectionHint}>You and all accepted friends</Text> */}
          </View>
          <Pressable onPress={onManageFriends}>
            <Text style={styles.textButton}>
              {pendingCount > 0 ? `${pendingCount} request${pendingCount === 1 ? '' : 's'}` : 'Manage'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.compareTable}>
          {everyone.map((person, index) => (
            <ComparisonRow
              key={person.id}
              onPress={() => setSelectedPerson(person)}
              person={person}
              rank={index + 1}
              yourMinutes={usage.totalMinutes}
            />
          ))}
        </View>

        {friends.length === 0 && (
          <Pressable onPress={onManageFriends} style={styles.findFriendsCard}>
            <Text style={styles.findFriendsTitle}>Your comparison gets better with friends.</Text>
            <Text style={styles.findFriendsText}>Find someone by their unique username</Text>
          </Pressable>
        )}
      </ScrollView>

      <GroupComposerModal
        friends={friends}
        mode={groupComposerMode}
        onClose={() => setGroupComposerMode(null)}
        onComplete={async () => {
          await onGroupsChange();
          setGroupComposerMode(null);
        }}
        onManageFriends={() => {
          setGroupComposerMode(null);
          onManageFriends();
        }}
      />

      <GroupDetailModal
        currentUserId={currentUser.id}
        group={selectedGroup}
        onClose={() => setSelectedGroup(null)}
        onSelectMember={member => setSelectedPerson(personFromGroupMember(member))}
        usage={usage}
      />

      <PersonUsageModal person={selectedPerson} onClose={() => setSelectedPerson(null)} />
    </>
  );
}

function GroupCard({
  currentUserId,
  group,
  onPress,
  usage,
}: {
  currentUserId: string;
  group: ComparisonGroup;
  onPress: () => void;
  usage: UsageSummary;
}) {
  const rankedMembers = group.members.map(member => ({
    ...member,
    minutes: member.userId === currentUserId
      ? usage.totalMinutes
      : member.usage?.totalMinutes,
  })).sort((first, second) =>
    (first.minutes ?? Number.MAX_SAFE_INTEGER) - (second.minutes ?? Number.MAX_SAFE_INTEGER));
  const leader = rankedMembers.find(member => member.minutes !== undefined);

  return (
    <Pressable onPress={onPress} style={({pressed}) => [styles.groupCard, pressed && styles.cardPressed]}>
      <View style={styles.groupCardTop}>
        <View>
          <Text style={styles.groupName}>{group.name}</Text>
          <Text style={styles.groupMeta}>{group.members.length} MEMBERS</Text>
        </View>
        <Text style={styles.groupArrow}>↗</Text>
      </View>
      <View style={styles.groupAvatarRow}>
        {group.members.slice(0, 5).map((member, index) => (
          <View
            key={member.userId}
            style={[
              styles.groupAvatar,
              {backgroundColor: colorForIdentity(member.userId)},
              index > 0 && styles.groupAvatarOverlap,
            ]}>
            <Text style={styles.groupAvatarText}>{initialsFor(member.displayName)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.groupLeaderRow}>
        <Text style={styles.groupLeaderLabel}>LEADING TODAY</Text>
        <Text style={styles.groupLeaderValue}>
          {leader ? `${leader.userId === currentUserId ? 'You' : leader.displayName} · ${formatDuration(leader.minutes ?? 0)}` : 'Waiting for data'}
        </Text>
      </View>
    </Pressable>
  );
}

function ComparisonRow({
  onPress,
  person,
  rank,
  yourMinutes,
}: {
  onPress: () => void;
  person: ComparePerson;
  rank: number;
  yourMinutes: number;
}) {
  const minutes = person.usage?.totalMinutes;
  const difference = minutes === undefined ? 0 : minutes - yourMinutes;
  let comparison = 'Not synced today';
  if (person.isMe) {
    comparison = 'Your screen time';
  } else if (minutes !== undefined && difference === 0) {
    comparison = 'Same as you';
  } else if (minutes !== undefined) {
    comparison = `${formatDuration(Math.abs(difference))} ${difference < 0 ? 'less' : 'more'} than you`;
  }

  return (
    <Pressable onPress={onPress} style={styles.comparisonRow}>
      <View style={[styles.rankBadge, rank === 1 && styles.rankBadgeFirst]}>
        <Text style={[styles.rankBadgeText, rank === 1 && styles.rankBadgeTextFirst]}>{rank}</Text>
      </View>
      <View style={[styles.comparisonAvatar, {backgroundColor: person.color}]}>
        <Text style={styles.comparisonAvatarText}>{person.initials}</Text>
      </View>
      <View style={styles.comparisonCopy}>
        <Text style={styles.comparisonName}>{person.name}</Text>
        <Text style={styles.comparisonHint}>{comparison}</Text>
      </View>
      <View style={styles.comparisonTimeStack}>
        <Text style={styles.comparisonTime}>
          {minutes === undefined ? '—' : formatDuration(minutes)}
        </Text>
        <Text style={styles.comparisonChevron}>›</Text>
      </View>
    </Pressable>
  );
}

function GroupComposerModal({
  friends,
  mode,
  onClose,
  onComplete,
  onManageFriends,
}: {
  friends: Friend[];
  mode: 'create' | 'join' | null;
  onClose: () => void;
  onComplete: () => Promise<void>;
  onManageFriends: () => void;
}) {
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode) {
      setName('');
      setInviteCode('');
      setSelectedIds([]);
      setError('');
    }
  }, [mode]);

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      if (mode === 'create') {
        if (name.trim().length < 2 || selectedIds.length === 0) {
          setError('Add a group name and select at least one friend.');
          return;
        }
        await createComparisonGroup(name.trim(), selectedIds);
      } else if (mode === 'join') {
        if (inviteCode.trim().length < 6) {
          setError('Enter the invite code shared by a group member.');
          return;
        }
        await joinComparisonGroup(inviteCode.trim().toUpperCase());
      }
      await onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={mode !== null}>
      <SafeAreaView style={styles.composerPage}>
        <View style={styles.composerHeader}>
          <Pressable onPress={onClose}><Text style={styles.composerCancel}>Cancel</Text></Pressable>
          <Text style={styles.composerTitle}>{mode === 'join' ? 'Join a group' : 'New group'}</Text>
          <View style={styles.composerHeaderSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.composerContent} keyboardShouldPersistTaps="handled">
          {mode === 'create' ? (
            <>
              <Text style={styles.composerLabel}>GROUP NAME</Text>
              <TextInput
                maxLength={60}
                onChangeText={setName}
                placeholder="Weekend reset"
                placeholderTextColor="#9AA39D"
                style={styles.composerInput}
                value={name}
              />
              <Text style={styles.composerLabel}>ADD FRIENDS</Text>
              {friends.length === 0 ? (
                <Pressable onPress={onManageFriends} style={styles.composerEmpty}>
                  <Text style={styles.composerEmptyTitle}>Add a friend first</Text>
                  <Text style={styles.composerEmptyText}>Find someone by username to create a group.</Text>
                </Pressable>
              ) : (
                <View style={styles.composerFriendList}>
                  {friends.map(friend => {
                    const selected = selectedIds.includes(friend.id);
                    return (
                      <Pressable
                        key={friend.id}
                        onPress={() => setSelectedIds(current => selected
                          ? current.filter(id => id !== friend.id)
                          : [...current, friend.id])}
                        style={styles.composerFriendRow}>
                        <Avatar friend={friend} size={42} />
                        <View style={styles.friendCopy}>
                          <Text style={styles.friendName}>{friend.name}</Text>
                          <Text style={styles.username}>@{friend.username}</Text>
                        </View>
                        <View style={[styles.selectionCircle, selected && styles.selectionCircleActive]}>
                          {selected && <Text style={styles.selectionCheck}>✓</Text>}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <Text style={styles.composerPrivacyNote}>
                Only accepted friends can be added directly. Others can join with the private code created for this group.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.composerIntroTitle}>Enter your private invite code</Text>
              <Text style={styles.composerIntroText}>
                Joining makes you friends with every member so the whole group can compare.
              </Text>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={10}
                onChangeText={value => setInviteCode(value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                placeholder="ABCD2345"
                placeholderTextColor="#A3AAA5"
                style={styles.inviteCodeInput}
                value={inviteCode}
              />
            </>
          )}
          {error.length > 0 && <Text style={styles.composerError}>{error}</Text>}
          <Pressable
            disabled={loading}
            onPress={submit}
            style={[styles.composerSubmit, loading && styles.authButtonDisabled]}>
            <Text style={styles.composerSubmitText}>
              {loading ? 'Please wait…' : mode === 'join' ? 'Join group' : 'Create group'}
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function GroupDetailModal({
  currentUserId,
  group,
  onClose,
  onSelectMember,
  usage,
}: {
  currentUserId: string;
  group: ComparisonGroup | null;
  onClose: () => void;
  onSelectMember: (member: ComparisonGroupMember) => void;
  usage: UsageSummary;
}) {
  if (!group) {
    return null;
  }
  const rankedMembers = group.members.map(member => ({
    member,
    minutes: member.userId === currentUserId ? usage.totalMinutes : member.usage?.totalMinutes,
  })).sort((first, second) =>
    (first.minutes ?? Number.MAX_SAFE_INTEGER) - (second.minutes ?? Number.MAX_SAFE_INTEGER));

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible>
      <SafeAreaView style={styles.weeklyPage}>
        <View style={styles.reportHeader}>
          <Pressable accessibilityLabel="Close group" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>‹</Text>
          </Pressable>
          <View style={styles.reportHeaderCopy}>
            <Text style={styles.reportEyebrow}>GROUP</Text>
            <Text style={styles.reportTitle}>{group.name}</Text>
          </View>
          <View style={styles.closeButtonPlaceholder} />
        </View>
        <ScrollView contentContainerStyle={styles.reportContent} showsVerticalScrollIndicator={false}>
          <View style={styles.inviteCodeCard}>
            <View>
              <Text style={styles.inviteCodeLabel}>PRIVATE INVITE CODE</Text>
              <Text style={styles.inviteCodeValue}>{group.inviteCode}</Text>
            </View>
            <Text style={styles.inviteCodeHint}>Share only with people you trust</Text>
          </View>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Today’s ranking</Text>
            <Text style={styles.sectionMeta}>{group.members.length} MEMBERS</Text>
          </View>
          <View style={styles.compareTable}>
            {rankedMembers.map(({member}, index) => (
              <ComparisonRow
                key={member.userId}
                onPress={() => onSelectMember(member)}
                person={{
                  id: member.userId,
                  name: member.userId === currentUserId ? 'You' : member.displayName,
                  username: member.username,
                  initials: initialsFor(member.displayName),
                  color: member.userId === currentUserId ? colors.lime : colorForIdentity(member.userId),
                  usage: member.userId === currentUserId ? usage : usageFromApi(member.usage),
                  isMe: member.userId === currentUserId,
                }}
                rank={index + 1}
                yourMinutes={usage.totalMinutes}
              />
            ))}
          </View>
          {rankedMembers.every(item => item.minutes === undefined) && (
            <Text style={styles.groupWaitingText}>Waiting for today’s first sync.</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PersonUsageModal({person, onClose}: {person: ComparePerson | null; onClose: () => void}) {
  if (!person) {
    return null;
  }
  const maxAppMinutes = Math.max(...(person.usage?.apps.map(app => app.minutes) ?? [1]), 1);
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible>
      <SafeAreaView style={styles.weeklyPage}>
        <View style={styles.reportHeader}>
          <Pressable accessibilityLabel="Close details" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>‹</Text>
          </Pressable>
          <View style={styles.reportHeaderCopy}>
            <Text style={styles.reportEyebrow}>TODAY</Text>
            <Text style={styles.reportTitle}>{person.isMe ? 'Your details' : `${person.name}’s details`}</Text>
          </View>
          <View style={styles.closeButtonPlaceholder} />
        </View>
        <ScrollView contentContainerStyle={styles.reportContent} showsVerticalScrollIndicator={false}>
          <View style={styles.personHero}>
            <View style={[styles.personHeroAvatar, {backgroundColor: person.color}]}>
              <Text style={styles.personHeroInitials}>{person.initials}</Text>
            </View>
            <Text style={styles.personHeroName}>{person.name}</Text>
            <Text style={styles.personHeroUsername}>@{person.username}</Text>
            <Text style={styles.personHeroTime}>
              {person.usage ? formatDuration(person.usage.totalMinutes) : 'No data'}
            </Text>
            <Text style={styles.personHeroLabel}>SCREEN TIME TODAY</Text>
          </View>
          {person.usage ? (
            <>
              <View style={styles.personMetrics}>
                <View style={styles.personMetric}>
                  <Text style={styles.personMetricValue}>{person.usage.pickups}</Text>
                  <Text style={styles.personMetricLabel}>UNLOCKS</Text>
                </View>
                <View style={styles.personMetricDivider} />
                <View style={styles.personMetric}>
                  <Text style={styles.personMetricValue}>{person.usage.apps.length}</Text>
                  <Text style={styles.personMetricLabel}>APPS USED</Text>
                </View>
              </View>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>App activity</Text>
                <Text style={styles.sectionMeta}>TODAY</Text>
              </View>
              <View style={styles.card}>
                {person.usage.apps.map((app, index) => (
                  <View key={`${app.name}-${index}`} style={[styles.appRow, index < person.usage!.apps.length - 1 && styles.rowBorder]}>
                    <View style={[styles.appIcon, {backgroundColor: app.color}]}>
                      <Text style={styles.appIconText}>{app.name.charAt(0)}</Text>
                    </View>
                    <View style={styles.appInfo}>
                      <View style={styles.appTitleRow}>
                        <Text style={styles.appName}>{app.name}</Text>
                        <Text style={styles.appTime}>{formatDuration(app.minutes)}</Text>
                      </View>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, {backgroundColor: app.color, width: `${Math.round((app.minutes / maxAppMinutes) * 100)}%`}]} />
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <View style={styles.noUsageCard}>
              <Text style={styles.noUsageTitle}>Nothing synced today</Text>
              <Text style={styles.noUsageText}>Their details will appear after they open Screen Time Social.</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
  const [weeklyVisible, setWeeklyVisible] = useState(false);
  const [weeklyUsage, setWeeklyUsage] = useState<WeeklyUsageSummary | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState('');
  const maxAppMinutes = Math.max(...usage.apps.map(app => app.minutes), 1);
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return 'Good morning';
    }
    if (hour < 17) {
      return 'Good afternoon';
    }
    return 'Good evening';
  }, []);
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

  const openWeeklyReport = async () => {
    setWeeklyVisible(true);
    setWeeklyError('');
    if (isDemo) {
      setWeeklyUsage(createDemoWeek());
      return;
    }

    setWeeklyLoading(true);
    try {
      const report = await getWeeklyUsage();
      if (!report.hasPermission) {
        setWeeklyError('Usage Access is required to build your weekly report.');
      } else {
        setWeeklyUsage(report);
      }
    } catch {
      setWeeklyError('Your weekly report could not be loaded. Please try again.');
    } finally {
      setWeeklyLoading(false);
    }
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <ScreenHeader eyebrow="DIGITAL WELLBEING" title={greeting} />

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

        <Pressable
          accessibilityHint="Opens your weekly screen time report"
          accessibilityRole="button"
          onPress={openWeeklyReport}
          style={({pressed}) => [styles.heroCard, pressed && styles.cardPressed]}>
          <View style={styles.heroTopRow}>
            <Text style={styles.cardLabel}>SCREEN TIME · TODAY</Text>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>{isDemo ? 'DEMO' : 'LIVE'}</Text>
            </View>
          </View>
          <Text style={styles.heroNumber}>{formatDuration(usage.totalMinutes)}</Text>
          <Text style={styles.heroSupporting}>
            Foreground use, excluding your home screen
          </Text>
          <View style={styles.heroActionRow}>
            <Text style={styles.heroAction}>View weekly report</Text>
            <Text style={styles.heroArrow}>↗</Text>
          </View>
        </Pressable>

        <View style={styles.metricRow}>
          <View style={[styles.metricCard, styles.metricCardGap]}>
            <View style={styles.metricIconBadge}>
              <Text style={styles.metricIcon}>↗</Text>
            </View>
            <Text style={styles.metricLabel}>
              {Platform.OS === 'android' ? 'UNLOCKS' : 'PICKUPS'}
            </Text>
            <Text style={styles.metricNumber}>{usage.pickups}</Text>
            <Text style={styles.metricHint}>
              {isDemo ? 'First at 7:42 AM' : 'Phone openings today'}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <View style={[styles.metricIconBadge, styles.metricIconBadgeLavender]}>
              <Text style={styles.metricIcon}>●</Text>
            </View>
            <Text style={styles.metricLabel}>TOP APP</Text>
            <Text numberOfLines={1} style={styles.metricNumberSmall}>
              {usage.apps[0]?.name ?? '—'}
            </Text>
            <Text style={styles.metricHint}>
              {usage.apps[0] ? formatDuration(usage.apps[0].minutes) : 'No usage yet'}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Usage by app</Text>
          <Text style={styles.sectionMeta}>TODAY</Text>
        </View>
        <View style={styles.card}>
          {usage.apps.length === 0 && (
            <Text style={styles.emptyFriends}>No app usage recorded yet today.</Text>
          )}
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
                      {
                        width: `${Math.round((app.minutes / maxAppMinutes) * 100)}%`,
                        backgroundColor: app.color,
                      },
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

      <WeeklyReportModal
        error={weeklyError}
        loading={weeklyLoading}
        onClose={() => setWeeklyVisible(false)}
        onRetry={() => {
          setWeeklyUsage(null);
          openWeeklyReport();
        }}
        report={weeklyUsage}
        visible={weeklyVisible}
      />
    </>
  );
}

function WeeklyReportModal({
  error,
  loading,
  onClose,
  onRetry,
  report,
  visible,
}: {
  error: string;
  loading: boolean;
  onClose: () => void;
  onRetry: () => void;
  report: WeeklyUsageSummary | null;
  visible: boolean;
}) {
  const maxAppMinutes = Math.max(...(report?.apps.map(app => app.minutes) ?? [1]), 1);
  const busiestDay = report?.days.reduce<WeeklyUsageDay | null>(
    (busiest, day) => !busiest || day.totalMinutes > busiest.totalMinutes ? day : busiest,
    null,
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}>
      <SafeAreaView style={styles.weeklyPage}>
        <View style={styles.reportHeader}>
          <Pressable accessibilityLabel="Close weekly report" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>‹</Text>
          </Pressable>
          <View style={styles.reportHeaderCopy}>
            <Text style={styles.reportEyebrow}>THIS WEEK</Text>
            <Text style={styles.reportTitle}>Weekly report</Text>
          </View>
          <View style={styles.closeButtonPlaceholder} />
        </View>

        {loading && (
          <View style={styles.reportState}>
            <ActivityIndicator color={colors.green} size="small" />
            <Text style={styles.reportStateText}>Building your report…</Text>
          </View>
        )}

        {!loading && error.length > 0 && (
          <View style={styles.reportState}>
            <Text style={styles.reportErrorTitle}>Report unavailable</Text>
            <Text style={styles.reportStateText}>{error}</Text>
            <Pressable onPress={onRetry} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {!loading && report && (
          <ScrollView
            contentContainerStyle={styles.reportContent}
            showsVerticalScrollIndicator={false}>
            <View style={styles.weeklySummaryCard}>
              <Text style={styles.weeklySummaryLabel}>DAILY AVERAGE</Text>
              <Text style={styles.weeklySummaryNumber}>
                {formatDuration(report.averageMinutes)}
              </Text>
              <Text style={styles.weeklySummaryHint}>
                {formatDuration(report.totalMinutes)} total this week
              </Text>
            </View>

            <View style={styles.chartCard}>
              <View style={styles.chartCardHeader}>
                <Text style={styles.chartCardTitle}>Screen time</Text>
                <Text style={styles.chartCardMeta}>MON–SUN</Text>
              </View>
              <WeeklyBarChart days={report.days} />
            </View>

            <View style={styles.weeklyMetricRow}>
              <View style={[styles.weeklyMetricCard, styles.metricCardGap]}>
                <Text style={styles.weeklyMetricLabel}>WEEK TOTAL</Text>
                <Text style={styles.weeklyMetricValue}>{formatDuration(report.totalMinutes)}</Text>
              </View>
              <View style={styles.weeklyMetricCard}>
                <Text style={styles.weeklyMetricLabel}>UNLOCKS</Text>
                <Text style={styles.weeklyMetricValue}>{report.pickups}</Text>
              </View>
            </View>

            {busiestDay && busiestDay.totalMinutes > 0 && (
              <View style={styles.insightCard}>
                <Text style={styles.insightEyebrow}>WEEKLY INSIGHT</Text>
                <Text style={styles.insightTitle}>
                  {busiestDay.label} was your busiest day.
                </Text>
                <Text style={styles.insightText}>
                  You recorded {formatDuration(busiestDay.totalMinutes)} of foreground screen time.
                </Text>
              </View>
            )}

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Most used this week</Text>
              <Text style={styles.sectionMeta}>TOP {report.apps.length}</Text>
            </View>
            <View style={styles.card}>
              {report.apps.map((app, index) => (
                <View
                  key={app.name}
                  style={[styles.appRow, index < report.apps.length - 1 && styles.rowBorder]}>
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
                          {
                            backgroundColor: app.color,
                            width: `${Math.round((app.minutes / maxAppMinutes) * 100)}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function WeeklyBarChart({days}: {days: WeeklyUsageDay[]}) {
  const maxMinutes = Math.max(...days.map(day => day.totalMinutes), 1);
  return (
    <View style={styles.weeklyChart}>
      {days.map(day => {
        const height = day.totalMinutes === 0
          ? 4
          : Math.max(12, Math.round((day.totalMinutes / maxMinutes) * 128));
        return (
          <View key={day.date} style={styles.weeklyBarSlot}>
            <Text style={[styles.weeklyBarValue, day.isToday && styles.weeklyBarValueActive]}>
              {day.totalMinutes > 0 ? formatCompactDuration(day.totalMinutes) : '—'}
            </Text>
            <View style={styles.weeklyBarTrack}>
              <View
                style={[
                  styles.weeklyBar,
                  day.isToday ? styles.weeklyBarActive : styles.weeklyBarInactive,
                  {height},
                ]}
              />
            </View>
            <Text style={[styles.weeklyDay, day.isToday && styles.weeklyDayActive]}>
              {day.label.slice(0, 1)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function createDemoWeek(): WeeklyUsageSummary {
  const values = [182, 247, 211, 276, 198, 324, 252];
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return {
    hasPermission: true,
    totalMinutes: values.reduce((sum, value) => sum + value, 0),
    averageMinutes: Math.round(values.reduce((sum, value) => sum + value, 0) / 7),
    pickups: 421,
    days: labels.map((label, index) => ({
      date: `demo-${index}`,
      label,
      totalMinutes: values[index],
      pickups: 50 + index,
      isToday: index === 6,
    })),
    apps: demoApps,
  };
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
    {id: 'compare', label: 'Compare', icon: '◉'},
    {id: 'today', label: 'Today', icon: '◷'},
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
  sessionLoadingText: {color: colors.muted, fontFamily: fonts.medium, fontSize: 13, marginTop: 16},
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
  scrollContent: {paddingHorizontal: 20, paddingBottom: 124},
  header: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 24, paddingTop: 20},
  eyebrow: {color: colors.green, fontFamily: fonts.medium, fontSize: 10, letterSpacing: 1.6, marginBottom: 4},
  title: {color: colors.ink, fontFamily: fonts.medium, fontSize: 30, fontWeight: '700', letterSpacing: -1.1},
  brandMark: {backgroundColor: colors.ink, borderRadius: 15, height: 44, position: 'relative', width: 44},
  brandDot: {backgroundColor: colors.lime, borderRadius: 7, height: 14, left: 10, position: 'absolute', top: 9, width: 14},
  brandDotOffset: {left: 20, top: 21},
  permissionCard: {alignItems: 'center', backgroundColor: colors.lavender, borderRadius: 18, flexDirection: 'row', marginBottom: 16, padding: 15},
  permissionIcon: {alignItems: 'center', backgroundColor: colors.ink, borderRadius: 13, height: 38, justifyContent: 'center', width: 38},
  permissionIconText: {color: colors.white, fontSize: 19, fontWeight: '700'},
  permissionCopy: {flex: 1, marginHorizontal: 12},
  permissionTitle: {color: colors.ink, fontSize: 14, fontWeight: '800'},
  permissionText: {color: '#57556B', fontSize: 12, marginTop: 2},
  chevron: {color: colors.ink, fontSize: 28, fontWeight: '400'},
  heroCard: {backgroundColor: '#10271D', borderRadius: 24, padding: 22},
  cardPressed: {opacity: 0.94, transform: [{scale: 0.995}]},
  heroTopRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  cardLabel: {color: '#AAB9B0', fontFamily: fonts.medium, fontSize: 10, letterSpacing: 1.35},
  livePill: {alignItems: 'center', backgroundColor: '#203C30', borderRadius: 12, flexDirection: 'row', paddingHorizontal: 9, paddingVertical: 5},
  liveDot: {backgroundColor: colors.lime, borderRadius: 3, height: 6, marginRight: 5, width: 6},
  liveText: {color: colors.lime, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1},
  heroNumber: {color: colors.white, fontFamily: fonts.medium, fontSize: 52, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: -2.2, marginTop: 18},
  heroSupporting: {color: '#AAB9B0', fontFamily: fonts.regular, fontSize: 12, marginTop: 3},
  heroActionRow: {alignItems: 'center', borderTopColor: '#294236', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, paddingTop: 16},
  heroAction: {color: colors.white, fontFamily: fonts.medium, fontSize: 13},
  heroArrow: {color: colors.lime, fontFamily: fonts.medium, fontSize: 18},
  weekChart: {alignItems: 'flex-end', flexDirection: 'row', height: 124, justifyContent: 'space-between', marginTop: 15},
  chartColumn: {alignItems: 'center', height: 114, justifyContent: 'flex-end', width: 28},
  chartBar: {borderRadius: 6, marginBottom: 7, width: 17},
  chartBarActive: {backgroundColor: colors.lime},
  chartBarInactive: {backgroundColor: '#365344'},
  chartDay: {color: '#7C8A81', fontSize: 10, fontWeight: '700'},
  chartDayActive: {color: colors.white},
  metricRow: {flexDirection: 'row', marginTop: 12},
  metricCard: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flex: 1, minHeight: 156, padding: 16},
  metricCardGap: {marginRight: 10},
  metricIconBadge: {alignItems: 'center', backgroundColor: '#E6F4EA', borderRadius: 10, height: 30, justifyContent: 'center', marginBottom: 15, width: 30},
  metricIconBadgeLavender: {backgroundColor: colors.lavender},
  metricIcon: {color: colors.green, fontFamily: fonts.medium, fontSize: 13},
  metricLabel: {color: colors.muted, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1.25},
  metricNumber: {color: colors.ink, fontFamily: fonts.medium, fontSize: 28, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: -0.7, marginTop: 5},
  metricNumberSmall: {color: colors.ink, fontFamily: fonts.medium, fontSize: 20, fontWeight: '700', letterSpacing: -0.5, marginTop: 8},
  metricHint: {color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 4},
  sectionHeading: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 11, marginTop: 29},
  sectionTitle: {color: colors.ink, fontFamily: fonts.medium, fontSize: 20, fontWeight: '700', letterSpacing: -0.45},
  sectionMeta: {color: colors.muted, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1.3},
  card: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 16},
  appRow: {alignItems: 'center', flexDirection: 'row', paddingVertical: 14},
  rowBorder: {borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth},
  appIcon: {alignItems: 'center', borderRadius: 12, height: 42, justifyContent: 'center', width: 42},
  appIconText: {color: colors.ink, fontFamily: fonts.medium, fontSize: 15, fontWeight: '700'},
  appInfo: {flex: 1, marginLeft: 13},
  appTitleRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  appName: {color: colors.ink, fontFamily: fonts.medium, fontSize: 14},
  appTime: {color: colors.ink, fontFamily: fonts.medium, fontSize: 13, fontVariant: ['tabular-nums']},
  progressTrack: {backgroundColor: '#E8E7E0', borderRadius: 3, height: 5, marginTop: 8, overflow: 'hidden'},
  progressFill: {borderRadius: 3, height: 5},
  textButton: {color: colors.green, fontFamily: fonts.medium, fontSize: 13},
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
  compareIntroCard: {alignItems: 'center', backgroundColor: '#10271D', borderRadius: 22, flexDirection: 'row', padding: 20},
  compareIntroCopy: {flex: 1, paddingRight: 14},
  compareIntroEyebrow: {color: colors.lime, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1.3},
  compareIntroTitle: {color: colors.white, fontFamily: fonts.medium, fontSize: 21, fontWeight: '700', letterSpacing: -0.6, marginTop: 8},
  compareIntroText: {color: '#AAB9B0', fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, marginTop: 5},
  compareIntroMark: {alignItems: 'center', backgroundColor: colors.lime, borderRadius: 27, height: 54, justifyContent: 'center', width: 54},
  compareIntroMarkText: {color: colors.ink, fontFamily: fonts.medium, fontSize: 20, fontVariant: ['tabular-nums'], fontWeight: '700'},
  groupCarousel: {paddingRight: 20},
  emptyGroupCard: {alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, flexDirection: 'row', padding: 16},
  emptyGroupIcon: {alignItems: 'center', backgroundColor: '#E8F4EA', borderRadius: 13, height: 44, justifyContent: 'center', width: 44},
  emptyGroupIconText: {color: colors.green, fontFamily: fonts.regular, fontSize: 25},
  emptyGroupCopy: {flex: 1, marginLeft: 13},
  emptyGroupTitle: {color: colors.ink, fontFamily: fonts.medium, fontSize: 14, fontWeight: '700'},
  emptyGroupText: {color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, marginTop: 3},
  joinCodeButton: {alignItems: 'center', flexDirection: 'row', marginTop: 9, paddingHorizontal: 5, paddingVertical: 11},
  joinCodeIcon: {color: colors.green, fontFamily: fonts.medium, fontSize: 18, width: 28},
  joinCodeText: {color: colors.green, flex: 1, fontFamily: fonts.medium, fontSize: 12},
  compareSectionHint: {color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 2},
  compareTable: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 15},
  findFriendsCard: {backgroundColor: '#E9F3EC', borderRadius: 17, marginTop: 12, padding: 17},
  findFriendsTitle: {color: colors.ink, fontFamily: fonts.medium, fontSize: 14, fontWeight: '700'},
  findFriendsText: {color: colors.green, fontFamily: fonts.regular, fontSize: 11, marginTop: 4},
  groupCard: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, marginRight: 11, padding: 18, width: 292},
  groupCardTop: {alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between'},
  groupName: {color: colors.ink, fontFamily: fonts.medium, fontSize: 18, fontWeight: '700', letterSpacing: -0.4},
  groupMeta: {color: colors.muted, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1.2, marginTop: 4},
  groupArrow: {color: colors.green, fontFamily: fonts.medium, fontSize: 18},
  groupAvatarRow: {alignItems: 'center', flexDirection: 'row', marginTop: 20},
  groupAvatar: {alignItems: 'center', borderColor: colors.surface, borderRadius: 19, borderWidth: 2, height: 38, justifyContent: 'center', width: 38},
  groupAvatarOverlap: {marginLeft: -9},
  groupAvatarText: {color: colors.ink, fontFamily: fonts.medium, fontSize: 10},
  groupLeaderRow: {borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 17, paddingTop: 13},
  groupLeaderLabel: {color: colors.muted, fontFamily: fonts.medium, fontSize: 8, letterSpacing: 1.2},
  groupLeaderValue: {color: colors.ink, fontFamily: fonts.medium, fontSize: 12, marginTop: 4},
  comparisonRow: {alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 78, paddingVertical: 12},
  rankBadge: {alignItems: 'center', backgroundColor: '#EEF1EE', borderRadius: 10, height: 27, justifyContent: 'center', marginRight: 10, width: 27},
  rankBadgeFirst: {backgroundColor: colors.lime},
  rankBadgeText: {color: colors.muted, fontFamily: fonts.medium, fontSize: 11},
  rankBadgeTextFirst: {color: colors.ink},
  comparisonAvatar: {alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44},
  comparisonAvatarText: {color: colors.ink, fontFamily: fonts.medium, fontSize: 14},
  comparisonCopy: {flex: 1, marginLeft: 11},
  comparisonName: {color: colors.ink, fontFamily: fonts.medium, fontSize: 14, fontWeight: '700'},
  comparisonHint: {color: colors.muted, fontFamily: fonts.regular, fontSize: 10, marginTop: 3},
  comparisonTimeStack: {alignItems: 'center', flexDirection: 'row', marginLeft: 8},
  comparisonTime: {color: colors.ink, fontFamily: fonts.medium, fontSize: 13, fontVariant: ['tabular-nums']},
  comparisonChevron: {color: '#A4ADA7', fontFamily: fonts.regular, fontSize: 20, marginLeft: 8},
  composerPage: {backgroundColor: colors.canvas, flex: 1},
  composerHeader: {alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 60, paddingHorizontal: 20},
  composerCancel: {color: colors.green, fontFamily: fonts.medium, fontSize: 13, minWidth: 60},
  composerTitle: {color: colors.ink, flex: 1, fontFamily: fonts.medium, fontSize: 16, fontWeight: '700', textAlign: 'center'},
  composerHeaderSpacer: {width: 60},
  composerContent: {paddingBottom: 40, paddingHorizontal: 20, paddingTop: 24},
  composerLabel: {color: colors.muted, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1.3, marginBottom: 9, marginTop: 18},
  composerInput: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 15, borderWidth: 1, color: colors.ink, fontFamily: fonts.medium, fontSize: 16, height: 54, paddingHorizontal: 15},
  composerFriendList: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 17, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 15},
  composerFriendRow: {alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 68},
  selectionCircle: {alignItems: 'center', borderColor: '#B8C0BB', borderRadius: 11, borderWidth: 1.5, height: 22, justifyContent: 'center', width: 22},
  selectionCircleActive: {backgroundColor: colors.green, borderColor: colors.green},
  selectionCheck: {color: colors.white, fontFamily: fonts.medium, fontSize: 12},
  composerPrivacyNote: {color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 17, marginTop: 13},
  composerEmpty: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1, padding: 18},
  composerEmptyTitle: {color: colors.ink, fontFamily: fonts.medium, fontSize: 14, fontWeight: '700'},
  composerEmptyText: {color: colors.green, fontFamily: fonts.regular, fontSize: 11, marginTop: 4},
  composerIntroTitle: {color: colors.ink, fontFamily: fonts.medium, fontSize: 22, fontWeight: '700', letterSpacing: -0.5, marginTop: 10, textAlign: 'center'},
  composerIntroText: {alignSelf: 'center', color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 19, marginTop: 8, maxWidth: 300, textAlign: 'center'},
  inviteCodeInput: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 17, borderWidth: 1, color: colors.ink, fontFamily: fonts.medium, fontSize: 25, fontWeight: '700', height: 68, letterSpacing: 4, marginTop: 25, paddingHorizontal: 18, textAlign: 'center'},
  composerError: {color: colors.danger, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: 'center'},
  composerSubmit: {alignItems: 'center', backgroundColor: colors.ink, borderRadius: 15, marginTop: 22, paddingVertical: 16},
  composerSubmitText: {color: colors.white, fontFamily: fonts.medium, fontSize: 14},
  inviteCodeCard: {backgroundColor: '#10271D', borderRadius: 20, padding: 20},
  inviteCodeLabel: {color: '#AAB9B0', fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1.3},
  inviteCodeValue: {color: colors.lime, fontFamily: fonts.medium, fontSize: 27, fontWeight: '700', letterSpacing: 4, marginTop: 8},
  inviteCodeHint: {color: '#AAB9B0', fontFamily: fonts.regular, fontSize: 10, marginTop: 16},
  groupWaitingText: {color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 12, textAlign: 'center'},
  personHero: {alignItems: 'center', backgroundColor: '#10271D', borderRadius: 22, padding: 24},
  personHeroAvatar: {alignItems: 'center', borderRadius: 31, height: 62, justifyContent: 'center', width: 62},
  personHeroInitials: {color: colors.ink, fontFamily: fonts.medium, fontSize: 18, fontWeight: '700'},
  personHeroName: {color: colors.white, fontFamily: fonts.medium, fontSize: 19, fontWeight: '700', marginTop: 12},
  personHeroUsername: {color: '#AAB9B0', fontFamily: fonts.regular, fontSize: 11, marginTop: 2},
  personHeroTime: {color: colors.white, fontFamily: fonts.medium, fontSize: 38, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: -1.4, marginTop: 20},
  personHeroLabel: {color: colors.lime, fontFamily: fonts.medium, fontSize: 8, letterSpacing: 1.25, marginTop: 4},
  personMetrics: {alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 17, borderWidth: 1, flexDirection: 'row', marginTop: 12, paddingVertical: 16},
  personMetric: {alignItems: 'center', flex: 1},
  personMetricDivider: {backgroundColor: colors.border, height: 35, width: StyleSheet.hairlineWidth},
  personMetricValue: {color: colors.ink, fontFamily: fonts.medium, fontSize: 20, fontVariant: ['tabular-nums'], fontWeight: '700'},
  personMetricLabel: {color: colors.muted, fontFamily: fonts.medium, fontSize: 8, letterSpacing: 1.1, marginTop: 4},
  noUsageCard: {alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 24},
  noUsageTitle: {color: colors.ink, fontFamily: fonts.medium, fontSize: 15, fontWeight: '700'},
  noUsageText: {color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 17, marginTop: 5, textAlign: 'center'},
  weeklyPage: {backgroundColor: colors.canvas, flex: 1},
  reportHeader: {alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 72, paddingHorizontal: 20},
  closeButton: {alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 18, borderWidth: 1, height: 38, justifyContent: 'center', width: 38},
  closeButtonText: {color: colors.ink, fontFamily: fonts.regular, fontSize: 32, lineHeight: 33, marginTop: -2},
  closeButtonPlaceholder: {height: 38, width: 38},
  reportHeaderCopy: {alignItems: 'center', flex: 1},
  reportEyebrow: {color: colors.green, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1.4},
  reportTitle: {color: colors.ink, fontFamily: fonts.medium, fontSize: 17, fontWeight: '700', letterSpacing: -0.25, marginTop: 2},
  reportContent: {paddingBottom: 48, paddingHorizontal: 20, paddingTop: 18},
  reportState: {alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 40},
  reportStateText: {color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, marginTop: 12, textAlign: 'center'},
  reportErrorTitle: {color: colors.ink, fontFamily: fonts.medium, fontSize: 18, fontWeight: '700'},
  retryButton: {backgroundColor: colors.ink, borderRadius: 12, marginTop: 18, paddingHorizontal: 18, paddingVertical: 11},
  retryButtonText: {color: colors.white, fontFamily: fonts.medium, fontSize: 13},
  weeklySummaryCard: {backgroundColor: '#10271D', borderRadius: 22, padding: 22},
  weeklySummaryLabel: {color: '#AAB9B0', fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1.35},
  weeklySummaryNumber: {color: colors.white, fontFamily: fonts.medium, fontSize: 45, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: -1.8, marginTop: 11},
  weeklySummaryHint: {color: colors.lime, fontFamily: fonts.regular, fontSize: 12, marginTop: 3},
  chartCard: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, marginTop: 12, paddingHorizontal: 14, paddingTop: 18},
  chartCardHeader: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 3},
  chartCardTitle: {color: colors.ink, fontFamily: fonts.medium, fontSize: 15, fontWeight: '700'},
  chartCardMeta: {color: colors.muted, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1.2},
  weeklyChart: {alignItems: 'flex-end', flexDirection: 'row', height: 205, justifyContent: 'space-between', marginTop: 13},
  weeklyBarSlot: {alignItems: 'center', flex: 1, height: 190, justifyContent: 'flex-end'},
  weeklyBarValue: {color: colors.muted, fontFamily: fonts.medium, fontSize: 8, marginBottom: 5},
  weeklyBarValueActive: {color: colors.green},
  weeklyBarTrack: {alignItems: 'center', height: 128, justifyContent: 'flex-end'},
  weeklyBar: {borderRadius: 6, width: 20},
  weeklyBarActive: {backgroundColor: colors.green},
  weeklyBarInactive: {backgroundColor: '#DCE8DF'},
  weeklyDay: {color: colors.muted, fontFamily: fonts.medium, fontSize: 10, marginBottom: 12, marginTop: 9},
  weeklyDayActive: {color: colors.ink},
  weeklyMetricRow: {flexDirection: 'row', marginTop: 12},
  weeklyMetricCard: {backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 17, borderWidth: 1, flex: 1, padding: 16},
  weeklyMetricLabel: {color: colors.muted, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1.2},
  weeklyMetricValue: {color: colors.ink, fontFamily: fonts.medium, fontSize: 22, fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: -0.5, marginTop: 9},
  insightCard: {backgroundColor: '#E9F3EC', borderRadius: 18, marginTop: 12, padding: 18},
  insightEyebrow: {color: colors.green, fontFamily: fonts.medium, fontSize: 9, letterSpacing: 1.3},
  insightTitle: {color: colors.ink, fontFamily: fonts.medium, fontSize: 17, fontWeight: '700', letterSpacing: -0.3, marginTop: 9},
  insightText: {color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, marginTop: 4},
  bottomNav: {backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, bottom: 0, flexDirection: 'row', left: 0, paddingTop: 10, position: 'absolute', right: 0},
  navItem: {alignItems: 'center', flex: 1, minHeight: 48},
  navIcon: {color: '#9CA099', fontSize: 18, fontWeight: '800'},
  navLabel: {color: '#8A8F88', fontSize: 10, fontWeight: '700', marginTop: 3},
  navActive: {color: colors.green},
});

export default App;
