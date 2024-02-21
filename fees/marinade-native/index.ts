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

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances }: FetchOptions): Promise<FetchResult> => {
  // Amounts in SOL lamports
  const amounts: MarinadeAmounts = (await fetchURL('https://stats-api.marinade.finance/v1/integrations/defillama/fees')).native
  const coin = 'So11111111111111111111111111111111111111112'
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
    timestamp: timestamp,
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
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: 1689120000, // 2023-07-12T00:00:00Z
      runAtCurrTime: true,
      meta: {
        methodology: {
          // https://docs.llama.fi/list-your-project/other-dashboards/dimensions
          UserFees: 'No Marinade fees in native staking',
          Fees: 'Staking rewards',
          Revenue: ' = ProtocolRevenue',
          ProtocolRevenue: ' = UserFees',
          SupplySideRevenue: 'Stakers revenue = Fees'
        },
        hallmarks:[
          [1667865600, 'FTX collapse'],
        ],
      },
    },
  },
}
export default adapter
