import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SWAP_EVENT = 'event Swap(address indexed token, address indexed user, uint256 tokenIn, uint256 ethIn, uint256 tokenOut, uint256 ethOut, uint256 priceBefore, uint256 priceAfter)'

const chainConfig: Record<string, { start: string, deadFrom?: string, curves: string[] }> = {
  [CHAIN.BASE]: {
    start: '2024-04-04',
    curves: [
      '0xf6af6c034e92694a4c79569b03543d580df402d7', // first swap 2024-04-04
      '0x992d40d9ed8937bb0ad3c0ba99713072ae0a05b3', // 2024-04-08
      '0x135de7f9223c76b7d0278ffe854ec480d37fe906', // 2024-05-01
      '0x3ccc78545f675a188b7521f7f4b4791995752635', // 2024-05-27
      '0x0bf8edd756ff6caf3f583d67a9fd8b237e40f58a', // 2024-07-18
      '0xc750af290bb41ca5dec04f22cd1318e940dd826a', // 2024-11-27
    ],
  },
  [CHAIN.ETHEREUM]: {
    start: '2024-09-04',
    deadFrom: '2025-07-08', // last swap on either curve 2025-07-07
    curves: [
      '0xda7a42492d27b2d145b1f1c5f0f59ccb79ffedaf', // first swap 2024-09-04
      '0xa7d854eaf481846f7da8cc863a46ac1f67b548d8', // 2024-09-06
    ],
  },
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const logs = await options.getLogs({ targets: chainConfig[options.chain].curves, eventAbi: SWAP_EVENT })
  logs.forEach((log: any) => dailyVolume.addGasToken(log.ethIn + log.ethOut))
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume: "ETH value of every buy and sell on Ape.Store bonding curves, net of the 1% platform fee. Tokens that launch directly into Uniswap pools and trading after a token leaves its curve are excluded, as that volume belongs to the DEX it trades on.",
  },
}

export default adapter
