import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addGasTokensReceived, addTokensReceived } from "../helpers/token";

type TMulitsig = {
  [s: string]: string[];
}
const multisig1 = "0x4a183b7ed67b9e14b3f45abfb2cf44ed22c29e54";
const multisig2 = "0x7d20ab6d8af50d87a5e8def46e48f4d7dc2ea5c7";

const multisigs: TMulitsig = {
  [CHAIN.ETHEREUM]: [multisig1],
  [CHAIN.OPTIMISM]: [multisig2],
  [CHAIN.ARBITRUM]: [multisig1],
  [CHAIN.BASE]: [multisig2],
  [CHAIN.POLYGON]: [multisig1],
  [CHAIN.BSC]: [multisig1]
}

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await addGasTokensReceived({ multisigs: multisigs[options.chain], options })
  await addTokensReceived({ targets: multisigs[options.chain], options, balances: dailyFees, })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, }
}

const methodology = {
  Fees: "Take 0.5% from trading volume",
  Revenue: "Take 0.5% from trading volume",
}

const adapter: Adapter = {
  fetch, start: '2023-01-01',
  methodology,
  version: 2,
  chains: [CHAIN.ETHEREUM, CHAIN.OPTIMISM, CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.POLYGON, CHAIN.BSC,],
}

export default adapter;
