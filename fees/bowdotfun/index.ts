import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const FEES = {
  BPS: 10_000n,
  // Source: bow.fun docs use the 1% Uniswap V3 tier and split collected WETH fees 35% to creators.
  POOL_FEE_BPS: 100n,
  CREATOR_SHARE_BPS: 3_500n,
};
const LAUNCHED =
  "event Launched(address indexed token, address indexed deployer, address pool, uint256 positionId, uint256 launchId)";

const chainConfig: Record<string, { start: string; factory: string; fromBlock: number; weth: string; duneChain: string }> = {
  [CHAIN.ROBINHOOD]: {
    // https://bow.fun/docs.html#deployed-contracts
    start: "2026-07-11",
    factory: "0xC70E510E14710Ea535CAB7b2414860aF63FEab79",
    fromBlock: 7158095,
    weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
    duneChain: "robinhood",
  },
};

const toBigInt = (amount: string | number | bigint) => BigInt(amount.toString());

function buildDuneQuery(options: FetchOptions) {
  const { duneChain, weth } = chainConfig[options.chain];

  return `
    SELECT project_contract_address AS pool, t.side, CAST(SUM(t.amount) AS VARCHAR) AS amount
    FROM dex.trades
    CROSS JOIN UNNEST(
      ARRAY['bought', 'sold'],
      ARRAY[token_bought_address, token_sold_address],
      ARRAY[token_bought_amount_raw, token_sold_amount_raw]
    ) AS t (side, token, amount)
    WHERE blockchain = '${duneChain}'
      AND project = 'uniswap'
      AND version = '3'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
      AND t.token = ${weth}
    GROUP BY project_contract_address, t.side`;
}

const fetch = async (options: FetchOptions) => {
  const tenHoursAgo = Date.now() - 10 * 60 * 60 * 1000;
  if (options.toTimestamp * 1000 > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const { factory, fromBlock, weth } = chainConfig[options.chain];

  const launches = (await options.getLogs({
    target: factory,
    eventAbi: LAUNCHED,
    fromBlock,
    cacheInCloud: true,
  })) as { pool: string }[];

  const launchedPools = new Set(launches.map((launch) => launch.pool.toLowerCase()));
  if (!launchedPools.size) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
  }

  const rows: { pool?: string; side?: string; amount?: string | number }[] =
    await queryDuneSql(options, buildDuneQuery(options));

  for (const row of rows) {
    if (!row.pool || !launchedPools.has(row.pool.toLowerCase())) continue;

    const amount = toBigInt(row.amount ?? 0);
    const swapFee =
      row.side === "sold"
        ? (amount * FEES.POOL_FEE_BPS) / FEES.BPS
        : (amount * FEES.POOL_FEE_BPS) / (FEES.BPS - FEES.POOL_FEE_BPS);
    const creatorFee = (swapFee * FEES.CREATOR_SHARE_BPS) / FEES.BPS;
    const protocolFee = swapFee - creatorFee;

    dailyFees.add(weth, swapFee, METRIC.SWAP_FEES);
    dailyRevenue.add(weth, protocolFee, "Token Swap Fees to Protocol");
    dailyProtocolRevenue.add(weth, protocolFee, "Token Swap Fees to Protocol");
    dailySupplySideRevenue.add(weth, creatorFee, "Token Swap Fees to Creators");
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees:
    "1% swap fees from bow.fun factory-launched Uniswap V3 pools on Robinhood Chain.",
  Revenue: "65% of swap fees retained by the bow.fun protocol.",
  ProtocolRevenue: "65% of swap fees retained by the bow.fun protocol.",
  SupplySideRevenue: "35% of swap fees routed to launched-token creators.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "1% swap fees from bow.fun factory-launched Uniswap V3 pools.",
  },
  Revenue: {
    "Token Swap Fees to Protocol": "The protocol's 65% share of swap fees.",
  },
  ProtocolRevenue: {
    "Token Swap Fees to Protocol": "The protocol's 65% share of swap fees.",
  },
  SupplySideRevenue: {
    "Token Swap Fees to Creators": "The launched token creator's 35% share of swap fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
  doublecounted: true, // Bow.fun pools are Uniswap V3 pools.
  isExpensiveAdapter: true,
};

export default adapter;
