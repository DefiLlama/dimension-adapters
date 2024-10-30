import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const graphUrl = 'https://api.goldsky.com/api/public/project_cm0yx4qi4ne0c01r9hv1k7rwy/subgraphs/KYEXSwapV2-zetachain-mainnet/1/gn'


const fetch = async ({ startTimestamp, endTimestamp, createBalances }: FetchOptions) => {
  let lastId: any = undefined
  const dailyVolume = createBalances()
  do {
    const graphQuery = `
    query MyQuery {
      volumes(
        first: 1000
        orderBy: id
        orderDirection: desc
        where: {
          timestamp__gte: ${startTimestamp}
          timestamp__lt: ${endTimestamp}
          ${lastId ? `id_lt: "${lastId}"` : ''}
        }
      ) {
        id
        volume
        swapExecuted { amountA amountB tokenA tokenB }
      }
    }`
    const { volumes } = await request(graphUrl, graphQuery, {});
    volumes.forEach((volume: any) => {
      dailyVolume.add(volume.swapExecuted.tokenB, volume.swapExecuted.amountB)
      lastId = volume.id
    })
    if (volumes.length < 1000) lastId = undefined

  } while (lastId)
  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ZETA]: {
      fetch,
      start: 1725844149,
    },
  },
};
export default adapter;
