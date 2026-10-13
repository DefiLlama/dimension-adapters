import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CORE = "0x1333692eB905823df110762525c26f7489BB9300";
// Choice v2 (which Sprout graduates into) was deployed at this block, so Sprout cannot be older
const LOWEST_BLOCK = 182158326;

const BUY_EVENT =
  "event Buy(uint256 indexed launchId, address indexed trader, uint256 amountIn, uint256 fee, uint256 amountOut, uint256 u3, uint256 u4, uint256 u5, uint256 u6)";
const SELL_EVENT =
  "event Sell(uint256 indexed launchId, address indexed trader, uint256 tokensIn, uint256 amountOut, uint256 fee, uint256 u3, uint256 u4, uint256 u5, uint256 u6)";
const CREATOR_FEE_EVENT =
  "event CreatorFeeAccrued(uint256 indexed launchId, address indexed creator, address indexed token, uint256 amount)";

const L_FEES = "Bonding Curve Trading Fees";
const L_SUPPLY = "Trading Fees To Creators And Referrers";
const L_REVENUE = "Trading Fees To Platform";
const L_PROTOCOL = "Trading Fees To Protocol";
const L_HOLDERS = "Trading Fees To SPROUT Buyback And Burn";

// `injective` is registered as both a cosmos and an EVM chain, so the sdk cannot turn
// a timestamp into an EVM block. Resolve the block range through the EVM rpc instead.
async function firstBlockAtOrAfter(provider: any, timestamp: number, latest: number): Promise<number> {
  let lo = LOWEST_BLOCK;
  let hi = latest;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const block = await provider.getBlock(mid);
    if (block.timestamp >= timestamp) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

async function getBlockRange(options: FetchOptions) {
  const provider = (options.api as any).provider;
  const latest = await provider.getBlockNumber();
  const latestBlock = await provider.getBlock(latest);
  const fromBlock = await firstBlockAtOrAfter(provider, options.startTimestamp, latest);
  const toBlock =
    latestBlock.timestamp < options.endTimestamp
      ? latest
      : (await firstBlockAtOrAfter(provider, options.endTimestamp, latest)) - 1;
  return { fromBlock, toBlock };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const { fromBlock, toBlock } = await getBlockRange(options);
  if (toBlock < fromBlock) {
    return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
  }

  const getEvents = (eventAbi: string): Promise<any[]> =>
    options.getLogs({ target: CORE, eventAbi, fromBlock, toBlock } as any);

  const buys = await getEvents(BUY_EVENT);
  const sells = await getEvents(SELL_EVENT);
  const accruals = await getEvents(CREATOR_FEE_EVENT);

  // the quote token of a launch never changes, so any accrual event reveals it
  const quoteByLaunch: Record<string, string> = {};
  accruals.forEach((log: any) => {
    quoteByLaunch[String(log.launchId)] = log.token;
  });

  const addFee = (launchId: any, feeRaw: any) => {
    const token = quoteByLaunch[String(launchId)];
    if (!token) throw new Error(`Sprout: no quote token found for launch ${launchId}`);
    const fee = BigInt(feeRaw);
    const platform = (fee * 30n) / 100n;
    const holders = (platform * 80n) / 100n;
    dailyFees.add(token, fee, L_FEES);
    dailySupplySideRevenue.add(token, fee - platform, L_SUPPLY);
    dailyRevenue.add(token, platform, L_REVENUE);
    dailyHoldersRevenue.add(token, holders, L_HOLDERS);
    dailyProtocolRevenue.add(token, platform - holders, L_PROTOCOL);
  };

  buys.forEach((log: any) => addFee(log.launchId, log.fee));
  sells.forEach((log: any) => addFee(log.launchId, log.fee));

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid on every buy and sell on sprout.fun bonding curves (1% or 3% per launch).",
  Revenue: "30% of each trading fee goes to the platform.",
  SupplySideRevenue: "70% of each trading fee goes to the launch creator (part of it to referrers).",
  ProtocolRevenue: "20% of the platform share is kept by the protocol.",
  HoldersRevenue: "80% of the platform share funds SPROUT buyback and burn.",
};

const breakdownMethodology = {
  Fees: { [L_FEES]: "Fees charged on every buy and sell on the bonding curve." },
  Revenue: { [L_REVENUE]: "30% of each trading fee kept by the platform." },
  SupplySideRevenue: { [L_SUPPLY]: "70% of each trading fee paid to creators, with referrers taking a cut of it." },
  ProtocolRevenue: { [L_PROTOCOL]: "20% of the platform share retained by the protocol." },
  HoldersRevenue: { [L_HOLDERS]: "80% of the platform share used to buy back and burn SPROUT." },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.INJECTIVE],
  start: "2026-09-13",
  methodology,
  breakdownMethodology,
};

export default adapter;
