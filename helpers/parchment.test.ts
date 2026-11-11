import assert from 'node:assert/strict'
import { test } from 'node:test'
import { POSITION_FIELD, closeFeesCollected, closedNotionals, matchQueuedFees } from './parchment'

// Offline: synthetic `objectChanges.nodes` shaped like Sui GraphQL `multiGetTransactionEffects`.
// Run with: node --test -r ts-node/register/transpile-only helpers/parchment.test.ts

const state = (positionId: string, notional: number, ppm = 40) =>
  ({ asMoveObject: { contents: { type: { repr: POSITION_FIELD }, json: { name: positionId, value: { id: positionId, notional: String(notional), close_fee_ppm: String(ppm) } } } } })
const close = (positionId: string, closeCharge: number) => ({ position_id: positionId, close_charge: String(closeCharge) })
const other = { idDeleted: false, inputState: { asMoveObject: { contents: { type: { repr: '0x2::coin::Coin<0x2::sui::SUI>' }, json: {} } } }, outputState: null }

test('full close: deleted field, closed notional is the input notional', () => {
  const changes = new Map([['tx1', [other, { idDeleted: true, inputState: state('1', 704_640_000), outputState: null }]]])
  const [r] = closedNotionals([{ event: close('1', 28_185), digest: 'tx1' }], changes)
  assert.equal(r.notional, 704_640_000n)
})

test('full close at another rate: no rate assumed', () => {
  const changes = new Map([['tx1', [{ idDeleted: true, inputState: state('7', 500_000_000, 25), outputState: null }]]])
  assert.equal(closedNotionals([{ event: close('7', 12_500), digest: 'tx1' }], changes)[0].notional, 500_000_000n)
})

test('partial close: mutated field, closed notional is input - output', () => {
  // 30% slice of 999_999_999: floor(999_999_999 * 3000 / 1e4) = 299_999_999, charge floor(299_999_999 * 40 / 1e6) = 11_999
  const changes = new Map([['tx2', [{ idDeleted: false, inputState: state('2', 999_999_999), outputState: state('2', 700_000_000) }]]])
  const [r] = closedNotionals([{ event: close('2', 11_999), digest: 'tx2' }], changes)
  assert.equal(r.notional, 299_999_999n)
})

test('partial then full close of one position in one transaction: summed, charges floored per slice', () => {
  // slices 299_999_999 (charge 11_999) and 700_000_000 (charge 28_000); floor(999_999_999 * 40 / 1e6) = 39_999
  const changes = new Map([['tx3', [{ idDeleted: true, inputState: state('3', 999_999_999), outputState: null }]]])
  const groups = closedNotionals([{ event: close('3', 11_999), digest: 'tx3' }, { event: close('3', 28_000), digest: 'tx3' }], changes)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].notional, 999_999_999n)
  assert.equal(groups[0].closes.length, 2)
})

test('two positions closed in one transaction are matched by position id', () => {
  const changes = new Map([['tx4', [
    { idDeleted: true, inputState: state('4', 100_000_000), outputState: null },
    { idDeleted: false, inputState: state('5', 200_000_000), outputState: state('5', 150_000_000) },
  ]]])
  const groups = closedNotionals([{ event: close('5', 2_000), digest: 'tx4' }, { event: close('4', 4_000), digest: 'tx4' }], changes)
  assert.deepEqual(groups.map((g) => g.notional), [50_000_000n, 100_000_000n])
})

test('fails loudly: missing position, created field, charge mismatch', () => {
  assert.throws(() => closedNotionals([{ event: close('1', 1), digest: 'tx1' }], new Map([['tx1', [other]]])), /0 prior states/)
  assert.throws(() => closedNotionals([{ event: close('1', 1), digest: 'tx1' }], new Map()), /0 prior states/)
  const created = new Map([['tx1', [{ idDeleted: false, inputState: null, outputState: state('1', 100) }]]])
  assert.throws(() => closedNotionals([{ event: close('1', 0), digest: 'tx1' }], created), /0 prior states/)
  const deleted = new Map([['tx1', [{ idDeleted: true, inputState: state('1', 704_640_000), outputState: null }]]])
  assert.throws(() => closedNotionals([{ event: close('1', 28_186), digest: 'tx1' }], deleted), /does not match/)
  const unchanged = new Map([['tx1', [{ idDeleted: false, inputState: state('1', 100_000_000), outputState: state('1', 100_000_000) }]]])
  assert.throws(() => closedNotionals([{ event: close('1', 0), digest: 'tx1' }], unchanged), /does not match/)
})

// Queued payouts and close fees, as emitted in one transaction: each queued close's enqueue comes right before its
// close fees event.
const tx = (digest: string, seq: number, event: any) => ({ event, digest, seq })
const fees = (positionId: string, closeCharge: number, winFee: number, discount = 0, lossFee = 0) =>
  ({ position_id: positionId, close_charge: String(closeCharge), win_fee: String(winFee), loss_fee: String(lossFee), referral_discount: String(discount) })
const enqueue = (positionId: string, fee: number) => ({ position_id: positionId, fee: String(fee) })

test('queued fees: matched to their own close, several closes of one position in one transaction', () => {
  const closes = [
    tx('txA', 1, fees('9', 12_000, 50_000)), // slice 1, queued (fee 50_000 + 12_000 from profit)
    tx('txA', 3, fees('9', 8_000, 30_000)), // slice 2, queued (fee 30_000 + 5_000 from profit)
    tx('txA', 4, fees('9', 20_000, 0, 0, 40_000)), // rest, losing close, not queued
    tx('txB', 1, fees('9', 4_000, 10_000)), // a later transaction: queued
    tx('txC', 0, fees('10', 4_000, 0)), // not queued
  ]
  const enqueues = [tx('txA', 0, enqueue('9', 62_000)), tx('txA', 2, enqueue('9', 35_000)), tx('txB', 0, enqueue('9', 14_000))]
  // Pass them out of order: matching uses the digest and the event index, not input order.
  assert.deepEqual(matchQueuedFees(closes, [...enqueues].reverse()), [62_000n, 35_000n, 0n, 14_000n, 0n])
})

test('queued fees: an enqueue without its close fails', () => {
  assert.throws(() => matchQueuedFees([tx('txA', 3, fees('9', 1, 0))], [tx('txA', 4, enqueue('9', 1))]), /without its close/)
  assert.throws(() => matchQueuedFees([], [tx('txA', 0, enqueue('9', 1))]), /without its close/)
})

test('close fees balance: collected now + queued + discount = everything charged', () => {
  const closes = [
    { close: fees('1', 40_000, 200_000, 2_400), queued: 0n }, // paid at once, discounted
    { close: fees('2', 40_000, 200_000, 0), queued: 230_000n }, // queued: win fee + 30_000 of the close charge
    { close: fees('3', 40_000, 200_000, 100), queued: 230_000n }, // queued, discount on the 10_000 collected now
    { close: fees('4', 40_000, 0, 7, 9_000), queued: 0n }, // losing close
  ]
  for (const { close, queued } of closes) {
    const c = closeFeesCollected(close, queued)
    for (const v of Object.values(c)) assert.ok(v >= 0n)
    const charged = BigInt(close.close_charge) + BigInt(close.win_fee) + BigInt(close.loss_fee)
    assert.equal(c.close + c.win + c.loss + queued + BigInt(close.referral_discount), charged, `position ${close.position_id}`)
  }
  assert.deepEqual(closeFeesCollected(closes[0].close, 0n), { close: 39_600n, win: 198_000n, loss: 0n })
  assert.deepEqual(closeFeesCollected(closes[2].close, 230_000n), { close: 9_900n, win: 0n, loss: 0n })
  assert.throws(() => closeFeesCollected(fees('5', 40_000, 0), 50_000n), /above the fees/)
})
