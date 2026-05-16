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
  const pairDayRes = await request(endpoints[options.chain], gql`
    {
      pairDayDatas(first: 1000, orderBy: dailyVolumeUSD, orderDirection: desc, where: { date: ${options.startOfDay} }) {
        pairAddress
        dailyVolumeUSD
      }
    }
  `);

  const pairDayDatas: { pairAddress: string; dailyVolumeUSD: string }[] = pairDayRes.pairDayDatas;

  if (pairDayDatas.length === 0)
    return { dailyVolume: 0, dailyFees: 0, dailyRevenue: 0, dailySupplySideRevenue: 0 };

  const pairAddresses = pairDayDatas.map((p) => p.pairAddress.toLowerCase());
  const pairFeeRes = await request(endpoints[options.chain], gql`
    {
      pairs(first: 1000, where: { id_in: ${JSON.stringify(pairAddresses)} }) {
        id
        swapFee01Min
        swapFee01Max
        swapFee10Min
        swapFee10Max
        protocolFee
      }
    }
  `);

  const feeByPair: Record<string, any> = {};
  for (const p of pairFeeRes.pairs) {
    feeByPair[p.id.toLowerCase()] = p;
  }

  let dailyVolume = 0;
  let dailyFees = 0;
  let dailyRevenue = 0;

  for (const r of pairDayDatas) {
    const pair = feeByPair[r.pairAddress.toLowerCase()];
    if (!pair) continue;
    const vol = Number(r.dailyVolumeUSD);
    const swapFee = (
      Number(pair.swapFee01Min) + Number(pair.swapFee01Max) +
      Number(pair.swapFee10Min) + Number(pair.swapFee10Max)
    ) / 4 / 1e5;
    const fee = vol * swapFee;
    dailyVolume += vol;
    dailyFees += fee;
    dailyRevenue += fee * Number(pair.protocolFee) / 1e5;
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue: dailyFees - dailyRevenue,
  };
}

const methodology = {
  Volume: "Token swap volume from SyncSwap subgraphs.",
  Fees: "Swap fees paid by users, computed per-pool using each pool's on-chain swap fee rate. For dynamic Aqua pools the rate is approximated as the average of the configured min/max bounds.",
  Revenue: "Protocol's share of swap fees.",
  SupplySideRevenue: "LP share of swap fees after the protocol fee cut.",
};

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
    [CHAIN.SOPHON]: {
      fetch: getGraphData,
      start: '2024-12-16',
    },
    [CHAIN.SCROLL]: {
      fetch: getGraphData,
      start: '2024-03-06',
    },
  }
}

export default adapter
