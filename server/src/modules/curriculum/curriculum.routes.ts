import { Router } from 'express';
import { z } from 'zod';
import { handler, ApiError, param, queryInt } from '../../lib/http.js';
import { paginationSchema, difficultySchema } from '../../lib/domain.js';
import {
  buildGraph,
  buildNeighborhood,
  getDomainTree,
  getTopicBySlug,
  listDomains,
  listTopics
} from './curriculum.repo.js';

export const curriculumRouter = Router();

const canSeeDrafts = (req: { user?: { role?: string } }) =>
  req.user !== undefined && (req.user.role === 'admin' || req.user.role === 'author');

curriculumRouter.get(
  '/domains',
  handler((req, res) => {
    res.json({ domains: listDomains(req.db, canSeeDrafts(req)) });
  })
);

curriculumRouter.get(
  '/domains/:slug',
  handler((req, res) => {
    const tree = getDomainTree(req.db, param(req, 'slug'), canSeeDrafts(req));
    if (!tree) throw ApiError.notFound(`Unknown domain "${param(req, 'slug')}"`);
    res.json(tree);
  })
);

curriculumRouter.get(
  '/topics',
  handler((req, res) => {
    const query = paginationSchema
      .extend({
        domain: z.string().trim().max(96).optional(),
        subdomain: z.string().trim().max(96).optional(),
        difficulty: difficultySchema.or(z.literal('all')).default('all'),
        q: z.string().trim().max(120).default(''),
        status: z.enum(['published', 'all']).default('published')
      })
      .parse(req.query);
    const status = query.status === 'all' && !canSeeDrafts(req) ? 'published' : query.status;
    const { topics, total } = listTopics(req.db, {
      domain: query.domain,
      subdomain: query.subdomain,
      difficulty: query.difficulty,
      q: query.q,
      status,
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage
    });
    res.json({
      topics,
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage))
    });
  })
);

curriculumRouter.get(
  '/topics/:slug',
  handler((req, res) => {
    const topic = getTopicBySlug(req.db, param(req, 'slug'), canSeeDrafts(req));
    if (!topic) throw ApiError.notFound(`Unknown topic "${param(req, 'slug')}"`);
    res.json({ topic });
  })
);

curriculumRouter.get(
  '/graph',
  handler((req, res) => {
    const query = z
      .object({ domain: z.string().trim().max(96).optional(), subdomain: z.string().trim().max(96).optional() })
      .parse(req.query);
    res.json(buildGraph(req.db, query));
  })
);

curriculumRouter.get(
  '/topics/:slug/neighborhood',
  handler((req, res) => {
    const depth = queryInt(req, 'depth', 1, 1, 3);
    const graph = buildNeighborhood(req.db, param(req, 'slug'), depth);
    if (!graph.center) throw ApiError.notFound(`Unknown topic "${param(req, 'slug')}"`);
    res.json(graph);
  })
);

curriculumRouter.get(
  '/stats',
  handler((req, res) => {
    const row = req.db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM domains) AS domains,
           (SELECT COUNT(*) FROM subdomains) AS subdomains,
           (SELECT COUNT(*) FROM topics WHERE status = 'published') AS topics,
           (SELECT COUNT(*) FROM topic_relations) AS relations,
           (SELECT COUNT(*) FROM courses WHERE status = 'published') AS courses,
           (SELECT COUNT(*) FROM lessons WHERE status = 'published') AS lessons,
           (SELECT COUNT(*) FROM exercises WHERE status = 'published') AS exercises,
           (SELECT COUNT(*) FROM resources WHERE status = 'published') AS resources,
           (SELECT COUNT(*) FROM learning_paths WHERE status = 'published') AS paths,
           (SELECT COUNT(*) FROM competitions WHERE status IN ('upcoming','open','ongoing','recurring')) AS events`
      )
      .get() as Record<string, number>;
    res.json(row);
  })
);
