import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { getPrices } from "../utils/prices";
import { queryFlipside } from "../helpers/flipsidecrypto";

interface IFee {
  contract_address: string;
  volume: number;
}

type TPrice = {
  [s: string]: {
    price: number;
    decimals: number
  };
}

const fetch = (chain: Chain, multisigs: string[], gasToken: string) => {
  return async (timestamp: number): Promise<FetchResultFees> => {

    const fromTimestamp = timestamp - 60 * 60 * 24
    const toTimestamp =  timestamp

      try {

        const startblock = (await getBlock(fromTimestamp, chain, {}));
        const endblock = (await getBlock(toTimestamp, chain, {}));

        let revenues : IFee[] = [];

          const query =`
              SELECT
                VALUE_PRECISE_RAW as eth_revenue
              FROM
                  ${chain}.core.fact_traces
              WHERE
                BLOCK_NUMBER BETWEEN ${startblock} AND ${endblock}
                AND
                TX_STATUS = 'SUCCESS'
                AND
                TO_ADDRESS in ('${multisigs.join("','")}')
              `;

          const ethRevenues: [string, string][] = (await queryFlipside(query, 260))

          const ethRevenue = ethRevenues.map(([eth_value]: [string, string]) => {
              const revenue =  Number(eth_value)
              return {
                volume: revenue,
                contract_address: gasToken,
              } as IFee
          });

          revenues = revenues.concat(ethRevenue)

          const topicTo = multisigs
            .map((multisig: string) => multisig.replace('0x', ''))
            .map((multisig: string) => multisig.padStart(64, '0'))
            .map((multisig: string) => `0x${multisig}`);

          /** Fetch all token transfers to multisig */
          const queryTokens =`
                SELECT
                  data,
                  contract_address
                from
                  ${chain}.core.fact_event_logs
                WHERE
                  BLOCK_NUMBER BETWEEN ${startblock} AND ${endblock}
                  and topics[0] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
                  and topics[2] in ('${topicTo.join("','")}')
          `;

          const tokenRevenues: [string, string][] = (await queryFlipside(queryTokens, 360))

          const tokenRevenue = tokenRevenues.map(([data, contract_address]: [string, string]) => {
              const volume =  Number(data)
              return {
                volume: volume,
                contract_address: contract_address,
              } as IFee
          });

          revenues = revenues.concat(tokenRevenue)

        const coins = [...new Set(
            revenues.map((e: IFee) => `${chain}:${e.contract_address}`.toLowerCase())
        )];

        const coins_split = [];
        for(let i = 0; i < coins.length; i+=100) {
          coins_split.push(coins.slice(i, i + 100))
        }

        const prices_result: any =  (await Promise.all(coins_split.map((a: string[]) =>  getPrices(a, timestamp)))).flat().flat().flat();
        const prices: TPrice = Object.assign({}, {});

        prices_result.map((a: any) => Object.assign(prices, a))

        const amounts = revenues.map((p: IFee) => {
          const price = prices[`${chain}:${p.contract_address}`.toLowerCase()]?.price || 0;
          const decimals = prices[`${chain}:${p.contract_address}`.toLowerCase()]?.decimals || 0;
          return (p.volume / 10 ** decimals) * price;
        })

        const volume = amounts
          .filter((e: any) => !isNaN(e))
          .filter((e: number) => e < 100_000_000)
          .reduce((a: number, b: number) => a+b, 0);
        const dailyFees = volume;

        return {
          timestamp: timestamp,
          dailyFees: dailyFees.toString(),
          dailyRevenue: dailyFees.toString(),
          dailyProtocolRevenue: dailyFees.toString(),
        } as FetchResultFees

      } catch (error) {
        throw error
      }
  }
}

const methodology = {
  Fees: "Take 0.5% from trading volume",
  Revenue: "Take 0.5% from trading volume",
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM, [
          "0x4a183b7ed67b9e14b3f45abfb2cf44ed22c29e54"
        ],
        "0x0000000000000000000000000000000000000000"),
        start: async ()  => 1672531200,
        meta: {
          methodology
        }
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM, [
        "0x7d20ab6d8af50d87a5e8def46e48f4d7dc2ea5c7"
      ],
      "0x0000000000000000000000000000000000000000"),
      start: async ()  => 1672531200,
      meta: {
        methodology
      }
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM, [
        "0x4a183b7ed67b9e14b3f45abfb2cf44ed22c29e54"
      ],
      "0x0000000000000000000000000000000000000000"),
      start: async ()  => 1672531200,
      meta: {
        methodology
      }
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE, [
        "0x7d20ab6d8af50d87a5e8def46e48f4d7dc2ea5c7"
      ],
      "0x0000000000000000000000000000000000000000"),
      start: async ()  => 1672531200,
      meta: {
        methodology
      }
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON,  [
        "0x4a183b7ed67b9e14b3f45abfb2cf44ed22c29e54"
      ],
      "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0"),
      start: async ()  => 1672531200,
      meta: {
        methodology
      }
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC, [
        "0x4a183b7ed67b9e14b3f45abfb2cf44ed22c29e54"
      ],
      "0xb8c77482e45f1f44de1745f52c74426c631bdd52"),
      start: async ()  => 1672531200,
      meta: {
        methodology
      }
    }
  }

}

export default adapter;
