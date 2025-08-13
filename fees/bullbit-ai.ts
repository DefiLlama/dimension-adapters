import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addGasTokensReceived, addTokensReceived } from "../helpers/token";

const feeReceiverMultisig = [
  "0x87D30c1a5a79b060d7F6FBEa7791c381a2aFc7Ad"
]

const fromAddresses = [
  "0x20be1319c5604d272fb828a9dccd38487e973cb8"
]

const fetch: any = async (options: FetchOptions) => {
  const dailyRevenue = await addTokensReceived({
    options,
    targets: feeReceiverMultisig,
    fromAdddesses: fromAddresses,
    skipIndexer: true
  });

  await addGasTokensReceived({
    multisigs: feeReceiverMultisig,
    balances: dailyRevenue,
    options,
    fromAddresses
  });

  const dailyFees = dailyRevenue.clone();

  return { dailyFees, dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: { 
      fetch,
      meta: {
        methodology: {
          Fees: 'All fees paid by users for launching, trading tokens.',
          Revenue: 'Fees collected by bullbit.ai protocol.',
        }
      },
    },
  },
};

export default adapter;
