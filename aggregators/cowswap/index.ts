import { ChainBlocks, FetchOptions } from "../../adapters/types";

const abis = {
  "Trade": "event Trade(address indexed owner, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 feeAmount, bytes orderUid)", // gnosis
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, chain, api }: FetchOptions) => {
  const dailyVolume = createBalances()

  const logs = await getLogs({ target: '0x9008d19f58aabd9ed0d60971565aa8510560ab41', eventAbi: abis.Trade, })
  logs.forEach((log: any) => {
    dailyVolume.add(log.buyToken, log.buyAmount)
  })
  return { timestamp, dailyVolume }
};

const adapter: any = {
  adapter: {
    ethereum: { fetch, start: 1685491200, },
    xdai: { fetch, start: 1685491200, },
  },
};

export default adapter;
