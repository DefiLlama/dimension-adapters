import request, { gql } from "graphql-request";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

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

const fetch = async (timestamp: number) => {
  const chain = CHAIN.SONEIUM;
  const dayTimestamp = getUniqStartOfTodayTimestamp(
    new Date(timestamp * 1000)
  );
  const dailyData = await request(endpoints[chain], historicalDataSwap, {
    id: dayTimestamp.toString(),
  });

  const DECIMALS = 30;

  return {
    timestamp: dayTimestamp,
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
  adapter: {
    [CHAIN.SONEIUM]: {
      fetch,
      start: 1735286448,
    },
  },
};

export default adapter;
