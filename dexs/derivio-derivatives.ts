import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";

const endpoints: { [key: string]: string } = {
  [CHAIN.ERA]: "https://api.goldsky.com/api/public/project_clo8pd6fm00sq2nw2gkope817/subgraphs/derivio-mainnet/prod/gn",
}

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

const fetch = async (timestamp: number) => {
  const chain = CHAIN.ERA;
  const fromTimestamp = timestamp - 60 * 60 * 24;
  const toTimestamp = timestamp;
  const fromBlock = await getBlock(fromTimestamp, chain, {});
  const toBlock = await getBlock(toTimestamp, chain, {});

  const fromBlockData: IGraphResponse = await request(endpoints[chain], historicalDataDerivatives, {
    block: fromBlock
  });
  const toBlockData: IGraphResponse = await request(endpoints[chain], historicalDataDerivatives, {
    block: toBlock
  });

  const dailyOptionVolume = Number(toBlockData.systemInfo.optionVolume) - Number(fromBlockData.systemInfo.optionVolume);
  const dailyPerpVolume = Number(toBlockData.systemInfo.perpVolume) - Number(fromBlockData.systemInfo.perpVolume);
  const dailyNotionalVolume = dailyOptionVolume * 10 ** -18;

  return {
    dailyVolume: (dailyPerpVolume * 10 ** -18).toString(),
    dailyNotionalVolume: dailyNotionalVolume ? dailyNotionalVolume.toString() : undefined,
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
