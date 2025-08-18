import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from "../../helpers/token";

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

  const dailyVolume = dailyFees.resizeBy(100) // because of 1% fixed platform fee as per docs

  return {
    dailyVolume: dailyVolume
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2025-16-08',
    },
  },
}

export default adapter
