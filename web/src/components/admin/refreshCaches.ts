import type { QueryClient } from '@tanstack/react-query';
import { keys } from '../../api/keys';

/** Projections a learner can look at that a content save can change. */
const LEARNER_VIEWS: readonly (readonly string[])[] = [
  ['curriculum'],
  ['courses'],
  ['lessons'],
  ['paths'],
  ['exercises'],
  ['arena'],
  ['resources'],
  ['competitions'],
  ['events'],
  ['research'],
  ['progress'],
  ['dashboard'],
  ['search']
];

/**
 * Publishing a topic moves the explore pages, the graph, the arena and the progress panel at once,
 * so staff never see a page that disagrees with the row they just edited.
 */
export function refreshContentCaches(queryClient: QueryClient) {
  for (const prefix of [keys.contentAll, keys.adminOverview, keys.adminChanges, keys.adminRevisionsAll, ...LEARNER_VIEWS]) {
    void queryClient.invalidateQueries({ queryKey: [...prefix] });
  }
}
