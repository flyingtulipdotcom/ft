These PNPM patches keep legacy tooling compatible with the pinned security releases.
They apply only to the named consumer versions; they do not change the security packages.

- Mocha 10 (used by Hardhat) and eslint-plugin-import use minimatch 11's named
  function. The import rule's removed `makeRe` calls use `Minimatch.match` so they
  retain the nonrecursive matcher rather than rebuilding vulnerable regexes.
- Both legacy rimraf versions and sc-istanbul use Glob 14's promise API and pass
  results or errors to their existing callbacks.

Run `pnpm test:tooling` after a frozen install. It tests file discovery, exclusions,
cleanup callbacks, and both accepted and rejected lint patterns without compilation
or RPC access. Remove each patch only when that consumer supports these APIs itself.

The legacy Axios override must remain at least 0.34.0. Version 0.33.0 introduces
GHSA-9fr6-4gfg-395g and GHSA-x97p-jq2g-jp4f relative to the old 0.21 line.
The tooling test uses an offline adapter and form serializer to verify both fixes
through Hardhat Deploy's actual Axios dependency.
