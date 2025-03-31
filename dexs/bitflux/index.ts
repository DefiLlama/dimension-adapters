import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
import { request } from "graphql-request";

const endpoints = {
  [CHAIN.CORE]: "https://thegraph.coredao.org/subgraphs/name/bitflux"
};

const FEE_PERCENT = 0.0005; // 0.05%
const PROTOCOL_SHARE = 0.5; // 50% of fees

async function fetchAllPages(endpoint: string, query: string, recordName: string, skip = 0, allRecords: any[] = []): Promise<any[]> {
  const paginatedQuery = query.replace(
    `${recordName} {`,
    `${recordName}(first: 1000, skip: ${skip}) {`
  );

  const response = await request(endpoint, paginatedQuery);
  const records = response[recordName];

  if (records.length === 0) {
    return allRecords;
  }

  const newRecords = [...allRecords, ...records];

  if (records.length === 1000) {
    return fetchAllPages(endpoint, query, recordName, skip + 1000, newRecords);
  }

  return newRecords;
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CORE]: {
      fetch: async (options: any) => {
        const dailyExchangeQuery = `{
          tokenExchanges(where: {timestamp_gte: ${options.startTimestamp}, timestamp_lt: ${options.endTimestamp}}) {
            tokensSold
            tokensBought
            timestamp
          }
        }`;

        const dailyExchangeUnderlyingQuery = `{
          tokenExchangeUnderlyings(where: {timestamp_gte: ${options.startTimestamp}, timestamp_lt: ${options.endTimestamp}}) {
            tokensSold
            tokensBought
            timestamp
          }
        }`;

        const totalVolumeQuery = `{
          dailyVolumes {
            volume
          }
        }`;

        const [dailyExchanges, dailyExchangeUnderlyings, allVolumes] = await Promise.all([
          request(endpoints[CHAIN.CORE], dailyExchangeQuery),
          request(endpoints[CHAIN.CORE], dailyExchangeUnderlyingQuery),
          fetchAllPages(endpoints[CHAIN.CORE], totalVolumeQuery, "dailyVolumes")
        ]);

        console.log("Daily exchanges count:", dailyExchanges.tokenExchanges.length);
        console.log("Daily underlying exchanges count:", dailyExchangeUnderlyings.tokenExchangeUnderlyings.length);
        console.log("Total volumes count:", allVolumes.length);

        let dailyVolumeBTC = 0;
        dailyExchanges.tokenExchanges.forEach((exchange: any) => {
          dailyVolumeBTC += parseFloat(exchange.tokensSold);
        });

        dailyExchangeUnderlyings.tokenExchangeUnderlyings.forEach((exchange: any) => {
          dailyVolumeBTC += parseFloat(exchange.tokensSold);
        });

        const totalVolumeBTC = allVolumes.reduce(
          (sum: number, entry: any) => sum + parseFloat(entry.volume),
          0
        );

        const btcPrice = (await getPrices(["coingecko:bitcoin"], options.endTimestamp))["coingecko:bitcoin"].price;

        const dailyVolumeUSD = dailyVolumeBTC * btcPrice;
        const totalVolumeUSD = totalVolumeBTC * btcPrice;

        const dailyFees = dailyVolumeUSD * FEE_PERCENT;
        const protocolRevenue = dailyFees * PROTOCOL_SHARE;
        const supplySideRevenue = dailyFees * PROTOCOL_SHARE;

        const blocksQuery = `{
          _meta {
            block {
              number
            }
          }
        }`;

        const metaData = await request(endpoints[CHAIN.CORE], blocksQuery);
        const block = metaData._meta.block.number;

        return {
          dailyVolume: dailyVolumeUSD.toString(),
          totalVolume: totalVolumeUSD.toString(),
          dailyFees: dailyFees.toString(),
          dailyRevenue: protocolRevenue.toString(),
          dailyProtocolRevenue: protocolRevenue.toString(),
          dailySupplySideRevenue: supplySideRevenue.toString(),
          block
        };
      },
      start: '2024-11-06',
      meta: {
        methodology: {
          UserFees: "User pays a 0.05% fee on each swap.",
          Fees: "A 0.05% of each swap is collected as trading fees",
          Revenue: "Protocol receives 0.025% of the swap fee (50% of total fees)",
          ProtocolRevenue: "Protocol receives 0.025% of the swap fee (50% of total fees)",
          SupplySideRevenue: "0.025% of the swap fee is distributed to LPs (50% of total fees)",
          HoldersRevenue: "No direct revenue to token holders",
        }
      }
    }
  }
};

export default adapter;
