import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { FetchOptions } from '../adapters/types'
import { queryDune } from './dune'

// Live test; executes a small bounded query and consumes Dune credits.
// Run with:
// DUNE_API_KEYS='<your-dune-api-key>' node --test -r ts-node/register/transpile-only helpers/dune.test.ts

// One row above the requested 100,000-row page limit proves that pagination ran.
const EXPECTED_ROWS = 100_001

test('downloads every page of a live Dune result', { timeout: 180_000 }, async () => {
  assert.ok(process.env.DUNE_API_KEYS, 'DUNE_API_KEYS must be set to run this live test')

  const rows = await queryDune('3996608', {
    fullQuery: `
      SELECT number AS n
      FROM ethereum.blocks
      WHERE number BETWEEN 1 AND ${EXPECTED_ROWS}
      ORDER BY number
    `,
  }, {} as FetchOptions)

  assert.equal(rows.length, EXPECTED_ROWS)
  assert.equal(Number(rows[0].n), 1)
  assert.equal(Number(rows[EXPECTED_ROWS - 1].n), EXPECTED_ROWS)
})
