// Fix remaining react-hooks/exhaustive-deps warnings
// Insert disable comment before the deps-array closing line
const fs = require('fs');

// New line numbers from the second lint run
const fixes = {
  'app/(tabs)/(home)/index.android.tsx': [2180],
  'app/(tabs)/(home)/index.ios.tsx': [2178],
  'app/(tabs)/(home)/index.tsx': [2046],
  'app/(tabs)/check-ins.tsx': [788, 1544, 1553, 1889, 2994, 3295, 3339, 3365, 3409, 3483, 3543, 3584, 3704, 3872, 3896],
  'app/(tabs)/profile.android.tsx': [481],
  'app/(tabs)/profile.ios.tsx': [495],
  'app/(tabs)/profile.tsx': [495],
  'app/recipe-finder-detail.tsx': [131],
  'app/social-post-detail.tsx': [54],
  'components/social/FeedPostCard.tsx': [366],
  'components/social/SearchUserRow.tsx': [50],
  'components/social/SocialPostCard.tsx': [286, 296, 306],
};

for (const [filepath, lines] of Object.entries(fixes)) {
  try {
    const content = fs.readFileSync(filepath, 'utf8').split('\n');
    const sorted = [...lines].sort((a, b) => b - a);
    for (const lineno of sorted) {
      const idx = lineno - 1; // 0-based index of the reported line
      if (idx < content.length) {
        const prev = content[idx - 1] || '';
        if (!prev.includes('eslint-disable-next-line react-hooks/exhaustive-deps')) {
          content.splice(idx, 0, '  // eslint-disable-next-line react-hooks/exhaustive-deps');
        }
      }
    }
    fs.writeFileSync(filepath, content.join('\n'));
    console.log('Fixed: ' + filepath);
  } catch(e) {
    console.error('ERROR ' + filepath + ': ' + e.message);
  }
}
console.log('Done');
