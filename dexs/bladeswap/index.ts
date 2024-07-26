import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { FetchOptions, BreakdownAdapter } from "../../adapters/types";
const adapters = univ2Adapter(
  {
    [CHAIN.BLAST]:
      "https://api.studio.thegraph.com/query/75205/blade-algebra/mainnet-info-1.0.3",
  },
  {
    factoriesName: "factories",
    dayData: "algebraDayData",
    dailyVolume: "volumeUSD",
    totalVolume: "totalVolumeUSD",
  }
);

const fetch: any = async (timestamp: number, chainBlocks: number, options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  let eventAbi = "event Swap(address indexed pool, address indexed user, bytes32[] tokenRef, int128[] delta)"
  const logs = await options.getLogs({ target: "0x10F6b147D51f7578F760065DF7f174c3bc95382c", eventAbi, })
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

adapters.adapter.blast.start = 1717740000;

const adapter: BreakdownAdapter = {
    breakdown: {
        v2: {
            [CHAIN.BLAST]: {
                fetch,
                start: 1709208245,
            }
        },
        CL: adapters.adapter
    },
}

export default adapter;
