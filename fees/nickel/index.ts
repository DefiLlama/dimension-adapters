import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SUBGRAPH_URL = "https://gateway.thegraph.com/api/subgraphs/id/57W3a3unYSE8BqH694JjW96PHVeVgZLTgrZY15q4zKvd";
const NICKEL_TOKEN_ADDRESS = "0xE3F0CDCfC6e154a60b1712147BdC7Be9203dEabA";

const buybacksQuery = `
  query getBuybacks($startTimestamp: String!, $endTimestamp: String!) {
    buybacks(
      where: {
        timestamp_gte: $startTimestamp
        timestamp_lte: $endTimestamp
      }
      orderBy: timestamp
      orderDirection: desc
    ) {
      ethSpent
      amountToTreasury
      amountBurned
      nickelBought
      timestamp
    }
  }
`;

interface Buyback {
  ethSpent: string;
  amountToTreasury: string;
  amountBurned: string;
  nickelBought: string;
  timestamp: string;
}

interface GraphQLResponse {
  buybacks: Buyback[];
}

const fetchData: any = async (_a: any, _b: any, options: FetchOptions) => {
  const variables = {
    startTimestamp: String(options.startTimestamp),
    endTimestamp: String(options.endTimestamp),
  };

  const headers = {
    "Content-Type": "application/json",
  };

  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: buybacksQuery, variables }),
  });

  const response = await res.json();
  
  if (response.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(response.errors)}`);
  }
  
  const data: GraphQLResponse = response.data;

  // Initialize balances for each metric
  const dailyRevenue = options.createBalances();
  const dailyBurn = options.createBalances();
  const dailyTokensBought = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  
  // Sum all values from buybacks in the time period
  let totalEthSpent = BigInt(0);
  let totalAmountBurned = BigInt(0);
  let totalNickelBought = BigInt(0);
  let totalAmountToTreasury = BigInt(0);
  
  if (data.buybacks && data.buybacks.length > 0) {
    for (const buyback of data.buybacks) {
      totalEthSpent += BigInt(buyback.ethSpent || "0");
      totalAmountBurned += BigInt(buyback.amountBurned || "0");
      totalNickelBought += BigInt(buyback.nickelBought || "0");
      totalAmountToTreasury += BigInt(buyback.amountToTreasury || "0");
    }
  }

  // ethSpent is in ETH value (BigInt), convert to wei by multiplying by 1e18
  const ethSpentWei = totalEthSpent * BigInt(1e18);
  dailyRevenue.addGasToken(ethSpentWei);
  
  // amountBurned, nickelBought, and amountToTreasury are in token units (BigInt)
  dailyBurn.add(`${CHAIN.BASE}:${NICKEL_TOKEN_ADDRESS}`, totalAmountBurned);
  dailyTokensBought.add(`${CHAIN.BASE}:${NICKEL_TOKEN_ADDRESS}`, totalNickelBought);
  dailyHoldersRevenue.add(`${CHAIN.BASE}:${NICKEL_TOKEN_ADDRESS}`, totalAmountToTreasury);

  return {
    dailyRevenue,
    dailyBurn,
    dailyTokensBought,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch: fetchData,
  chains: [CHAIN.BASE],
  start: "2024-01-01", // Update this with the actual start date
  methodology: {
    Revenue: "Total ETH spent on buybacks.",
    Burn: "Total amount of tokens burned.",
    TokensBought: "Total nickel tokens bought.",
    HoldersRevenue: "Total amount sent to Staking contract.",
  },
};

export default adapter;

