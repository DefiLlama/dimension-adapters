import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Stockereum - a launchpad on Ethereum where every token opens in a Uniswap v4
// pool quoted in a tokenized stock, ETH (WETH) or USDC. The pool's liquidity is
// a single hook-owned position, and the Stockereum hook charges a fee on every
// swap, always in the quote currency, and credits it in the same swap to the
// creator and the platform through the fee escrow.
//
// Two hook generations are live and keep trading:
//
//   - v2 (2026-09-03): flat 1% fee, split 50/50 between creator and platform.
//     An anti-snipe rate applies right after launch; the creator still gets
//     half of the normal 1%, the excess goes to the platform.
//   - v3 (2026-09-05): the creator picks a 1%, 2% or 3% fee. The platform takes
//     0.5% of the trade at 1% and 1% of the trade at 2% or 3%; the rest goes to
//     the creator, or to the launch token's holders when the launch enabled
//     holder rewards. The anti-snipe excess again goes to the platform.
//
// Every swap emits Trade(poolId, ..., amountIn, amountOut, feeAmount): a buy
// reports the gross quote paid in, a sell the quote paid out after the fee.
//
// https://stockereum.com

const TRADE_EVENT =
  "event Trade(bytes32 indexed poolId, address indexed trader, address indexed referrer, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 feeAmount, bytes32 comment)";

const FEE_DENOMINATOR = 1_000_000n;

type Launch = { quote: string; creatorShare: (gross: bigint, fee: bigint) => bigint; toHolders: boolean };

type Hook = {
  address: string;
  getLaunchAbi: string;
  toLaunch: (l: any) => Launch;
};

const HOOKS: Hook[] = [
  {
    // v2 hook, https://etherscan.io/address/0xAFeD2c6e0d906520ca17143a8918Ce6d54b128Cc
    address: "0xAFeD2c6e0d906520ca17143a8918Ce6d54b128Cc",
    getLaunchAbi:
      "function getLaunch(bytes32 poolId) view returns ((address token, address creator, address quote, uint64 openedAt, bool quoteIsCurrency0, bool pendingDevBuy, address devBuyer, int24 tickLower, int24 tickUpper, uint128 liquidity))",
    toLaunch: (l: any) => ({
      quote: l.quote,
      // creator gets half of the normal 1% fee (NORMAL_FEE = 10_000 ppm, CREATOR_SHARE_BPS = 5_000)
      creatorShare: (gross: bigint, fee: bigint) => {
        const normal = (gross * 10_000n) / FEE_DENOMINATOR;
        return ((fee < normal ? fee : normal) * 5_000n) / 10_000n;
      },
      toHolders: false,
    }),
  },
  {
    // v3 hook, https://etherscan.io/address/0x322dcEc4958C14e021A9F1cD49DF11b9457968cC
    address: "0x322dcEc4958C14e021A9F1cD49DF11b9457968cC",
    getLaunchAbi:
      "function getLaunch(bytes32 poolId) view returns ((address token, address feeRecipient, address quote, uint40 openedAt, uint24 feePpm, bool quoteIsCurrency0, bool pendingDevBuy, bool feesToHolders, address devBuyer, int24 tickLower, int24 tickUpper, uint128 liquidity))",
    toLaunch: (l: any) => {
      const feePpm = BigInt(l.feePpm);
      // platformFeeFor: 0.5% of the trade below a 2% fee, 1% from 2% up
      const platformPpm = feePpm >= 20_000n ? 10_000n : 5_000n;
      return {
        quote: l.quote,
        creatorShare: (gross: bigint) => (gross * (feePpm - platformPpm)) / FEE_DENOMINATOR,
        toHolders: Boolean(l.feesToHolders),
      };
    },
  },
];

const LABEL = {
  toPlatform: "Swap Fees To Platform",
  toCreators: "Swap Fees To Creators",
  toTokenHolders: "Swap Fees To Launched Token Holders",
};

const fetch = async (options: FetchOptions) => {
  const { api, createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const tradesByHook = await getLogs({
    targets: HOOKS.map((h) => h.address),
    eventAbi: TRADE_EVENT,
    onlyArgs: false,
    flatten: false,
  });

  for (const [i, hook] of HOOKS.entries()) {
    const trades: any[] = tradesByHook[i];
    if (!trades.length) continue;

    const poolIds = [...new Set(trades.map((t: any) => t.args.poolId as string))];
    const launches = await api.multiCall({
      target: hook.address,
      abi: hook.getLaunchAbi,
      calls: poolIds,
    });
    const byPool: Record<string, Launch> = {};
    poolIds.forEach((id, i) => { byPool[id] = hook.toLaunch(launches[i]); });

    for (const { args: t } of trades) {
      const launch = byPool[t.poolId];
      const fee = BigInt(t.feeAmount);
      const gross = t.isBuy ? BigInt(t.amountIn) : BigInt(t.amountOut) + fee;
      let creator = launch.creatorShare(gross, fee);
      if (creator > fee) creator = fee;
      const platform = fee - creator;

      dailyVolume.add(launch.quote, gross);
      dailyFees.add(launch.quote, fee, METRIC.SWAP_FEES);
      dailyRevenue.add(launch.quote, platform, LABEL.toPlatform);
      dailySupplySideRevenue.add(launch.quote, creator, launch.toHolders ? LABEL.toTokenHolders : LABEL.toCreators);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "The quote side (tokenized stock, ETH or USDC) of every swap in a Stockereum launch pool: the gross amount paid in on buys and the gross amount paid out before the fee on sells. A launch never migrates: it trades in the same hook pool, with the same fee, for its whole life, so every trade is counted.",
  Fees: "The fee the Stockereum hook charges on every swap, in the quote currency, from the hook's Trade event: 1% on v2 launches, 1%, 2% or 3% (chosen by the creator) on v3 launches, plus the anti-snipe rate in the first moments after a launch.",
  UserFees: "Traders pay the whole swap fee.",
  Revenue: "The platform's share of the swap fee: half of the normal 1% on v2, 0.5% of the trade on 1% v3 launches and 1% of the trade on 2% and 3% v3 launches, plus any anti-snipe excess.",
  ProtocolRevenue: "The platform's share of the swap fee.",
  SupplySideRevenue: "The rest of the swap fee, paid to the launch's creator or, on launches with holder rewards enabled, to the launched token's holders.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "The hook's fee on each swap in a launch pool, in the quote currency.",
  },
  Revenue: {
    [LABEL.toPlatform]: "The platform's share of the swap fee, credited to the platform in the fee escrow.",
  },
  ProtocolRevenue: {
    [LABEL.toPlatform]: "The platform's share of the swap fee, credited to the platform in the fee escrow.",
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "The creator's share of the swap fee, credited to the creator in the fee escrow.",
    [LABEL.toTokenHolders]: "The creator's share on launches with holder rewards enabled, paid to the launched token's holders through its reward distributor.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-09-03",
  methodology,
  breakdownMethodology,
  pullHourly: true,
  doublecounted: true, // uni-v4
};

export default adapter;
