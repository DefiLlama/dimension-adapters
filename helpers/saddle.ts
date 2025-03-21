import { FetchOptions } from "../adapters/types";

export async function getSaddleVolume(options: FetchOptions, pools: string[]) {
  const { createBalances, api, getLogs } = options;
  const tokens: any = []
  for (let i=0; i<4; i++) {
    const _tokens = await api.multiCall({  abi: 'function getToken(uint8) view returns (address)', calls: pools.map((pool) => ({ target: pool, params: i })), permitFailure: true });
    tokens.push(_tokens)
  }
  const dailyVolume = createBalances()
  const eventAbi = 'event TokenSwap (address indexed buyer, uint256 tokensSold, uint256 tokensBought, uint128 soldId, uint128 boughtId)'
  const logs = await getLogs({  targets: pools, eventAbi, flatten: false, });
  logs.forEach((log, i) => {
    log.forEach((_log) => dailyVolume.add(tokens[_log.boughtId][i], _log.tokensBought))
  })
  return { dailyVolume }

}