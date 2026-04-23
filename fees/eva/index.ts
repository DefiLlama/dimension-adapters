import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SUBGRAPH_URL = "https://gateway.eva.markets/subgraph";

const VAULT_UNDERLYINGS: Record<string, string> = {
  "0x741bd193b6b40f8703d2e116fd1965421f290f58": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "0x501ebf66d76a96d4fb26ccead42957653e16b8b8": "0xdac17f958d2ee523a2206206994597c13d831ec7",
  "0xdbecd077c1c2fefdcb75f547d1b5a73bf8207e4c": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
};

type VaultSkim = {
  amount: string;
  vault: string;
};

type VaultSkimsResponse = {
  VaultSkim: VaultSkim[];
};

const query = gql`
  query VaultSkims($start: numeric!, $end: numeric!, $offset: Int!) {
    VaultSkim(
      where: { timestamp: { _gte: $start, _lt: $end } }
      order_by: { timestamp: asc }
      limit: 1000
      offset: $offset
    ) {
      amount
      vault
    }
  }
`;

async function fetchSkims(start: number, end: number) {
  const skims: VaultSkim[] = [];
  let offset = 0;

  while (true) {
    const response = await request<VaultSkimsResponse>(SUBGRAPH_URL, query, {
      start: String(start),
      end: String(end),
      offset,
    });

    skims.push(...response.VaultSkim);
    if (response.VaultSkim.length < 1000) break;
    offset += 1000;
  }

  return skims;
}

const fetch = async ({ createBalances, startTimestamp, endTimestamp }: FetchOptions) => {
  const dailyFees = createBalances();

  const skims = await fetchSkims(startTimestamp, endTimestamp);
  skims.forEach(({ amount, vault }) => {
    const underlying = VAULT_UNDERLYINGS[vault.toLowerCase()];
    if (underlying) dailyFees.add(underlying, amount);
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-03-24",
  methodology: {
    Fees: "Yield skimmed from eva vault backing after holder obligations are covered.",
    Revenue: "Skimmed yield retained by the eva protocol treasury.",
    ProtocolRevenue: "Skimmed yield retained by the eva protocol treasury.",
  },
};

export default adapter;
