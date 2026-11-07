import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Dumbbell,
  GraduationCap,
  Lightbulb,
  ListChecks,
  Route as RouteIcon
} from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { Neighborhood, TopicDetail } from '../api/types';
import { DIFFICULTY_LABEL, formatMinutes, RELATION_LABEL } from '../lib/format';
import { PageHeader } from '../components/layout/PageHeader';
import { TopicMap } from '../components/explore/TopicMap';
import { StudyAssistant } from '../components/assistant/StudyAssistant';
import { Markdown } from '../components/content/Markdown';
import { Card, SectionHeader } from '../components/ui/Surface';
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/Feedback';
import { Chip, DifficultyChip, RelationChip } from '../components/ui/Chip';
import { LinkButton } from '../components/ui/Button';

const RELATION_ORDER = ['requires', 'unlocks', 'lateral'] as const;

export default function TopicDetailPage() {
  const { slug = '' } = useParams();
  const [depth, setDepth] = useState(1);

  const topicQuery = useQuery({
    queryKey: keys.topic(slug),
    queryFn: () => api.get<{ topic: TopicDetail }>(`/curriculum/topics/${slug}`),
    enabled: slug !== ''
  });

  const neighborhoodQuery = useQuery({
    queryKey: keys.topicNeighborhood(slug, depth),
    queryFn: () => api.get<Neighborhood>(`/curriculum/topics/${slug}/neighborhood`, { depth }),
    enabled: slug !== ''
  });

  if (topicQuery.isLoading) {
    return (
      <>
        <PageHeader title="Loading topic…" />
        <SkeletonRows rows={6} />
      </>
    );
  }
  if (topicQuery.error) {
    return (
      <ErrorState
        error={topicQuery.error}
        onRetry={() => void topicQuery.refetch()}
        title="This topic could not be loaded"
      />
    );
  }
  const topic = topicQuery.data?.topic;
  if (!topic) return null;

  const groups = RELATION_ORDER.map((direction) => ({
    direction,
    items: topic.relations.filter((relation) => relation.direction === direction)
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Explore AI', to: '/explore' },
          ...topic.breadcrumb.map((crumb) => ({
            label: crumb.name,
            to: crumb.type === 'domain' ? `/explore?domain=${crumb.slug}` : undefined
          })),
          { label: topic.name }
        ]}
        title={topic.name}
        description={topic.definition}
        actions={<DifficultyChip difficulty={topic.difficulty} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Chip icon={<Compass size={12} aria-hidden />}>{DIFFICULTY_LABEL[topic.difficulty]}</Chip>
          <Chip>{formatMinutes(topic.estMinutes)} estimated</Chip>
          {topic.tags.map((tag) => (
            <Chip key={tag} tone="neutral">
              {tag}
            </Chip>
          ))}
        </div>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[1fr_19rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <SectionHeader eyebrow="Overview" title="What this topic is" />
            <div className="prose mt-3">
              <Markdown source={topic.explanation || topic.definition} />
            </div>
          </Card>

          <ListSection icon={<ListChecks size={15} aria-hidden />} title="Learning objectives" items={topic.learningObjectives} />
          <ListSection icon={<Lightbulb size={15} aria-hidden />} title="Key results" items={topic.keyResults} />
          <ListSection icon={<GraduationCap size={15} aria-hidden />} title="Mathematical foundations" items={topic.mathFoundations} />
          <ListSection icon={<Compass size={15} aria-hidden />} title="Where it is used" items={topic.applications} />

          {topic.misconceptions.length > 0 && (
            <div className="callout pitfall">
              <span className="callout-label">Common misconceptions</span>
              <div className="callout-body">
                <ul className="list-disc space-y-1.5 pl-5">
                  {topic.misconceptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {topic.historyNote && (
            <Card variant="sunken">
              <SectionHeader eyebrow="Context" title="How this developed" />
              <div className="prose mt-2 text-caption">
                <Markdown source={topic.historyNote} />
              </div>
            </Card>
          )}

          {topic.openProblems && (
            <Card variant="sunken">
              <SectionHeader eyebrow="Honest boundary" title="What is still open" />
              <div className="prose mt-2 text-caption">
                <Markdown source={topic.openProblems} />
              </div>
              <p className="mt-3 text-caption text-ink-muted">
                Open problems are recorded as open. They are not presented as settled results.
              </p>
            </Card>
          )}

          <Card>
            <SectionHeader
              eyebrow="Prerequisites"
              title="How this topic connects"
              description="Strict prerequisites must be covered first; the rest are guidance, not gates."
            />
            {groups.length === 0 ? (
              <EmptyState
                className="mt-4"
                icon={<RouteIcon size={18} aria-hidden />}
                title="No recorded relations"
                description="This topic stands on its own in the current map."
              />
            ) : (
              <div className="mt-4 space-y-4">
                {groups.map((group) => (
                  <div key={group.direction}>
                    <h3 className="eyebrow mb-2 text-caption">
                      {group.direction === 'requires'
                        ? 'Build on these first'
                        : group.direction === 'unlocks'
                          ? 'This unlocks'
                          : 'Related'}
                    </h3>
                    <ul className="space-y-1.5">
                      {group.items.map((relation) => (
                        <li key={relation.slug} className="flex flex-wrap items-baseline gap-2">
                          <RelationChip kind={relation.kind} label={RELATION_LABEL[relation.kind]} />
                          <Link
                            to={`/explore/${relation.slug}`}
                            className="font-sans text-caption font-medium text-ink hover:text-accent-hover"
                          >
                            {relation.name}
                          </Link>
                          <span className="text-caption text-ink-muted">{DIFFICULTY_LABEL[relation.difficulty]}</span>
                          {relation.note && <span className="text-caption text-ink-secondary">{relation.note}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 border-t border-[var(--border-subtle)] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="eyebrow text-caption">Neighbourhood</h3>
                <div className="flex items-center gap-1.5" role="group" aria-label="Neighbourhood depth">
                  {[1, 2, 3].map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setDepth(level)}
                      aria-pressed={depth === level}
                      className={`tnum cursor-pointer rounded-input border px-2 py-0.5 text-caption transition-colors ${
                        depth === level
                          ? 'border-accent bg-accent-soft text-accent-hover'
                          : 'border-line bg-raised text-ink-secondary hover:bg-sunken'
                      }`}
                    >
                      {level} hop{level === 1 ? '' : 's'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                {neighborhoodQuery.isLoading ? (
                  <SkeletonRows rows={3} />
                ) : neighborhoodQuery.error ? (
                  <ErrorState error={neighborhoodQuery.error} onRetry={() => void neighborhoodQuery.refetch()} />
                ) : neighborhoodQuery.data ? (
                  <TopicMap
                    nodes={neighborhoodQuery.data.nodes}
                    edges={neighborhoodQuery.data.edges}
                    centerSlug={neighborhoodQuery.data.center}
                  />
                ) : null}
              </div>
            </div>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[calc(var(--topbar-height)+1rem)] lg:self-start">
          <Card>
            <SectionHeader eyebrow="Study" title="Lessons on this topic" />
            {topic.lessons.length === 0 ? (
              <p className="mt-3 text-caption text-ink-muted">
                No lesson covers this topic yet. It is mapped in the curriculum and waiting for content.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {topic.lessons.map((lesson) => (
                  <li key={lesson.slug}>
                    <Link
                      to={`/lessons/${lesson.slug}`}
                      className="flex items-start gap-2 rounded-input px-1.5 py-1 transition-colors hover:bg-sunken"
                    >
                      <BookOpen size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                      <span className="min-w-0">
                        <span className="block font-sans text-caption font-medium text-ink">{lesson.title}</span>
                        <span className="tnum block text-caption text-ink-muted">
                          {lesson.courseTitle} · {formatMinutes(lesson.estMinutes)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionHeader eyebrow="Practise" title="Exercises" />
            {topic.exercises.length === 0 ? (
              <p className="mt-3 text-caption text-ink-muted">No graded exercise is attached to this topic yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {topic.exercises.map((exercise) => (
                  <li key={exercise.slug}>
                    <Link
                      to={`/arena/${exercise.slug}`}
                      className="flex items-start gap-2 rounded-input px-1.5 py-1 transition-colors hover:bg-sunken"
                    >
                      <Dumbbell size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                      <span className="min-w-0">
                        <span className="block font-sans text-caption font-medium text-ink">{exercise.title}</span>
                        <span className="block text-caption text-ink-muted">
                          {DIFFICULTY_LABEL[exercise.difficulty]} · {exercise.kind.replace('_', ' ')}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <LinkButton to="/arena" variant="ghost" size="sm" className="mt-3">
              Open Problem Arena <ArrowRight size={14} aria-hidden />
            </LinkButton>
          </Card>

          <StudyAssistant context={{ kind: 'topic', slug: topic.slug }} entryTitle={topic.name} />

          {topic.relatedPaths.length > 0 && (
            <Card>
              <SectionHeader eyebrow="Goals" title="Appears in paths" />
              <ul className="mt-3 space-y-1.5">
                {topic.relatedPaths.map((path) => (
                  <li key={path.slug}>
                    <Link to={`/paths/${path.slug}`} className="font-sans text-caption text-ink hover:text-accent-hover">
                      {path.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {topic.resources.length > 0 && (
            <Card>
              <SectionHeader eyebrow="Library" title="Saved resources" />
              <ul className="mt-3 space-y-2">
                {topic.resources.map((resource) => (
                  <li key={resource.slug}>
                    <Link
                      to={`/resources/${resource.slug}`}
                      className="block font-sans text-caption font-medium text-ink hover:text-accent-hover"
                    >
                      {resource.title}
                    </Link>
                    <p className="text-caption text-ink-muted">
                      {resource.type}
                      {resource.authors ? ` · ${resource.authors}` : ''}
                      {resource.year ? ` · ${resource.year}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {topic.furtherReading.length > 0 && (
            <Card>
              <SectionHeader
                eyebrow="Sources"
                title="Further reading"
                description="Cited works behind this topic. Entries without a verifiable source are not listed."
              />
              <ul className="mt-3 space-y-2.5">
                {topic.furtherReading.map((entry, index) => (
                  <li key={index} className="text-caption">
                    {entry.url ? (
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-ink underline decoration-dotted hover:text-accent-hover"
                      >
                        {entry.title}
                      </a>
                    ) : (
                      <span className="font-medium text-ink">{entry.title}</span>
                    )}
                    <p className="text-ink-muted">
                      {[entry.authors, entry.year ? String(entry.year) : null, entry.type].filter(Boolean).join(' · ')}
                    </p>
                    {entry.note && <p className="text-ink-secondary">{entry.note}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function ListSection({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <SectionHeader eyebrow="Detail" title={title} actions={<span className="text-ink-muted">{icon}</span>} />
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-body text-ink-secondary">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Card>
  );
}
