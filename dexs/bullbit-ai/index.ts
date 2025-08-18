import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from "../../helpers/token";

const FIXED_PLATFORM_FEE = 1 // 1%

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

  const dailyVolume = dailyFees.clone(100 / FIXED_PLATFORM_FEE)

  return {
    dailyVolume: dailyVolume,
    dailyFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'All fees paid by users for launching, trading tokens.',
    Revenue: 'All fees collected by bullbit.ai protocol.',
    ProtocolRevenue: 'All fees collected by bullbit.ai protocol.',
  },
  fetch,
  chains: [CHAIN.BSC],
  start: '2025-08-16',
}

export default adapter
