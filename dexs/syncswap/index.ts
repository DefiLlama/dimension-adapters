import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";

const endpoints: { [key: string]: string } = {
  [CHAIN.ERA]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-zksync',
  [CHAIN.LINEA]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-linea',
  [CHAIN.SCROLL]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-scroll',
  [CHAIN.SOPHON]: 'https://graph1.syncswap.xyz/subgraphs/name/syncswap/syncswap-sophon',
};

async function getGraphData(_t: any, _b: any, options: FetchOptions) {
  const dateId = Math.floor(options.startOfDay / 86400);
  const query = gql`
    {
      dayData(id: "${dateId}") {
        dailyVolumeUSD
      }
    }
  `
  const graphRes = await request(endpoints[options.chain], query, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
      'origin': 'https://syncswap.xyz',
    }
  });

  return {
    dailyVolume: Number(graphRes.dayData.dailyVolumeUSD),
    dailyFees: Number(graphRes.dayData.dailyVolumeUSD) * (0.3 / 100),
    dailyUserFees: Number(graphRes.dayData.dailyVolumeUSD) * (0.3 / 100),
    dailySupplySideRevenue: Number(graphRes.dayData.dailyVolumeUSD) * (0.3 / 100),
  }
}

const methodology = {
    Volume: "Count token swap volume from SyncSwap subgraphs.",
    Fees: "All fees comes from users by swap token on SyncSwap.",
    UserFees: "Users pay fees for every swap on SyncSwap.",
    SupplySideRevenue: "All swap fees paid to LPs.",
}

const adapter: SimpleAdapter = {
  methodology,
  version: 1,
  adapter: {
    [CHAIN.ERA]: {
      fetch: getGraphData,
      start: '2024-03-06',
    },
    [CHAIN.LINEA]: {
      fetch: getGraphData,
      start: '2024-03-06',
    },
    // [CHAIN.SOPHON]: {
    //   fetch: getGraphDataV2,
    //   start: '2024-03-06',
    // },
    [CHAIN.SCROLL]: {
      fetch: getGraphData,
      start: '2024-03-06',
    },
  }
}

export default adapter
