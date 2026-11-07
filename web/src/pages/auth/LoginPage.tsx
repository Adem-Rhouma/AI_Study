import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useSession } from '../../lib/session';
import { ApiError } from '../../api/client';
import { Button, IconButton } from '../../components/ui/Button';
import { Field, FormErrors, Input } from '../../components/ui/Field';
import { InlineAlert } from '../../components/ui/Feedback';

export default function LoginPage() {
  const { login } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string> | undefined>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setDetails(undefined);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setDetails(error.details);
      } else {
        setFormError('Could not sign in. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="text-h2 font-semibold text-ink">Welcome back</h1>
      <p className="mt-1 text-caption text-ink-secondary">Sign in to continue where you left off.</p>

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        {formError && <InlineAlert tone="danger">{formError}</InlineAlert>}
        <FormErrors details={details} shown={['email', 'password']} />

        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            invalid={Boolean(details?.email)}
            required
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          required
          error={details?.password}
          hint={
            <Link to="/forgot-password" className="text-accent hover:underline">
              Forgot?
            </Link>
          }
        >
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={reveal ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={Boolean(details?.password)}
              className="pr-11"
              required
            />
            <IconButton
              label={reveal ? 'Hide password' : 'Show password'}
              size="sm"
              type="button"
              onClick={() => setReveal((value) => !value)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2"
            >
              {reveal ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
            </IconButton>
          </div>
        </Field>

        <Button type="submit" variant="primary" block loading={busy}>
          Sign in
        </Button>
      </form>

      <p className="mt-5 text-center text-caption text-ink-secondary">
        New here?{' '}
        <Link to="/register" className="font-medium text-accent hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
