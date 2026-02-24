import request, {gql} from "graphql-request";
import {BreakdownAdapter, Fetch,} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {getBlock} from "../../helpers/getBlock";

const endpoints: { [key: string]: string } = {
  [CHAIN.ERA]: "https://api.goldsky.com/api/public/project_clo8pd6fm00sq2nw2gkope817/subgraphs/derivio-mainnet/prod/gn",
}

const historicalDataSwap = gql`
  query SystemInfo($block: Int!) {
    systemInfo(id: "current", block: {number: $block}) {
      swapVolume
    }
  }
`

const historicalDataDerivatives = gql`
  query SystemInfo($block: Int!) {
    systemInfo(id: "current", block: {number: $block}) {
      optionVolume
      perpVolume
    }
  }
`

interface IGraphResponse {
  systemInfo: {
    swapVolume: string,
    optionVolume: string,
    perpVolume: string
  }
}

const getFetch = (query: string) => (chain: string): Fetch => async (timestamp: number) => {
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const toTimestamp = timestamp;
  const fromBlock = await getBlock(fromTimestamp, chain, {});
  const toBlock = await getBlock(toTimestamp, chain, {});

  const fromBlockData: IGraphResponse = await request(endpoints[chain], query, {
    block: fromBlock
  });
  const toBlockData: IGraphResponse = await request(endpoints[chain], query, {
    block: toBlock
  });

  let dailyData;
  let totalData;
  let dailyNotionalVolume: number | undefined = undefined;
  if (query === historicalDataSwap) {
    const dailySwapVolume = Number(toBlockData.systemInfo.swapVolume) - Number(fromBlockData.systemInfo.swapVolume);
    dailyData = {
      volume: dailySwapVolume * 10 ** -18,
    };
    const totalSwapVolume = Number(toBlockData.systemInfo.swapVolume);
    totalData = {
      volume: totalSwapVolume * 10 ** -18,
    };
  } else if (query === historicalDataDerivatives) {
    const dailyOptionVolume = Number(toBlockData.systemInfo.optionVolume) - Number(fromBlockData.systemInfo.optionVolume);
    const dailyPerpVolume = Number(toBlockData.systemInfo.perpVolume) - Number(fromBlockData.systemInfo.perpVolume);
    dailyData = {
      volume: (dailyPerpVolume) * 10 ** -18,
    };
    dailyNotionalVolume = dailyOptionVolume * 10 ** -18;
    const totalPerpVolume = Number(toBlockData.systemInfo.perpVolume);
    totalData = {
      volume: (totalPerpVolume) * 10 ** -18,
    };
  } else {
    throw new Error("Unknown query");
  }

  return {
    dailyVolume: dailyData.volume.toString(),
    dailyNotionalVolume: dailyNotionalVolume ? dailyNotionalVolume.toString() : undefined,
  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ERA]: 1698710400
}

const adapter: BreakdownAdapter = {
  breakdown: {
    "swap": Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getFetch(historicalDataSwap)(chain),
          start: startTimestamps[chain]
        }
      }
    }, {}),
    "derivatives": Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getFetch(historicalDataDerivatives)(chain),
          start: startTimestamps[chain]
        }
      }
    }, {})
  }
}

export default adapter;
