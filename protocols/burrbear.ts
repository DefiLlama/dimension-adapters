import { graph } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getBlock } from "../helpers/getBlock"

const url = 'https://api.goldsky.com/api/public/project_cluukfpdrw61a01xag6yihcuy/subgraphs/berachain/prod/gn'

interface IPool {
  address: string
  symbol: string
  totalSwapVolume: number
  totalSwapFee: number
}

interface GraphQLResponse {
  yesterday: { pool0: IPool[] }
  today: { pool0: IPool[] }
}

const fetchVolume = async (options: FetchOptions) => {
  const [todaysBlock, yesterdaysBlock] = await Promise.all([
    getBlock(options.endTimestamp, options.chain, {}),
    getBlock(options.startTimestamp, options.chain, {}),
  ]);

  const query = `{
    yesterday: pools(
      first: 1000
      where: { totalSwapVolume_gt: "0" }
      block: { number: ${yesterdaysBlock} }
    ) {
      address
      symbol
      totalSwapVolume
      totalSwapFee
    }
    today: pools(
      first: 1000
      where: { totalSwapVolume_gt: "0" }
      block: { number: ${todaysBlock} }
    ) {
      address
      symbol
      totalSwapVolume
      totalSwapFee
    }
  }`

  const response = await graph.request(url, query) as {
    yesterday: IPool[]
    today: IPool[]
  }

  const yesterdayTotalVolume = response.yesterday.reduce((acc, pool) => acc + Number(pool.totalSwapVolume), 0);
  const yesterdayTotalFees = response.yesterday.reduce((acc, pool) => acc + Number(pool.totalSwapFee), 0);

  const todayTotalVolume = response.today.reduce((acc, pool) => acc + Number(pool.totalSwapVolume), 0);
  const todayTotalFees = response.today.reduce((acc, pool) => acc + Number(pool.totalSwapFee), 0);

  const volumeDiff = todayTotalVolume - yesterdayTotalVolume;
  const feesDiff = todayTotalFees - yesterdayTotalFees;

  const dailyVolume = (volumeDiff > 0 ? volumeDiff : 0);
  const dailyFees = (feesDiff > 0 ? feesDiff : 0);

  return {
    dailyVolume: dailyVolume,
    totalVolume: todayTotalVolume,
    dailyFees: dailyFees,
    totalFees: todayTotalFees,
  }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: fetchVolume,
      start: '2025-01-25'
    }
  }
}

export default adapters
