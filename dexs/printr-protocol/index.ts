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

const PRINTR_SOLANA_BONDING_CURVE_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
const PRINTR_SOLANA_LAUNCH_PROGRAM = "T8HsGYv7sMk3kTnyaRqZrbRPuntYzdh12evXBkprint";
const SOLANA_WSOL = "So11111111111111111111111111111111111111112";
const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

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

const fetchEvm = async ({ getLogs, createBalances, api }: FetchOptions) => {
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

interface ISolanaFeeRow {
  quote_mint: string;
  total_trading_fees: string | number;
  total_protocol_fees: string | number;
  total_referral_fees: string | number;
}

const fetchSolana = async (options: FetchOptions) => {
  const rows: ISolanaFeeRow[] = await queryDuneSql(options, `
    WITH printr_created_mints AS (
      SELECT DISTINCT token_mint_address AS meme_mint
      FROM tokens_solana.transfers
      WHERE action = 'mint'
        AND outer_executing_account = '${PRINTR_SOLANA_LAUNCH_PROGRAM}'
        AND block_time >= TIMESTAMP '${START}'
        AND token_mint_address NOT IN ('${SOLANA_WSOL}', '${SOLANA_USDC}')
    ),
    printr_dbc_pools AS (
      SELECT DISTINCT
        account_config,
        account_quote_mint
      FROM meteora_solana.dynamic_bonding_curve_call_initialize_virtual_pool_with_spl_token
      WHERE account_base_mint IN (SELECT meme_mint FROM printr_created_mints)
    ),
    swap_events AS (
      SELECT
        p.account_quote_mint AS quote_mint,
        CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.trading_fee') AS DECIMAL(38,0)) AS trading_fee,
        CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.protocol_fee') AS DECIMAL(38,0)) AS protocol_fee,
        CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.referral_fee') AS DECIMAL(38,0)) AS referral_fee
      FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
      JOIN printr_dbc_pools p ON s.config = p.account_config
      WHERE s.evt_executing_account = '${PRINTR_SOLANA_BONDING_CURVE_PROGRAM}'
        AND s.evt_block_time >= from_unixtime(${options.startTimestamp})
        AND s.evt_block_time < from_unixtime(${options.endTimestamp})
    )
    SELECT
      quote_mint,
      SUM(COALESCE(trading_fee, 0)) AS total_trading_fees,
      SUM(COALESCE(protocol_fee, 0)) AS total_protocol_fees,
      SUM(COALESCE(referral_fee, 0)) AS total_referral_fees
    FROM swap_events
    GROUP BY 1
  `)

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  rows.forEach((row) => {
    dailyFees.add(row.quote_mint, Number(row.total_trading_fees))
    dailyRevenue.add(row.quote_mint, Number(row.total_protocol_fees))
    dailyProtocolRevenue.add(row.quote_mint, Number(row.total_protocol_fees))
    dailySupplySideRevenue.add(row.quote_mint, Number(row.total_referral_fees))
  })

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const fetch = async (options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(options)
  return fetchEvm(options)
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
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.DUNE],
  fetch,
  start: START,
  chains: [CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.AVAX, CHAIN.MANTLE, CHAIN.MONAD, CHAIN.BSC, CHAIN.ETHEREUM, CHAIN.SOLANA],
  methodology,
  breakdownMethodology,
};

export default adapter;
