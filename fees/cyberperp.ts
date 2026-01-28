import { request, gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import BigNumber from "bignumber.js";

const GRAPHQL_URL = "https://graphql.mainnet.iota.cafe";
const PACKAGE_ID =
  "0xfdccf09798b9265b5a774c2ecbe65a54dbd62ebd0f7645c35d53a2d0d9e9cf21";
const VUSD_DECIMALS = 1e6;
const PAGE_SIZE = 50;

interface Accumulator {
  lp: BigNumber;
  stake: BigNumber;
  dev: BigNumber;
  funding: BigNumber;
  rollover: BigNumber;
}

const buildQuery = (cursor: string | null, eventType: string) => gql`
  query GetEvents{
    events(
      last: ${PAGE_SIZE},
      before: ${cursor ? `"${cursor}"` : null},
      filter: {
        eventType: "${eventType}"
      }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          json
          timestamp
        }
      }
    }
  }
`;

const processEvents = (
  edges: any[],
  from: number,
  to: number,
  acc: Accumulator,
  handler: (json: any, acc: Accumulator) => void,
): boolean => {
  for (let i = edges.length - 1; i >= 0; i--) {
    const { json, timestamp } = edges[i].node;
    const ts = Math.floor(Date.parse(timestamp) / 1000);

    if (ts > to) continue;
    if (ts < from) return false;

    handler(json, acc);
  }
  return true;
};

const processDepositFees = (
  edges: any[],
  from: number,
  to: number,
  acc: Accumulator,
): boolean => {
  return processEvents(edges, from, to, acc, (json, acc) => {
    acc.lp = acc.lp.plus(json.lp_amount || "0");
    acc.stake = acc.stake.plus(json.stake_amount || "0");
    acc.dev = acc.dev.plus(json.dev_amount || "0");
  });
};

const processTradingFees = (
  edges: any[],
  from: number,
  to: number,
  acc: Accumulator,
): boolean => {
  return processEvents(edges, from, to, acc, (json, acc) => {
    acc.rollover = acc.rollover.plus(json.rollover_fee || "0");

    const funding = new BigNumber(json.funding_fee || "0");
    if (json.is_funding_fee_profit) {
      acc.funding = acc.funding.minus(funding);
    } else {
      acc.funding = acc.funding.plus(funding);
    }
  });
};

const fetchEvents = async (
  from: number,
  to: number,
  module: string,
  event: string,
  acc: Accumulator,
  processor: (
    edges: any[],
    from: number,
    to: number,
    acc: Accumulator,
  ) => boolean,
) => {
  let cursor: string | null = null;
  const eventType = `${PACKAGE_ID}::${module}::${event}`;

  while (true) {
    const query = buildQuery(cursor, eventType);

    const response: any = await request(GRAPHQL_URL, query);
    if (!response.events?.edges?.length) break;

    const shouldContinue = processor(response.events.edges, from, to, acc);
    if (!shouldContinue) break;
    cursor = response.events.pageInfo.endCursor;
  }
};

const fetch = async (options: FetchOptions) => {
  const { fromTimestamp, toTimestamp, createBalances, startOfDay } = options;
  const acc: Accumulator = {
    lp: new BigNumber(0),
    stake: new BigNumber(0),
    dev: new BigNumber(0),
    funding: new BigNumber(0),
    rollover: new BigNumber(0),
  };

  await Promise.all([
    fetchEvents(
      fromTimestamp,
      toTimestamp,
      "rewards_manager",
      "DepositFeeEvent",
      acc,
      processDepositFees,
    ),
    fetchEvents(
      fromTimestamp,
      toTimestamp,
      "trading",
      "PositionUpdatedEvent",
      acc,
      processTradingFees,
    ),
  ]);

  const divDecimals = (bn: BigNumber) => bn.div(VUSD_DECIMALS).toNumber();

  // Protocol = Stake + Dev
  const protocolRevenue = divDecimals(acc.stake.plus(acc.dev));
  // LP provider = LP fee + Funding + Rollover
  const providersRevenue = divDecimals(
    acc.lp.plus(acc.funding).plus(acc.rollover),
  );
  const totalRevenue = protocolRevenue + providersRevenue;

  const fees = createBalances();
  const rev = createBalances();
  const pRev = createBalances();
  const ssRev = createBalances();
  
  fees.addCGToken("usd-coin", totalRevenue);
  rev.addCGToken("usd-coin", protocolRevenue);
  pRev.addCGToken("usd-coin", protocolRevenue);
  ssRev.addCGToken("usd-coin", providersRevenue);

  return {
    timestamp: startOfDay,
    dailyFees: fees,
    dailyRevenue: rev,
    dailyProtocolRevenue: pRev,
    dailySupplySideRevenue: ssRev,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: { [CHAIN.IOTA]: { fetch, start: "2025-10-23" } },
  allowNegativeValue: true,
  methodology: {
    Fees: "All trading, funding and rollover fees collected from users",
    Revenue: "Aggregated fees distributed between the protocol vaults",
    ProtocolRevenue: "Fees directed to the protocol vaults for maintenance",
    SupplySideRevenue:
      "Fees distributed to liquidity providers, adjusted for funding profit/loss",
  },
};

export default adapter;
