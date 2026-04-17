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

interface ISolanaVolumeRow {
  payment_mint: string;
  payment_amount: string | number;
}

const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
  // Methodology alignment with EVM:
  // EVM tracks TokenTrade.cost in the basePair token.
  // Solana DBC swap events expose the quote mint and quote leg amount directly:
  //  - trade_direction = 1: user pays quote mint as amount_in
  //  - trade_direction = 0: user receives quote mint as output_amount
  // In both cases we accumulate the quote/payment leg by mint.
  const rows: ISolanaVolumeRow[] = await queryDuneSql(options, `
    WITH printr_created_mints AS (
      SELECT DISTINCT token_mint_address AS meme_mint
      FROM tokens_solana.transfers
      WHERE action = 'mint'
        AND outer_executing_account = '${PRINTR_SOLANA_LAUNCH_PROGRAM}'
        AND block_time >= TIMESTAMP '${START}'
        AND token_mint_address NOT IN ('${SOLANA_WSOL}', '${SOLANA_USDC}')
    ),
    printr_dbc_pools AS (
      -- account_base_mint is the launched/traded meme token mint for each DBC config.
      SELECT DISTINCT
        account_config,
        account_quote_mint,
        account_base_mint AS meme_mint
      FROM meteora_solana.dynamic_bonding_curve_call_initialize_virtual_pool_with_spl_token
      WHERE account_base_mint IN (SELECT meme_mint FROM printr_created_mints)
    ),
    printr_swaps AS (
      SELECT
        p.account_quote_mint AS payment_mint,
        CASE
          WHEN s.trade_direction = 1 THEN COALESCE(s.amount_in, 0)
          ELSE COALESCE(CAST(JSON_EXTRACT_SCALAR(s.swap_result, '$.SwapResult.output_amount') AS DECIMAL(38,0)), 0)
        END AS payment_amount
      FROM meteora_solana.dynamic_bonding_curve_evt_evtswap s
      JOIN printr_dbc_pools p ON s.config = p.account_config
      WHERE s.evt_executing_account = '${PRINTR_SOLANA_BONDING_CURVE_PROGRAM}'
        AND s.evt_block_time >= from_unixtime(${options.startTimestamp})
        AND s.evt_block_time < from_unixtime(${options.endTimestamp})
    )
    SELECT
      payment_mint,
      SUM(payment_amount) AS payment_amount
    FROM printr_swaps
    GROUP BY payment_mint
  `)

  const dailyVolume = options.createBalances()
  rows.forEach((row) => {
    dailyVolume.add(row.payment_mint, row.payment_amount)
  })

  return {
    dailyVolume,
    ...getFeeBreakdownFromVolume(dailyVolume),
  }
}

const fetch = async (options: FetchOptions) => {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(null, null, options)
  return fetchEvm(options)
}

const methodology = {
  Volume:
    "Total trading volume from Printr bonding curve buys and sells, tracked as payment-side trade cost. On EVM this is TokenTrade.cost in the curve base pair token; on Solana this is the quote/payment mint leg from DBC swap events (amount_in for buys, quote output_amount for sells).",
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
