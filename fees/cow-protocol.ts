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

const fetch = async (options: FetchOptions) => {
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
  UserFees: "Swap fees from the sell token: protocol fees (50% surplus + 2bps volume), partner fees, and MEV Blocker fees",
  Fees: "Swap fees from the sell token: protocol fees (50% surplus + 2bps volume), partner fees, and MEV Blocker fees",
  Revenue: "CoW DAO share: protocol fees, ~25% partner service fee, and 50% of MEV Blocker fees/sale proceeds",
  ProtocolRevenue: "CoW DAO share: protocol fees, ~25% partner service fee, and 50% of MEV Blocker fees/sale proceeds",
  SupplySideRevenue: "Partner integrator share and 50% of MEV Blocker fees/sale proceeds to Beaver Build",
  HoldersRevenue: "No revenue to COW token holders",
}

const breakdownMethodology = {
  Fees: {
    'CoW Protocol Fees': '50% of user surplus and 2bps on volume.',
    'Partner Fees for CoW': 'Service fee from partner integrations (~25% on average). Converted to WETH.',
    'Partner Fees for Partners': 'Fees paid to widget/API integrators.',
    'MEV Blocker Fees': 'Per-block fees from block builders. Split 50/50 with Beaver Build.',
    'MEV Blocker Sale': 'One-off MEV Blocker stake sale (CIP-73), on 3 payment dates. Split 50/50 with Beaver Build.',
  },
  UserFees: {
    'CoW Protocol Fees': '50% of user surplus and 2bps on volume.',
    'Partner Fees for CoW': 'Service fee from partner integrations (~25% on average). Converted to WETH.',
    'Partner Fees for Partners': 'Fees paid to widget/API integrators.',
    'MEV Blocker Fees': 'Per-block fees from block builders. Split 50/50 with Beaver Build.',
    'MEV Blocker Sale': 'One-off MEV Blocker stake sale (CIP-73), on 3 payment dates. Split 50/50 with Beaver Build.',
  },
  Revenue: {
    'CoW Protocol Fees': '50% of user surplus and 2bps on volume.',
    'Partner Fees for CoW': 'Service fee from partner integrations (~25% on average). Converted to WETH.',
    'MEV Blocker Fees to CoW DAO': 'CoW DAO share of MEV Blocker fees.',
    'MEV Blocker Sale Amount to CoW DAO': 'CoW DAO share of MEV Blocker sale proceeds (buyer: SMG / Consensys).',
  },
  ProtocolRevenue: {
    'CoW Protocol Fees': '50% of user surplus and 2bps on volume.',
    'Partner Fees for CoW': 'Service fee from partner integrations (~25% on average). Converted to WETH.',
    'MEV Blocker Fees to CoW DAO': 'CoW DAO share of MEV Blocker fees.',
    'MEV Blocker Sale Amount to CoW DAO': 'CoW DAO share of MEV Blocker sale proceeds (buyer: SMG / Consensys).',
  },
  SupplySideRevenue: {
    'Partner Fees for Partners': 'Fees paid to widget/API integrators.',
    'MEV Blocker Fees to Beaver Build': 'Beaver Build share of MEV Blocker fees.',
    'MEV Blocker Sale Amount to Beaver Build': 'Beaver Build share of MEV Blocker sale proceeds.',
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
