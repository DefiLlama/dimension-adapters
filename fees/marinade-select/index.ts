import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
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
  const amounts: MarinadeAmounts = (await fetchURL('https://stats-api.marinade.finance/v1/integrations/defillama/fees')).select
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
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-05-21',
      runAtCurrTime: true,
    },
  },
  methodology: {
    // https://docs.llama.fi/list-your-project/other-dashboards/dimensions
    UserFees: 'Users paid fees to Marinade in Select program.',
    Fees: 'Staking rewards from Solana validators.',
    Revenue: 'Staking rewards collected by Marinade.',
    ProtocolRevenue: 'Staking rewards collected by Marinade.',
    SupplySideRevenue: 'Staking rewards ditributed to stakers.'
  }
}
export default adapter
