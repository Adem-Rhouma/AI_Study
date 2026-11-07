import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../../lib/session';
import { ApiError } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Field, FormErrors, Input } from '../../components/ui/Field';
import { InlineAlert } from '../../components/ui/Feedback';
import { isStrongEnough, PasswordRules } from '../../components/auth/PasswordRules';

export default function RegisterPage() {
  const { register } = useSession();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string> | undefined>();
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  const passwordValid = isStrongEnough(password);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (displayName.trim().length < 2) errors.displayName = 'Choose a name with at least 2 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (!passwordValid) errors.password = 'Pick a password that meets every rule below.';
    if (confirm !== password) errors.confirm = 'The two passwords do not match.';
    setLocalErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setDetails(undefined);
    if (!validate()) return;
    setBusy(true);
    try {
      await register(email.trim(), password, displayName.trim());
      navigate('/', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setDetails(error.details);
      } else {
        setFormError('Could not create the account. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-h2 font-semibold text-ink">Create your account</h1>
      <p className="mt-1 text-caption text-ink-secondary">
        Track mastery across the curriculum, save notes and keep your place in every lesson.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}
        <FormErrors details={details} shown={['displayName', 'email', 'password']} />

        <Field label="Display name" htmlFor="displayName" required error={localErrors.displayName ?? details?.displayName}>
          <Input
            id="displayName"
            name="displayName"
            autoComplete="nickname"
            value={displayName}
            maxLength={60}
            onChange={(event) => setDisplayName(event.target.value)}
            invalid={Boolean(localErrors.displayName || details?.displayName)}
            required
          />
        </Field>

        <Field label="Email" htmlFor="email-register" required error={localErrors.email ?? details?.email}>
          <Input
            id="email-register"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            invalid={Boolean(localErrors.email || details?.email)}
            required
          />
        </Field>

        <Field label="Password" htmlFor="password-register" required error={localErrors.password ?? details?.password}>
          <Input
            id="password-register"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            invalid={Boolean(localErrors.password || details?.password)}
            required
          />
        </Field>

        <div className="-mt-2">
          <PasswordRules value={password} />
        </div>

        <Field label="Confirm password" htmlFor="confirm" required error={localErrors.confirm}>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            invalid={Boolean(localErrors.confirm)}
            required
          />
        </Field>

        <Button type="submit" variant="primary" block loading={busy}>
          Create account
        </Button>
      </form>

      <p className="mt-5 text-center text-caption text-ink-secondary">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
