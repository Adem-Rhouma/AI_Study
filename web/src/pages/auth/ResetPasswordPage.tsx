import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useResetPassword } from '../../lib/session';
import { ApiError } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { InlineAlert } from '../../components/ui/Feedback';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const reset = useResetPassword();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    setFailure(null);
    if (password.length < 10) {
      setLocalError('Use at least 10 characters.');
      return;
    }
    if (password !== confirm) {
      setLocalError('The two passwords do not match.');
      return;
    }
    try {
      await reset.mutateAsync({ token, newPassword: password });
      setDone(true);
      window.setTimeout(() => navigate('/login', { replace: true }), 1600);
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.message
          : 'Could not reset the password. The link may have expired — request a new one.'
      );
    }
  }

  if (!token) {
    return (
      <div>
        <h1 className="text-h2 font-semibold text-ink">Reset link needed</h1>
        <p className="mt-2 text-caption text-ink-secondary">
          This page needs a reset token from an emailed link. Request a new one to continue.
        </p>
        <Link to="/forgot-password" className="mt-4 inline-block font-medium text-accent hover:underline">
          Request a reset link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-h2 font-semibold text-ink">Choose a new password</h1>
      <p className="mt-1 text-caption text-ink-secondary">
        Resetting signs out every other session for your account.
      </p>

      {done && (
        <div className="mt-4">
          <InlineAlert tone="success">Password updated. Taking you to sign in…</InlineAlert>
        </div>
      )}
      {failure && (
        <div className="mt-4">
          <InlineAlert tone="danger">{failure}</InlineAlert>
        </div>
      )}

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        {localError && <InlineAlert tone="danger">{localError}</InlineAlert>}
        <Field label="New password" htmlFor="new-password" required>
          <Input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={done}
            required
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm-password" required>
          <Input
            id="confirm-password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            disabled={done}
            required
          />
        </Field>
        <Button type="submit" variant="primary" block loading={reset.isPending} disabled={done}>
          Set new password
        </Button>
      </form>
    </div>
  );
}
