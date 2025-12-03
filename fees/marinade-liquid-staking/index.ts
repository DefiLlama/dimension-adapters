import ADDRESSES from '../../helpers/coreAssets.json'
import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

interface MarinadeAmounts {
  dailyFees: string;
  dailyUserFees: string;
  dailyRevenue: string;
  dailyProtocolRevenue: string;
  dailySupplySideRevenue: string;
}

const fetch = async (_a: any, _b: any, { createBalances }: FetchOptions) => {
  // Amounts in SOL lamports
  const amounts: MarinadeAmounts = (await fetchURL('https://stats-api.marinade.finance/v1/integrations/defillama/fees')).liquid
  const coin = ADDRESSES.solana.SOL
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  dailyFees.add(coin, amounts.dailyFees);
  dailyUserFees.add(coin, amounts.dailyUserFees);
  dailyRevenue.add(coin, amounts.dailyRevenue);
  dailyProtocolRevenue.add(coin, amounts.dailyProtocolRevenue);
  dailySupplySideRevenue.add(coin, amounts.dailySupplySideRevenue);

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology: {
    // https://docs.llama.fi/list-your-project/other-dashboards/dimensions
    UserFees: 'Marinade management fee 6% on staking rewards',
    Fees: 'Staking rewards',
    Revenue: 'Amount of 6% staking rewards',
    ProtocolRevenue: 'Amount of 6% staking rewards collected by Marinade',
    SupplySideRevenue: 'Amount of 94% staking rewards are distributed to stakers',
    HoldersRevenue: 'No revenue share to MNDE token holders.',
  },
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2023-07-12', // 2023-07-12T00:00:00Z
      runAtCurrTime: true,
    },
  },
}
export default adapter
