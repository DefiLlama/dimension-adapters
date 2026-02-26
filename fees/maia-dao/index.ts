import * as sdk from "@defillama/sdk";
import { SimpleAdapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Contract Addresses on Arbitrum
const ADDRESSES = {
  MAIA_VAULT: '0x000000009239de863fb45a2577358e2073b6a0fc',
  bHERMES_GAUGES: '0xe6D0aeA7cEf79B08B906e0C455C25042b57b23Ed',
  BRIBE_FACTORY: '0x863011414b400340178Ec329647a2aa55f724D70',
  BOOST_AGGREGATOR: '0xd74d905fc5c74cc680ea9305714ab161ba290f14',
  HERMES: '0x45940000009600102A1c002F0097C4A500fa00AB',
};

// Deployment block on Arbitrum
const DEPLOY_BLOCK = 263751600;

// Event ABIs
const eventAbis = {
  AddGauge: 'event AddGauge(address indexed gauge)',
  AssetAdded: 'event AssetAdded(address indexed rewardsDepot, address indexed asset)',
};

// Contract ABIs
const abis = {
  multiRewardsDepot: 'function multiRewardsDepot() external view returns (address)',
  protocolRewards: 'function protocolRewards() external view returns (uint256)',
  tokenToFlywheel: 'function tokenToFlywheel(address) external view returns (address)',
  rewardsAccrued: 'function rewardsAccrued(address) external view returns (uint256)',
};

/**
 * Get all gauges from AddGauge events
 */
async function getGauges(fetchOptions: FetchOptions): Promise<string[]> {
  const { getLogs } = fetchOptions;

  const gaugeLogs = await getLogs({
    target: ADDRESSES.bHERMES_GAUGES,
    eventAbi: eventAbis.AddGauge,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
  });

  return gaugeLogs.map((log: any) => log.gauge.toLowerCase());
}

/**
 * Get bribe revenue accrued to Maia Vault via flywheel contracts
 * 1. Get all bribe tokens from AssetAdded events
 * 2. Map tokens to flywheels via tokenToFlywheel
 * 3. Query rewardsAccrued(MAIA_VAULT) at start/end blocks
 * 4. Calculate delta = daily accrued revenue
 */
async function getBribeRevenue(fetchOptions: FetchOptions): Promise<sdk.Balances> {
  const { createBalances, getLogs, api, fromApi } = fetchOptions;
  const dailyBribes = createBalances();

  // Get all gauges
  const gauges = await getGauges(fetchOptions);
  if (!gauges.length) return dailyBribes;

  // Get depots
  const depots = await api.multiCall({
    abi: abis.multiRewardsDepot,
    calls: gauges,
    permitFailure: true,
  });
  const validDepots = depots.filter(Boolean).map((d: string) => d.toLowerCase());
  if (!validDepots.length) return dailyBribes;

  // Get all bribe tokens from AssetAdded events
  const assetAddedLogs = await getLogs({
    targets: validDepots,
    eventAbi: eventAbis.AssetAdded,
    fromBlock: DEPLOY_BLOCK,
    cacheInCloud: true,
    entireLog: true,
  });

  // Collect unique tokens
  const tokens = new Set<string>();
  assetAddedLogs.forEach((log: any) => {
    const token = log.args?.asset?.toLowerCase();
    if (token) tokens.add(token);
  });

  if (!tokens.size) return dailyBribes;

  // Get flywheels for each token
  const tokenArray = Array.from(tokens);
  const flywheels = await api.multiCall({
    abi: abis.tokenToFlywheel,
    target: ADDRESSES.BRIBE_FACTORY,
    calls: tokenArray.map(t => ({ params: [t] })),
    permitFailure: true,
  });

  // Filter valid flywheels (non-zero address)
  const validPairs: { token: string; flywheel: string }[] = [];
  tokenArray.forEach((token, i) => {
    if (flywheels[i] && flywheels[i] !== '0x0000000000000000000000000000000000000000') {
      validPairs.push({ token, flywheel: flywheels[i] });
    }
  });

  if (!validPairs.length) return dailyBribes;

  // Query rewardsAccrued at start and end blocks
  const [accruedStart, accruedEnd] = await Promise.all([
    fromApi.multiCall({
      abi: abis.rewardsAccrued,
      calls: validPairs.map(p => ({ target: p.flywheel, params: [ADDRESSES.MAIA_VAULT] })),
      permitFailure: true,
    }),
    api.multiCall({
      abi: abis.rewardsAccrued,
      calls: validPairs.map(p => ({ target: p.flywheel, params: [ADDRESSES.MAIA_VAULT] })),
      permitFailure: true,
    }),
  ]);

  // Calculate delta for each token
  validPairs.forEach((pair, i) => {
    const start = BigInt(accruedStart[i] || 0);
    const end = BigInt(accruedEnd[i] || 0);
    const delta = end - start;

    if (delta > 0n) {
      dailyBribes.add(pair.token, delta.toString());
    }
  });

  return dailyBribes;
}

/**
 * Get protocol rewards delta from Boost Aggregator
 */
async function getBoostAggregatorRewards(
  fetchOptions: FetchOptions
): Promise<sdk.Balances> {
  const { createBalances, fromApi, api } = fetchOptions;
  const rewards = createBalances();

  const [rewardsStart, rewardsEnd] = await Promise.all([
    fromApi.call({ target: ADDRESSES.BOOST_AGGREGATOR, abi: abis.protocolRewards }),
    api.call({ target: ADDRESSES.BOOST_AGGREGATOR, abi: abis.protocolRewards }),
  ]);

  const delta = BigInt(rewardsEnd || 0) - BigInt(rewardsStart || 0);

  if (delta > 0n) {
    // protocolRewards is denominated in HERMES token
    rewards.add(ADDRESSES.HERMES, delta.toString());
  }

  return rewards;
}

/**
 * Main fetch function
 */
const fetch: FetchV2 = async (fetchOptions: FetchOptions) => {
  const { createBalances } = fetchOptions;
  const dailyFees = createBalances();

  // Get bribe revenue from flywheel accruals
  const bribeRevenue = await getBribeRevenue(fetchOptions);
  dailyFees.addBalances(bribeRevenue);

  // Add Boost Aggregator protocol rewards
  const boostRewards = await getBoostAggregatorRewards(fetchOptions);
  dailyFees.addBalances(boostRewards);

  // 100% of fees go to protocol
  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const methodology = {
  Fees: "Maia Vault's bribe revenue from gauge voting + Boost Aggregator protocol rewards",
  Revenue: "100% of fees go to protocol",
  ProtocolRevenue: "100% of fees go to protocol",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2025-05-24',
    },
  },
  methodology,
};

export default adapter;
