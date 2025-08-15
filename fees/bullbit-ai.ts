import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getETHReceived } from "../helpers/token";

const feeReceiverMultisig = [
  "0x87D30c1a5a79b060d7F6FBEa7791c381a2aFc7Ad",
]

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  await getETHReceived({
    targets: feeReceiverMultisig,
    balances: dailyFees,
    options
  });

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  methodology: {
    Fees: 'All fees paid by users for launching, trading tokens.',
    Revenue: 'All fees collected by bullbit.ai protocol.',
    ProtocolRevenue: 'All fees collected by bullbit.ai protocol.',
  },
  chains: [CHAIN.BSC],
};

export default adapter;
