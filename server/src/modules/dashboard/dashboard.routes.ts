import { Router } from 'express';
import { handler } from '../../lib/http.js';
import { getLearnerDashboard, getPublicDashboard } from './dashboard.service.js';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/',
  handler((req, res) => {
    // req.user is the session user; its id is the only identity any learner query sees.
    if (!req.user) {
      res.json(getPublicDashboard(req.db));
      return;
    }
    res.json(getLearnerDashboard(req.db, req.user.id));
  })
);
