import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetchFees = async ({ startTimestamp }: { startTimestamp: number }) => {
  const response = await globalThis.fetch(
    `https://grelfswap.com/api/defillama/fees?startTimestamp=${startTimestamp}`
  );
  const data = await response.json();
  return {
    dailyFees: data.dailyFeesUsd,
    dailyRevenue: data.dailyFeesUsd,
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
      },
    },
  },
};

export default adapter;
