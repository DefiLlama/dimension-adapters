import { CHAIN } from "../../helpers/chains";
import { FetchOptions, BreakdownAdapter } from "../../adapters/types";
import { getUniV3LogAdapter } from "../../helpers/uniswap";


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


const adapter: BreakdownAdapter = {
    breakdown: {
        v2: {
            [CHAIN.BLAST]: {
                fetch,
                start: '2024-02-29',
            }
        },
        CL: {
          [CHAIN.BLAST]: {
            fetch: () => ({} as any)
          }
        }
    },
    version: 2
}

export default adapter;
