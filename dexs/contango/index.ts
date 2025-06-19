import * as sdk from "@defillama/sdk";
import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { wrapGraphError } from "../../helpers/getUniSubgraph";

type IEndpoint = {
  [chain: string]: string;
}

const endpoint: IEndpoint = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('BmHqxUxxLuMoDYgbbXU6YR8VHUTGPBf9ghD7XH6RYyTQ'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('PT2TcgYqhQmx713U3KVkdbdh7dJevgoDvmMwhDR29d5'),
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('FSn2gMoBKcDXEHPvshaXLPC1EJN7YsfCP78swEkXcntY'),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('5t3rhrAYt79iyjm929hgwyiaPLk9uGxQRMiKEasGgeSP'),
  [CHAIN.BASE]: "https://graph.contango.xyz:18000/subgraphs/name/contango-xyz/v2-base",
  [CHAIN.XDAI]: sdk.graph.modifyEndpoint('9h1rHUKJK9CGqztdaBptbj4Q9e2zL9jABuu9LpRQ1XkC'),
}

interface IAssetTotals {
  id: string;
  symbol: string;
  totalVolume: string;
  openInterest: string;
  totalFees: string;
}
interface IResponse {
  today: IAssetTotals[];
  yesterday: IAssetTotals[];
}
interface IAsset {
  id: string;
  volume: number;
  openInterest: number;
  fees: number;
}
const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  const { getFromBlock, getToBlock, createBalances, api } = options;
  const query = `
    {
      today:assetTotals(where: {totalVolume_not: "0"}, block: {number: ${await getToBlock()}}) {
        id
        symbol
        totalVolume
        openInterest
        totalFees
      },
      yesterday:assetTotals(where: {totalVolume_not: "0"}, block: {number: ${await getFromBlock()}}) {
        id
        symbol
        totalVolume
        openInterest
        totalFees
      }
    }
    `;
  let response: IResponse
  try {
    response = await request(endpoint[options.chain], query)
  } catch (error) {
    console.error('Error fetching contango data', wrapGraphError(error as Error).message);
    return { timestamp };
  }

  const dailyOpenInterest = createBalances();
  const dailyFees = createBalances();
  const dailyVolume = createBalances();

  const tokens = response.today.map((asset) => asset.id);
  const decimals = await api.multiCall({ abi: 'erc20:decimals', calls: tokens })

  const data: IAsset[] = response.today.map((asset, index: number) => {
    const yesterday = response.yesterday.find((e: IAssetTotals) => e.id === asset.id);
    const totalVolume = Number(asset.totalVolume) - Number(yesterday?.totalVolume || 0);
    const totalFees = Number(asset.totalFees) - Number(yesterday?.totalFees || 0);
    const openInterest = Math.abs(Number(asset.openInterest));
    const multipliedBy = 10 ** Number(decimals[index]);
    return {
      id: asset.id,
      openInterest: openInterest * multipliedBy,
      fees: totalFees * multipliedBy,
      volume: totalVolume * multipliedBy,
    } as IAsset
  })
  data.map(({ volume, id, openInterest, fees }) => {
    dailyVolume.add(id, +volume)
    dailyOpenInterest.add(id, +openInterest)
    dailyFees.add(id, +fees)
  });

  return {
    dailyOpenInterest, dailyFees, dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-10-03',
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2023-10-02',
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-10-03',
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: '2023-10-13',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2023-10-09',
    },
    [CHAIN.XDAI]: {
      fetch,
      start: '2023-10-06',
    },
  }
};
export default adapter;
