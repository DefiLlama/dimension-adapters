import { Adapter, FetchOptions, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { GraphQLClient, gql } from 'graphql-request';
import { Balances } from "@defillama/sdk";

const subgraphEndpoint = "https://gateway-arbitrum.network.thegraph.com/api/7ca317c1d6347234f75513585a71157c/deployments/id/QmQF8cZUUb3hEVfuNBdGAQPBmvRioLsqyxHZbRRgk1zpVV"
const client = new GraphQLClient(subgraphEndpoint);


// event logs can be found here: https://github.com/DefiLlama/dimension-adapters/pull/1492#issuecomment-2118112517
async function calculateNotionalVolume(balances: Balances, orders: any[]) {
  for (const order of orders) {
    let orderDetails = order.callOrder || order.putOrder;

    if (!orderDetails) {
      console.error("No order details found");
      continue;
    }
    if (order.callOrder) {
      balances.add(orderDetails.strikeAsset, orderDetails.strikeAmount)
    }
    else if (order.putOrder) {
      balances.add(orderDetails.underlyingAsset, orderDetails.underlyingAmount)
    }
  }
}

function calculatePremiumVolume(balances: Balances, optionPremiums: any[]) {
  for (const premium of optionPremiums)
    balances.add(premium.premiumAsset, premium.amount)
}

async function fetchCallOrder(client: GraphQLClient, start: number, end: number | null, pageSize: number = 100) {
  let skip = 0;
  let allData = { callOrderEntities: [] };
  let hasMore = true;
  while (hasMore) {
    const query = gql`
      {
        callOrderEntities(where: { timestamp_gte: ${start}, timestamp_lte: ${end}}, first: ${pageSize}, skip: ${skip}) {
          callOrder {
            underlyingAsset
            underlyingAmount
            strikeAsset
            strikeAmount
          }
          orderId
          transactionHash
        }
      }
    `;
    const result = await client.request(query);
    allData.callOrderEntities.push(...result.callOrderEntities as never[]);
    skip += pageSize;
    hasMore = result.callOrderEntities.length === pageSize;
  }
  return allData;
}
async function fetchPutOrder(client: GraphQLClient, start: number, end: number | null, pageSize: number = 100) {
  let skip = 0;
  let allData = { putOrderEntities: [] };
  let hasMore = true;
  while (hasMore) {
    const query = gql`
      {
        putOrderEntities(where: { timestamp_gte: ${start}, timestamp_lte: ${end}}, first: ${pageSize}, skip: ${skip}) {
          putOrder {
            underlyingAsset
            underlyingAmount
            strikeAsset
            strikeAmount
          }
          orderId
          transactionHash
        }
      }`
    const result = await client.request(query);
    allData.putOrderEntities.push(...result.putOrderEntities as never[]);
    skip += pageSize;
    hasMore = result.putOrderEntities.length === pageSize;
  }
  return allData;
}
async function fetchOptionPremiums(client: GraphQLClient, start: number, end: number | null, pageSize: number = 100) {
  let skip = 0;
  let allData = { optionPremiums: [] };
  let hasMore = true;
  while (hasMore) {
    const query = gql`
      {
        optionPremiums(where: { timestamp_gte: ${start}, timestamp_lte: ${end}}, first: ${pageSize}, skip: ${skip}) {
          amount
          premiumAsset
          orderID
          transactionHash
        }
      }
    `;
    const result = await client.request(query);
    allData.optionPremiums.push(...result.optionPremiums as never[]);
    skip += pageSize;
    hasMore = result.optionPremiums.length === pageSize;
  }
  return allData;
}

export async function fetchSubgraphData({ createBalances, startTimestamp, endTimestamp, }: FetchOptions) {
  const now = endTimestamp;
  const startOfDay = startTimestamp;
  const [
    dailyCallData, dailyPutData, dailyPremiumData,
    // totalCallData, totalPutData, totalPremiumData
  ] = await Promise.all([
    fetchCallOrder(client, startOfDay, now),
    fetchPutOrder(client, startOfDay, now),
    fetchOptionPremiums(client, startOfDay, now),
    // fetchCallOrder(client, start, now),
    // fetchPutOrder(client, start, now),
    // fetchOptionPremiums(client, start, now)
  ]);
  const dailyNotionalVolume = createBalances()
  const dailyPremiumVolume = createBalances()
  // const totalNotionalVolume = createBalances()
  // const totalPremiumVolume = createBalances()

  calculateNotionalVolume(dailyNotionalVolume, [...dailyCallData.callOrderEntities, ...dailyPutData.putOrderEntities]);
  calculatePremiumVolume(dailyPremiumVolume, dailyPremiumData.optionPremiums);
  // calculateNotionalVolume(totalNotionalVolume, [...totalCallData.callOrderEntities, ...totalPutData.putOrderEntities]);
  // calculatePremiumVolume(totalPremiumVolume, totalPremiumData.optionPremiums);

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
    // totalNotionalVolume,
    // totalPremiumVolume,
  }
}

const start = 1715175000

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchSubgraphData,
      runAtCurrTime: true,
      start: start,
    },
  }
}
export default adapter;
