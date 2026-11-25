import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// https://stellar.curve.finance/dex/stellar/pools
// StableSwap factory: every pool is registered under a permanent 0-based index (pool_count / pool_registration)
const FACTORY = "CC2DWZ5RDSC5BZKEDQ5BABNUATX5EFJ4GCOENDXULEDVBHH2OKXFKYS5";

const LIQUIDITY_FEES = "Liquidity Imbalance Fees";
const EVENTS_PAGE_SIZE = 200;
// getEvents takes at most 5 contract ids per filter
const POOLS_PER_REQUEST = 5;
// ledgers close about every 5s; dividing by less starts the scan a little early, never late
const MIN_LEDGER_SECONDS = 4;

const { stellar } = sdk.chains;

async function getPools() {
  const poolCount = Number(await stellar.callSoroban({ contractId: FACTORY, method: "pool_count" }));
  const pools: Record<string, string[]> = {};
  for (let i = 0; i < poolCount; i++) {
    const registration: any = await stellar.callSoroban({ contractId: FACTORY, method: "pool_registration", args: [i] }).catch(() => null);
    if (registration?.pool) pools[registration.pool] = registration.coins;
  }
  return pools;
}

// The Soroban RPC only keeps about a week of ledgers. A window that starts before the oldest kept ledger cannot be
// read in full, so it fails instead of being reported with part of its events missing.
async function getStartLedger(startTimestamp: number) {
  const { latestLedger, latestLedgerCloseTime, oldestLedger, oldestLedgerCloseTime } = await stellar.sorobanRpc("getHealth");
  const estimate = latestLedger - Math.ceil((Number(latestLedgerCloseTime) - startTimestamp) / MIN_LEDGER_SECONDS);
  if (estimate >= oldestLedger) return Math.min(estimate, latestLedger);
  if (!Number(oldestLedgerCloseTime) || Number(oldestLedgerCloseTime) > startTimestamp)
    throw new Error(`curve-stellar: window starts before the oldest ledger the Soroban RPC keeps (${oldestLedger}), events are gone`);
  return oldestLedger;
}

// event cursors are "<toid>-<index>", the ledger sequence is the high 32 bits of the toid
const cursorLedger = (cursor: string) => Number(BigInt(String(cursor).split("-")[0]) >> 32n);

async function getPoolEvents(pools: string[], startLedger: number, startTimestamp: number, endTimestamp: number) {
  const events: any[] = [];
  for (let i = 0; i < pools.length; i += POOLS_PER_REQUEST) {
    const filters = [{ type: "contract", contractIds: pools.slice(i, i + POOLS_PER_REQUEST) }];
    let params: any = { startLedger, filters, pagination: { limit: EVENTS_PAGE_SIZE } };
    // one request scans a limited span of ledgers (10,000) and returns a cursor at the end of it, so a short or
    // empty page is not the end: keep following the cursor until it passes the window or reaches the chain tip
    while (true) {
      const res = await stellar.sorobanRpc("getEvents", params);
      const page = res.events ?? [];
      let pastWindow = false;
      for (const ev of page) {
        const closedAt = Math.floor(Date.parse(ev.ledgerClosedAt) / 1e3);
        if (closedAt >= endTimestamp) { pastWindow = true; break; }
        if (closedAt < startTimestamp || ev.inSuccessfulContractCall === false) continue;
        events.push({ pool: ev.contractId, topics: ev.topic.map((t: string) => stellar.parseScVal(t)), data: stellar.parseScVal(ev.value) });
      }
      if (pastWindow || !res.cursor || cursorLedger(res.cursor) >= res.latestLedger) break;
      params = { filters, pagination: { limit: EVENTS_PAGE_SIZE, cursor: res.cursor } };
    }
  }
  return events;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const pools = await getPools();
  const startLedger = await getStartLedger(options.startTimestamp);
  const events = await getPoolEvents(Object.keys(pools), startLedger, options.startTimestamp, options.endTimestamp);

  // fee is the whole fee charged in that coin, adminCut the part of it set aside for the protocol
  const addFee = (coin: string, fee: any, adminCut: any, label: string) => {
    const total = BigInt(fee ?? 0);
    const admin = BigInt(adminCut ?? 0);
    if (!coin || total <= 0n) return;
    dailyFees.add(coin, total, label);
    dailyRevenue.add(coin, admin, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.add(coin, total - admin, METRIC.LP_FEES);
  };

  for (const { pool, topics, data } of events) {
    const coins = pools[pool];
    if (!coins || !data) continue;
    const name = topics[0];
    if (name === "exchange") {
      // topics: [exchange, buyer, input coin index, output coin index]; the swap fee is charged in the token paid out
      const coinIn = coins[Number(topics[2])];
      const coinOut = coins[Number(topics[3])];
      if (!coinIn || !coinOut) throw new Error(`curve-stellar: exchange event without coin indexes on ${pool}`);
      dailyVolume.add(coinIn, data.tokens_sold);
      addFee(coinOut, data.fee, data.admin_fee_cut, METRIC.SWAP_FEES);
    } else if (name === "add_liquidity" || name === "remove_liquidity_imbalance") {
      coins.forEach((coin, i) => addFee(coin, data.fees?.[i], data.admin_fee_cuts?.[i], LIQUIDITY_FEES));
    } else if (name === "remove_liquidity_one") {
      // topics: [remove_liquidity_one, provider, coin index]
      const coin = coins[Number(topics[2])];
      if (!coin) throw new Error(`curve-stellar: remove_liquidity_one event without coin index on ${pool}`);
      addFee(coin, data.fee, data.admin_fee_cut, LIQUIDITY_FEES);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Input amount of every swap (exchange event) in the pools deployed by the Curve StableSwap factory on Stellar.",
  Fees: "Swap fees, plus the fees charged on deposits and withdrawals that change a pool's balance, read from the pool events.",
  UserFees: "Swap fees paid by traders, and imbalance fees paid by liquidity providers on unbalanced deposits and withdrawals.",
  Revenue: "The protocol's share of each fee (admin fee, 50% on the pools deployed so far), read from the pool events.",
  ProtocolRevenue: "The protocol's share of each fee, collected by the factory's fee receiver.",
  SupplySideRevenue: "The rest of each fee, kept in the pool for liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees charged on swaps, in the token paid out.",
    [LIQUIDITY_FEES]: "Fees charged on deposits and withdrawals that change a pool's balance.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Fees charged on swaps, in the token paid out.",
    [LIQUIDITY_FEES]: "Fees charged on deposits and withdrawals that change a pool's balance.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "The admin fee share of swap and imbalance fees, collected by the factory's fee receiver.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "The admin fee share of swap and imbalance fees, collected by the factory's fee receiver.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Swap and imbalance fees left in the pools for liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.STELLAR],
  start: "2026-10-21",
  methodology,
  breakdownMethodology,
};

export default adapter;
