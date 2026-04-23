import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetchFees = async ({ startTimestamp }: { startTimestamp: number }) => {
  const data = await httpGet(
    `https://grelfswap.com/api/defillama/fees?startTimestamp=${startTimestamp}`
  );
  return {
    dailyFees: Number(data?.dailyFeesUsd ?? 0),
    dailyRevenue: Number(data?.dailyFeesUsd ?? 0),
    timestamp: startTimestamp,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HEDERA]: {
      fetch: fetchFees,
      start: 1762473600,
      meta: {
        methodology: {
          Fees: "Platform fees collected on each swap (USD value of the fee taken from the input token).",
          Revenue: "All platform fees go to the protocol treasury.",
        },
        breakdownMethodology: {
          Fees: {
            "Swap Fees": "Platform fee on the input token of each swap, computed as (feeAmount / fromAmount) × valueUsd at execution time.",
          },
          Revenue: {
            "Swap Fees To Protocol": "Entire platform swap fee is retained by the protocol treasury (no token-holder distribution).",
          },
        },
      },
    },
  },
};

export default adapter;
