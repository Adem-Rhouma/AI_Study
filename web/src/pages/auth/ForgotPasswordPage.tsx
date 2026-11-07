import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useForgotPassword } from '../../lib/session';
import { ApiError } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { InlineAlert } from '../../components/ui/Feedback';

export default function ForgotPasswordPage() {
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ message: string; devLink?: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFailure(null);
    setSent(null);
    try {
      const result = await forgot.mutateAsync(email.trim());
      setSent(result);
    } catch (error) {
      setFailure(error instanceof ApiError ? error.message : 'Could not send the request. Try again.');
    }
  }

  return (
    <div>
      <span className="grid size-9 place-items-center rounded-pill bg-accent-soft text-accent-hover">
        <KeyRound size={17} aria-hidden />
      </span>
      <h1 className="mt-3 text-h2 font-semibold text-ink">Reset your password</h1>
      <p className="mt-1 text-caption text-ink-secondary">
        Enter the address on your account. If it exists, a reset link will be generated — this build has no mail
        transport, so the link is written to the server log.
      </p>

      {sent && (
        <div className="mt-4 space-y-2">
          <InlineAlert tone="success">{sent.message}</InlineAlert>
          {sent.devLink && (
            <InlineAlert tone="info" title="Development link">
              <a href={sent.devLink} className="break-all font-mono text-[12px] underline underline-offset-2">
                {sent.devLink}
              </a>
            </InlineAlert>
          )}
        </div>
      )}
      {failure && (
        <div className="mt-4">
          <InlineAlert tone="danger">{failure}</InlineAlert>
        </div>
      )}

      <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
        <Field label="Email" htmlFor="forgot-email" required>
          <Input
            id="forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>
        <Button type="submit" variant="primary" block loading={forgot.isPending}>
          Send reset link
        </Button>
      </form>

      <p className="mt-5 text-center text-caption text-ink-secondary">
        Remembered it?{' '}
        <Link to="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
