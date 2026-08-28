import request from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const v3Endpoint = {
  [CHAIN.STORY]: "https://app.storyhunt.xyz/api/graph",
}

async function fetch({ chain, getStartBlock, getEndBlock }: FetchOptions) {
  const { factories: [{totalVolumeUSD}]} = await getData(await getEndBlock());
  const { factories: [{totalVolumeUSD: totalVolumeUSDYesterday}]} = await getData(await getStartBlock());

  return {
    dailyVolume: totalVolumeUSD - totalVolumeUSDYesterday,
  }

  async function getData(block: any) {
    const query = "query total_volume ($block: Int) { factories(block: { number: $block }) {  totalVolumeUSD }  }"
    try {
      const res = await request((v3Endpoint as any)[chain], query, { block });
      return res
    } catch (error) {
      if ((error as any)?.response.status === 200) return (error as any).response
      return {}
    }
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STORY]: {
      fetch,
    },
  },
  version: 2
};

export default adapter;
