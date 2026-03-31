import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abis = {
  "Trade": "event Trade(address indexed owner, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 feeAmount, bytes orderUid)", // gnosis
}

const fetch = async ({ createBalances, getLogs, }: FetchOptions) => {
  const dailyVolume = createBalances()

  const logs = await getLogs({ target: '0x9008d19f58aabd9ed0d60971565aa8510560ab41', eventAbi: abis.Trade, })
  logs.forEach((log: any) => {
    dailyVolume.add(log.buyToken, log.buyAmount)
  })
  return { dailyVolume }
};

const adapter: any = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2023-05-31', },
    [CHAIN.XDAI]: { start: '2023-05-31', },
    [CHAIN.ARBITRUM]: { start: '2024-04-26', },
    [CHAIN.BASE]: { start: '2024-12-10', },
    [CHAIN.POLYGON]: { start: '2023-12-10', },
    [CHAIN.AVAX]: { start: '2025-03-10', },
    [CHAIN.LENS]: { start: '2025-06-16', },
    [CHAIN.BSC]: { start: '2025-09-04', },
  },
};

export default adapter;
