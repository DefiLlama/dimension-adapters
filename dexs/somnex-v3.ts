import request from "graphql-request";
import type { FetchOptions, FetchResult, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const subgraphUrl = "https://api.subgraph.somnia.network/api/public/962dcbf6-75ff-4e54-b778-6b5816c05e7d/subgraphs/somnia-swap/v1.0.0/gn"

const fetch = async (
  { getFromBlock, getToBlock }: FetchOptions
): Promise<FetchResult> => {

  const query = (block: number) => `{
  uniPools (first: 1000 where: {    uniPoolType:v3  } 
    orderBy: volumeUSD orderDirection:desc  block:{ number: ${block} }) {
    feesUSD    volumeUSD  } }`

  const resYesterday = await request(subgraphUrl, query(await getFromBlock()));
  const resToday = await request(subgraphUrl, query(await getToBlock()));
  const feeYesterdayTotal = resYesterday.uniPools.reduce((a: number, b: { feesUSD: string }) => a + Number(b.feesUSD), 0)
  const feeTodayTotal = resToday.uniPools.reduce((a: number, b: { feesUSD: string }) => a + Number(b.feesUSD), 0)
  const dailyFees = feeTodayTotal - feeYesterdayTotal

  const volumeYesterdayTotal = resYesterday.uniPools.reduce((a: number, b: { volumeUSD: string }) => a + Number(b.volumeUSD), 0)
  const volumeTodayTotal = resToday.uniPools.reduce((a: number, b: { volumeUSD: string }) => a + Number(b.volumeUSD), 0)
  const dailyVolume = volumeTodayTotal - volumeYesterdayTotal
  return { dailyVolume, dailyFees }
};

export default {
  start: '2025-07-09',
  version: 2,
  fetch,
  chains: [CHAIN.SOMNIA]
};

