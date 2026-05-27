import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const PRINTR_CONTRACT = "0xb77726291b125515d0a7affeea2b04f2ff243172";
const START = '2025-10-14';

const TOKEN_TRADE_EVENT =
  "event TokenTrade(address indexed token, address indexed trader, bool isBuy, uint256 amount, uint256 cost, uint256 priceAfter, uint256 issuedSupply, uint256 reserve)";

const GET_CURVE_ABI =
  "function getCurve(address token) view returns (tuple(address basePair, uint16 totalCurves, uint256 maxTokenSupply, uint256 virtualReserve, uint256 reserve, uint256 completionThreshold))";

const PRINTR_SOLANA_CREATOR = "82VbBzGtb8v5wFx1TM6iaMmLyRSLy8WeqA123orjHGzL";

// 1% total bonding curve swap fee
// Fee split: 25% creator, 25% memecoin reserve, 40% buyback, 10% team
const FEE_RATE = 1 / 100;

const getFeeBreakdownFromVolume = (dailyVolume: ReturnType<FetchOptions["createBalances"]>) => {
  // Derive fee breakdown from volume
  const dailyFees = dailyVolume.clone(FEE_RATE, METRIC.SWAP_FEES); // 1% total fee
  const dailyRevenue = dailyVolume.clone(FEE_RATE * 0.1, METRIC.PROTOCOL_FEES);
  dailyRevenue.add(dailyVolume.clone(FEE_RATE * 0.25, 'Memecoin Reserve'));
  dailyRevenue.add(dailyVolume.clone(FEE_RATE * 0.4, METRIC.TOKEN_BUY_BACK));
  const dailyProtocolRevenue = dailyVolume.clone(FEE_RATE * 0.1, METRIC.PROTOCOL_FEES);
  dailyProtocolRevenue.add(dailyVolume.clone(FEE_RATE * 0.25, 'Memecoin Reserve'));
  const dailyHoldersRevenue = dailyVolume.clone(FEE_RATE * 0.4, METRIC.TOKEN_BUY_BACK);
  const dailySupplySideRevenue = dailyVolume.clone(FEE_RATE * 0.25, METRIC.CREATOR_FEES);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const fetchEvm = async (_a: any, _b: any, { getLogs, createBalances, api }: FetchOptions) => {
  const dailyVolume = createBalances();

  const tradeLogs = await getLogs({
    target: PRINTR_CONTRACT,
    eventAbi: TOKEN_TRADE_EVENT,
  });

  if (!tradeLogs.length) {
    return { dailyVolume, dailyFees: createBalances() };
  }

  // Get unique token addresses to resolve their basePair token
  const uniqueTokens = Array.from(new Set(tradeLogs.map((log: any) => log.token)));

  const curves = await api.multiCall({
    abi: GET_CURVE_ABI,
    calls: uniqueTokens.map((token) => ({
      target: PRINTR_CONTRACT,
      params: [token],
    })),
    permitFailure: true,
  });

  // Build token -> basePair mapping
  const tokenBasePair: Record<string, string> = {};
  uniqueTokens.forEach((token: string, i: number) => {
    if (curves[i]?.basePair) {
      tokenBasePair[token] = curves[i].basePair;
    }
  });

  // Accumulate volume by basePair token
  // cost = the trade amount denominated in the base pair token
  for (const log of tradeLogs) {
    const basePair = tokenBasePair[log.token];
    if (!basePair) continue;
    dailyVolume.add(basePair, log.cost);
  }

  return {
    dailyVolume,
    ...getFeeBreakdownFromVolume(dailyVolume),
  };
};


const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
  const [row = { printr_fee_total_usd: 0 }] = await queryDuneSql(options, `
    WITH printr_tokens AS (
      SELECT DISTINCT base_mint AS token
      FROM meteora_solana.dynamic_bonding_curve_evt_evtinitializepool
      WHERE creator = '${PRINTR_SOLANA_CREATOR}'
      AND evt_block_date >= DATE '${START}'
    ),
    trades_dedup AS (
      SELECT
        t.project,
        t.version_name,
        t.tx_id,
        COALESCE(t.outer_instruction_index, 0) AS o_idx,
        COALESCE(t.inner_instruction_index, 0) AS i_idx,
        MAX(t.amount_usd) AS amount_usd
      FROM dex_solana.trades t
      WHERE t.block_month >= CAST(DATE_TRUNC('month', from_unixtime(${options.startTimestamp})) AS date)
        AND t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time < from_unixtime(${options.endTimestamp})
        AND (
          t.token_bought_mint_address IN (SELECT token FROM printr_tokens)
          OR t.token_sold_mint_address IN (SELECT token FROM printr_tokens)
        )
      GROUP BY 1, 2, 3, 4, 5
    ),
    agg AS (
      SELECT
        COALESCE(SUM(CASE WHEN project = 'meteora' AND version_name = 'dbc' THEN amount_usd ELSE 0 END), 0) AS dbc_volume_usd,
        COALESCE(SUM(CASE WHEN NOT (project = 'meteora' AND version_name = 'dbc') THEN amount_usd ELSE 0 END), 0) AS grad_volume_usd
      FROM trades_dedup
    )
    SELECT
      ROUND(0.004 * dbc_volume_usd + 0.002 * grad_volume_usd, 2) AS printr_fee_total_usd
    FROM agg
  `);

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(Number(row.printr_fee_total_usd), METRIC.SWAP_FEES);

  const dailyRevenue = dailyFees.clone(1, METRIC.PROTOCOL_FEES);
  const dailyProtocolRevenue = dailyFees.clone(1, METRIC.PROTOCOL_FEES);
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(_a, _b, options)
  return fetchEvm(_a, _b, options)
}

const methodology = {
  Volume:
    "EVM-only trading volume from Printr bonding curve swaps, denominated in the base pair token via TokenTrade.cost. Solana bonding curve volume is tracked under Meteora and excluded here.",
  Fees: "Printr charges a 1% fee on all bonding curve swaps.",
  Revenue:
    "75% of trading fees: team (10%), protocol-controlled memecoin reserve (25%), and buyback (40%).",
  ProtocolRevenue:
    "35% of trading fees: 10% to the Printr team and 25% to the protocol-controlled memecoin reserve fund (allocated via community voting for liquidity, listings, and growth).",
  HoldersRevenue:
    "40% of trading fees are used for buybacks, benefiting token holders.",
  SupplySideRevenue:
    "25% of trading fees go to token creators.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Printr charges a 1% fee on all bonding curve swaps.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "10% of trading fees go to the Printr team.",
    [METRIC.TOKEN_BUY_BACK]: "40% of trading fees are used for buybacks, benefiting token holders.",
    'Memecoin Reserve': "25% of trading fees go to the protocol-controlled memecoin reserve fund (allocated via community voting for liquidity, listings, and growth).",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "10% of trading fees go to the Printr team.",
    'Memecoin Reserve': "25% of trading fees go to the protocol-controlled memecoin reserve fund (allocated via community voting for liquidity, listings, and growth).",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "40% of trading fees are used for buybacks, benefiting token holders.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "25% of trading fees go to token creators.",
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  start: START,
  chains: [CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.AVAX, CHAIN.MANTLE, CHAIN.MONAD, CHAIN.BSC, CHAIN.ETHEREUM, CHAIN.SOLANA],
  methodology,
  breakdownMethodology,
  isExpensiveAdapter: true,
};

export default adapter;
