import { Dependencies, FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";
import { addOneToken } from "../../helpers/prices";
import { filterPools } from "../../helpers/uniswap";
import { METRIC } from "../../helpers/metrics";

const factories = [
  "0x0c37a24F5D23A486FA692d1500881d698B1F77a4", // old
  "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB", // new
];

const lpLockers = [
  "0x31ca5E101941A93A7DD6d0497928700625CF54B5", // old
  "0x736D76699C26D0d966744cAe304C000d471f7F35", // new
];

const MIN_TVL = 1000;
const SWAP_FEE = 1 / 100;
const FROM_BLOCK = 8600612;

const tokenLaunchedEvent =
  "event TokenLaunched(address indexed token, address indexed deployer, address indexed dexFactory, address pairToken, address pool, uint256 dexId, uint256 launchConfigId, uint256 positionId, uint256 restrictionsEndBlock, uint256 initialBuyAmount)";

function buildDuneQuery(options: FetchOptions): string {
  return `
    SELECT project_contract_address AS pool, t.token, CAST(SUM(t.amount) AS VARCHAR) AS amount
    FROM dex.trades
    CROSS JOIN UNNEST(
      ARRAY[token_bought_address, token_sold_address],
      ARRAY[token_bought_amount_raw, token_sold_amount_raw]
    ) AS t (token, amount)
    WHERE blockchain = 'robinhood'
      AND project = 'uniswap'
      AND version = '3'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
    GROUP BY project_contract_address, t.token`;
}

async function fetch(options: FetchOptions) {
  const feesFromSwap = options.createBalances();
  const swapFeesToCreator = options.createBalances();
  const swapFeesToProtocol = options.createBalances();

  const protocolFeeShares = await options.api.multiCall({
    calls: lpLockers,
    abi: "uint256:protocolFeeShare",
  });

  const tokenLaunchedLogs = await options.getLogs({
    targets: factories,
    eventAbi: tokenLaunchedEvent,
    flatten: false,
    cacheInCloud: true,
    fromBlock: FROM_BLOCK,
  });

  const poolsFromNewFactory = new Set(
    (tokenLaunchedLogs[1] ?? []).map((log: any) => log.pool.toLowerCase())
  );

  const pairObject: IJSON<string[]> = {};
  for (const logs of tokenLaunchedLogs) {
    for (const log of logs ?? []) {
      const [token0, token1] =
        log.token < log.pairToken
          ? [log.token, log.pairToken]
          : [log.pairToken, log.token];
      pairObject[log.pool.toLowerCase()] = [token0.toLowerCase(), token1.toLowerCase()];
    }
  }

  const filteredPairs = await filterPools({
    api: options.api,
    pairs: pairObject,
    createBalances: options.createBalances,
    minUSDValue: MIN_TVL,
    maxPairSize: 5000,
  });

  const filteredPools = new Set(Object.keys(filteredPairs));
  if (!filteredPools.size) {
    return {
      dailyFees: feesFromSwap,
      dailyRevenue: swapFeesToProtocol,
      dailySupplySideRevenue: swapFeesToCreator,
      dailyProtocolRevenue: swapFeesToProtocol,
    };
  }

  const rows: any[] = await queryDune(
    "3996608",
    { fullQuery: buildDuneQuery(options) },
    options
  );

  const byPool: Record<string, { tokens: string[]; amounts: string[] }> = {};
  for (const row of rows) {
    if (!row.pool || !row.token || !row.amount) continue;
    const pool = row.pool.toLowerCase();
    if (!filteredPools.has(pool)) continue;
    const entry = (byPool[pool] ??= { tokens: [], amounts: [] });
    entry.tokens.push(row.token.toLowerCase());
    entry.amounts.push(row.amount);
  }

  for (const pool of Object.keys(byPool)) {
    const [token0, token1] = pairObject[pool] ?? [];
    if (!token0 || !token1) continue;

    const protocolShare =
      (poolsFromNewFactory.has(pool) ? protocolFeeShares[1] : protocolFeeShares[0]) / 100;
    const creatorShare = 1 - protocolShare;

    const { tokens, amounts } = byPool[pool];
    const amountByToken: Record<string, number> = {};
    for (let i = 0; i < tokens.length; i++) {
      amountByToken[tokens[i]] = (amountByToken[tokens[i]] ?? 0) + Number(amounts[i]);
    }

    const amount0 = amountByToken[token0] ?? 0;
    const amount1 = amountByToken[token1] ?? 0;

    addOneToken({balances: feesFromSwap,token0,amount0: amount0 * SWAP_FEE,token1,amount1: amount1 * SWAP_FEE});
    addOneToken({balances: swapFeesToCreator,token0,amount0: amount0 * SWAP_FEE * creatorShare,token1,amount1: amount1 * SWAP_FEE * creatorShare});
    addOneToken({balances: swapFeesToProtocol,token0,amount0: amount0 * SWAP_FEE * protocolShare,token1,amount1: amount1 * SWAP_FEE * protocolShare});
  }

  const dailyFees = feesFromSwap.clone(1, METRIC.SWAP_FEES);
  const dailySupplySideRevenue = swapFeesToCreator.clone(1, "Token Swap Fees to Creators");
  const dailyProtocolRevenue = swapFeesToProtocol.clone(1, "Token Swap Fees to Protocol");

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
}

const methodology = {
  Fees: "1% swap fees paid on all token swaps of tokens launched on the platform (only pools with at least $1000 in TVL are included).",
  Revenue: "Part of swap fees retained by the protocol (exact fee share extracted from the protocolFeeShare function).",
  ProtocolRevenue: "Part of swap fees retained by the protocol (exact fee share extracted from the protocolFeeShare function).",
  SupplySideRevenue: "Part of swap fees paid to token creators after protocol revenue is deducted.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "1% swap fees paid on all token swaps of tokens launched on the platform (only pools with at least $1000 in TVL are included)",
  },
  Revenue: {
    "Token Swap Fees to Protocol": "Part of swap fees retained by the protocol (exact fee share extracted from the protocolFeeShare function).",
  },
  ProtocolRevenue: {
    "Token Swap Fees to Protocol": "Part of swap fees retained by the protocol (exact fee share extracted from the protocolFeeShare function).",
  },
  SupplySideRevenue: {
    "Token Swap Fees to Creators": "Part of swap fees paid to token creators after protocol revenue is deducted.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-13",
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
  doublecounted: true, // uniswap
  isExpensiveAdapter: true,
};

export default adapter;
