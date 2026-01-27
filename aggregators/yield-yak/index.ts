import { ChainBlocks, FetchOptions } from "../../adapters/types";

const routers: any = {
  arbitrum: "0xb32C79a25291265eF240Eb32E9faBbc6DcEE3cE3",
  avax: "0xC4729E56b831d74bBc18797e0e17A295fA77488c",
}

const fetch = async (timestamp: number , _: ChainBlocks, { createBalances, getLogs, chain, }: FetchOptions) => {
  const dailyVolume = createBalances()
  const logs = await getLogs({
    target: routers[chain],
    eventAbi: 'event YakSwap (address indexed _tokenIn, address indexed _tokenOut, uint256 _amountIn, uint256 _amountOut)'
  });
  logs.forEach((log: any) => dailyVolume.add(log._tokenOut, log._amountOut));
  return { timestamp, dailyVolume}
};

const adapter: any = {
  adapter: {
    avax: { fetch, start: '2023-05-31', },
    arbitrum: { fetch, start: '2023-05-31', },
  },
};

export default adapter;
