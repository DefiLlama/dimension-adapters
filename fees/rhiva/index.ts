import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { postURL } from "../../utils/fetchURL";

interface Metrics {
  volume: number;
  userFees: number;
  protocolFees: number;
  transactions: number;
}

const RHIVA_ENDPOINT = "https://api.rhiva.fun/metrics/fees";

const fetch = async ({
  createBalances,
  fromTimestamp,
  toTimestamp,
}: FetchOptions) => {
  const amounts: Metrics = await postURL(RHIVA_ENDPOINT, {
    filter: {
      endTime: new Date(toTimestamp * 1000).toISOString(),
      startTime: new Date(fromTimestamp * 1000).toISOString(),
    },
  });
  console.log(amounts)
 
  const dailyFees = createBalances();
  const dailyUserFees = createBalances();
  const dailyProtocolRevenue = createBalances();

  dailyFees.addUSDValue(amounts.userFees);
  dailyFees.addUSDValue(amounts.protocolFees);
  dailyUserFees.addUSDValue(amounts.userFees);
  dailyProtocolRevenue.addUSDValue(amounts.protocolFees);

  return {
    dailyFees,
    dailyUserFees,
    dailyProtocolRevenue,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-09-11",
    },
  },
  runAtCurrTime: true,
  methodology: {
    UserFees: "Users paid fees to referrals",
    Fees: "Staking rewards from Solana validators.",
    Revenue: "Swap Fees collected by Rhiva.",
    ProtocolRevenue: "~90% revenue is collected by Rhiva.",
  },
};
export default adapter;
