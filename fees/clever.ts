import * as sdk from "@defillama/sdk";
import { FetchOptions, Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request } from "graphql-request";

const endpoints: Record<string, string> = {
  [CHAIN.ETHEREUM]:
    sdk.graph.modifyEndpoint('CCaEZU1PJyNaFmEjpyc4AXUiANB6M6DGDCJuWa48JWTo'),
};

const fetch = async ({ createBalances, startOfDay, toTimestamp, chain }: FetchOptions) => {
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dateId = Math.floor(startOfDay);

  const graphQuery = `{ dailyRevenueSnapshot(id: ${dateId}) { cvxRevenue fraxRevenue } _meta { block { timestamp } } }`;

  const { dailyRevenueSnapshot: snapshot, _meta } = await request(
    endpoints[chain],
    graphQuery
  );
  if (!snapshot) {
    // the subgraph only writes a snapshot on days with a harvest; once it has indexed past the
    // end of the day, a missing snapshot means no harvest that day, not missing data
    const indexedTo = Number(_meta?.block?.timestamp ?? 0);
    if (indexedTo < Math.min(dateId + 86400, toTimestamp)) throw new Error(`No data found: subgraph indexed only to ${indexedTo}`);
    return { dailyFees, dailyRevenue };
  }

  const cvxAmount = Number(snapshot.cvxRevenue);
  const fraxAmount = Number(snapshot.fraxRevenue);

  dailyFees.addCGToken("convex-finance", cvxAmount * 2, "CVX harvest fees");
  dailyFees.addCGToken("frax", fraxAmount * 2, "FRAX harvest fees");

  dailyRevenue.addCGToken("convex-finance", cvxAmount, "CVX protocol revenue");
  dailyRevenue.addCGToken("frax", fraxAmount, "FRAX protocol revenue");

  return { dailyFees, dailyRevenue };
};

const breakdownMethodology = {
  Fees: {
    "CVX harvest fees": "Total fees collected from CVX token harvests, representing the full fee amount before the protocol revenue split.",
    "FRAX harvest fees": "Total fees collected from FRAX token harvests, representing the full fee amount before the protocol revenue split.",
  },
  Revenue: {
    "CVX protocol revenue": "Protocol share (50%) of CVX harvest fees retained by CLever as revenue.",
    "FRAX protocol revenue": "Protocol share (50%) of FRAX harvest fees retained by CLever as revenue.",
  },
};

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-04-19',
  breakdownMethodology,
};

export default adapter;
