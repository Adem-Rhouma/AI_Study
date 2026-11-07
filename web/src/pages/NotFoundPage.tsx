import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { LinkButton } from '../components/ui/Button';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <PageHeader eyebrow="Error 404" title="That page isn't part of the map" />
      <div className="rounded-card border border-dashed border-line-strong bg-sunken px-6 py-10 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-pill border border-line bg-raised text-ink-muted">
          <Compass size={20} aria-hidden />
        </span>
        <p className="mt-4 text-body text-ink-secondary">
          The link may be old, or the topic may have been renamed during a curriculum revision. Try one of these
          instead:
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <LinkButton to="/explore" variant="primary">
            Explore the curriculum
          </LinkButton>
          <LinkButton to="/courses">Browse courses</LinkButton>
          <LinkButton to="/search">Search everything</LinkButton>
        </div>
        <p className="mt-5 text-caption text-ink-muted">
          Or go back to the <Link to="/" className="text-accent hover:underline">dashboard</Link>.
        </p>
      </div>
    </div>
  );
}
