import { ChainBlocks, FetchOptions } from "../../adapters/types";

const abis = {
  "Trade": "event Trade(address indexed owner, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 feeAmount, bytes orderUid)", // gnosis
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, }: FetchOptions) => {
  const dailyVolume = createBalances()

  const logs = await getLogs({ target: '0x9008d19f58aabd9ed0d60971565aa8510560ab41', eventAbi: abis.Trade, })
  logs.forEach((log: any) => {
    dailyVolume.add(log.buyToken, log.buyAmount)
  })
  return { timestamp, dailyVolume }
};

const adapter: any = {
  adapter: {
    ethereum: { fetch, start: '2023-05-31', },
    xdai: { fetch, start: '2023-05-31', },
    arbitrum: { fetch, start: '2024-04-26', },
    base: { fetch, start: '2024-12-10', },
  },
};

export default adapter;
