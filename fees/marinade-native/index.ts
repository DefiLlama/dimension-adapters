import ADDRESSES from '../../helpers/coreAssets.json'
import fetchURL from "../../utils/fetchURL"
import { ChainBlocks, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

interface MarinadeAmounts {
  dailyFees: string;
  totalFees: string;
  dailyUserFees: string;
  totalRevenue: string;
  dailyRevenue: string;
  dailyProtocolRevenue: string;
  dailySupplySideRevenue: string;
  totalProtocolRevenue: string;
  totalSupplySideRevenue: string;
  totalUserFees: string;
}

const fetch = async ({ createBalances }: FetchOptions) => {
  // Amounts in SOL lamports
  const amounts: MarinadeAmounts = (await fetchURL('https://stats-api.marinade.finance/v1/integrations/defillama/fees')).native
  const coin = ADDRESSES.solana.SOL
  const dailyFees = createBalances();
  const totalFees = createBalances();
  const dailyUserFees = createBalances();
  const totalRevenue = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const totalProtocolRevenue = createBalances();
  const totalSupplySideRevenue = createBalances();
  const totalUserFees = createBalances();

  dailyFees.add(coin, amounts.dailyFees);
  totalFees.add(coin, amounts.totalFees);
  dailyUserFees.add(coin, amounts.dailyUserFees);
  totalRevenue.add(coin, amounts.totalRevenue);
  dailyRevenue.add(coin, amounts.dailyRevenue);
  dailyProtocolRevenue.add(coin, amounts.dailyProtocolRevenue);
  dailySupplySideRevenue.add(coin, amounts.dailySupplySideRevenue);
  totalProtocolRevenue.add(coin, amounts.totalProtocolRevenue);
  totalSupplySideRevenue.add(coin, amounts.totalSupplySideRevenue);
  totalUserFees.add(coin, amounts.totalUserFees);

  return {
    totalFees,
    dailyFees,
    dailyUserFees,
    totalRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    totalProtocolRevenue,
    totalSupplySideRevenue,
    totalUserFees,
  }
}

const adapter: SimpleAdapter = {
  methodology: {
    // https://docs.llama.fi/list-your-project/other-dashboards/dimensions
    UserFees: 'No Marinade fees in native staking',
    Fees: 'Staking rewards',
    Revenue: ' = ProtocolRevenue',
    ProtocolRevenue: ' = UserFees',
    SupplySideRevenue: 'Stakers revenue = Fees'
  },
  version: 2,
  runAtCurrTime: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2023-07-12', // 2023-07-12T00:00:00Z
    },
  },
}
export default adapter
