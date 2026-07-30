import { Dependencies, FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";
import { addOneToken } from "../../helpers/prices";
import { filterPools } from "../../helpers/uniswap";
import { METRIC } from "../../helpers/metrics";
import { addTokensReceived } from "../../helpers/token";

const factories = [
  "0x0c37a24F5D23A486FA692d1500881d698B1F77a4", // old
  "0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB", // new
];

const lpLockers = [
  "0x31ca5E101941A93A7DD6d0497928700625CF54B5", // old
  "0x736D76699C26D0d966744cAe304C000d471f7F35", // new
];

const BURNER_WALLET = "0xda4bcee76b29efec9697fcf663601c2042043968";
const PONS_TOKEN = "0x39dBED3a2bd333467115dE45665cC57F813C4571";
const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";

//https://docs.ponsfamily.com/#fees
const MIN_TVL = 0;
const SWAP_FEE = 1 / 100;
const FROM_BLOCK = 8600612;
const LAUNCH_FEE_ETH = 0.0005;
const UNISWAP_FEE_SWITCH_DATE = "2026-07-27";
const UNISWAP_FEE_SHARE_1_PERCENT_TIER = 1/6;

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

  const tokensLaunchedToday = await options.getLogs({
    targets: factories,
    eventAbi: tokenLaunchedEvent,
    flatten: true,
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
    maxPairSize: 100_000,
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

  const dailyBurns = await addTokensReceived({
    options,
    fromAddressFilter: BURNER_WALLET,
    target: DEAD_ADDRESS,
    token: PONS_TOKEN
  })

  const launchFees = tokensLaunchedToday.length * LAUNCH_FEE_ETH;
  const swapFeesRatioToLps = options.dateString >= UNISWAP_FEE_SWITCH_DATE ? 1 - UNISWAP_FEE_SHARE_1_PERCENT_TIER : 1;
  const swapFeesRatioToUniswap = options.dateString >= UNISWAP_FEE_SWITCH_DATE ? UNISWAP_FEE_SHARE_1_PERCENT_TIER : 0;

  const dailyFees = feesFromSwap.clone(1, METRIC.SWAP_FEES);
  dailyFees.addCGToken("ethereum", launchFees, "Token Launch Fees");

  const dailySupplySideRevenue = swapFeesToCreator.clone(1 * swapFeesRatioToLps, "Token Swap Fees to Creators");
  const swapFeesToUniswap = dailyFees.clone(swapFeesRatioToUniswap);
  dailySupplySideRevenue.add(swapFeesToUniswap, "Token Swap Fees to Uniswap");

  const dailyRevenue = swapFeesToProtocol.clone(1 * swapFeesRatioToLps, "Token Swap Fees to Protocol");
  dailyRevenue.addCGToken("ethereum", launchFees, "Token Launch Fees to Protocol");

  const dailyHoldersRevenue = dailyBurns.clone(1, "Protocol Revenue to Buyback and Burn");

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
}

const methodology = {
  Fees: "1% swap fees paid on all token swaps of tokens launched on the platform (only pools with at least $200 in TVL are included) and 0.0005 $ETH per token launched.",
  Revenue: "Part of swap fees retained by the protocol (exact fee share extracted from the protocolFeeShare function, only pools with at least $200 in TVL are included) and all the launch fees (0.0005 $ETH per token launched).",
  SupplySideRevenue: "Includes one-sixth of swap fees (routed to Uniswap after July 27, 2026, and zero before that), as well as the portion of swap fees paid to token creators after protocol revenue is deducted.",
  HoldersRevenue: "Around 80% of revenue is used to buyback and burn $PONS tokens."
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "1% swap fees paid on all token swaps of tokens launched on the platform (only pools with at least $200 in TVL are included)",
    "Token Launch Fees": "0.0005 $ETH per token launched",
  },
  Revenue: {
    "Token Swap Fees to Protocol": "Part of swap fees retained by the protocol (exact fee share extracted from the protocolFeeShare function, only pools with at least $200 in TVL are included).",
    "Token Launch Fees to Protocol": "All the launch fees (0.0005 $ETH per token launched)",
  },
  SupplySideRevenue: {
    "Token Swap Fees to Creators": "Part of swap fees paid to token creators after protocol revenue is deducted.",
    "Token Swap Fees to Uniswap": "One-sixth of swap fees (routed to Uniswap after July 27, 2026, and zero before that)",
  },
  HoldersRevenue: {
    "Protocol Revenue to Buyback and Burn": "Around 80% of revenue is used to buyback and burn $PONS tokens.",
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
