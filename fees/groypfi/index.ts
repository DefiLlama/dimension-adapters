import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FEE_RECIPIENT = "0:eee00893fff24abaa4f466789ed11a172103cf723e2e206619999edd42b8845944";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  const response = await fetch(
    `https://tonapi.io/v2/blockchain/accounts/${FEE_RECIPIENT}/transactions?limit=1000&start_date=${options.startTimestamp}&end_date=${options.endTimestamp}`
  );
  
  const data = await response.json();
  
  let totalFees = 0;
  for (const tx of data.transactions || []) {
    if (tx.in_msg?.value) {
      totalFees += tx.in_msg.value;
    }
  }
  
  dailyFees.addGasToken(totalFees);
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: '2025-01-04',
      meta: {
        methodology: {
          Fees: "1% fee on lending, DEX swaps, cross-chain swaps, perps, staking, and NFT marketplace",
          Revenue: "100% of fees go to protocol",
        },
      },
    },
  },
};

export default adapter;
