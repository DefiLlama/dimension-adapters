import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch: any = async (timestamp: number, _, { getLogs, createBalances, }: FetchOptions) => {
  const dailyVolume = createBalances()
  let eventAbi = "event Swap(address indexed pool, address indexed user, bytes32[] tokenRef, int128[] delta)"
  const logs = await getLogs({ target: "0x1d0188c4B276A09366D05d6Be06aF61a73bC7535", eventAbi, })
  logs.forEach((log: any) => {
    const pool = log.pool.toLowerCase()
    const hasPool = log.tokenRef.some((val: string) => '0x' + val.slice(2 + 24).toLowerCase() === pool)
    // this is lp deposit/withdrawal, not swap
    if (hasPool) return;
    log.tokenRef.forEach((val: string, i: number) => {
      const token = '0x' + val.slice(2 + 24).toLowerCase()
      const volume = Number(log.delta[i])
      if (volume < 0) return;
      dailyVolume.add(token, volume)
    })
  })
  return { dailyVolume, timestamp, };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.LINEA]: {
      fetch,
      start: '2023-08-01',
    },
  }
};

export default adapter;
