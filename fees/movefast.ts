import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getResources, getVersionFromTimestamp, octasToApt } from "../helpers/aptos";
import { METRIC } from "../helpers/metrics";

// Both MoveFast deployments. Pools live under the first; the second is an
// earlier package kept alive for the tokens launched on it.
const PACKAGES = [
  "0xdef6b8f06dd82104a4bd3957eb715290cc615dc5a4acd432efadd64d23975d34",
  "0x8f79b6d87aca62ff5e3e9a555e69e409a3c76b7eb1283249c6998497ef1ac6d7",
];
const POOL_TYPES = new Set(PACKAGES.map((address) => `${address}::pool::Pool`));

// Every launch is a sticky object created under 0xdead, so the set of pools is
// derivable from chain data with no token list to maintain.
const POOL_OWNER = "0x000000000000000000000000000000000000000000000000000000000000dead";

// A block height just before the first MoveFast launch (2026-10-13 15:25 UTC;
// this block is 12:29 the same day), which bounds the timestamp search.
const DEPLOYED_AT_BLOCK = 1_110_000_000;

const TOKENS_QUERY = `query MoveFastTokens($creator: String!, $limit: Int!, $offset: Int!) {
  fungible_asset_metadata(
    where: { creator_address: { _eq: $creator } }
    order_by: { asset_type: asc }
    limit: $limit
    offset: $offset
  ) {
    asset_type
  }
}`;

async function launchedTokens(): Promise<string[]> {
  const { GraphQLClient } = await import("graphql-request");
  const client = new GraphQLClient("https://api.mainnet.aptoslabs.com/v1/graphql");
  const limit = 100;
  const tokens: string[] = [];
  for (let offset = 0; ; offset += limit) {
    const { fungible_asset_metadata: rows } = await client.request<{
      fungible_asset_metadata: { asset_type: string }[];
    }>(TOKENS_QUERY, { creator: POOL_OWNER, limit, offset });
    tokens.push(...rows.map((row) => row.asset_type));
    if (rows.length < limit) return tokens;
  }
}

/** Each pool names the vault its holder rewards are paid into. */
async function rewardsVaults(tokens: string[]): Promise<string[]> {
  const resources = await Promise.all(tokens.map((token) => getResources(token)));
  const vaults: string[] = [];
  for (const list of resources) {
    const pool = list.find((resource: any) => POOL_TYPES.has(resource.type));
    const vault = pool?.data?.rewards_vault?.inner;
    if (typeof vault === "string") vaults.push(vault);
  }
  return vaults;
}

/**
 * A vault's cumulative `lifetime_received` -- every octa of holder tax it has
 * ever taken in. Only this field is cumulative; `undistributed`, `allocated`
 * and the balance all move as holders claim, so differencing those would
 * measure claiming behaviour rather than fees earned.
 *
 * Read as a resource rather than through `vault_state`, because a view call at
 * a version before the package existed returns HTTP 400, and the SDK retries
 * each failure with backoff -- across every vault that is slow enough to time
 * the adapter out. Reading resources answers 200 with an empty list instead,
 * which is correctly zero.
 */
async function lifetimeReceived(vaults: string[], version: number): Promise<bigint> {
  const VAULT_TYPES = new Set(PACKAGES.map((address) => `${address}::rewards::Vault`));
  let total = 0n;
  // Sequential in batches: the public node rate-limits bursts, and a 429 costs
  // more in retries than the batching costs in latency.
  for (let at = 0; at < vaults.length; at += 8) {
    const batch = vaults.slice(at, at + 8);
    const lists = await Promise.all(
      batch.map((vault) => getResources(vault, version).catch(() => [] as any[])),
    );
    for (const list of lists) {
      const vault = list.find((resource: any) => VAULT_TYPES.has(resource.type));
      if (vault?.data?.lifetime_received !== undefined) {
        total += BigInt(vault.data.lifetime_received);
      }
    }
  }
  return total;
}

const fetch = async (options: FetchOptions) => {
  const [startVersion, endVersion] = await Promise.all([
    getVersionFromTimestamp(new Date(options.startTimestamp * 1000), DEPLOYED_AT_BLOCK),
    getVersionFromTimestamp(new Date(options.endTimestamp * 1000), DEPLOYED_AT_BLOCK),
  ]);

  const vaults = await rewardsVaults(await launchedTokens());
  const [startTotal, endTotal] = await Promise.all([
    lifetimeReceived(vaults, startVersion),
    lifetimeReceived(vaults, endVersion),
  ]);

  const dailyHolders = octasToApt(endTotal - startTotal);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // Paid to token holders, not retained by the protocol: it counts as fees and
  // as holders' revenue, and deliberately not as protocol revenue.
  dailyFees.addCGToken("aptos", dailyHolders, METRIC.TRADING_FEES);
  dailyHoldersRevenue.addCGToken("aptos", dailyHolders, METRIC.TRADING_FEES);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.APTOS],
  start: "2026-10-13",
  methodology: {
    Fees: "The share of every pool's trading tax that is paid out to token holders.",
    Revenue: "Zero. MoveFast keeps none of the holder share.",
    HoldersRevenue: "Trading tax distributed to token holders, paid in APT.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]:
        "Each MoveFast pool charges a creator-set tax, capped at 5%, split on chain between " +
        "holders, the token's creator and a burn. The holder share is escrowed in that token's " +
        "rewards vault. Summing every vault's cumulative lifetime_received at the start and end " +
        "of the period and differencing gives what holders were owed over it.",
    },
    HoldersRevenue: {
      [METRIC.TRADING_FEES]:
        "The same amount: it is distributed to holders in APT through Merkle-snapshot epochs, " +
        "so none of it is protocol revenue.",
    },
  },
};

export default adapter;
