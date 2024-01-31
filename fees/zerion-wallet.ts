import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
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

type TMulitsig = {
  [s: string]: string[];
}
const multisigs: TMulitsig = {
  [CHAIN.ETHEREUM]: [
    "0x4a183b7ed67b9e14b3f45abfb2cf44ed22c29e54"
  ],
  [CHAIN.OPTIMISM]: [
    "0x7d20ab6d8af50d87a5e8def46e48f4d7dc2ea5c7"
  ],
  [CHAIN.ARBITRUM]: [
    "0x4a183b7ed67b9e14b3f45abfb2cf44ed22c29e54"
  ],
  [CHAIN.BASE]: [
    "0x7d20ab6d8af50d87a5e8def46e48f4d7dc2ea5c7"
  ],
  [CHAIN.POLYGON]: [
    "0x4a183b7ed67b9e14b3f45abfb2cf44ed22c29e54"
  ],
  [CHAIN.BSC]: [
    "0x4a183b7ed67b9e14b3f45abfb2cf44ed22c29e54"
  ]
}

const build_query_rev = (timestamp: number) => {
  const now = new Date(timestamp * 1e3)
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
  return Object.keys(multisigs).map((chain: Chain) => `
    SELECT
      SUM(VALUE_PRECISE_RAW) as eth_revenue,
      '${chain}' as chain
    from
      ${chain}.core.fact_traces
    WHERE
      BLOCK_TIMESTAMP BETWEEN '${dayAgo.toISOString()}' AND '${now.toISOString()}'
      AND
      TX_STATUS = 'SUCCESS'
      AND
      TO_ADDRESS in ('${multisigs[chain].join("','")}')
      `).join(" union all ");
}

const toHexTopic  = (multisigs: string[])  => multisigs
  .map((multisig: string) => multisig.replace('0x', ''))
  .map((multisig: string) => multisig.padStart(64, '0'))
  .map((multisig: string) => `0x${multisig}`);

const build_query = (timestamp: number) => {
  const now = new Date(timestamp * 1e3)
  const dayAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24)
  return Object.keys(multisigs).map((chain: Chain) => `
      SELECT
        data,
        contract_address,
        '${chain}' as chain
      from
        ${chain}.core.fact_event_logs
      WHERE
      BLOCK_TIMESTAMP BETWEEN '${dayAgo.toISOString()}' AND '${now.toISOString()}'
        and topics[0] = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        and topics[2] in ('${toHexTopic(multisigs[chain]).join("','")}')`).join(" union all ");
}

const fetch = (chain: Chain, gasToken: string) => {
  return async (timestamp: number): Promise<FetchResultFees> => {

      try {
        let revenues : IFee[] = [];

        const query = build_query_rev(timestamp)

        const ethRevenues: any[] = (await queryFlipside(query, 260))
          .map(([eth_revenue, chain]: [string, string]) => {
            return {
              eth_revenue,
              chain
            }
          }).filter((e: any) => e.chain === chain);

        const ethRevenue = ethRevenues.map((e: any) => {
            const revenue =  Number(e.eth_value)
            return {
              volume: revenue,
              contract_address: gasToken,
            } as IFee
        });

        revenues = revenues.concat(ethRevenue)

        const queryTokens = build_query(timestamp)
        const tokenRevenues: any[] = (await queryFlipside(queryTokens, 360))
          .map(([data, contract_address, chain]: [string, string, string]) => {
            return {
              data,
              contract_address,
              chain
            }
          }).filter((e: any) => e.chain === chain);

        const tokenRevenue = tokenRevenues.map((e: any) => {
            const volume =  Number(e.data)
            return {
              volume: volume,
              contract_address: e.contract_address,
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
        fetch: fetch(CHAIN.ETHEREUM,
        "0x0000000000000000000000000000000000000000"),
        start: async ()  => 1672531200,
        meta: {
          methodology
        }
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM,
      "0x0000000000000000000000000000000000000000"),
      start: async ()  => 1672531200,
      meta: {
        methodology
      }
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM,
      "0x0000000000000000000000000000000000000000"),
      start: async ()  => 1672531200,
      meta: {
        methodology
      }
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE,
      "0x0000000000000000000000000000000000000000"),
      start: async ()  => 1672531200,
      meta: {
        methodology
      }
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON,
      "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0"),
      start: async ()  => 1672531200,
      meta: {
        methodology
      }
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC,
      "0xb8c77482e45f1f44de1745f52c74426c631bdd52"),
      start: async ()  => 1672531200,
      meta: {
        methodology
      }
    }
  }

}

export default adapter;
