import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from "../../helpers/token";

const defaultFeeCollectors = [
  '0x98114De4823484313d56b8a8D90c55224CE571AC',
  '0xab726237d912909c1b99a31d7194a30be84286ce',
];


export const config: any = {
  base: {
    fees_collectors: [...defaultFeeCollectors],
  },  
}

export const fetch = async (options: FetchOptions) => {
  const { chain } = options
  const { fees_collectors = defaultFeeCollectors } = config[chain] ?? {}
  const dailyRevenue = await getETHReceived({ options, targets: fees_collectors })

  return {    
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyVolume: dailyRevenue
  }

}

const methodology = {
  Fees: 'Total native ETH received by fee collector wallets on Base',
  Revenue: 'Total native ETH received by fee collector wallets on Base',
  ProtocolRevenue: 'Total native ETH received by fee collector wallets on Base',
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: '2026-04-01',
  methodology
}

export default adapter;
