import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const SUBGRAPH_URL = "https://gateway.eva.markets/subgraph";

type VaultSkim = {
  amount: string;
  vault: string;
};

type Vault = {
  address: string;
  underlying: string;
};

type VaultSkimsResponse = {
  VaultSkim: VaultSkim[];
};

type VaultsResponse = {
  Vault: Vault[];
};

const skimsQuery = gql`
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

const vaultsQuery = gql`
  query Vaults {
    Vault(limit: 1000) {
      address
      underlying
    }
  }
`;

async function fetchSkims(start: number, end: number) {
  const skims: VaultSkim[] = [];
  let offset = 0;

  while (true) {
    const response = await request<VaultSkimsResponse>(SUBGRAPH_URL, skimsQuery, {
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

async function fetchVaultUnderlyings() {
  const response = await request<VaultsResponse>(SUBGRAPH_URL, vaultsQuery);

  return Object.fromEntries(response.Vault.map(({ address, underlying }) => [address.toLowerCase(), underlying]));
}

const fetch = async ({ createBalances, startTimestamp, endTimestamp }: FetchOptions) => {
  const dailyFees = createBalances();

  const [skims, vaultUnderlyings] = await Promise.all([
    fetchSkims(startTimestamp, endTimestamp),
    fetchVaultUnderlyings(),
  ]);

  skims.forEach(({ amount, vault }) => {
    const underlying = vaultUnderlyings[vault.toLowerCase()];
    if (!underlying) throw new Error(`eva: unmapped vault ${vault}`);
    dailyFees.add(underlying, amount, METRIC.ASSETS_YIELDS);
  });

  return {
    dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-03-24",
  methodology: {
    Fees: "Yield skimmed from eva vault backing after holder obligations are covered.",
    Revenue: "eva retains no protocol revenue from skimmed yield.",
    ProtocolRevenue: "eva retains no protocol revenue from skimmed yield.",
    SupplySideRevenue: "Skimmed yield is allocated back to users through LP incentives.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Yield skimmed from eva vault backing after holder obligations are covered.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Skimmed yield allocated back to users through LP incentives.",
    },
  },
};

export default adapter;
