import { gql, request } from "graphql-request";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL_V3 = 'https://graph-api.tentou.tech/subgraphs/name/mimboku'
const URL_V2 = 'https://graph-api.tentou.tech/subgraphs/name/mimboku-v2'

async function getTotalVolumeV3(block: number): Promise<number> {
  const query = gql`
    query GetVolumeUsdV3 {
      factories(block: {number: ${block}}) {
        totalVolumeUSD
      }
    }
  `;
  let totalVolumeUSD = 0;
  // try {
  //   const resp = await request(URL_V3, query, { block });
  //   resp.factories.forEach((factory: any) => {
  //     totalVolumeUSD += Math.round(parseFloat(factory.totalVolumeUSD));
  //   });
  //   return totalVolumeUSD;
  // } catch (error) {
  //   console.log(error)
  //   return totalVolumeUSD;
  // }
    const resp = await request(URL_V3, query, { block });
    resp.factories.forEach((factory: any) => {
      totalVolumeUSD += Math.round(parseFloat(factory.totalVolumeUSD));
    });
    return totalVolumeUSD;
}

async function getTotalVolumeV2(block: number): Promise<number> {
  const query = gql`
    query GetVolumeUsdV2 {
      uniswapFactories(block: {number: ${block}}) {
        totalVolumeUSD
      }
    }
  `;
  let totalVolumeUSD = 0;
  try {
    const resp = await request(URL_V2, query, { block });
    resp.uniswapFactories.forEach((factory: any) => {
      totalVolumeUSD += Math.round(parseFloat(factory.totalVolumeUSD));
    });
    return totalVolumeUSD;
  } catch (error) {
    console.log(error)
    return totalVolumeUSD;
  }
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const startBlock = await options.getStartBlock();
  const endBlock = await options.getEndBlock();

  const currentVolumeV3 = await getTotalVolumeV3(endBlock);
  const startVolumeV3 = await getTotalVolumeV3(startBlock);
  const dailyVolumeV3 = currentVolumeV3 - startVolumeV3;

  const currentVolumeV2 = await getTotalVolumeV2(endBlock);
  const startVolumeV2 = await getTotalVolumeV2(startBlock);
  const dailyVolumeV2 = currentVolumeV2 - startVolumeV2;

  dailyVolume.addUSDValue(dailyVolumeV3 + dailyVolumeV2);

  return { dailyVolume }
};

const adapter: SimpleAdapter = {
	version: 2,
	adapter: {
		[CHAIN.STORY]: {
			fetch,
			start: '2025-05-08',
		},
	},
};

export default adapter;