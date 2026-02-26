import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";

const fetch: any = async ({ getLogs, createBalances, }: FetchOptions) => {
  const dailyVolume = createBalances()
  let eventAbi = "event Swap(address indexed pool, address indexed user, bytes32[] tokenRef, int128[] delta)"
  const logs = await getLogs({ target: "0x10F6b147D51f7578F760065DF7f174c3bc95382c", eventAbi, })
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
  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BLAST]: {
      fetch,
      start: '2024-02-29',
    }
  }
}

export default adapter;
