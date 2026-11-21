import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql, getSqlFromFile } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";
import { fetchURLAutoHandleRateLimit } from "../utils/fetchURL";

const RELAY_API = 'https://boost-relay.flashbots.net/relay/v1/data/bidtraces/proposer_payload_delivered'
const BEACON_GENESIS = 1606824023 // slot 0 timestamp, 12s slots
const PAGE_SIZE = 200 // largest limit the relay accepts

// hashes of the blocks the Flashbots relay delivered in the window; matched by hash because the relay
// also lists payloads for slots the proposer missed, whose block number then belongs to another block
async function getFlashbotsRelayBlockHashes(options: FetchOptions): Promise<string[]> {
  const firstSlot = Math.ceil((options.startTimestamp - BEACON_GENESIS) / 12)
  const lastSlot = Math.floor((options.endTimestamp - 1 - BEACON_GENESIS) / 12)
  const hashes = new Set<string>()
  let cursor = lastSlot
  while (true) {
    const page = await fetchURLAutoHandleRateLimit(`${RELAY_API}?limit=${PAGE_SIZE}&cursor=${cursor}`)
    if (!Array.isArray(page)) throw new Error('Flashbots relay API returned no payload list')
    let minSlot = cursor
    for (const p of page) {
      const slot = Number(p.slot)
      if (slot < minSlot) minSlot = slot
      if (slot >= firstSlot && slot <= lastSlot) hashes.add(String(p.block_hash).toLowerCase())
    }
    if (page.length < PAGE_SIZE || minSlot < firstSlot) break
    cursor = minSlot - 1
  }
  if (!hashes.size) throw new Error('Flashbots relay API returned no delivered payloads for the day')
  return [...hashes]
}

const fetch = async (options: FetchOptions) => {
  // Workaround for dune indexing issue
  const now = Date.now()
  const tenHoursAgo = now - (10 * 60 * 60 * 1000)
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
      console.log("End timestamp is less than 10 hours ago, skipping fetch due to dune indexing delay", new Date(options.toTimestamp * 1000).toISOString(), new Date(tenHoursAgo).toISOString())
      throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay")
  }

  const dailyFees = options.createBalances()
  const blockHashes = await getFlashbotsRelayBlockHashes(options)

  // https://dune.com/queries/4742045
  const sql = getSqlFromFile('helpers/queries/flashbots.sql', {
    start: options.startTimestamp,
    end: options.endTimestamp,
    blocks: blockHashes.join(','),
  });

  const res = await queryDuneSql(options, sql);

  const dayItem = res[0]
  if (!dayItem || dayItem.cum_proposer_revenue == null ) {
    throw new Error('Dune query returned no results');
  }

  dailyFees.addGasToken((dayItem.cum_proposer_revenue) * 1e18 || 0, METRIC.MEV_REWARDS)

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true, // the same ETH is in Ethereum's transaction fees and in staking listings' execution-layer rewards
  methodology: {
    Fees: 'ETH paid to block proposers for the blocks delivered by the Flashbots MEV-Boost relay.',
    Revenue: 'Flashbots gets no fees share.',
    SupplySideRevenue: 'All ETH paid to block proposers for the blocks delivered by the Flashbots relay.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MEV_REWARDS]: "ETH paid to block proposers in blocks delivered by the Flashbots relay: the builder's end-of-block payment to the proposer, or, when the proposer is the fee recipient, the block's priority fees plus direct ETH transfers to it.",
    },
    SupplySideRevenue: {
      [METRIC.MEV_REWARDS]: "All ETH paid to block proposers in blocks delivered by the Flashbots relay: the builder's end-of-block payment to the proposer, or, when the proposer is the fee recipient, the block's priority fees plus direct ETH transfers to it.",
    },
  },
}

export default adapter;
