import { SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { fetchFees } from '../helpers/faze';

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ARC],
  start: '2026-09-13',
  fetch: fetchFees,
  // Live splits can reallocate pending fees. Buyback funding and later keeper rewards can
  // reclassify earlier revenue, so protocol/holder components may be negative in a window.
  allowNegativeValue: true,
  methodology: {
    Fees: 'Trading fees on FAZE bonding curves and graduated pools, plus token launch and graduation fees. Settled fees are adjusted for opening and closing pending balances.',
    Revenue: 'Fees retained by FAZE: platform treasury allocations plus creator fees from FAZE own-token pools. Excludes other projects creator allocations and fees allocated to locked liquidity. Buybacks are a subsequent capital allocation, not additional revenue.',
    SupplySideRevenue: 'Creator allocations for other launched tokens, including their own burners, plus fees allocated to locked liquidity. Pending allocations use the contracts live split at each boundary.',
    ProtocolRevenue: 'Retained revenue after reclassifying net fees paid to the FAZE buyback burner; includes FAZE own-pool creator fees not yet distributed. This is revenue attribution, not a treasury cash balance.',
    HoldersRevenue: 'Native USDC fees paid by the hook to the designated FAZE buyback burner, less failed-payment recredits and actual keeper rewards. Recognized at funding rather than swap execution; excludes unrelated deposits and other tokens burners.',
  },
  breakdownMethodology: { Fees: {
    'Curve Trading Fees': 'Actual fees charged in bonding-curve buy and sell events, in each launch quote asset.',
    'Hook Trading Fees': 'Fees charged by the FAZE hook, recognized on accrual rather than when claimed; the pool LP fee is zero.',
    'Token Launch Fees': 'Native USDC launch fee in force at the time of each launch, reconstructed from fee-setting events.',
    'Graduation Fees': 'Quote-asset migration fee recorded on successful curve graduation.',
  }, Revenue: {
    'Fees Retained by FAZE': 'Gross fees less other-project creator allocations and locked-liquidity allocations; includes FAZE own-pool creator fees.',
  }, SupplySideRevenue: {
    'Trading Fees to Creators': 'Fees allocated to creators of other tokens launched on FAZE, irrespective of whether they redirect them to their own burners.',
    'Trading Fees to Locked Liquidity': 'Trading fees allocated to compounding into locked positions, counted once at allocation.',
  }, ProtocolRevenue: {
    'FAZE Revenue After Buyback Funding': 'Total retained fee revenue less net fee-funded distributions to the FAZE burner. Funding can distribute prior-period earnings; negative periods are not clamped.',
  }, HoldersRevenue: {
    'FAZE Buyback Funding': 'Successful native fee payouts from hook OwedWithdrawn events to the FAZE burner, net of PayoutOwed recredits and keeper bountyWei. Unspent buyback funding remains included; executed spending is a separate measure.',
  } },
};
export default adapter;
