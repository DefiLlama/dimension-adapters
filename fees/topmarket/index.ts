import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { reconstruct } from './accounting';
import { inputs, Inputs } from './config';
import { loadContext } from './onchain';
import { loadReferrals, referralEntries } from './referrals';

const feeDescriptions = {
  'Gacha Fees': 'Actual paid draw payments less fees routed to the excluded Jackpot, established refunds/rescues and player card buybacks; recognized at the economic event, including deferred payouts.',
  'Marketplace Trading Fees': 'Per-trade floor(amount * effective feeBps / 10000); seller proceeds excluded.',
};
const supplierDescriptions = {
  'Gacha Referrals': 'Final Gacha referral commissions recognized once at settled_at after eligible refunds; pending estimates and later withdrawals are excluded.',
  'Marketplace Referrals': 'Final Marketplace and auction referral commissions recognized once at settled_at; withdrawals do not create another expense.',
  'Gacha Keep To Suppliers': 'Keep sale proceeds owed to the historical user staker, including deferred obligations; platform inventory Safe and treasury stakes are internal allocations.',
  'Gacha Recycle To Suppliers': 'Recycle profit share owed to the historical user staker; excludes player buyback and internal platform-staker allocations.',
};
const revenueDescriptions = {
  'Gacha Revenue To Protocol': 'Draw payments after excluded Jackpot contributions, refunds, player buybacks, external supplier Keep proceeds, Recycle shares and finalized referral commissions.',
  'Marketplace Revenue To Protocol': 'Per-trade fees at the effective on-chain rate less finalized referral commissions; seller principal excluded.',
};

/** Convert complete raw-token entries into labeled metrics, rejecting partial attribution. */
export function balances(options: FetchOptions, result: ReturnType<typeof reconstruct>) {
  if (result.unresolved.length) throw new Error(`TopMarket: revenue attribution missing:\n${result.unresolved.join('\n')}`);
  const dailyFees = options.createBalances(), dailyVolume = options.createBalances();
  const dailyRevenue = options.createBalances(), dailySupplySideRevenue = options.createBalances();
  for (const e of result.entries) {
    const marketplace = e.label === 'Marketplace Trading Fees' || e.label === 'Marketplace Referrals';
    if (e.volume) dailyVolume.add(e.token, e.volume.toString());
    // Refunds/buybacks net against the original category, not separate negative rows.
    if (e.fees) dailyFees.add(e.token, e.fees.toString(), marketplace ? 'Marketplace Trading Fees' : 'Gacha Fees');
    if (e.supply) dailySupplySideRevenue.add(e.token, e.supply.toString(), e.label);
    if (e.fees - e.supply) dailyRevenue.add(e.token, (e.fees - e.supply).toString(), marketplace ? 'Marketplace Revenue To Protocol' : 'Gacha Revenue To Protocol');
  }
  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyVolume, dailyUserFees: dailyFees.clone(), dailyProtocolRevenue: dailyRevenue.clone() };
}

/** Run the same chain and referral accounting for a fetch or an explicitly selected audit window. */
export async function audit(options: FetchOptions, policy: Inputs = inputs, source = loadReferrals) {
  const referrals = await source(options.startTimestamp, options.endTimestamp); // Coverage before expensive RPC.
  const context = await loadContext(options, referrals.filter(r => r.source_type === 'pack_purchase')
    .map(r => ({ address: r.box_address, blockNumber: r.block_number })));
  const entries = await referralEntries(referrals, context, options);
  return { context, ...reconstruct(context, policy, options.startTimestamp, options.endTimestamp, entries) };
}

/** Remove only the official runner's extra overlap second; preserve exact caller windows. */
export function hourlyStart(options: Pick<FetchOptions, 'startTimestamp' | 'endTimestamp'>) {
  // runAdapter.ts uses end - 1 - windowSize as the start for both hourly and
  // daily runs. Remove that one-second overlap; exact [start,end) callers stay
  // unchanged, and daily runs fit the public referral API's 24-hour limit.
  const duration = options.endTimestamp - options.startTimestamp;
  return options.startTimestamp + (duration === 3601 || duration === 86401 ? 1 : 0);
}

/** Fetch complete hourly metrics using the runner's normalized half-open time window. */
const fetch = async (options: FetchOptions) => {
  return balances(options, await audit({ ...options, startTimestamp: hourlyStart(options) }));
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  start: new Date(inputs.statisticsStart!.timestamp * 1000).toISOString().slice(0, 10),
  fetch,
  allowNegativeValue: true, // Cross-day refunds/buybacks/supplier obligations can exceed that window's sales.
  methodology: {
    Fees: 'User-paid standard and nonstandard Gacha sales less fees historically routed to Jackpot, refunds and player card buybacks, plus user-paid Marketplace trading fees at the effective on-chain rate; includes real internal-test activity from deployment and excludes Shipping, Jackpot flows and unverified product versions.',
    Revenue: 'Gacha payments net of Jackpot contributions, refunds, player buybacks, user-staker proceeds and finalized referral commissions, plus Marketplace fees net of finalized referral commissions; Jackpot income/payouts and procurement/operating costs are not included.',
    SupplySideRevenue: 'Keep proceeds and Recycle profit shares owed to historical user stakers, plus Gacha and Marketplace referral commissions recognized once at final settlement; platform-staker allocations, pending referral estimates and later withdrawals are excluded.',
    ProtocolRevenue: 'Gacha payments after Jackpot contributions, refunds, player buybacks, user-staker allocations and finalized referral commissions, plus Marketplace fees after finalized referral commissions; excludes Jackpot income/payouts and governance-token holder distributions, while platform-staker allocations remain internal.',
    Volume: 'Gross paid Gacha sales, including the fee routed to Jackpot, plus final Marketplace trades, reversing the original gross payment on draw refunds; buybacks, Jackpot payouts/deposits, Shipping, listings, bids and withdrawals add no Volume, and this secondary metric does not create an independent Volume listing.',
  },
  breakdownMethodology: {
    Fees: feeDescriptions,
    Revenue: revenueDescriptions,
    ProtocolRevenue: revenueDescriptions,
    SupplySideRevenue: supplierDescriptions,
  },
};
export default adapter;
