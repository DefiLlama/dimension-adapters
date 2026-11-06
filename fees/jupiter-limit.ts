import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryAllium } from "../helpers/allium"
import { JUPITER_METRICS, jupBuybackRatioFromRevenue } from "./jupiter"

const fetch = async (options: FetchOptions) => {
  const data: { usd_amount: number; product: string }[] = await queryAllium(`
    -- v1: All transfers to fee wallet excluding transfers from the wallet itself
    SELECT 
      COALESCE(t.usd_amount, 0) as usd_amount,
      'lo_v1' as product
    FROM solana.assets.transfers t
    WHERE t.from_address != 'H3vkQqNVWySTD4c1Y91wtoT5iwxKSVtVLfC2rD8SgwTN'
      AND t.to_address = 'H3vkQqNVWySTD4c1Y91wtoT5iwxKSVtVLfC2rD8SgwTN'
      AND t.block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND t.block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')

    UNION ALL

    -- v2: Fee vault inflows from limit fee vault to central address
    SELECT 
      COALESCE(t.usd_amount, 0) as usd_amount,
      'lo_v2' as product
    FROM solana.assets.transfers t
    WHERE t.from_address = '27ZASRjinQgXKsrijKqb9xyRnH6W5KWgLSDveRghvHqc'
      AND t.to_address = '7JQeyNK55fkUPUmEotupBFpiBGpgEQYLe8Ht1VdSfxcP'
      AND t.block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND t.block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
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
  HoldersRevenue: 'JUP buybacks are reported once, on the Jupiter Aggregator listing, from the JUP the Litterbox buys.',
  ProtocolRevenue: 'All revenue goes to the Jupiter treasury.',
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
    [JUPITER_METRICS.LimitOrderV1Fees]: "Limit order v1 fees, all to the Jupiter treasury.",
    [JUPITER_METRICS.LimitOrderV2Fees]: "Limit order v2 fees, all to the Jupiter treasury.",
  },
  HoldersRevenue: {
    [JUPITER_METRICS.TokenBuyBack]: "JUP buybacks are reported once, on the Jupiter Aggregator listing, from the JUP the Litterbox buys.",
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
