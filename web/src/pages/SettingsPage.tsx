import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, KeyRound, NotebookPen, ShieldCheck, SlidersHorizontal, Trash2, UserRound } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { keys } from '../api/keys';
import type { AssistantStatus, Difficulty, Preferences, ProgressExport } from '../api/types';
import { useChangePassword, useSession, useUpdatePreferences, useUpdateProfile } from '../lib/session';
import { useTheme } from '../lib/theme';
import { DIFFICULTY_LABEL, DIFFICULTY_ORDER, formatDateTime } from '../lib/format';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Divider, SectionHeader } from '../components/ui/Surface';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Field, FormErrors, Input, SwitchField, Textarea } from '../components/ui/Field';
import { InlineAlert, errorMessage } from '../components/ui/Feedback';
import { Modal } from '../components/ui/Overlay';
import { StatTile } from '../components/ui/Progress';
import { TabPanel, Tabs } from '../components/ui/Tabs';
import { useToast } from '../components/ui/Toast';
import { isStrongEnough, PasswordRules } from '../components/auth/PasswordRules';
import { BookmarksPanel, NotesPanel } from '../components/settings/SavedNotes';

const TABS = ['profile', 'preferences', 'saved', 'security', 'data'] as const;
type Tab = (typeof TABS)[number];

const isTab = (value: string | null): value is Tab => (TABS as readonly string[]).includes(value ?? '');

/** The row the server writes when a learner has never touched this form (see preferencesSchema). */
const PREFERENCE_DEFAULTS: Preferences = {
  theme: 'system',
  reducedMotion: false,
  uiDensity: 'comfortable',
  dailyGoalMinutes: 20,
  defaultDifficulty: 'intermediate',
  showSolutionsByDefault: false,
  aiAssistantEnabled: true
};

/** Written-out choices: CSS text-transform would also change what a screen reader announces. */
const THEME_CHOICES: { value: Preferences['theme']; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Follow the system' }
];

const DENSITY_CHOICES: { value: Preferences['uiDensity']; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' }
];

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const { session } = useSession();
  const urlTab = params.get('tab');
  const [tab, setTab] = useState<Tab>(isTab(urlTab) ? urlTab : 'profile');

  useEffect(() => {
    if (isTab(urlTab)) setTab(urlTab);
  }, [urlTab]);

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Profile & settings"
        description="Your details, how the interface behaves, everything you have saved, and the record this platform keeps about you. All of it is yours; nothing here is shared with another learner."
        actions={
          session.user ? (
            <Chip tone="neutral">{session.user.role === 'learner' ? 'Learner account' : `Staff · ${session.user.role}`}</Chip>
          ) : undefined
        }
      />

      <Tabs
        ariaLabel="Settings sections"
        value={tab}
        onValueChange={(next) => {
          const chosen = isTab(next) ? next : 'profile';
          setTab(chosen);
          setParams(chosen === 'profile' ? {} : { tab: chosen }, { replace: true });
        }}
        items={[
          { value: 'profile', label: 'Profile', icon: <UserRound size={14} aria-hidden /> },
          { value: 'preferences', label: 'Preferences', icon: <SlidersHorizontal size={14} aria-hidden /> },
          { value: 'saved', label: 'Notes & bookmarks', icon: <NotebookPen size={14} aria-hidden /> },
          { value: 'security', label: 'Security', icon: <ShieldCheck size={14} aria-hidden /> },
          { value: 'data', label: 'Data & account', icon: <KeyRound size={14} aria-hidden /> }
        ]}
      >
        <TabPanel value="profile">
          <ProfilePanel />
        </TabPanel>
        <TabPanel value="preferences">
          <PreferencesPanel />
        </TabPanel>
        <TabPanel value="saved">
          <div className="space-y-8">
            <section className="space-y-3">
              <SectionHeader
                eyebrow="Private"
                title="Your notes"
                description="Every note you have written, newest target first. Only you can read them."
              />
              <NotesPanel />
            </section>
            <section className="space-y-3">
              <SectionHeader
                eyebrow="Private"
                title="Your bookmarks"
                description="Lessons, topics and resources you parked for later."
              />
              <BookmarksPanel />
            </section>
          </div>
        </TabPanel>
        <TabPanel value="security">
          <SecurityPanel />
        </TabPanel>
        <TabPanel value="data">
          <DataPanel />
        </TabPanel>
      </Tabs>
    </>
  );
}

function ProfilePanel() {
  const { session, isAuthenticated } = useSession();
  const update = useUpdateProfile();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(session.user?.displayName ?? '');
  const [bio, setBio] = useState(session.user?.bio ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(session.user?.displayName ?? '');
    setBio(session.user?.bio ?? '');
  }, [session.user?.displayName, session.user?.bio]);

  if (!isAuthenticated || !session.user) return null;
  const user = session.user;

  function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const name = displayName.trim();
    if (name.length < 2 || name.length > 60) {
      setLocalError('Choose a display name between 2 and 60 characters.');
      return;
    }
    if (bio.length > 600) {
      setLocalError('A bio can be at most 600 characters.');
      return;
    }
    update.mutate(
      { displayName: name, bio: bio.trim() === '' ? null : bio.trim() },
      { onSuccess: () => toast.info('Profile saved.') }
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <SectionHeader eyebrow="This account" title={user.displayName} description={user.email} />
        <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-1 text-caption text-ink-secondary">
          <li>
            <span className="text-ink-muted">Role</span> {user.role}
          </li>
          <li>
            <span className="text-ink-muted">Joined</span> {formatDateTime(user.createdAt)}
          </li>
          <li>
            <span className="text-ink-muted">Last seen</span>{' '}
            {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'not recorded'}
          </li>
        </ul>
        <p className="pt-1 text-caption text-ink-muted">
          The email address is the sign-in name and there is no change-address flow in this build —
          registration and login both key off it.
        </p>
      </Card>

      <Card as="section" className="space-y-4">
        <SectionHeader eyebrow="Public within the app" title="How you appear" description="Your display name shows on your own screens and nowhere else; there is no social surface in this build." />
        <form onSubmit={submit} className="space-y-4" noValidate>
          {update.isError && <InlineAlert tone="danger">{errorMessage(update.error)}</InlineAlert>}
          <FormErrors details={update.error instanceof ApiError ? update.error.details : undefined} />
          {localError && <InlineAlert tone="danger">{localError}</InlineAlert>}

          <Field label="Display name" htmlFor="displayName" required hint="2–60 characters">
            <Input
              id="displayName"
              name="displayName"
              autoComplete="nickname"
              value={displayName}
              maxLength={60}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>

          <Field label="Bio" htmlFor="bio" hint={`${bio.length}/600`}>
            <Textarea
              id="bio"
              name="bio"
              rows={3}
              maxLength={600}
              value={bio}
              placeholder="What you are working on, or what you want to get good at."
              onChange={(event) => setBio(event.target.value)}
            />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={update.isPending}>
              Save profile
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDisplayName(user.displayName);
                setBio(user.bio ?? '');
                setLocalError(null);
              }}
            >
              Undo changes
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function PreferencesPanel() {
  const { session, isAuthenticated } = useSession();
  const update = useUpdatePreferences();
  const { setPreference } = useTheme();
  const toast = useToast();

  const stored = session.preferences ?? PREFERENCE_DEFAULTS;
  const [form, setForm] = useState<Preferences>(stored);
  const [goal, setGoal] = useState(String(stored.dailyGoalMinutes));

  useEffect(() => {
    const next = session.preferences ?? PREFERENCE_DEFAULTS;
    setForm(next);
    setGoal(String(next.dailyGoalMinutes));
  }, [session.preferences]);

  // Whether the platform has any provider at all decides whether this switch can do anything.
  const assistant = useQuery({
    queryKey: keys.aiStatus,
    queryFn: () => api.get<AssistantStatus>('/ai/status'),
    staleTime: 60_000
  });

  if (!isAuthenticated) return null;

  const set = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    const minutes = Number(goal);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 600) {
      setGoal(String(stored.dailyGoalMinutes));
      toast.danger('A daily goal has to be a whole number of minutes between 0 and 600.');
      return;
    }
    // The PUT replaces the whole row, so keys this form does not expose travel through unchanged.
    update.mutate(
      { ...form, dailyGoalMinutes: minutes },
      {
        onSuccess: ({ preferences }) => {
          setPreference(preferences.theme);
          toast.info('Preferences saved.');
        }
      }
    );
  }

  return (
    <div className="space-y-4">
      {update.isError && <InlineAlert tone="danger">{errorMessage(update.error)}</InlineAlert>}
      {update.isSuccess && (
        <InlineAlert tone="success" title="Saved">
          These settings are stored on your account, so they follow you to any other browser you sign in on.
        </InlineAlert>
      )}

      <Card as="section" className="space-y-5">
        <SectionHeader
          eyebrow="Interface"
          title="How it looks and moves"
          description="Theme also has a one-click toggle in the top bar; this is the value that gets remembered for you."
        />
        <form onSubmit={submit} className="space-y-5" noValidate>
          <fieldset className="space-y-2">
            <legend className="text-caption font-medium text-ink-secondary">Colour theme</legend>
            <div className="flex flex-wrap gap-2">
              {THEME_CHOICES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('theme', value)}
                  aria-pressed={form.theme === value}
                  className={
                    'cursor-pointer rounded-input border px-3 py-1.5 text-caption transition-colors ' +
                    (form.theme === value
                      ? 'border-accent bg-[var(--accent-soft)] text-accent-hover'
                      : 'border-line-strong bg-raised text-ink-secondary hover:bg-sunken hover:text-ink')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <SwitchField
            label="Reduce motion"
            description="Turns off transitions and the animated figures, on top of whatever your operating system asks for."
            checked={form.reducedMotion}
            onCheckedChange={(checked) => set('reducedMotion', checked)}
          />

          <fieldset className="space-y-2">
            <legend className="text-caption font-medium text-ink-secondary">Density</legend>
            <div className="flex flex-wrap gap-2">
              {DENSITY_CHOICES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('uiDensity', value)}
                  aria-pressed={form.uiDensity === value}
                  className={
                    'cursor-pointer rounded-input border px-3 py-1.5 text-caption transition-colors ' +
                    (form.uiDensity === value
                      ? 'border-accent bg-[var(--accent-soft)] text-accent-hover'
                      : 'border-line-strong bg-raised text-ink-secondary hover:bg-sunken hover:text-ink')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <Divider className="my-1" />

          <SectionHeader eyebrow="Learning" title="Goals and starting point" />

          <Field
            label="Daily study goal"
            htmlFor="dailyGoalMinutes"
            hint="minutes; 0 switches the goal ring off"
            error={goal.trim() === '' ? 'Enter a number of minutes.' : undefined}
          >
            <Input
              id="dailyGoalMinutes"
              name="dailyGoalMinutes"
              type="number"
              inputMode="numeric"
              min={0}
              max={600}
              step={5}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-caption font-medium text-ink-secondary">Default difficulty</legend>
            <p className="text-caption text-ink-muted">
              What the arena recommends from, and what the dashboard’s starting points lean towards. It never
              hides content at other levels.
            </p>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTY_ORDER.map((value: Difficulty) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('defaultDifficulty', value)}
                  aria-pressed={form.defaultDifficulty === value}
                  className={
                    'cursor-pointer rounded-input border px-3 py-1.5 text-caption transition-colors ' +
                    (form.defaultDifficulty === value
                      ? 'border-accent bg-[var(--accent-soft)] text-accent-hover'
                      : 'border-line-strong bg-raised text-ink-secondary hover:bg-sunken hover:text-ink')
                  }
                >
                  {DIFFICULTY_LABEL[value]}
                </button>
              ))}
            </div>
          </fieldset>

          <Divider className="my-1" />

          <SectionHeader eyebrow="Assistant" title="Study assistant" />

          <SwitchField
            label="Ask the study assistant"
            description={
              assistant.data && !assistant.data.configured
                ? 'No provider is configured on this install yet, so there is nothing for this switch to turn on.'
                : 'Adds the assistant panel to lessons, topics and exercises. Turning it off hides it and blocks its endpoint for your account.'
            }
            checked={form.aiAssistantEnabled}
            onCheckedChange={(checked) => set('aiAssistantEnabled', checked)}
          />

          {assistant.data?.configured && assistant.data.provider && (
            <p className="text-caption text-ink-muted">
              Answers come from {assistant.data.provider.name} using the model {assistant.data.provider.model}. The
              assistant reads curriculum text only — it is not connected to the web, and it never receives exercise
              solutions.
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="submit" variant="primary" loading={update.isPending}>
              Save preferences
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setForm(stored);
                setGoal(String(stored.dailyGoalMinutes));
              }}
            >
              Undo changes
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function SecurityPanel() {
  const { session, isAuthenticated, logout } = useSession();
  const change = useChangePassword();
  const toast = useToast();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  if (!isAuthenticated || !session.user) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (current === '') {
      setLocalError('Enter your current password.');
      return;
    }
    if (!isStrongEnough(next)) {
      setLocalError('The new password has to meet every rule below.');
      return;
    }
    if (confirm !== next) {
      setLocalError('The two new passwords do not match.');
      return;
    }
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setConfirm('');
          toast.info('Password changed. Every other device was signed out.');
        }
      }
    );
  }

  return (
    <div className="space-y-4">
      <Card as="section" className="space-y-4">
        <SectionHeader
          eyebrow="Sign-in"
          title="Change your password"
          description="Sessions are server-side records: changing the password drops every other one immediately and leaves this browser signed in."
        />
        <form onSubmit={submit} className="space-y-4" noValidate>
          {change.isError && <InlineAlert tone="danger">{errorMessage(change.error)}</InlineAlert>}
          {change.isSuccess && <InlineAlert tone="success">{change.data?.note ?? 'Password changed.'}</InlineAlert>}
          {localError && <InlineAlert tone="danger">{localError}</InlineAlert>}

          <Field label="Current password" htmlFor="currentPassword" required>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </Field>

          <Field label="New password" htmlFor="newPassword" required>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
          </Field>

          <PasswordRules value={next} />

          <Field label="Repeat new password" htmlFor="confirmPassword" required>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>

          <Button type="submit" variant="primary" loading={change.isPending}>
            Change password
          </Button>
        </form>
      </Card>

      <Card as="section" className="space-y-3">
        <SectionHeader
          eyebrow="This device"
          title="Sign out"
          description="Ends this browser’s session record. Nothing you have saved is affected."
        />
        <Button
          variant="secondary"
          onClick={() => {
            void logout().then(() => navigate('/'));
          }}
        >
          Sign out
        </Button>
      </Card>
    </div>
  );
}

function DataPanel() {
  const { session, isAuthenticated } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [exported, setExported] = useState<ProgressExport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');

  const download = useMutation({
    mutationFn: () => api.get<ProgressExport>('/progress/export'),
    onSuccess: (data) => {
      setExported(data);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ai-mastery-export-${data.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.info('Your data has been downloaded as JSON.');
    },
    onError: (error) => toast.danger(errorMessage(error))
  });

  const erase = useMutation({
    mutationFn: () => api.del<{ ok: boolean; note: string }>('/auth/me', { password, confirm: word }),
    onSuccess: () => {
      queryClient.clear();
      setDeleting(false);
      setPassword('');
      setWord('');
      toast.info('The account and its data are gone.');
      navigate('/', { replace: true });
    },
    onError: (error) => toast.danger(errorMessage(error))
  });

  if (!isAuthenticated || !session.user) return null;

  const totals = exported?.totals;

  return (
    <div className="space-y-4">
      <Card as="section" className="space-y-3">
        <SectionHeader
          eyebrow="Portability"
          title="Take a copy of everything"
          description="One JSON document with every row this account owns: mastery, completions, graded attempts, activity and notes. It is generated on request from the live tables — nothing is pre-baked."
        />
        {download.isError && <InlineAlert tone="danger">{errorMessage(download.error)}</InlineAlert>}
        {totals ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Mastery rows" value={totals.mastery_rows} />
            <StatTile label="Lesson completions" value={totals.completions} />
            <StatTile label="Graded attempts" value={totals.attempts} />
            <StatTile label="Activity events" value={totals.activity_events} />
          </div>
        ) : (
          <p className="text-caption text-ink-muted">
            The counts appear here once a file has actually been produced, so they always describe what you hold.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={download.isPending} onClick={() => download.mutate()}>
            <Download size={15} aria-hidden />
            Export my data
          </Button>
          {exported && (
            <p className="self-center text-caption text-ink-muted tnum">
              Last file generated {formatDateTime(exported.exportedAt)}
            </p>
          )}
        </div>
      </Card>

      <Card as="section" className="space-y-3">
        <SectionHeader
          eyebrow="Irreversible"
          title="Delete this account"
          description="Removes the account and every personal row it owns — mastery, attempts, completions, notes, bookmarks, collections, enrolments and sessions. Curriculum content stays in place."
        />
        <ul className="space-y-1 text-caption text-ink-secondary">
          <li className="flex gap-2">
            <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-danger" />
            Export first if you want a copy; this cannot be undone and there is no recovery window.
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-danger" />
            Public content you authored stays, with your name detached from it (the schema sets that column to null).
          </li>
        </ul>
        <Button variant="danger" onClick={() => setDeleting(true)}>
          <Trash2 size={15} aria-hidden />
          Delete my account
        </Button>
      </Card>

      <Modal
        open={deleting}
        onOpenChange={(open) => {
          setDeleting(open);
          if (!open) {
            setPassword('');
            setWord('');
          }
        }}
        title="Delete this account permanently?"
        description="Confirm with your password and the word DELETE. Every personal row is removed as soon as you do."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Keep my account
            </Button>
            <Button
              variant="danger"
              loading={erase.isPending}
              disabled={password === '' || word !== 'DELETE'}
              onClick={() => erase.mutate()}
            >
              Delete permanently
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {erase.isError && <InlineAlert tone="danger">{errorMessage(erase.error)}</InlineAlert>}
          <Field label="Your password" htmlFor="delete-password" required>
            <Input
              id="delete-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field label="Type DELETE" htmlFor="delete-word" required hint="upper case, exactly">
            <Input
              id="delete-word"
              name="confirm"
              autoComplete="off"
              spellCheck={false}
              value={word}
              onChange={(event) => setWord(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
