import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, ExternalLink, MapPin, Target } from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { CompetitionDetail } from '../api/types';
import { eventStatusLabel, eventStatusTone, eventTypeLabel, formatDate } from '../lib/format';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Divider, SectionHeader } from '../components/ui/Surface';
import { Chip, DifficultyChip } from '../components/ui/Chip';
import { AnchorButton } from '../components/ui/Button';
import { EmptyState, ErrorState, InlineAlert, SkeletonRows } from '../components/ui/Feedback';
import { Markdown } from '../components/content/Markdown';

type EventResponse = { event: CompetitionDetail; isLiveData: false; disclaimer: string };

export default function EventDetailPage() {
  const { slug = '' } = useParams();

  const query = useQuery({
    queryKey: keys.event(slug),
    queryFn: () => api.get<EventResponse>(`/events/${slug}`)
  });

  if (query.isLoading) {
    return (
      <>
        <PageHeader eyebrow="Event" title="Loading event…" crumbs={[{ label: 'Research', to: '/research' }]} />
        <SkeletonRows rows={5} />
      </>
    );
  }

  if (query.error || !query.data) {
    return (
      <>
        <PageHeader
          eyebrow="Event"
          title="Event unavailable"
          crumbs={[{ label: 'Research', to: '/research' }, { label: 'Events', to: '/research/events' }, { label: 'Not found' }]}
        />
        <ErrorState error={query.error ?? new Error('This event is not in the curated list.')} onRetry={() => void query.refetch()} />
      </>
    );
  }

  const event = query.data.event;

  return (
    <>
      <PageHeader
        eyebrow={eventTypeLabel(event.type)}
        title={event.name}
        crumbs={[
          { label: 'Research', to: '/research' },
          { label: 'Events', to: '/research/events' },
          { label: event.name }
        ]}
        actions={
          <AnchorButton variant="primary" href={event.url}>
            <ExternalLink size={15} aria-hidden /> Official page
          </AnchorButton>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone={eventStatusTone(event.status)}>{eventStatusLabel(event.status)}</Chip>
          <DifficultyChip difficulty={event.difficulty} />
          <Chip icon={<Target size={12} aria-hidden />}>{event.organizer || 'Organiser not recorded'}</Chip>
          {event.location && (
            <Chip icon={<MapPin size={12} aria-hidden />}>{event.location}</Chip>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-5">
          {event.summary && (
            <Card>
              <Markdown source={event.summary} withIds={false} />
            </Card>
          )}

          <section aria-labelledby="entry-requirements" className="space-y-3">
            <SectionHeader
              eyebrow="Before you commit"
              title="What entry asks of you"
              description="Written from the organiser's own rules at the time this entry was curated."
            />
            {event.requirements ? (
              <Card>
                <Markdown source={event.requirements} withIds={false} />
              </Card>
            ) : (
              <EmptyState
                title="No requirements recorded"
                description="Nobody has written up what this event asks of entrants. Check the organiser's page."
              />
            )}
          </section>

          {event.skillsPracticed.length > 0 && (
            <section aria-labelledby="skills" className="space-y-3">
              <SectionHeader eyebrow="Transferable" title="What you practise by doing it" />
              <ul className="flex flex-wrap gap-1.5">
                {event.skillsPracticed.map((skill) => (
                  <li key={skill}>
                    <Chip tone="info">{skill}</Chip>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {event.relatedTopics.length > 0 && (
            <section aria-labelledby="topics" className="space-y-3">
              <SectionHeader
                eyebrow="Curriculum"
                title="Topics this pulls together"
                description="Links into the lessons that teach the material this event assumes."
              />
              <ul className="grid gap-2 md:grid-cols-2">
                {event.relatedTopics.map((topic) => (
                  <li key={topic.slug}>
                    <Link
                      to={`/explore/${topic.slug}`}
                      className="flex items-center justify-between gap-2 rounded-card border border-line bg-raised px-3 py-2 text-caption text-ink transition-colors hover:border-[var(--border-strong)]"
                    >
                      <span className="min-w-0">{topic.name}</span>
                      <DifficultyChip difficulty={topic.difficulty} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <SectionHeader eyebrow="Dates" title="When" />
            <dl className="mt-3 space-y-2 text-caption">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Starts</dt>
                <dd className="text-ink tnum">{event.startDate ? formatDate(event.startDate) : 'Not recorded'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-muted">Deadline</dt>
                <dd className="text-ink tnum">{event.deadlineDate ? formatDate(event.deadlineDate) : 'Not recorded'}</dd>
              </div>
            </dl>
            {!event.startDate && !event.deadlineDate && (
              <p className="mt-3 text-caption text-ink-muted">
                This entry is {eventStatusLabel(event.status).toLowerCase()} with no fixed date recorded, because the
                organiser sets it fresh each edition rather than us guessing.
              </p>
            )}
            <Divider className="my-3" />
            <p className="flex items-start gap-2 text-caption text-ink-muted">
              <CalendarDays size={14} aria-hidden className="mt-0.5 shrink-0" />
              Last checked by an editor {formatDate(event.sourceUpdatedAt)}.
            </p>
          </Card>

          <InlineAlert tone="warning" title="Not live data">
            <p>{query.data.disclaimer}</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-ink-muted">
              <CheckCircle2 size={13} aria-hidden /> This page never fetches from the organiser.
            </p>
          </InlineAlert>

          <Card>
            <SectionHeader eyebrow="Next step" title="Put it on the calendar" />
            <p className="mt-2 text-caption text-ink-secondary">
              Deadlines are only useful if something happens before them. Build the project the entry describes as a
              learning path milestone, then enter with something you can show.
            </p>
            <AnchorButton variant="secondary" size="sm" href={event.url} className="mt-3 w-full">
              <ExternalLink size={14} aria-hidden /> Read the rules
            </AnchorButton>
          </Card>
        </aside>
      </div>
    </>
  );
}
