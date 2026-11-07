import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Database, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { AdminKindsResponse } from '../api/types';
import { useSession } from '../lib/session';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, EmptyState, ErrorState, SkeletonRows } from '../components/ui';
import { TabPanel, Tabs } from '../components/ui/Tabs';
import { AccountsPanel } from '../components/admin/AccountsPanel';
import { ContentListView, type EditingTarget } from '../components/admin/ContentListView';
import { OverviewPanel } from '../components/admin/OverviewPanel';
import { ProvidersPanel } from '../components/admin/ProvidersPanel';

const TABS = ['overview', 'content', 'assistant', 'accounts'] as const;
type Tab = (typeof TABS)[number];

const isTab = (value: string | null): value is Tab => value !== null && (TABS as readonly string[]).includes(value);

const positiveInt = (value: string | null, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * A filter the list did not mention stays out of the patch, so turning a page keeps the search.
 * 'all' and page 1 are the defaults and stay out of the address bar.
 */
function addressFilters(filters: { q?: string; status?: string; page?: number; perPage?: number }) {
  const patch: Record<string, string | number | null | undefined> = { q: filters.q, perPage: filters.perPage };
  if (filters.status !== undefined) patch.status = filters.status === 'all' ? null : filters.status;
  if (filters.page !== undefined) patch.page = filters.page === 1 ? null : filters.page;
  return patch;
}

/**
 * One screen for the whole catalogue. Which content types exist, what fields they have and what
 * children they hold all come from `GET /api/admin/kinds`, so adding a column to a table is a
 * server-side change and this page does not learn the name of a single content type.
 */
export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const { session, isStaff } = useSession();

  const kinds = useQuery({
    queryKey: keys.adminKinds,
    queryFn: () => api.get<AdminKindsResponse>('/admin/kinds'),
    staleTime: 5 * 60_000
  });

  const requestedTab = params.get('tab');
  const tab: Tab = isTab(requestedTab) ? requestedTab : 'overview';
  const isAdmin = session.user?.role === 'admin';
  const spec = useMemo(() => {
    const requested = params.get('kind');
    const list = kinds.data?.kinds ?? [];
    return list.find((kind) => kind.kind === requested) ?? list[0];
  }, [kinds.data, params]);

  /** Every filter lives in the address bar, so a view or an open document can be pasted to a colleague. */
  function updatePatch(patch: Record<string, string | number | null | undefined>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      if (value === null || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next, { replace: true });
  }

  if (!isStaff) {
    return (
      <>
        <PageHeader eyebrow="Content Studio" title="Staff only" description="This screen writes the curriculum itself." />
        <Card>
          <EmptyState
            title="Your account cannot edit content"
            description="Authors and administrators sign in here. If you need something changed, ask a staff member for a link to it."
            icon={<ShieldCheck size={18} aria-hidden />}
          />
        </Card>
      </>
    );
  }

  const tabs = [
    { value: 'overview', label: 'Overview', icon: <Database size={14} aria-hidden /> },
    { value: 'content', label: 'Content', icon: <ShieldCheck size={14} aria-hidden /> },
    { value: 'assistant', label: 'Assistant', icon: <Sparkles size={14} aria-hidden /> },
    ...(isAdmin ? [{ value: 'accounts', label: 'Accounts', icon: <Users size={14} aria-hidden /> }] : [])
  ];

  const editing: EditingTarget = params.has('ref') ? { slug: params.get('ref') === 'new' ? null : params.get('ref') } : null;

  return (
    <>
      <PageHeader
        eyebrow="Content Studio"
        title="Author and publish"
        description="Everything a learner can read is written here: topics, lessons, exercises, resources, courses, paths, events and reading lists. A change is live the moment it is published — and every save is recorded."
      />

      <Tabs items={tabs} value={tab} onValueChange={(value) => updatePatch({ tab: value })} ariaLabel="Content Studio sections">
        {tab === 'overview' && (
          <TabPanel value="overview">
            <OverviewPanel onOpenKind={(kind) => updatePatch({ tab: 'content', kind, ref: null })} />
          </TabPanel>
        )}

        {tab === 'content' && (
          <TabPanel value="content">
            {kinds.error ? (
              <ErrorState error={kinds.error} onRetry={() => void kinds.refetch()} />
            ) : !kinds.data || !spec ? (
              <SkeletonRows rows={6} />
            ) : (
              <div className="space-y-4">
                <Tabs
                  variant="pill"
                  ariaLabel="Content types"
                  items={kinds.data.kinds.map((kind) => ({ value: kind.kind, label: kind.label }))}
                  value={spec.kind}
                  onValueChange={(kind) => updatePatch({ kind, ref: null, status: 'all', page: null })}
                />
                <ContentListView
                  key={spec.kind}
                  kind={spec}
                  itemShapes={kinds.data.itemShapes}
                  q={params.get('q') ?? ''}
                  status={params.get('status') ?? 'all'}
                  page={positiveInt(params.get('page'), 1)}
                  perPage={positiveInt(params.get('perPage'), 24)}
                  editing={editing}
                  onFiltersChange={(filters) => updatePatch(addressFilters(filters))}
                  onEditingChange={(target) => updatePatch({ ref: target === null ? null : (target.slug ?? 'new') })}
                />
              </div>
            )}
          </TabPanel>
        )}

        {tab === 'assistant' && (
          <TabPanel value="assistant">
            {kinds.error ? (
              <ErrorState error={kinds.error} onRetry={() => void kinds.refetch()} />
            ) : !kinds.data ? (
              <SkeletonRows rows={4} />
            ) : (
              <ProvidersPanel adapters={kinds.data.providerAdapters} />
            )}
          </TabPanel>
        )}

        {tab === 'accounts' && isAdmin && (
          <TabPanel value="accounts">
            <AccountsPanel />
          </TabPanel>
        )}
      </Tabs>
    </>
  );
}
