import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

const priceUrl = "https://api.aladdin.club/api/coingecko/price";

const endpoints: Record<string, string> = {
  [CHAIN.ETHEREUM]:
    sdk.graph.modifyEndpoint('CCaEZU1PJyNaFmEjpyc4AXUiANB6M6DGDCJuWa48JWTo'),
};

const fetch = async ({ startOfDay, chain }: FetchOptions) => {
  const dateId = Math.floor(startOfDay);
  const graphQuery = gql`{
      dailyRevenueSnapshot(id: ${dateId}) {
          aCRVRevenue
      }
  }`;

  const { dailyRevenueSnapshot: snapshot } = await request(
    endpoints[chain],
    graphQuery
  );
  if (!snapshot) throw new Error("No data found");

  const { aCRV } = (await fetchURL(priceUrl))?.data;

  const dailyRevenue = snapshot.aCRVRevenue;

  const usd = dailyRevenue * aCRV.usd;
  const revenue = usd.toFixed(0);
  const dailyFees = (usd * 2).toFixed(0);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: revenue, dailyHoldersRevenue: revenue };
};

const methodology = {
  Fees: "Fees are collected from vault harvests",
  Revenue: "All the vault harvest fees are either collected by the protocol or shared with the holders",
  HoldersRevenue: "50% of the vault harvest fees are shared with the holders (veCTR lockers)",
  ProtocolRevenue: "50% of the vault harvest fees are retained by the protocol",
}

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2022-11-08',
  methodology,
};

export default adapter;
