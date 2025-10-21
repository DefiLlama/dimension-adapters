// dexs/lithos/index.ts
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { CHAIN } from "../../helpers/chains";
import PromisePool from "@supercharge/promise-pool";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const VOLATILE_FEE = 0.0025; // 25 bps
const STABLE_FEE = 0.0005;   // 5 bps
const PROTOCOL_FEE_SHARE = 0.12; // 12% to treasury
const LP_FEE_SHARE = 1 - PROTOCOL_FEE_SHARE;
const START_BLOCK = 3_599_118; // Voter deployment
const START_DATE = "2025-09-29";

const CONFIG = {
  factory: "0x71a870D1c935C2146b87644DF3B5316e8756aE18",
  voter: "0x2AF460a511849A7aA37Ac964074475b0E6249c69",
};

const eventAbis = {
  gaugeCreated: "event GaugeCreated(address indexed gauge, address indexed creator, address indexed internal_bribe, address external_bribe, address pool)",
  rewardAdded: "event RewardAdded(address indexed rewardToken, uint256 reward, uint256 startTimestamp)",
};

const baseFetch = getUniV2LogAdapter({
  factory: CONFIG.factory,
  fees: VOLATILE_FEE,
  stableFees: STABLE_FEE,
});

const normaliseAddress = (address?: string) =>
  address ? address.toLowerCase() : undefined;

const normaliseAmount = (value: string | bigint | number) =>
  typeof value === "string" ? value : value.toString();

const getExternalBribeAddresses = async (
  fetchOptions: FetchOptions,
): Promise<string[]> => {
  const toBlock = await fetchOptions.getToBlock();
  const gaugeLogs = (await fetchOptions.getLogs({
    target: CONFIG.voter,
    fromBlock: START_BLOCK,
    toBlock,
    eventAbi: eventAbis.gaugeCreated,
    onlyArgs: true,
    cacheInCloud: true,
  })) as any[];

  const addresses = gaugeLogs
    .map(
      (log) =>
        normaliseAddress(
          log?.external_bribe ?? log?.externalBribe ?? log?.[3],
        )!,
    )
    .filter((addr) => addr && addr !== ZERO_ADDRESS);

  return Array.from(new Set(addresses));
};

const getDailyBribesRevenue = async (
  fetchOptions: FetchOptions,
): Promise<ReturnType<FetchOptions["createBalances"]>> => {
  const dailyBribesRevenue = fetchOptions.createBalances();
  const [fromBlockRaw, toBlock] = await Promise.all([
    fetchOptions.getFromBlock(),
    fetchOptions.getToBlock(),
  ]);

  const fromBlock = Math.max(fromBlockRaw ?? START_BLOCK, START_BLOCK);
  if (toBlock < fromBlock) return dailyBribesRevenue;

  const bribeAddresses = await getExternalBribeAddresses(fetchOptions);
  if (!bribeAddresses.length) return dailyBribesRevenue;

  const rewardLogs = (await fetchOptions.getLogs({
    targets: bribeAddresses,
    fromBlock,
    toBlock,
    eventAbi: eventAbis.rewardAdded,
    onlyArgs: true,
    flatten: true,
  })) as any[];

  rewardLogs.forEach((log) => {
    const token =
      normaliseAddress(
        log?.rewardToken ?? log?.reward_token ?? log?.reward ?? log?.[0],
      ) ?? "";
    if (!token) return;

    const amount = normaliseAmount(log?.reward ?? log?.amount ?? log?.[1] ?? 0);
    dailyBribesRevenue.add(token, amount);
  });

  return dailyBribesRevenue;
};

const fetch: FetchV2 = async (fetchOptions: FetchOptions) => {
  const { dailyVolume, dailyFees } = await baseFetch(fetchOptions);

  const dailyBribesRevenue = await getDailyBribesRevenue(fetchOptions);

  const dailyUserFees = dailyFees.clone(1);
  const dailyProtocolRevenue = dailyFees.clone(PROTOCOL_FEE_SHARE);
  const dailySupplySideRevenue = dailyFees.clone(LP_FEE_SHARE);
  const dailyRevenue = dailyProtocolRevenue.clone(1);
  const dailyHoldersRevenue = dailyBribesRevenue.clone(1);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyBribesRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Users pay 0.25% on volatile swaps and 0.05% on stable swaps.",
  UserFees: "Users are charged the full swap fee on every trade.",
  Revenue: "12% of collected swap fees accrue to the Lithos protocol treasury.",
  ProtocolRevenue: "Same as Revenue (12% treasury share of swap fees).",
  HoldersRevenue: "External incentives deposited into Lithos bribe contracts for veLITH voters.",
  SupplySideRevenue: "88% of collected swap fees accrue to LPs via internal fee bribes.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: START_DATE,
  chains: [CHAIN.PLASMA],
  methodology,
};

export default adapter;
