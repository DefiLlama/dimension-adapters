import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { addWalletVAsterAmounts, fetchWalletVAsterDay, WALLET_V_ASTER_START } from '../helpers/wallet-v-aster';

const BUILDER_FEES = 'Aster Builder Fees';
const BUILDER_REVENUE = 'Aster Builder Fees To Wallet V';

async function fetch(options: FetchOptions) {
  const day = await fetchWalletVAsterDay(options.dateString);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  addWalletVAsterAmounts(dailyFees, day.builderFeesByAsset, options.dateString, BUILDER_FEES);
  addWalletVAsterAmounts(dailyRevenue, day.builderFeesByAsset, options.dateString, BUILDER_REVENUE);
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
}

const revenueBreakdown = {
  [BUILDER_REVENUE]: 'Builder commissions attributed to Wallet V by Aster on its Futures fills.',
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.ASTER],
  start: WALLET_V_ASTER_START,
  fetch,
  doublecounted: true,
  methodology: {
    Fees: "Builder fees attributed to Wallet V by Aster userCommissions on Futures fills, including privacy-mode users, by UTC trade date.",
    Revenue: 'Wallet V Builder commissions accrued on Aster Futures fills.',
    ProtocolRevenue: 'Wallet V share of Builder commissions accounted for on the trade date.',
  },
  breakdownMethodology: {
    Fees: { [BUILDER_FEES]: 'Reported Builder fee charged on a Wallet V Aster Futures fill.' },
    Revenue: revenueBreakdown,
    ProtocolRevenue: revenueBreakdown,
  },
};

export default adapter;
