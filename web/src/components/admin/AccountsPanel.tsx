import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { keys } from '../../api/keys';
import type { AdminAccount, AdminAccountPage, UserRole } from '../../api/types';
import { useSession } from '../../lib/session';
import { formatDateTime, formatRelative } from '../../lib/format';
import {
  Button,
  Chip,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  InlineAlert,
  Pagination,
  QueryBoundary,
  SearchInput,
  Select,
  SkeletonRows,
  type Column
} from '../ui';
import { useToast } from '../ui/Toast';

const ROLES: UserRole[] = ['learner', 'author', 'admin'];

const ROLE_TONE: Record<string, 'neutral' | 'info' | 'accent'> = { learner: 'neutral', author: 'info', admin: 'accent' };

/**
 * Who can see the studio at all. Roles here are the platform's own: an author writes content, an
 * administrator additionally holds provider keys and other people's accounts.
 */
export function AccountsPanel() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [pending, setPending] = useState<{ account: AdminAccount; patch: { role?: UserRole; isActive?: boolean }; message: string } | null>(
    null
  );

  const users = useQuery({
    queryKey: keys.adminAccounts({ q, page, perPage }),
    queryFn: () => api.get<AdminAccountPage>('/admin/users', { q, page, perPage }),
    placeholderData: (previous) => previous
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { role?: UserRole; isActive?: boolean }; name: string }) =>
      api.patch<{ id: number; role: string; isActive: boolean }>(`/admin/users/${id}`, patch),
    onSuccess: (result, variables) => {
      void queryClient.invalidateQueries({ queryKey: keys.adminAccounts() });
      void queryClient.invalidateQueries({ queryKey: keys.adminOverview });
      setPending(null);
      toast.info(`${variables.name} is now ${result.role}${result.isActive ? '' : ' and deactivated'}.`);
    },
    onError: (error) => {
      setPending(null);
      toast.danger(error instanceof Error ? error.message : 'The account was not changed.');
      // The row has to snap back to what the server actually holds, not what was clicked.
      void users.refetch();
    }
  });

  const apply = (account: AdminAccount, patch: { role?: UserRole; isActive?: boolean }) =>
    update.mutate({ id: account.id, patch, name: account.displayName });

  const askRole = (account: AdminAccount, role: UserRole) => {
    if (role === account.role) return;
    if (account.id === session.user?.id) {
      setPending({ account, patch: { role }, message: 'The server will not let you remove your own access. Ask another administrator.' });
      return;
    }
    if (role === 'learner' && account.role === 'admin') {
      setPending({
        account,
        patch: { role },
        message: `${account.displayName} would stop being an administrator. If nobody else is active in that role, the platform cannot be configured.`
      });
      return;
    }
    apply(account, { role });
  };

  const askActive = (account: AdminAccount, isActive: boolean) => {
    if (isActive === account.isActive) return;
    if (!isActive) {
      setPending({
        account,
        patch: { isActive: false },
        message: `${account.displayName} is signed out of every device immediately and cannot sign back in until somebody reactivates the account.`
      });
      return;
    }
    apply(account, { isActive: true });
  };

  if (users.error) return <ErrorState error={users.error} onRetry={() => void users.refetch()} />;

  const total = users.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const columns: Column<AdminAccount>[] = [
    {
      key: 'person',
      header: 'Account',
      cell: (row) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-ink">
            {row.displayName}
            {row.id === session.user?.id && <span className="ml-2 text-caption text-ink-muted">you</span>}
          </span>
          <span className="block truncate text-caption text-ink-muted">{row.email}</span>
        </span>
      )
    },
    {
      key: 'role',
      header: 'Role',
      cell: (row) => (
        <span className="flex items-center gap-2">
          <Chip tone={ROLE_TONE[row.role] ?? 'neutral'}>{row.role}</Chip>
          <Select
            aria-label={`Role for ${row.displayName}`}
            value={row.role}
            className="w-auto py-1 text-caption"
            onChange={(event) => askRole(row, event.target.value as UserRole)}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </Select>
        </span>
      )
    },
    {
      key: 'access',
      header: 'Access',
      cell: (row) => (
        <span className="flex items-center gap-2">
          <Chip tone={row.isActive ? 'success' : 'danger'}>{row.isActive ? 'active' : 'deactivated'}</Chip>
          <Button size="sm" variant="ghost" onClick={() => askActive(row, !row.isActive)}>
            {row.isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
        </span>
      )
    },
    {
      key: 'sessions',
      header: 'Sessions',
      cell: (row) => <span className="tnum text-ink-secondary">{row.sessions}</span>
    },
    {
      key: 'seen',
      header: 'Last seen',
      cell: (row) =>
        row.lastLoginAt ? (
          <span title={formatDateTime(row.lastLoginAt)}>{formatRelative(row.lastLoginAt)}</span>
        ) : (
          <span className="text-ink-muted">never</span>
        )
    },
    {
      key: 'joined',
      header: 'Joined',
      cell: (row) => <span className="text-caption text-ink-muted">{formatDateTime(row.createdAt).slice(0, 10)}</span>
    }
  ];

  return (
    <div className="space-y-4">
      <InlineAlert tone="info" title="What changing a role does">
        Authors reach the studio and the content types. Administrators additionally hold the provider keys and this screen. Nothing
        here deletes a person's progress, notes or history — deactivating only signs them out and blocks new sign-ins.
      </InlineAlert>

      <SearchInput
        className="w-72"
        value={q}
        ariaLabel="Search accounts by name or email"
        placeholder="Search name or email…"
        onValueChange={(value) => {
          setQ(value);
          setPage(1);
        }}
      />

      <QueryBoundary
        state={users}
        onRetry={() => void users.refetch()}
        isEmpty={total === 0}
        empty={
          <EmptyState
            title={q === '' ? 'No accounts' : 'Nothing matches that search'}
            description={
              q === '' ? 'Every person who has registered appears here.' : 'Search matches the display name and the email address.'
            }
            action={
              q === '' ? undefined : (
                <Button variant="secondary" onClick={() => setQ('')}>
                  Clear search
                </Button>
              )
            }
          />
        }
        loading={<SkeletonRows rows={6} />}
      >
        <DataTable rows={users.data?.items ?? []} columns={columns} rowKey={(row) => row.id} dense />
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          perPage={perPage}
          perPageOptions={[25, 50, 100]}
          onPageChange={setPage}
          onPerPageChange={(next) => {
            setPerPage(next);
            setPage(1);
          }}
        />
      </QueryBoundary>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={`Change ${pending?.account.displayName ?? 'this account'}?`}
        body={pending?.message}
        confirmLabel="Apply change"
        busy={update.isPending}
        onConfirm={() => pending && apply(pending.account, pending.patch)}
      />
    </div>
  );
}
