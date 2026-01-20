import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface VirtueFeeResponse {
  data: {
    collateralFee: number;
    liquidationFee: number;
    totalFee: number;
    periodDays: number;
  };
}

const virtueApiURL = "https://info.virtue.money/api";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()
  
  const url = `${virtueApiURL}/v1/fees`;
  const res: VirtueFeeResponse = await fetchURL(url);

  dailyFees.addUSDValue(res.data.collateralFee, 'Collateral Fees')
  dailyFees.addUSDValue(res.data.liquidationFee, 'Liquidation Fees')

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.IOTA],
  runAtCurrTime: true,
  methodology: {
    Fees: "All the services fees paid by users, including liquidation and collateral fees",
    UserFees: "All the services fees paid by users, including liquidation and collateral fees",
    Revenue: "All the services fees paid by users, including liquidation and collateral fees earned by Virtue",
    ProtocolRevenue: "All revenue are earned by Virtue",
  },
  breakdownMethodology: {
    Fees: {
      'Collateral Fees': 'Collateral fees paid by users.',
      'Liquidation Fees': 'Liquidation fees paid by users.',
    },
    Revenue: {
      'Collateral Fees': 'Protocol earns all collateral fees paid by users.',
      'Liquidation Fees': 'Protocol earns all liquidation fees paid by users.',
    },
  }
};

export default adapter;
