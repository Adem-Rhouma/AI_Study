import { AlertTriangle, CheckCircle2, Database, Library, Sparkles, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { keys } from '../../api/keys';
import type { AdminChange, AdminOverview } from '../../api/types';
import { formatDateTime, formatRelative } from '../../lib/format';
import { Button, Card, Chip, DataTable, EmptyState, ErrorState, QueryBoundary, SectionHeader, SkeletonRows, StatTile, type Column } from '../ui';

/**
 * The first thing staff see: how much content exists, what is not fit to publish yet, and who
 * changed what. Every number here is a query the server already runs, not a claim made up here.
 */
export function OverviewPanel({ onOpenKind }: { onOpenKind: (kind: string) => void }) {
  const overview = useQuery({
    queryKey: keys.adminOverview,
    queryFn: () => api.get<AdminOverview>('/admin/overview')
  });

  const changes = useQuery({
    queryKey: keys.adminChanges,
    queryFn: () => api.get<{ changes: AdminChange[] }>('/admin/changes', { limit: 40 })
  });

  if (overview.error) return <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />;
  if (!overview.data) return <SkeletonRows rows={8} />;

  const data = overview.data;
  const problems = data.health.filter((check) => check.count > 0);
  // Types such as events are always visible; counting them as "unpublished" would invent a gap.
  const publishable = data.content.filter((kind) => kind.published !== null);

  const changeColumns: Column<AdminChange>[] = [
    {
      key: 'at',
      header: 'When',
      cell: (row) => (
        <span className="whitespace-nowrap text-ink-secondary" title={formatDateTime(row.at)}>
          {formatRelative(row.at)}
        </span>
      )
    },
    { key: 'actor', header: 'Who', cell: (row) => row.actor },
    {
      key: 'what',
      header: 'What',
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <Chip tone="neutral">{row.kind}</Chip>
          <span className="font-medium text-ink">{row.ref}</span>
        </span>
      )
    },
    { key: 'summary', header: 'Change', cell: (row) => <span className="text-ink-secondary">{row.summary}</span> }
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Learners" value={data.people.learners} hint={`${data.people.active} active accounts`} icon={<Users size={15} aria-hidden />} />
        <StatTile label="Staff" value={data.people.staff} hint="Authors and administrators" icon={<Library size={15} aria-hidden />} />
        <StatTile
          label="Assistant"
          value={data.assistant.enabled}
          hint={data.assistant.configured ? `${data.assistant.providers} providers configured` : `No provider is enabled (${data.assistant.providers} stored)`}
          icon={<Sparkles size={15} aria-hidden />}
        />
        <StatTile
          label="Published content"
          value={publishable.reduce((sum, kind) => sum + (kind.published ?? 0), 0)}
          hint={`of ${publishable.reduce((sum, kind) => sum + kind.total, 0)} rows that have a publish state`}
          icon={<Database size={15} aria-hidden />}
        />
      </div>

      <section>
        <SectionHeader title="Curriculum by type" description="Counts cover every row, published or not. Open a type to edit it." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.content.map((kind) => (
            <Card key={kind.kind} variant="interactive" padded={false} className="overflow-hidden">
              <button
                type="button"
                onClick={() => onOpenKind(kind.kind)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-sunken"
              >
                <span>
                  <span className="block font-medium text-ink">{kind.label}</span>
                  <span className="block text-caption text-ink-muted">
                    {kind.published === null
                      ? kind.statuses.length > 0
                        ? kind.statuses.map((entry) => `${entry.count} ${entry.status}`).join(' · ')
                        : `${kind.total} in the catalogue · no publish state`
                      : `${kind.published} published · ${kind.unpublished} not published`}
                  </span>
                </span>
                <span className="tnum text-h3 font-semibold text-ink">{kind.total}</span>
              </button>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Before this ships"
          description="Checks over the published set: content a learner could open and find nothing in."
        />
        {problems.length === 0 ? (
          <Card variant="sunken" className="flex items-center gap-3">
            <CheckCircle2 size={18} className="text-success" aria-hidden />
            <p className="text-body text-ink-secondary">
              Nothing flagged. {data.health.length} checks run over the published content — empty lessons, unmarkable questions,
              unreachable paths.
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {problems.map((check) => (
              <li key={check.key}>
                <Card variant="sunken" className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex min-w-0 items-start gap-3">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                    <span>
                      <span className="block font-medium text-ink">
                        <span className="tnum">{check.count}</span> — {check.label}
                      </span>
                      <span className="block text-caption text-ink-muted">{check.note}</span>
                    </span>
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => onOpenKind(check.kind)}>
                    Open {check.kind}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeader title="Recent changes" description="Every write through this studio, including provider and account changes." />
        <QueryBoundary
          state={changes}
          onRetry={() => void changes.refetch()}
          isEmpty={(changes.data?.changes.length ?? 0) === 0}
          empty={<EmptyState title="Nothing has been written yet" description="The audit trail starts with the first save." />}
          loading={<SkeletonRows rows={4} />}
        >
          <DataTable rows={changes.data?.changes ?? []} columns={changeColumns} rowKey={(row) => row.id} dense />
        </QueryBoundary>
      </section>
    </div>
  );
}
