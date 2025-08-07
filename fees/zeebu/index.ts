
import { request, gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

// Define target contracts and chains
const CONTRACTS = {
  [CHAIN.BASE]: ["0x330EDca5D02c454725db9c1384963f82b9fC8e47"],
  [CHAIN.BSC]: [
    "0x109722F4c9C9CB5059c116C6c83fe38CB710CBfB",
    "0xEEaf4Dc07ef08B7470B0e829Ed0a8d111737715B",
    "0x09d647A0BAFec8421DEC196A5cEe207fc7a6b85A",
    "0x9a47F91A6541812F88A026bdA2d372E22Ba4d7f7",
  ],
  [CHAIN.ETHEREUM]: ["0xE843115fF0Dc2b20f5b07b6E7Ba5fED064468AC6"],
};

const endpoints = {
  [CHAIN.BSC]: 'https://api.studio.thegraph.com/query/89152/fees_reward/version/latest',
  [CHAIN.BASE]: 'https://api.studio.thegraph.com/query/89152/fees_reward_base/version/latest',
}

const graphsDaily = (graphUrls: Record<string, string>) => {
  return (chain: CHAIN) => {
    return async (timestamp: number) => {
      const dayID = (Math.floor(timestamp.startOfDay / 86400) ).toString(); // Ensure this aligns with your subgraph's dayID logic
      //console.log("dayID",dayID, chain);
      const graphQuery = gql`
        query ($dayID: String!) {
          dayVolumeFeesAggregates(
            orderBy: dayID
            orderDirection: desc
            where: { dayID: $dayID }
          ) {
            contract
            dailyFees
            dailyVolume
            dayID
          }
        }
      `;

      const totalFeesQuery = gql`
        query {
          overallVolumeFeesAggregates{
            totalFees
            totalVolume
            chain
            contract
          }
        }
      `;

      try {
        // Fetch total fees
        const totalFeesResponse = await request(graphUrls[chain], totalFeesQuery, { });
        //console.log("totalFeesResponse",totalFeesResponse);
        const totalFees = totalFeesResponse.overallVolumeFeesAggregates.reduce(
          (sum, item) => sum + parseFloat(((item.totalFees * 2)/1e18) || 0),
          0
        );
        //console.log("totalFees",totalFees);

        // Fetch daily fees
        const graphRes = await request(graphUrls[chain], graphQuery, { dayID: dayID });
        //console.log("graphRes",graphRes);
        const aggregates = graphRes.dayVolumeFeesAggregates;
        //console.log("aggregates",aggregates);

        // Aggregate daily fees and daily volume
        const dailyFees = aggregates.reduce((sum, agg) => sum + parseFloat(((agg.dailyFees * 2)/1e18) || 0), 0);
        //console.log("dailyFees",dailyFees);
        const dailyUserFees = dailyFees;
        const totalUserFees = totalFees;

        const dailyRevenue = dailyFees;
        const totalRevenue = totalFees;

        const dailyHoldersRevenue = dailyFees * 0.6 / 100;
        const totalHoldersRevenue = totalFees * 0.6 / 100;

        const dailySupplySideRevenue = dailyFees * 0.6 / 100;
        const totalSupplySideRevenue = totalFees * 0.6 / 100;

        const dailyProtocolRevenue = dailyFees - dailyHoldersRevenue;

        return {dailyFees, totalFees, dailyUserFees, totalUserFees, dailyRevenue, totalRevenue, dailyHoldersRevenue, totalHoldersRevenue, dailyProtocolRevenue };
      } catch (error) {
        console.error(`Error fetching data for chain ${chain}:`, error.message);
        return {
          dailyFees: 0,
          totalFees: 0,
          dailyUserFees : 0, 
          totalUserFees : 0, 
          dailyRevenue : 0, 
          totalRevenue : 0, 
          dailyHoldersRevenue : 0, 
          totalHoldersRevenue : 0,
          dailyProtocolRevenue : 0
        };
      }
    };
  };
};

interface GraphResponse {
  dayVolumeFeesAggregates: {
    contract: string;
    dailyFees: string;
    dailyVolume: string;
    dayID: string;
  }[];
}
const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dayID = (Math.floor(options.startOfDay / 86400) ).toString();
  const graphQuery = gql`
    query ($dayID: String!) {
      dayVolumeFeesAggregates(
        orderBy: dayID
        orderDirection: desc
        where: { dayID: $dayID }
      ) {
        contract
        dailyFees
        dailyVolume
        dayID
      }
    }
  `;

  const totalFeesQuery = gql`
        query {
          overallVolumeFeesAggregates{
            totalFees
            totalVolume
            chain
            contract
          }
        }
      `;

  const url = endpoints[options.chain];
  const graphRes: GraphResponse = await request(url, graphQuery, { dayID: dayID });
  const aggregates = graphRes.dayVolumeFeesAggregates;
  const dailyFees = aggregates.reduce((sum, agg) => {
    const fee = agg.dailyFees ? (Number(agg.dailyFees) * 2) / 1e18 : 0;
    return sum + fee;
  }, 0);
  const dailyHoldersRevenue = dailyFees * 0.6 / 100;
  const dailyProtocolRevenue = dailyFees - dailyHoldersRevenue;

  const totalFeesResponse = await request(url, totalFeesQuery, { });
  const totalFees = totalFeesResponse.overallVolumeFeesAggregates.reduce(
    (sum, item) => sum + parseFloat(((item.totalFees * 2)/1e18) || 0),
    0
  );

  const totalUserFees = totalFees;
  const totalRevenue = totalFees;
  const totalHoldersRevenue = totalFees * 0.6 / 100;
  const totalSupplySideRevenue = totalFees * 0.6 / 100;


  return { dailyFees, dailyUserFees: dailyFees, dailyHoldersRevenue, dailyProtocolRevenue, totalUserFees, totalRevenue, totalHoldersRevenue, totalSupplySideRevenue};

};

const methodology = {
  Fees: "2% collectively paid by merchant and customer",
  Revenue: "Invoice fees",
  HoldersRevenue: "Staking rewards earned by veZBU holders, 0.6% of collected fees "
}

const adapter: SimpleAdapter = {
  methodology,
  adapter: {
    [CHAIN.BASE]: { fetch, start: 1728518400 },
    [CHAIN.BSC]: { fetch, start: 1688083200 },
  },
}

export default adapter;
