import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const prefetch = async (options: FetchOptions) => {
  const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
  const sql = getSqlFromFile("helpers/queries/cow-protocol.sql", {
    start: startOfDay
  });
  return await queryDuneSql(options, sql);
}

const fetch = async (_a: any, _ts: any, options: FetchOptions) => {
  const preFetchedResults = options.preFetchedResults || [];
  const dune_chain = options.chain === CHAIN.XDAI ? 'gnosis' : options.chain === CHAIN.AVAX ? 'avalanche_c' : options.chain;
  const data = preFetchedResults.find((result: any) => result.chain === dune_chain);

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  if (data) {
    // All values are now in ETH from the new dune query
    const protocolFee = data.protocol_fee_revenue || 0;
    const partnerFeePartner = data.partner_fee_partner_revenue || 0;
    const mevBlockerFee = data.mev_blocker_fee || 0;
    // const limitFee = data.limit_revenue || 0;
    // const marketFee = data.market_revenue || 0;
    // const uiFee = data.ui_fee_revenue || 0;
    const partnerFeeCow = data.partner_fee_cow_revenue || 0;

    let totalFees = protocolFee + partnerFeeCow + partnerFeePartner + (mevBlockerFee * 2); // beaverbuild receive same amount for mevBlockerFee
    let protocolRevenue = protocolFee + partnerFeeCow + mevBlockerFee; // Excluding partner fees

    // Sanity check for Gnosis chain
    if(options.chain === CHAIN.XDAI && totalFees > 5) {
      throw new Error(`Total fees ${totalFees} ETH very high for gnosis. Protocol: ${protocolFee}, Partner(Partner): ${partnerFeePartner}, Partner(COW): ${partnerFeeCow}, MEV: ${mevBlockerFee}`);
    }

    if(options.chain === CHAIN.ETHEREUM && totalFees > 1000) {
      totalFees = 0;
      protocolRevenue = 0;
      // throw new Error(`Total fees ${totalFees} ETH very high for ethereum. Protocol: ${protocolFee}, Partner: ${partnerFee}, MEV: ${mevBlockerFee}`);
    }

    dailyFees.addCGToken('ethereum', totalFees);
    dailyProtocolRevenue.addCGToken('ethereum', protocolRevenue);
  } else { 
    console.log(`No data found for chain ${options.chain} on ${options.startOfDay}`);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  }
}

const methodology = {
  UserFees: "All trading fees including protocol fees, partner fees, and MEV blocker fees",
  Fees: "All trading fees including protocol fees, partner fees, and MEV blocker fees", 
  Revenue: "Trading fees (protocol fees + cow's MEV blocker fees + partner fee share)",
  ProtocolRevenue: "Trading fees (protocol fees + cow's MEV blocker fees + partner fee share)",
}

const chainConfig = {
  [CHAIN.ETHEREUM]: { start: '2023-02-03' },
  [CHAIN.ARBITRUM]: { start: '2024-05-20' },
  [CHAIN.BASE]: { start: '2024-12-02' },
  [CHAIN.XDAI]: { start: '2023-02-03' },
  [CHAIN.AVAX]: { start: '2025-06-30' },
  [CHAIN.POLYGON]: { start: '2025-06-30' },
}

const adapter: Adapter = {
  fetch,
  adapter: chainConfig,
  methodology,
  prefetch,
  isExpensiveAdapter: true,
}

export default adapter;
