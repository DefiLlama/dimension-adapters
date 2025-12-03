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
  const amounts: MarinadeAmounts = (await fetchURL('https://stats-api.marinade.finance/v1/integrations/defillama/fees')).native
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
    UserFees: 'No Marinade fees in native staking',
    Fees: 'Staking rewards',
    Revenue: ' = ProtocolRevenue',
    ProtocolRevenue: ' = UserFees',
    SupplySideRevenue: 'Stakers revenue = Fees',
    HoldersRevenue: 'No revenue share to MNDE token holders.',
  },
  runAtCurrTime: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2023-07-12', // 2023-07-12T00:00:00Z
    },
  },
}
export default adapter
