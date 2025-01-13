import * as sdk from "@defillama/sdk";
import { request, gql } from "graphql-request";
import { Adapter, FetchV2, ChainEndpoints } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
//import { getTokenPrice } from "../../helpers/prices"; // Fetch Zeebu price in USD
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import BigNumber from "bignumber.js";
//import { ETHEREUM } from "../../helpers/chains";
//import { Chain } from '@defillama/sdk/build/general';

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
        const totalFees = totalFeesResponse.overallVolumeFeesAggregates.reduce(
          (sum, item) => sum + parseFloat(((item.totalFees * 2)/1e18) || 0),
          0
        );

        // Fetch daily fees
        const graphRes = await request(graphUrls[chain], graphQuery, { dayID: dayID });
        const aggregates = graphRes.dayVolumeFeesAggregates;

        // Aggregate daily fees and daily volume
        const dailyFees = aggregates.reduce((sum, agg) => sum + parseFloat(((agg.dailyFees * 2)/1e18) || 0), 0);
        const dailyUserFees = dailyFees;
        const totalUserFees = totalFees;

        const dailyRevenue = dailyFees;
        const totalRevenue = totalFees;

        const dailyHoldersRevenue = dailyFees * 0.6 / 100;
        const totalHoldersRevenue = totalFees * 0.6 / 100;

        const dailySupplySideRevenue = dailyFees * 0.6 / 100;
        const totalSupplySideRevenue = totalFees * 0.6 / 100;

        return {dailyFees, totalFees, dailyUserFees, totalUserFees, dailyRevenue, totalRevenue, dailyHoldersRevenue, totalHoldersRevenue };
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
          totalHoldersRevenue : 0
        };
      }
    };
  };
};

export default {
  adapter: {
    // Define for each chain
    [CHAIN.BASE]: {
      fetch : graphsDaily(endpoints)(CHAIN.BASE),
      start: 1728518400,
      meta: {
        methodology: {
          Fees: "1% Invoice settlement fees paid by Merchant and Customer",
          UserFees : "Daily fees"
          Revenue: "Invoice fees",
          HoldersRevenue: "Staking rewards earned by veZBU holders, 0.6% of collected fees "
        }
      }
    },
    [CHAIN.BSC]: {
      fetch : graphsDaily(endpoints)(CHAIN.BSC),
      start: 1688083200,
      meta: {
        methodology: {
          Fees: "1% Invoice settlement fees paid by Merchant and Customer",
          Revenue: "Invoice fees",
          HoldersRevenue: "Staking rewards earned by veZBU holders, 0.6% of collected fees "
        }
      }
    },

  },
  version: 2,
} as Adapter;

/**
 * Function to fetch fees for a specific chain
 */
function fetchFeesForChain(chain: string, contracts: string[]): FetchV2 {
  return async ({ getLogs, createBalances }) => {
    const dailyFees = createBalances();
    const dailyRevenue = createBalances();

    for (const contract of contracts) {
      // Fetch logs for each contract
      const logs = await getLogs({
        target: contract,
        eventAbi: EVENT_ABI,
      });

      logs.map((e: any) => {
        console.log(`Contract: ${contract}, Fee: ${e.fee}`);
        // Add fees to daily balances
        dailyFees.addGasToken(e.fee);
        dailyRevenue.addGasToken(e.fee);
      });
    }

    return { dailyFees, dailyRevenue };
  };
}

/**
 * Function to fetch stats for a specific chain
 */
function fetchStatsForChain(chain: string, contracts: string[]): FetchV2 {
  return async ({ getLogs }) => {
    let dailyVolume = 0;
    let totalVolume = 0;
    let dailyFees = 0;
    let totalFees = 0;

    for (const contract of contracts) {
      // Fetch logs for each contract
      const logs = await getLogs({
        target: contract,
        eventAbi: EVENT_ABI,
      });

      // Process each event log
      logs.map((e: any) => {
        const volume = e.amount; // Use tokenValue or amount as the metric
        const fee = e.fee; // Extract fee field (in Zeebu tokens)

        const volumeInZeebu = parseFloat(volume) / 1e18; // Convert volume to Zeebu tokens
        const feeInZeebu = parseFloat(fee) / 1e18; // Convert fee to Zeebu tokens

        dailyVolume += volumeInZeebu; // Sum up daily volume
        totalVolume += volumeInZeebu; // Sum up total volume
        dailyFees += feeInZeebu; // Sum up daily fees
        totalFees += feeInZeebu; // Sum up total fees
      });
    }

    // Convert fees and volumes to USD using Zeebu token price
    const zeebuPrice = 1;//await getTokenPrice("zeebu", chain); // Replace 'zeebu' with actual token ID
    const dailyVolumeUSD = dailyVolume * zeebuPrice;
    const totalVolumeUSD = totalVolume * zeebuPrice;
    const dailyFeesUSD = dailyFees * zeebuPrice;
    const totalFeesUSD = totalFees * zeebuPrice;

    return {
      dailyVolume: dailyVolumeUSD, // Return daily volume in USD
      totalVolume: totalVolumeUSD, // Return total volume in USD
      dailyFees: dailyFeesUSD, // Return daily fees in USD
      totalFees: totalFeesUSD, // Return total fees in USD
      dailyRevenue: dailyFeesUSD, // Assume revenue = fees (if this applies)
    };
  };
}

/**
 * Fetch statistics for a specific chain
 * @param chain - Blockchain chain
 * @param contracts - List of contract addresses
 * @param startBlock - Starting block to fetch logs
 */
function fetchStatsForChain2(chain: string, contracts: string[], startBlock: number): FetchV2 {
  console.log(chain,contracts,startBlock);
  return async ({ getLogs }) => {
    let dailyVolume = 0;
    let totalVolume = 0;
    let dailyFees = 0;
    let totalFees = 0;

    const currentTimestamp = Math.floor(Date.now() / 1000); // Current time in seconds
    const oneDayAgo = currentTimestamp - 24 * 60 * 60; // 24 hours ago

    for (const contract of contracts) {
      // Fetch all logs from the start block
      const logs = await getLogs({
        target: contract,
        eventAbi: EVENT_ABI,
        fromBlock: startBlock,
      });

      logs.map((e: any) => {
        const volume = e.tokenValue || e.amount; // Use tokenValue or amount as volume
        const fee = e.fee; // Use fee field

        const volumeInUSD = parseFloat(volume) / 1e18; // Convert to Zeebu tokens
        const feeInUSD = parseFloat(fee) / 1e18; // Convert fee to Zeebu tokens

        totalVolume += volumeInUSD; // Add to total volume
        totalFees += feeInUSD; // Add to total fees

        // Check if the log is within the last 24 hours
        if (e.blockTime >= oneDayAgo) {
          dailyVolume += volumeInUSD; // Add to daily volume
          dailyFees += feeInUSD; // Add to daily fees
        }
      });
    }

    // Convert values to USD using Zeebu token price
    const dailyVolumeUSD = dailyVolume ;
    const totalVolumeUSD = totalVolume ;
    const dailyFeesUSD = dailyFees ;
    const totalFeesUSD = totalFees ;

    console.log({
      chain : chain,
      dailyVolume: dailyVolumeUSD,
      totalVolume: totalVolumeUSD,
      dailyFees: dailyFeesUSD,
      totalFees: totalFeesUSD,
    });

    return {
      dailyVolume: dailyVolumeUSD,
      totalVolume: totalVolumeUSD,
      dailyFees: dailyFeesUSD,
      totalFees: totalFeesUSD,
    };
  };
}
