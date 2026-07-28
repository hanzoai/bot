#!/usr/bin/env node
// Applies the Hanzo Bot brand to an upstream (openclaw) tree.
//
// The fork carries three orthogonal layers: upstream content, this brand
// transform, and our own files. Keeping them separate is what makes a sync
// `git merge pristine/main && node scripts/rebrand.mjs` instead of a
// thousand-conflict merge. The transform is idempotent — running it on an
// already-branded tree is a no-op.
//
//   node scripts/rebrand.mjs [--check]
//
// --check exits 1 if anything would change, for CI.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, lstatSync } from 'node:fs'

// Ordered: the most specific pattern has to win before a broader one eats it.
const RULES = [
  [/@openclaw\//g, '@hanzo/bot-'],
  [/openclaw\/openclaw/g, 'hanzoai/bot'],
  [/OPENCLAW/g, 'BOT'],
  [/OpenClaw/g, 'Bot'],
  [/Openclaw/g, 'Bot'],
  [/openClaw/g, 'bot'],
  [/openclaw/g, 'bot'],
]

// Upstream publishes these to npm and we do not republish them, so the import
// has to keep pointing at upstream's package. Every other @openclaw/* name is
// either a workspace package (which we do rebuild as @hanzo/bot-*) or a
// synthetic fixture name, and both are safe to rename.
const PRESERVE = [
  '@openclaw/crabline',
  '@openclaw/fs-safe',
  '@openclaw/libterminal',
  '@openclaw/proxyline',
  '@openclaw/uirouter',
]

const SKIP = [
  // These state the brand mapping literally, so running the transform over
  // them rewrites the mapping into identity no-ops — silently disarming every
  // future sync in the script's case, and corrupting the explanation in the
  // doc's. Neither is upstream content; both are already ours.
  /^scripts\/rebrand\.mjs$/,
  /^LLM\.md$/,
  // Upstream's licence and attributions name upstream. Rebranding them would
  // be a false claim of authorship, and patches/ targets third-party packages
  // by their real names.
  /^LICENSE$/,
  /^THIRD_PARTY_NOTICES\.md$/,
  /^patches\//,
]

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 })

const isBinary = (buf) => buf.subarray(0, 8192).includes(0)

// Restoring the preserved names after the fact keeps one ordered rule list
// instead of threading exceptions through every pattern.
const RESTORE = PRESERVE.map((name) => [
  new RegExp(name.replace('@openclaw/', '@hanzo/bot-'), 'g'),
  name,
])

const brand = (s) => {
  const branded = RULES.reduce((acc, [re, to]) => acc.replace(re, to), s)
  return RESTORE.reduce((acc, [re, to]) => acc.replace(re, to), branded)
}

// Upstream's root package is the unscoped `openclaw`, so dependents name it
// `"openclaw": "workspace:*"`. Ours is `@hanzo/bot`, and the text rules alone
// would leave those pointing at a package that does not exist. Only the
// dependency blocks may be rewritten: a package.json also carries a top-level
// `openclaw` block, which is the plugin manifest namespace and correctly
// becomes `bot`. Telling those apart needs the parse.
const DEP_BLOCKS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'peerDependenciesMeta',
]

const brandPackageJson = (text) => {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return text // fixtures include deliberately malformed manifests
  }
  let touched = false
  for (const block of DEP_BLOCKS) {
    const deps = parsed[block]
    if (!deps || typeof deps !== 'object' || !('bot' in deps)) continue
    // Rebuild in place so the key keeps its position and the diff stays small.
    parsed[block] = Object.fromEntries(
      Object.entries(deps).map(([k, v]) => [k === 'bot' ? '@hanzo/bot' : k, v]),
    )
    touched = true
  }
  return touched ? `${JSON.stringify(parsed, null, 2)}\n` : text
}

// `src/` imports a handful of workspace packages without declaring them.
// Upstream gets away with that because it publishes every @openclaw/* to npm,
// so the phantom import resolves off the registry. We do not publish
// @hanzo/bot-*, so the same import resolves to nothing and only shows up at
// runtime — the bundler is fine, because it goes through tsconfig paths.
// Deriving the list rather than pinning it means a sync that adds another
// phantom import heals itself.
const declarePhantomWorkspaceDeps = (workspaceNames) => {
  const imported = new Set()
  const src = git('ls-files', '-z', 'src').split('\0').filter(Boolean)
  for (const file of src) {
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    // Import positions only. A bare quoted "@hanzo/bot-discord" is usually a
    // plugin id or a fixture name, not an edge that has to resolve.
    const pattern = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["'](@hanzo\/bot-[a-z0-9-]+)(?:\/[^"']*)?["']/g
    for (const m of text.matchAll(pattern)) {
      if (workspaceNames.has(m[1])) imported.add(m[1])
    }
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const declared = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ])
  const missing = [...imported].filter((n) => !declared.has(n)).sort()
  if (!missing.length) return []
  pkg.dependencies = Object.fromEntries(
    [...Object.entries(pkg.dependencies || {}), ...missing.map((n) => [n, 'workspace:*'])].sort(
      ([a], [b]) => a.localeCompare(b),
    ),
  )
  if (!check) writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`)
  return missing
}

const check = process.argv.includes('--check')
const files = git('ls-files', '-z')
  .split('\0')
  .filter(Boolean)
  .filter((f) => !SKIP.some((re) => re.test(f)))

let edited = 0

for (const file of files) {
  let st
  try {
    st = lstatSync(file)
  } catch {
    continue // ls-files can name a path a concurrent checkout removed
  }
  // lstat, not stat: CLAUDE.md -> AGENTS.md -> LLM.md is a symlink chain, and
  // following it would rewrite the same target once per link.
  if (!st.isFile()) continue

  const buf = readFileSync(file)
  if (isBinary(buf)) continue

  const before = buf.toString('utf8')
  let after = brand(before)
  if (file === 'package.json' || file.endsWith('/package.json')) {
    after = brandPackageJson(after)
  }
  if (after !== before) {
    edited++
    if (!check) writeFileSync(file, after)
  }
}

// Paths carry the brand too (.agents/skills/openclaw-debugging/…). Rename
// deepest-first so renaming a parent cannot invalidate a child's path.
const moves = files
  .map((f) => [f, brand(f)])
  .filter(([from, to]) => from !== to)
  .sort((a, b) => b[0].split('/').length - a[0].split('/').length)

if (!check) {
  for (const [from, to] of moves) {
    const dir = to.split('/').slice(0, -1).join('/')
    if (dir) execFileSync('mkdir', ['-p', dir])
    git('mv', '-f', from, to)
  }
}

const workspaceNames = new Set(
  files
    .filter((f) => f.endsWith('package.json') && f !== 'package.json')
    .map((f) => {
      try {
        return JSON.parse(readFileSync(f, 'utf8')).name
      } catch {
        return null
      }
    })
    .filter(Boolean),
)
const declared = declarePhantomWorkspaceDeps(workspaceNames)

console.log(
  check
    ? `rebrand --check: ${edited} file(s), ${moves.length} path(s), ${declared.length} dep(s) would change`
    : `rebrand: ${edited} file(s) rewritten, ${moves.length} path(s) renamed, ${declared.length} workspace dep(s) declared`,
)
if (declared.length) console.log(`  declared: ${declared.join(', ')}`)

if (check && (edited || moves.length || declared.length)) process.exit(1)
