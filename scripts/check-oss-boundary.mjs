#!/usr/bin/env node
/**
 * Architectural boundary check (hanzoai/bot#98):
 * Ensures the public OSS `hanzoai/bot` repository never depends on private
 * `hanzo-inc/*` packages or commercial product-only internals.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const pkgPath = join(ROOT, 'package.json')
const violations = []

if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = pkg[field] ?? {}
    for (const [name, spec] of Object.entries(deps)) {
      if (name.startsWith('@hanzo-inc/') || String(spec).includes('hanzo-inc/')) {
        violations.push(`package.json ${field}.${name}: ${spec} references private hanzo-inc`)
      }
    }
  }
}

if (violations.length > 0) {
  console.error('OSS boundary check failed (hanzoai/bot#98):')
  for (const v of violations) console.error('  -', v)
  process.exit(1)
}
console.log('hanzoai/bot OSS boundary check passed (0 private hanzo-inc dependencies).')
