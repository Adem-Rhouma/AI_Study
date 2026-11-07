import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, ExternalLink, MapPin } from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { CompetitionRow, EventCalendar, EventsPage as EventsPayload } from '../api/types';
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_ORDER,
  EVENT_TYPE_ORDER,
  eventStatusLabel,
  eventStatusTone,
  eventTypeLabel,
  formatDate
} from '../lib/format';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, SectionHeader } from '../components/ui/Surface';
import { Chip, DifficultyChip } from '../components/ui/Chip';
import { Button, LinkButton } from '../components/ui/Button';
import { EmptyState, ErrorState, InlineAlert, SkeletonRows } from '../components/ui/Feedback';
import { SearchInput, Select } from '../components/ui/Field';
import { Pagination } from '../components/ui/Pagination';

const STATUS_OPTIONS = [
  { value: '', label: 'Happening or next' },
  { value: 'open', label: 'Open now' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'recurring', label: 'Recurring every year' },
  { value: 'closed', label: 'Finished editions' },
  { value: 'all', label: 'Everything' }
];

export default function EventsPage() {
  const [status, setStatus] = useState('');
  const [type, setType] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filters = {
    ...(status ? { status } : {}),
    ...(type !== 'all' ? { type } : {}),
    ...(difficulty !== 'all' ? { difficulty } : {}),
    q: search,
    page,
    perPage: 12
  };

  const events = useQuery({
    queryKey: keys.competitions(filters),
    queryFn: () => api.get<EventsPayload>('/events', filters),
    placeholderData: (previous) => previous
  });

  const calendar = useQuery({
    queryKey: keys.eventCalendar(120),
    queryFn: () => api.get<EventCalendar>('/events/calendar', { days: 120 })
  });

  const rows = events.data?.events ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Research & Discover"
        title="Competitions & events"
        crumbs={[{ label: 'Research', to: '/research' }, { label: 'Events' }]}
        description="The competitions and conferences worth building a project around, with what each one actually asks of you. Everything below is curated by hand."
        actions={
          <LinkButton variant="ghost" to="/research">
            Back to research
          </LinkButton>
        }
      >
        <InlineAlert tone="warning" title="Check before you rely on a date">
          {events.data?.disclaimer ?? calendar.data?.disclaimer}
        </InlineAlert>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-4">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(q.trim());
              setPage(1);
            }}
          >
            <SearchInput
              className="min-w-56 flex-1"
              ariaLabel="Search events"
              value={q}
              placeholder="Search name, organiser or summary…"
              onValueChange={setQ}
            />
            <label className="flex items-end gap-2">
              <span className="sr-only">Status</span>
              <Select
                aria-label="Filter by status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
                className="w-52"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-end gap-2">
              <span className="sr-only">Type</span>
              <Select
                aria-label="Filter by type"
                value={type}
                onChange={(event) => {
                  setType(event.target.value);
                  setPage(1);
                }}
                className="w-40"
              >
                <option value="all">All types</option>
                {EVENT_TYPE_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {eventTypeLabel(value)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-end gap-2">
              <span className="sr-only">Difficulty</span>
              <Select
                aria-label="Filter by difficulty"
                value={difficulty}
                onChange={(event) => {
                  setDifficulty(event.target.value);
                  setPage(1);
                }}
                className="w-40"
              >
                <option value="all">Any level</option>
                {DIFFICULTY_ORDER.map((level) => (
                  <option key={level} value={level}>
                    {DIFFICULTY_LABEL[level]}
                  </option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          {events.isLoading ? (
            <SkeletonRows rows={5} />
          ) : events.error ? (
            <ErrorState error={events.error} onRetry={() => void events.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={status === '' ? 'Nothing is currently open' : 'No events match those filters'}
              description="The curated list is small by design. Widen the status filter — finished editions are hidden by default."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQ('');
                    setSearch('');
                    setStatus('all');
                    setType('all');
                    setDifficulty('all');
                    setPage(1);
                  }}
                >
                  Show everything
                </Button>
              }
            />
          ) : (
            <>
              <ul className="space-y-3">
                {rows.map((event) => (
                  <li key={event.slug}>
                    <EventCard event={event} />
                  </li>
                ))}
              </ul>
              {events.data && events.data.totalPages > 1 && (
                <Pagination
                  page={events.data.page}
                  totalPages={events.data.totalPages}
                  total={events.data.total}
                  perPage={events.data.perPage}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <SectionHeader
              eyebrow="Next four months"
              title="Dated deadlines"
              description="Only entries with a recorded date appear here."
            />
            {calendar.isLoading ? (
              <SkeletonRows className="mt-3" rows={3} />
            ) : calendar.error ? (
              <ErrorState className="mt-3" error={calendar.error} onRetry={() => void calendar.refetch()} />
            ) : calendar.data && calendar.data.months.length > 0 ? (
              <ol className="mt-3 space-y-3">
                {calendar.data.months.map((month) => (
                  <li key={month.month}>
                    <p className="eyebrow text-caption">{month.label}</p>
                    <ul className="mt-1 space-y-1.5">
                      {month.items.map((item) => (
                        <li key={item.slug}>
                          <Link
                            to={`/research/events/${item.slug}`}
                            className="block rounded-input border border-line bg-sunken px-2.5 py-2 text-caption transition-colors hover:border-[var(--border-strong)]"
                          >
                            <span className="block text-ink">{item.name}</span>
                            <span className="text-ink-muted tnum">
                              {item.deadlineDate ? `Closes ${formatDate(item.deadlineDate)}` : `Starts ${formatDate(item.startDate)}`}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-caption text-ink-muted">
                No dated deadlines fall in the next four months. Most entries here are recurring events whose next
                edition has not been recorded yet — pick a specific event to see what it asks of you.
              </p>
            )}
          </Card>

          <Card>
            <SectionHeader eyebrow="How to use this list" title="Choose by what you want to prove" />
            <ul className="mt-3 space-y-2 text-caption text-ink-secondary">
              <li className="flex gap-2">
                <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                A competition is worth doing when it forces you to finish a system, not tune one metric.
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                Workshops at the main conferences are the cheapest way to see a field before it is written up.
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                Read the rules before the leaderboard; most formats differ from year to year.
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}

function EventCard({ event }: { event: CompetitionRow }) {
  const when = event.deadlineDate ?? event.startDate;
  return (
    <Card as="article" variant="interactive" className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={eventStatusTone(event.status)}>{eventStatusLabel(event.status)}</Chip>
        <Chip>{eventTypeLabel(event.type)}</Chip>
        <DifficultyChip difficulty={event.difficulty} />
        {event.isLiveData === false && <Chip tone="neutral">Curated</Chip>}
      </div>
      <h3 className="font-sans text-small-title font-semibold leading-snug text-ink">
        <Link to={`/research/events/${event.slug}`} className="transition-colors hover:text-accent-hover">
          {event.name}
        </Link>
      </h3>
      <p className="text-caption text-ink-muted">{event.organizer}</p>
      <p className="prose line-clamp-2 text-caption text-ink-secondary">{event.summary}</p>
      <div className="flex flex-wrap items-center gap-3 pt-1 text-caption text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <CalendarDays size={13} aria-hidden />
          {when ? formatDate(when) : 'Dates vary by edition'}
        </span>
        {event.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin size={13} aria-hidden /> {event.location}
          </span>
        )}
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-ink-secondary transition-colors hover:text-accent-hover"
        >
          <ExternalLink size={13} aria-hidden /> Official page
        </a>
      </div>
    </Card>
  );
}
