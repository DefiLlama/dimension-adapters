import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

const fethcFeesSolana = async (options: FetchOptions) => {
  try {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const value = (await queryDune("3521814", {
      start: options.startTimestamp,
      end: options.endTimestamp,
      receiver: '2F6oCWmo44sxTzg228GkqKhwuhFTrUNTPCnSFBsyLZeg'
    }));
    dailyFees.add('So11111111111111111111111111111111111111112', value[0].fee_token_amount);
    dailyRevenue.add('So11111111111111111111111111111111111111112', value[0].fee_token_amount);
    return {
      dailyFees: dailyFees,
      dailyRevenue: dailyRevenue,
    }
  } catch (error: any) {
    console.error('Error fetching fees for Solana', error);
    return {
      dailyFees: "0",
    }
  }
}


const adapter: SimpleAdapter = {
  version: 2,
  isExpensiveAdapter: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      start: 1685577600,
    },
  }
}

export default adapter;
