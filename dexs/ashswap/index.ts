import { request } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const API_URL = 'https://api-v2.ashswap.io/graphql';

interface IVolume {
  totalVolumeUSD24h: number;
}

const VolumeQuery = `
{
  defillama {
    totalVolumeUSD24h
  }
}
`

const fetch = async (options: FetchOptions) => {
  const results: IVolume = (await request(API_URL, VolumeQuery)).defillama;
  const dailyVolume = results?.totalVolumeUSD24h;
  return {
    dailyVolume: dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ELROND],
  start: '2023-02-17',
  runAtCurrTime: true,
};

export default adapter;
