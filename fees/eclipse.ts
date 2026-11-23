import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { httpPost } from "../utils/fetchURL";

// The previous source, the EclipseScan network-fees API (api.eclipsescan.xyz), was discontinued in late Oct 2026:
// eclipsescan.xyz shows "Service Discontinued" and the API host no longer resolves. Last stored day: 2026-10-23.
// Its series also counted the sequencer's own vote fees (~245k slots/day x 50 lamports, ~97% of its total), which are not user fees.
// The official RPC keeps only ~5 days of ledger, so windows older than that cannot be refilled.
const RPC = 'https://mainnetbeta-rpc.eclipse.xyz'

// Eclipse runs a single sequencer: getVoteAccounts lists one validator with this identity (vote account Fuwdpk6BQq6hPsEWPtmvyujchKYAb6gMA7Z9rKezuoxS).
// It receives 100% of transaction fees, base and priority, with no burn: every block's `rewards` holds one 'Fee' reward to this identity with its postBalance.
// It also pays the 50-lamport fee of its own vote transaction in every slot and gets it back in the same block's fee reward,
// so its balance grows only by the fees users pay. Checked 2026-11-08 over slots 200112400-200113100: 17 user txs paid 260,850 lamports,
// equal to the balance change, and the identity sent no transaction other than its votes.
const SEQUENCER = '7jtuen1N95bBNyAV5dbcx6enYT24qKqHobyHQZnyRoTD'
const LAMPORTS_PER_ETH = 1e9 // the Eclipse gas token is bridged ETH with 9 decimals

// JSON-RPC errors for a slot with no block: block not available (-32004), slot skipped (-32007), missing in long-term storage (-32009)
const NO_BLOCK_ERROR_CODES = [-32004, -32007, -32009]

async function rpc(method: string, params: any[] = [], { allowNoBlock = false } = {}) {
  const res = await httpPost(RPC, { jsonrpc: '2.0', id: 1, method, params })
  if (res.error) {
    if (allowNoBlock && NO_BLOCK_ERROR_CODES.includes(res.error.code)) return null
    throw new Error(`Eclipse RPC ${method} ${JSON.stringify(params)} failed: ${JSON.stringify(res.error)}`)
  }
  return res.result
}

// block time of `slot`, or of the next produced slot when `slot` has no block
async function getSlotTime(slot: number): Promise<number> {
  const time = await rpc('getBlockTime', [slot], { allowNoBlock: true })
  if (time !== null) return time
  const [next] = await rpc('getBlocksWithLimit', [slot, 1])
  if (next === undefined) throw new Error(`Eclipse: no produced block at or after slot ${slot}`)
  return rpc('getBlockTime', [next])
}

// last produced slot whose block time is before `timestamp`
async function getLastSlotBefore(timestamp: number, firstSlot: number, lastSlot: number): Promise<number> {
  const iso = new Date(timestamp * 1000).toISOString()
  if (await getSlotTime(firstSlot) >= timestamp) throw new Error(`Eclipse: the RPC ledger starts at slot ${firstSlot} and no longer holds blocks before ${iso}`)
  if (await getSlotTime(lastSlot) < timestamp) throw new Error(`Eclipse: no finalized block at or after ${iso} yet`)
  let lo = firstSlot // block time < timestamp
  let hi = lastSlot // block time >= timestamp
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (await getSlotTime(mid) < timestamp) lo = mid
    else hi = mid
  }
  return lo
}

// sequencer balance (lamports) after the last block at or before `slot` that paid fees
async function getSequencerBalance(slot: number): Promise<number> {
  for (let s = slot; s > slot - 100; s--) {
    const block = await rpc('getBlock', [s, { transactionDetails: 'none', rewards: true, maxSupportedTransactionVersion: 0 }], { allowNoBlock: true })
    if (!block) continue
    const feeRewards = (block.rewards ?? []).filter((r: any) => r.rewardType === 'Fee')
    if (!feeRewards.length) continue // no transactions in this block, so the balance did not change
    if (feeRewards.length > 1 || feeRewards[0].pubkey !== SEQUENCER)
      throw new Error(`Eclipse: slot ${s} paid fee rewards to ${feeRewards.map((r: any) => r.pubkey).join(', ')}, not the known sequencer`)
    return feeRewards[0].postBalance
  }
  throw new Error(`Eclipse: no fee-paying block found in the 100 slots up to ${slot}`)
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  const firstSlot: number = await rpc('getFirstAvailableBlock')
  const lastSlot: number = await rpc('getSlot', [{ commitment: 'finalized' }])
  const startSlot = await getLastSlotBefore(options.startTimestamp, firstSlot, lastSlot)
  const endSlot = await getLastSlotBefore(options.endTimestamp, startSlot, lastSlot)

  const fees = (await getSequencerBalance(endSlot)) - (await getSequencerBalance(startSlot))
  // fees only ever add to the balance, so a drop means the sequencer moved funds out and this window cannot be read from it
  if (fees < 0) throw new Error(`Eclipse: sequencer balance fell by ${-fees} lamports between slots ${startSlot} and ${endSlot}`)

  dailyFees.addCGToken('ethereum', fees / LAMPORTS_PER_ETH, METRIC.TRANSACTION_GAS_FEES)

  return { dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ECLIPSE],
  start: "2024-07-29",
  protocolType: ProtocolType.CHAIN,
  skipBreakdownValidation: true,
  methodology: {
    Fees: "Transaction fees (base + priority) paid by users on the Eclipse network, all of which go to its single sequencer. Excludes the sequencer's own vote transactions, whose fees it pays to itself.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: "Base and priority fees paid by users for transactions.",
    },
  },
};

export default adapter;
