import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Clock, Layers, Star } from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { CoursePage, Difficulty } from '../api/types';
import { DIFFICULTY_LABEL, DIFFICULTY_ORDER, formatHours, percent } from '../lib/format';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Surface';
import { EmptyState, ErrorState, SkeletonCard } from '../components/ui/Feedback';
import { DifficultyChip } from '../components/ui/Chip';
import { SearchInput, Select } from '../components/ui/Field';
import { Pagination } from '../components/ui/Pagination';
import { ProgressBar } from '../components/ui/Progress';
import { LinkButton } from '../components/ui/Button';

type DifficultyFilter = Difficulty | 'all';

export default function CoursesPage() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all');
  const [featured, setFeatured] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);

  const filters = { q: search, difficulty, featured, page, perPage };
  const query = useQuery({
    queryKey: keys.courses(filters),
    queryFn: () => api.get<CoursePage>('/courses', filters),
    placeholderData: (previous) => previous
  });

  const courses = query.data?.courses ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Courses"
        title="Structured courses"
        description="Each course is a sequence of written lessons with derivations, worked examples and graded exercises — stored as content in this application, not generated per request."
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <form
          className="min-w-56 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(q.trim());
            setPage(1);
          }}
        >
          <SearchInput
            ariaLabel="Search courses"
            value={q}
            placeholder="Search by title, summary or author…"
            onValueChange={setQ}
          />
        </form>
        <Select
          aria-label="Filter by difficulty"
          value={difficulty}
          onChange={(event) => {
            setDifficulty(event.target.value as DifficultyFilter);
            setPage(1);
          }}
          className="w-44"
        >
          <option value="all">All difficulties</option>
          {DIFFICULTY_ORDER.map((level) => (
            <option key={level} value={level}>
              {DIFFICULTY_LABEL[level]}
            </option>
          ))}
        </Select>
        <label className="flex cursor-pointer items-center gap-2 pb-2 font-sans text-caption text-ink-secondary">
          <input
            type="checkbox"
            checked={featured}
            onChange={(event) => {
              setFeatured(event.target.checked);
              setPage(1);
            }}
            className="size-4 accent-[var(--accent)]"
          />
          Featured only
        </label>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonCard key={index} lines={4} />
          ))}
        </div>
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : courses.length === 0 ? (
        <EmptyState
          title="No courses match those filters"
          description="Try a different search term, or clear the difficulty and featured filters."
          action={
            <LinkButton
              to="/courses"
              variant="secondary"
              onClick={() => {
                setQ('');
                setSearch('');
                setDifficulty('all');
                setFeatured(false);
                setPage(1);
              }}
            >
              Clear filters
            </LinkButton>
          }
        />
      ) : (
        <>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => (
              <li key={course.slug}>
                <Card as="article" variant="interactive" className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-h4 font-semibold text-ink">
                      <Link to={`/courses/${course.slug}`} className="transition-colors hover:text-accent-hover">
                        {course.title}
                      </Link>
                    </h2>
                    {course.isFeatured && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-accent-soft px-2 py-0.5 text-caption font-medium text-accent-hover">
                        <Star size={12} aria-hidden /> Featured
                      </span>
                    )}
                  </div>
                  {course.subtitle && <p className="text-caption text-ink-muted">{course.subtitle}</p>}
                  <p className="line-clamp-3 text-body text-ink-secondary">{course.summary}</p>

                  <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-muted">
                    <div className="flex items-center gap-1.5">
                      <Clock size={13} aria-hidden /> <dd className="tnum">{formatHours(course.estHours)}</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <BookOpen size={13} aria-hidden /> <dd className="tnum">{course.lessonCount} lessons</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Layers size={13} aria-hidden /> <dd className="tnum">{course.moduleCount} modules</dd>
                    </div>
                  </dl>

                  <div className="mt-auto space-y-2 pt-1">
                    <DifficultyChip difficulty={course.difficulty} />
                    {course.enrolled ? (
                      <>
                        <ProgressBar value={course.progress} label={`${course.title} progress`} size="sm" />
                        <div className="flex items-center justify-between gap-2">
                          <span className="tnum text-caption text-ink-muted">
                            {course.completedLessons}/{course.lessonCount} lessons · {percent(course.progress)}
                          </span>
                          {course.nextLessonSlug ? (
                            <LinkButton to={`/lessons/${course.nextLessonSlug}`} size="sm">
                              Continue <ArrowRight size={14} aria-hidden />
                            </LinkButton>
                          ) : (
                            <span className="rounded-input border border-line bg-sunken px-2.5 py-1 text-caption font-medium text-ink-muted">
                              Finished
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <LinkButton to={`/courses/${course.slug}`} variant="secondary" size="sm">
                        View course
                      </LinkButton>
                    )}
                    <p className="truncate text-caption text-ink-muted">By {course.author}</p>
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {query.data && (
            <Pagination
              className="mt-6"
              page={query.data.page}
              totalPages={query.data.totalPages}
              total={query.data.total}
              perPage={query.data.perPage}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
            />
          )}
        </>
      )}
    </>
  );
}
