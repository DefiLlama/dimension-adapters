import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";

const mevBlockerSaleDates = [
  '2025-11-04',
  '2026-01-21',
  '2026-02-17',
]

const prefetch = async (options: FetchOptions) => {
  const now = new Date();
  if (now.getUTCHours() === 0 && now.getUTCMinutes() < 59) {
    throw new Error("cow-swap adapter is disabled b/w 00:00 and 00:59 AM UTC");
  }
  const sql = getSqlFromFile("helpers/queries/cow-protocol.sql", {
    start: options.startOfDay
  });
  return await queryDuneSql(options, sql);
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const preFetchedResults = options.preFetchedResults || [];
  const dune_chain = options.chain === CHAIN.XDAI ? 'gnosis' : options.chain === CHAIN.AVAX ? 'avalanche_c' : options.chain;
  const data = preFetchedResults.find((result: any) => result.chain === dune_chain);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (data) {
    // All values are now in ETH from the new dune query
    const protocolFee = data.protocol_fee_revenue || 0;
    const partnerFeePartner = data.partner_fee_partner_revenue || 0;
    const mevBlockerFee = data.mev_blocker_fee || 0;
    const mevBlockerSale = Number(data.mev_blocker_sale || 0);
    // const limitFee = data.limit_revenue || 0;
    // const marketFee = data.market_revenue || 0;
    // const uiFee = data.ui_fee_revenue || 0;
    const partnerFeeCow = data.partner_fee_cow_revenue || 0;

    let totalFees = protocolFee + partnerFeeCow + partnerFeePartner + (mevBlockerFee * 2) + (mevBlockerSale * 2); // beaverbuild receive same amount for mevBlockerFee
    // let protocolRevenue = protocolFee + partnerFeeCow + mevBlockerFee; // Excluding partner fees

    // Sanity check for Gnosis chain
    if (options.chain === CHAIN.XDAI && totalFees > 5) {
      throw new Error(`Total fees ${totalFees} ETH very high for gnosis. Protocol: ${protocolFee}, Partner(Partner): ${partnerFeePartner}, Partner(COW): ${partnerFeeCow}, MEV: ${mevBlockerFee}, MEV Sale: ${mevBlockerSale}`);
    }

    if(options.chain === CHAIN.ETHEREUM && totalFees > 1000 && !mevBlockerSaleDates.includes(options.dateString)) {
      // totalFees = 0;
      // protocolRevenue = 0;
      throw new Error(`Total fees ${totalFees} ETH very high for ethereum. Protocol: ${protocolFee}, Partner(Partner): ${partnerFeePartner}, Partner(COW): ${partnerFeeCow}, MEV: ${mevBlockerFee}, MEV Sale: ${mevBlockerSale}`);
    }

    dailyFees.addCGToken('ethereum', protocolFee, 'CoW Protocol Fees');
    dailyFees.addCGToken('ethereum', partnerFeeCow, 'Partner Fees for CoW');
    dailyFees.addCGToken('ethereum', partnerFeePartner, 'Partner Fees for Partners');
    dailyFees.addCGToken('ethereum', mevBlockerFee * 2, 'MEV Blocker Fees');
    dailyFees.addCGToken('ethereum', mevBlockerSale * 2, 'MEV Blocker Sale');

    dailySupplySideRevenue.addCGToken('ethereum', partnerFeePartner, 'Partner Fees for Partners');
    dailySupplySideRevenue.addCGToken('ethereum', mevBlockerFee, 'MEV Blocker Fees to Beaver Build');
    dailySupplySideRevenue.addCGToken('ethereum', mevBlockerSale, 'MEV Blocker Sale Amount to Beaver Build');

    dailyRevenue.addCGToken('ethereum', mevBlockerFee, 'MEV Blocker Fees to CoW DAO');
    dailyRevenue.addCGToken('ethereum', mevBlockerSale, 'MEV Blocker Sale Amount to CoW DAO');
    dailyRevenue.addCGToken('ethereum', protocolFee, 'CoW Protocol Fees');
    dailyRevenue.addCGToken('ethereum', partnerFeeCow, 'Partner Fees for CoW');
  } else {
    if (options.chain === CHAIN.LENS) return {}
    throw new Error(`No data found for chain ${options.chain} on ${options.startOfDay}`);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  }
}

const methodology = {
  UserFees: "All trading fees including protocol fees, partner fees, and MEV blocker fees",
  Fees: "All trading fees including protocol fees, partner fees, and MEV blocker fees",
  Revenue: "Trading fees (protocol fees + 1/2 cow's MEV blocker fees + partner fee share)",
  ProtocolRevenue: "Trading fees (protocol fees + 1/2 cow's MEV blocker fees + partner fee share)",
  SupplySideRevenue: "Partner fee share + 1/2 MEV blocker fees for block builders",
  HoldersRevenue: "No revenue share to COW token holders",
}

const breakdownMethodology = {
  Fees: {
    'CoW Protocol Fees': 'Swap fees share for CoW protocol.',
    'Partner Fees for CoW': 'Share of partner fees for CoW protocol.',
    'Partner Fees for Partners': 'Share of partner fees for partners.',
    'MEV Blocker Fees': 'MEV blockers fee for CoW protocol and block builders.',
    'MEV Blocker Sale': `Non-recurring proceeds from selling CoW DAO's MEV Blocker RPC stake (CIP-73). Recognized on 3 sale payment dates, split equally between CoW DAO and Beaver Build.`,
  },
  UserFees: {
    'CoW Protocol Fees': 'Swap fees share for CoW protocol.',
    'Partner Fees for CoW': 'Share of partner fees for CoW protocol.',
    'Partner Fees for Partners': 'Share of partner fees for partners.',
    'MEV Blocker Fees': 'MEV blockers fee for CoW protocol and block builders.',
    'MEV Blocker Sale': `Non-recurring proceeds from selling CoW DAO's MEV Blocker RPC stake (CIP-73). Recognized on 3 sale payment dates, split equally between CoW DAO and Beaver Build.`,
  },
  Revenue: {
    'CoW Protocol Fees': 'Swap fees share for CoW protocol.',
    'Partner Fees for CoW': 'Share of partner fees for CoW protocol.',
    'MEV Blocker Fees to CoW DAO': 'MEV blockers fee for CoW protocol.',
    'MEV Blocker Sale Amount to CoW DAO': `CoW DAO's 50% share of MEV Blocker sale proceeds, recognized on each sale payment date (buyer: SMG / Consensys).`,
  },
  ProtocolRevenue: {
    'CoW Protocol Fees': 'Swap fees share for CoW protocol.',
    'Partner Fees for CoW': 'Share of partner fees for CoW protocol.',
    'MEV Blocker Fees to CoW DAO': 'MEV blockers fee for CoW protocol.',
    'MEV Blocker Sale Amount to CoW DAO': `CoW DAO's 50% share of MEV Blocker sale proceeds, recognized on each sale payment date (buyer: SMG / Consensys).`,
  },
  SupplySideRevenue: {
    'Partner Fees for CoW': 'Share of partner fees for partners.',
    'MEV Blocker Fees to Beaver Build': 'MEV blockers fee for block builders.',
    'MEV Blocker Sale Amount to Beaver Build': `Beaver Build's 50% share of MEV Blocker sale proceeds, recognized on each sale payment date.`,
  },
}

const chainConfig = {
  [CHAIN.ETHEREUM]: { start: '2023-02-03' },
  [CHAIN.ARBITRUM]: { start: '2024-05-20' },
  [CHAIN.BASE]: { start: '2024-12-02' },
  [CHAIN.XDAI]: { start: '2023-02-03' },
  [CHAIN.AVAX]: { start: '2025-06-30' },
  [CHAIN.POLYGON]: { start: '2025-06-30' },
  [CHAIN.LENS]: { start: '2025-06-16', },
}

const adapter: Adapter = {
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
  prefetch,
  isExpensiveAdapter: true,
}

export default adapter;
