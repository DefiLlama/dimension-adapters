import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";

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

interface IGraphResponse {
  systemInfo: {
    swapVolume: string,
    optionVolume: string,
    perpVolume: string
  }
}

const fetch = async (timestamp: number) => {
  const chain = CHAIN.ERA;
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const toTimestamp = timestamp;
  const fromBlock = await getBlock(fromTimestamp, chain, {});
  const toBlock = await getBlock(toTimestamp, chain, {});

  const fromBlockData: IGraphResponse = await request(endpoints[chain], historicalDataSwap, {
    block: fromBlock
  });
  const toBlockData: IGraphResponse = await request(endpoints[chain], historicalDataSwap, {
    block: toBlock
  });

  const dailySwapVolume = Number(toBlockData.systemInfo.swapVolume) - Number(fromBlockData.systemInfo.swapVolume);

  return {
    dailyVolume: (dailySwapVolume * 10 ** -18).toString(),
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch,
      start: 1698710400,
    }
  }
}

export default adapter;
