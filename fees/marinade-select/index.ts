import fetchURL from "../../utils/fetchURL"
import { FetchOptions, SimpleAdapter } from "../../adapters/types"
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
  const amounts: MarinadeAmounts = (await fetchURL('https://stats-api.marinade.finance/v1/integrations/defillama/fees')).select
  const coin = 'So11111111111111111111111111111111111111112'
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
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-05-21',
    },
  },
  runAtCurrTime: true,
  methodology: {
    // https://docs.llama.fi/list-your-project/other-dashboards/dimensions
    UserFees: 'Users paid fees to Marinade in Select program.',
    Fees: 'Staking rewards from Solana validators.',
    Revenue: 'Staking rewards collected by Marinade.',
    ProtocolRevenue: 'Staking rewards collected by Marinade.',
    SupplySideRevenue: 'Staking rewards ditributed to stakers.',
    HoldersRevenue: 'No revenue share to MNDE token holders.',
  }
}
export default adapter
