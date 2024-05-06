import { Balances } from "@defillama/sdk";
import { Adapter, FetchOptions, FetchResultV2, FetchResultVolume } from "../../adapters/types";

const api = "https://data.mangrove.exchange/volumes-per-pair/total/all";

const adapter: Adapter = {
  version: 2,

  adapter: {
    blast: {
      meta: {
        methodology: {
          dailyVolume: "Sum of all offers taken in the last 24hrs",
        },
      },
      fetch: async (options: FetchOptions): Promise<FetchResultV2> => {
        const startBlock = await options.getStartBlock();
        const endBlock = await options.getEndBlock();

        const url = `${api}/${startBlock}/${endBlock}`;

        const dailyVolume = options.createBalances() as Balances;

        const data = await fetch(url).then((res) => res.json());

        const markets = Object.keys(data).map((key) => {
          const [base, quote] = key.split("-");
          const { totalValueInBase, totalValueInQuote } = data[key][0];
          return {
            base,
            quote,
            totalValueInBase,
            totalValueInQuote,
          };
        });

        for (const market of markets) {
          const { base, quote, totalValueInBase, totalValueInQuote } = market;
          dailyVolume.add(base, totalValueInBase);
          dailyVolume.add(quote, totalValueInQuote);
        }

        return { dailyVolume };
      },
      start: 1708992000,
    },
  },
};

export default adapter;
