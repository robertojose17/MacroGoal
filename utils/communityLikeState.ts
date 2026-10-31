type Section = 'feed' | 'club';

/** Coordinates reads with mutations without sharing state between Club and feed. */
export function createCommunityLikeCoordinator() {
  let scope = '';
  let identityScope = '';
  const generations = { feed: 0, club: 0 };
  const versions = { feed: 0, club: 0 };
  const reads = { feed: 0, club: 0 };
  const pending = { feed: new Set<string>(), club: new Set<string>() };
  const revisions = new Map<string, number>();
  function invalidateSection(section: Section) {
    generations[section]++;
    pending[section].clear();
    for (const key of revisions.keys()) if (key.startsWith(section + ':')) revisions.delete(key);
  }
  function invalidate() {
    invalidateSection('feed');
    invalidateSection('club');
  }
  return {
    invalidate,
    setScope(next: string, identity = next) {
      if (identityScope !== identity) {
        identityScope = identity;
        scope = next;
        invalidate();
      } else if (scope !== next) {
        scope = next;
        // Premium changes affect Club access, not this actor's Feed mutation.
        invalidateSection('club');
      }
    },
    beginRead(section: Section) {
      if (pending[section].size) return null;
      const owner = generations[section];
      const version = versions[section];
      const read = ++reads[section];
      return { current: () => generations[section] === owner && versions[section] === version
        && reads[section] === read && pending[section].size === 0 };
    },
    beginLike(section: Section, postId: string) {
      if (pending[section].has(postId)) return null;
      const owner = generations[section];
      const key = section + ':' + postId;
      const revision = (revisions.get(key) ?? 0) + 1;
      revisions.set(key, revision);
      pending[section].add(postId);
      versions[section]++;
      const current = () => generations[section] === owner && revisions.get(key) === revision;
      let finished = false;
      return {
        current,
        finish() {
          if (finished || !current()) return;
          finished = true;
          pending[section].delete(postId);
          versions[section]++;
        },
      };
    },
  };
}

/** A failed likes query is unknown state, never evidence that no posts are liked. */
export function requireCommunityLikedIds(result: { data: { post_id: string }[] | null; error: unknown }) {
  if (result.error || !Array.isArray(result.data)) throw new Error('Community likes unavailable');
  return new Set(result.data.map(row => row.post_id));
}
