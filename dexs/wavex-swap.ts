import request, { gql } from "graphql-request";
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const endpoints: { [key: string]: string } = {
  [CHAIN.SONEIUM]: "https://wavex-indexer-serve-mainnet.up.railway.app/",
};

const historicalDataSwap = gql`
  query get_volume($id: String!) {
    volumeStat(id: $id) {
      swap
    }
  }
`;

const fetch = async (options: FetchOptions) => {
  const chain = CHAIN.SONEIUM;
  const dailyData = await request(endpoints[chain], historicalDataSwap, {
    id: options.startOfDay.toString(),
  });

  const DECIMALS = 30;

  return {
    dailyVolume: dailyData.volumeStat
      ? String(
          Number(
            Object.values(dailyData.volumeStat).reduce((sum, element) =>
              String(Number(sum) + Number(element))
            )
          ) *
            10 ** -DECIMALS
        )
      : undefined,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SONEIUM],
  start: '2024-12-27',
};

export default adapter;
