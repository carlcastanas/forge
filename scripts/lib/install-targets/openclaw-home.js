const { createInstallTargetAdapter } = require('./helpers');

module.exports = createInstallTargetAdapter({
  id: 'openclaw-home',
  target: 'openclaw',
  kind: 'home',
  rootSegments: ['.openclaw'],
  installStatePathSegments: ['forge-install-state.json'],
  nativeRootRelativePath: '.openclaw',
});
