import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryAllium } from "../helpers/allium"
import { JUPITER_METRICS, jupBuybackRatioFromRevenue } from "./jupiter"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data: { usd_amount: number; product: string }[] = await queryAllium(`
    -- v1: All transfers to fee wallet excluding transfers from the wallet itself
    SELECT 
      COALESCE(t.usd_amount, 0) as usd_amount,
      'lo_v1' as product
    FROM solana.assets.transfers t
    WHERE t.from_address != 'H3vkQqNVWySTD4c1Y91wtoT5iwxKSVtVLfC2rD8SgwTN'
      AND t.to_address = 'H3vkQqNVWySTD4c1Y91wtoT5iwxKSVtVLfC2rD8SgwTN'
      AND t.block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND t.block_timestamp <= TO_TIMESTAMP_NTZ('${options.endTimestamp}')

    UNION ALL

    -- v2: Fee vault inflows from limit fee vault to central address
    SELECT 
      COALESCE(t.usd_amount, 0) as usd_amount,
      'lo_v2' as product
    FROM solana.assets.transfers t
    WHERE t.from_address = '27ZASRjinQgXKsrijKqb9xyRnH6W5KWgLSDveRghvHqc'
      AND t.to_address = '7JQeyNK55fkUPUmEotupBFpiBGpgEQYLe8Ht1VdSfxcP'
      AND t.block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND t.block_timestamp <= TO_TIMESTAMP_NTZ('${options.endTimestamp}')
  `);

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  data.forEach(row => {
    const metric = row.product === 'lo_v1' ? JUPITER_METRICS.LimitOrderV1Fees : JUPITER_METRICS.LimitOrderV2Fees;
    dailyFees.addUSDValue(row.usd_amount, metric);
  });

  const dailyRevenue = dailyFees.clone(1);

  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);

  dailyProtocolRevenue.addBalances(dailyRevenue.clone(1 - buybackRatio));
  dailyHoldersRevenue.addBalances(dailyRevenue.clone(buybackRatio), JUPITER_METRICS.TokenBuyBack);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
  }
}

const methodology = {
  Fees: 'Fees collected from Jupiter Limit Order service. V1/V2: Fees paid by traders for limit orders execution and trade surplus.',
  Revenue: 'All fees collected by Jupiter from limit order executions.',
  HoldersRevenue: 'JUP token buybacks funded by 50% of platform revenue, started Feb 17, 2025.',
  ProtocolRevenue: 'Platform fees allocated to Jupiter treasury. 100% before Feb 17, 2025, then 50% after buyback program started.',
}

const breakdownMethodology = {
  Fees: {
    [JUPITER_METRICS.LimitOrderV1Fees]: "Fees from limit order v1. Collected when traders fill user limit orders.",
    [JUPITER_METRICS.LimitOrderV2Fees]: "Fees from limit order v2. Collected when traders fill user limit orders.",
  },
  Revenue: {
    [JUPITER_METRICS.LimitOrderV1Fees]: "100% of limit order v1 fees retained by Jupiter protocol.",
    [JUPITER_METRICS.LimitOrderV2Fees]: "100% of limit order v2 fees retained by Jupiter protocol.",
  },
  ProtocolRevenue: {
    [JUPITER_METRICS.LimitOrderV1Fees]: "Limit order v1 fees allocated to treasury: 100% before Feb 17, 2025, then 50% after buyback program started.",
    [JUPITER_METRICS.LimitOrderV2Fees]: "Limit order v2 fees allocated to treasury: 50% (v2 launched after buyback program started).",
  },
  HoldersRevenue: {
    [JUPITER_METRICS.TokenBuyBack]: "Starting Feb 17, 2025, 50% of platform revenue is used to buy back JUP tokens, benefiting all token holders.",
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2022-10-14',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology
}

export default adapter;
