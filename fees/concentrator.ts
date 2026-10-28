import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../adapters/types";
import { parseUnits } from "ethers";
import CORE_ASSETS from "../helpers/coreAssets.json";

// aCRV wraps cvxCRV: https://github.com/AladdinDAO/aladdin-v3-contracts/blob/main/contracts/concentrator/cvxcrv/AladdinCRV.sol
const aCRV = "0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884";

const endpoints: Record<string, string> = {
  [CHAIN.ETHEREUM]:
    sdk.graph.modifyEndpoint('CCaEZU1PJyNaFmEjpyc4AXUiANB6M6DGDCJuWa48JWTo'),
};

const fetch = async ({ startOfDay, chain, api, createBalances }: FetchOptions) => {
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

  // The subgraph reports aCRV shares received by the veCTR distributor, in 18-decimal token units.
  const shares = parseUnits(snapshot.aCRVRevenue, 18);
  if (shares < 0n) throw new Error("Negative aCRV revenue");
  const dailyFees = createBalances();
  const dailyHoldersRevenue = createBalances();
  if (shares > 0n) {
    // api is pinned to the end of the requested day. Both getters exist on aCRV V1 and V2.
    const [totalUnderlying, totalSupply] = await api.batchCall([
      { target: aCRV, abi: "uint256:totalUnderlying" },
      { target: aCRV, abi: "erc20:totalSupply" },
    ]);
    if (BigInt(totalSupply) === 0n) throw new Error("aCRV has zero total supply");
    const underlying = shares * BigInt(totalUnderlying) / BigInt(totalSupply);
    dailyHoldersRevenue.add(CORE_ASSETS.ethereum.cvxCRV, underlying, "Vault Harvest Fees to veCTR");
    if (underlying > 0n && await dailyHoldersRevenue.getUSDValue() === 0) throw new Error("Missing cvxCRV price");
    // Preserve the existing 50/50 attribution between veCTR lockers and the treasury.
    dailyFees.add(CORE_ASSETS.ethereum.cvxCRV, underlying * 2n, "Vault Harvest Fees");
  }
  const dailyProtocolRevenue = dailyHoldersRevenue.clone(1, "Vault Harvest Fees to Treasury");
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue, dailyHoldersRevenue };
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
  breakdownMethodology: {
    Fees: { "Vault Harvest Fees": "Vault harvest fees, inferred from the existing 50/50 treasury and veCTR split." },
    Revenue: { "Vault Harvest Fees": "Vault harvest fees retained by the protocol or distributed to veCTR lockers." },
    ProtocolRevenue: { "Vault Harvest Fees to Treasury": "The treasury's 50% share of vault harvest fees." },
    HoldersRevenue: { "Vault Harvest Fees to veCTR": "aCRV received by the veCTR distributor, valued through its cvxCRV underlying at the end of the day." },
  },
};

export default adapter;
