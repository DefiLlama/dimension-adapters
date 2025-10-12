import * as sdk from "@defillama/sdk";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import request from "graphql-request";

const deployerAddresses = [
  "0xFd6CC4F251eaE6d02f9F7B41D1e80464D3d2F377",
  "0x5c46b718Cd79F2BBA6869A3BeC13401b9a4B69bB",
];

const rtokenCreationAbi =
  "event RTokenCreated(address indexed main, address indexed rToken, address stRSR, address indexed owner, string version)";

const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('BT7YCEWL7JHbEBD9WXWmtMSzCuW6YXisWTqHPVb4u6uC'),
};

const graphQuery = `
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

const fetch: any = async ({ getLogs, createBalances, toTimestamp }: FetchOptions) => {
  const RSR = '0x320623b8e4ff03373931769a31fc52a4e78b5d70'

  // Get list of deployed RTokens
  const rtokenCreationLogs = await getLogs({ targets: deployerAddresses, fromBlock: 16680995, eventAbi: rtokenCreationAbi, })

  // Key RToken contracts
  const rtokens = rtokenCreationLogs.map((i) => i.rToken.toLowerCase());

  const graphRes = (
    await request(endpoints[CHAIN.ETHEREUM], graphQuery, { currentTime: toTimestamp, rtokens, })
  ).rtokens;

  const dailyFees = createBalances();
  // Use increase in RSR redemption rate & total staked to calculate fees
  // Total Staked * RSR Price * (rate_today - rate_yesterday) = daily_fees
  graphRes.forEach(({ dailySnapshots: snapshots }: any) => {
    if (snapshots.length < 2) return;
    const todayRate = snapshots[0].rsrExchangeRate;
    const yesterdayRate = snapshots[1].rsrExchangeRate;

    dailyFees.add(RSR, snapshots[0].rsrStaked * (todayRate - yesterdayRate));
  });

  return { dailyFees, dailyRevenue: dailyFees, };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-04-18',
    },
  },
  methodology: {
    Fees: "Yield, redeemtion fees.",
    Revenue: "All fees are revenue.",
  }
};

export default adapter;
