import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('5CBKsDihF7KeBrNX4bgtb4tVFqy41PguVm88zBGpd4Hi'),
};

async function fetch(options: FetchOptions) {
  
  const query = `
    query {
      nomiswapFactories(first: 5, block: { number: ${await options.getToBlock()} }) {
        id
        totalVolumeUSD
      }
    }
  `;

  const startQuery = `
    query {
      nomiswapFactories(first: 5, block: { number: ${await options.getFromBlock()} }) {
        id
        totalVolumeUSD
      }
    }
  `;

  const endResponse = await sdk.graph.request(endpoints[CHAIN.BSC], query);

  const startResponse = await sdk.graph.request(endpoints[CHAIN.BSC], startQuery);

  const endVolume = endResponse.data?.nomiswapFactories?.reduce((sum: number, factory: any) => sum + Number(factory.totalVolumeUSD || "0"), 0) || 0;
  const startVolume = startResponse.data?.nomiswapFactories?.reduce((sum: number, factory: any) => sum + Number(factory.totalVolumeUSD || "0"), 0) || 0;

  const dailyVolume = Number(endVolume) - Number(startVolume);

  return {
    dailyVolume,
    dailyFees: dailyVolume * 0.001,
    dailyRevenue: dailyVolume * 0.0007,
    dailyProtocolRevenue: dailyVolume * 0.0007,
  };
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2021-10-20',
    }
  }
}

export default adapters
