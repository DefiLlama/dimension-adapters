import { ethers } from "ethers";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { getPrices } from "../../utils/prices";
import request, { gql } from "graphql-request";

const deployerAddresses = [
  "0xFd6CC4F251eaE6d02f9F7B41D1e80464D3d2F377",
  "0x5c46b718Cd79F2BBA6869A3BeC13401b9a4B69bB",
];

const rtokenCreationTopic0 =
  "0x27a62b7d4a7ee7a705ae91fe5a3ad74f32fc3d14e82eb82c3730630601ce9ae6";
const rtokenCreationTopic =
  "RTokenCreated(address,address,address,address,string)";

const rtokenCreationAbi =
  "event RTokenCreated(address indexed main, address indexed rToken, address stRSR, address indexed owner, string version)";

const deployerInterface = new ethers.Interface([rtokenCreationAbi]);

const endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/lcamargof/reserve",
};

const graphQuery = gql`
  query ($rtokens: [String!], $currentTime: Int!) {
    rtokens(where: { id_in: $rtokens }) {
      dailySnapshots(
        where: { timestamp_lte: $currentTime }
        orderBy: timestamp
        orderDirection: desc
      ) {
        rToken {
          id
        }
        timestamp
        rsrExchangeRate
        rsrStaked
      }
    }
  }
`;

const getFees = () => {
  return async (timestamp: number) => {
    const currentBlock = await getBlock(timestamp, CHAIN.ETHEREUM, {});

    const rsrPriceObj = await getPrices(
      ["ethereum:0x320623b8e4ff03373931769a31fc52a4e78b5d70"],
      timestamp
    ); // RSR contract

    const rsrPrice = Object.values(rsrPriceObj)[0].price;

    // Get list of deployed RTokens
    const rtokenCreationLogs = (
      await Promise.all(
        deployerAddresses.map((deployerAddress) =>
          sdk.getEventLogs({
            target: deployerAddress,
            topic: rtokenCreationTopic,
            topics: [rtokenCreationTopic0],
            fromBlock: 16680995,
            toBlock: currentBlock,
            chain: "ethereum",
          })
        )
      )
    )
      .flatMap((x: any) => x as any[])
      .map((e: any) => deployerInterface.parseLog(e));

    // Key RToken contracts
    const rtokens = rtokenCreationLogs.map((i) => i!.args.rToken.toLowerCase());

    const graphRes = (
      await request(endpoints[CHAIN.ETHEREUM], graphQuery, {
        currentTime: timestamp,
        rtokens,
      })
    ).rtokens;

    let sumDailyFees = 0;

    // Use increase in RSR redemption rate & total staked to calculate fees
    // Total Staked * RSR Price * (rate_today - rate_yesterday) = daily_fees
    graphRes.forEach(({ dailySnapshots: snapshots }: any) => {
      if (snapshots.length < 2) return;
      const todayRate = snapshots[0].rsrExchangeRate;
      const yesterdayRate = snapshots[1].rsrExchangeRate;

      const rsrStaked = snapshots[0].rsrStaked / 1e18;

      const dailyFees = rsrStaked * rsrPrice * (todayRate - yesterdayRate);

      sumDailyFees += dailyFees;
    });

    return {
      timestamp,
      dailyFees: sumDailyFees.toString(),
      dailyRevenue: sumDailyFees.toString(),
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: getFees(),
      start: async () => 1681850303,
    },
  },
};

export default adapter;
