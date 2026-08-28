// token.select — DefiLlama FEES adapter (dimension-adapters/fees/token-select/index.ts)
//
// A fair-launch launchpad on Robinhood Chain. Every launch deploys its own token contract from
// one factory, migrates into a Uniswap V3 1% pool, and routes that pool's trading fees back
// through the token contract, which splits them between the platform, the token's creator, an
// optional referrer, and the people who funded the launch.
//
// Everything below is read from event logs rather than lifetime-counter deltas or contract reads,
// because Robinhood Chain's public RPC serves no archive state — any historical eth_call fails
// with "metadata is not found". The adapter makes no contract calls at all: even each token's
// service charge rate is reconstructed from the factory's own event history.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// TokenSelectFactory (ERC1967 proxy — stable across implementation upgrades)
// https://robinhoodchain.blockscout.com/address/0xA94AA60e9c7f193BF678608D5837F0FD51794635
//
// Scope: an earlier deployment of this same codebase exists at
// 0xB7351ba8347fc464946CC89e3Ddf2c3f7a94b381, with 104 launches from block 17615598 (~10M blocks
// before production). That is token.select's own pre-production test deployment and is
// deliberately excluded. Its fee parameters are 1000x smaller than production's on every one of
// its launches — 0.000003 ETH deployment fee against 0.003, 0.0001 ETH migration fee against 0.1 —
// and it has its own treasury and its own $SELECT-equivalent pairing token. Only the production
// factory below is in scope, and no production launch predates FROM_BLOCK.
const FACTORY = "0xA94AA60e9c7f193BF678608D5837F0FD51794635";
// First NewTokenSelectToken emitted by the production factory, 2026-08-04. Launches before this
// block belong to the test deployment described above and are out of scope.
// https://robinhoodchain.blockscout.com/block/27657019
const FROM_BLOCK = 27657019;
// Creation of the factory proxy. Rate history is walked from here rather than FROM_BLOCK so that a
// rate change made between deployment and the first launch is not missed.
// https://robinhoodchain.blockscout.com/tx/0x55b14c29316153eacc527eedb3936c4834b2a7e6e951c9b1a3c01a4f6274355d
const FACTORY_DEPLOY_BLOCK = 25259405;
const BASIS_POINTS = 10_000;

// INITIAL_SERVICE_CHARGE_RATE in TokenSelectFactory — the platform's cut of gross pool fees in bps,
// set in the initializer. The factory's rate is mutable (setRewardFees, which emits
// RewardFeesUpdated); whatever it holds when a token launches is copied into that token and is
// immutable there. So this constant is only the starting point of the rate history, not the rate.
const INITIAL_SERVICE_CHARGE_RATE = 2000;

// A single ordering key for a log: block number, then position within the block. Rate changes and
// launches can share a block (~0.1s block time on this chain), so block number alone is not enough
// to say which happened first. The multiplier supports up to 1,000,000 logs in one block, far above
// any realistic count, and at the current height of ~28M blocks the largest key it produces is
// ~2.8e13, well inside Number.MAX_SAFE_INTEGER (~9.0e15).
const LOG_INDEX_SCALE = 1e6;
const logPosition = (log: any) => {
  const blockNumber = Number(log.blockNumber);
  // Fail loudly rather than return NaN. options.getLogs defaults onlyArgs to true, which strips
  // blockNumber; a NaN position compares false against everything, which would silently apply
  // every rate change to every launch instead of throwing.
  if (!Number.isFinite(blockNumber))
    throw new Error("token-select: log has no blockNumber - getLogs needs onlyArgs: false");
  const logIndex = Number(log.logIndex ?? log.index);
  // Same reasoning. Defaulting a missing index to 0 would collapse the within-block ordering, so a
  // rate change could look like it preceded a launch that actually came first in the same block.
  if (!Number.isFinite(logIndex))
    throw new Error("token-select: log has no logIndex - getLogs needs onlyArgs: false");
  return blockNumber * LOG_INDEX_SCALE + logIndex;
};
const REWARD_FEES_UPDATED =
  "event RewardFeesUpdated(uint256 oldServiceRate, uint256 oldCreatorWithReferrerRate, uint256 oldCreatorNoReferrerRate, uint256 oldReferrerRate, uint256 newServiceRate, uint256 newCreatorFeeWithReferrer, uint256 newCreatorFeeNoReferrer, uint256 newReferrerFee)";

// Emitted by the factory once per launch. deploymentFee and migrationFee are the platform's
// charges for this token, denominated in ETH and fixed at deployment.
const NEW_TOKEN =
  "event NewTokenSelectToken(address indexed tokenAddress, address indexed creator, string name, string symbol, uint256 targetETHRaise, uint256 migrationFee, uint256 deploymentFee)";

// Emitted by each launched token when pool fees are pulled in and split. The amounts are NET of
// the platform's service charge — they are what reaches creator + referrer + contributors — and
// log.address is the launched token, which is what makes the token leg priceable.
const FEES_COLLECTED = "event FeesCollected(uint256 ethAmount, uint256 tokenAmount)";

// Emitted by each token on graduation. migrationFeeTransferred is the ETH actually sent to the
// treasury: the fixed migration fee plus a percentage of the ETH contributed.
const MIGRATION =
  "event Migration(uint256 actualETHUsed, uint256 actualTokensUsed, uint256 ethPositionTokenId, uint256 migrationFeeTransferred)";

// Every launch also seeds a second pool pairing the token against $SELECT, and that position's
// fees are harvested by the factory rather than the token. amount0/amount1 follow the pool's
// token ordering, which is the two addresses sorted ascending.
const SELECT_POOL_FEES =
  "event SelectPoolFeesCollected(address indexed tokenAddress, uint256 amount0, uint256 amount1)";
// $SELECT, the protocol token every launch is paired against in its second pool. Deployed through
// this same factory (first NewTokenSelectToken at block 27830592):
// https://robinhoodchain.blockscout.com/address/0xFc39e99e78524d7c891669F70d5aa92aB1041eb6
const SELECT_TOKEN = "0xFc39e99e78524d7c891669F70d5aa92aB1041eb6";

const SWAP_FEES = "Trading Fees";
const SWAP_FEES_PROTOCOL = "Trading Fees to Protocol";
const SWAP_FEES_SUPPLY = "Trading Fees to Contributors and Creators";
const SELECT_POOL_SWAP_FEES = "Token/$SELECT Pool Trading Fees";
const DEPLOY_FEES = "Token Deployment Fees";
const MIGRATION_FEES = "Migration Fees";

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Every token ever launched. Cached in cloud because this walks from the factory's first block.
  // onlyArgs: false because the rate history below needs each launch's blockNumber and logIndex,
  // and options.getLogs defaults onlyArgs to true, which returns the decoded arguments alone.
  // Decoded values therefore come from log.args here.
  const allLaunches = await options.getLogs({
    target: FACTORY,
    eventAbi: NEW_TOKEN,
    fromBlock: FROM_BLOCK,
    cacheInCloud: true,
    onlyArgs: false,
  });
  const tokens = allLaunches.map((log: any) => log.args.tokenAddress);
  if (!tokens.length) return { dailyFees, dailyRevenue, dailySupplySideRevenue };

  // Each token's serviceChargeRate is the factory's rate copied in at launch and immutable on the
  // token afterwards. It cannot be read back per token for a historical period: options.api is
  // pinned to the period's end block and Robinhood Chain's public RPC serves no archive state, so
  // the call fails with "metadata is not found". Reconstruct it from the factory's own history
  // instead — start at the initializer's rate and apply every RewardFeesUpdated in order, giving
  // each launch the rate in force at its position. A rate of 0 is legitimate (the platform can
  // waive its cut) and is preserved rather than treated as absent. onlyArgs: false for the same
  // reason as above: the ordering needs blockNumber and logIndex, not just the decoded arguments.
  const rateChanges = (
    await options.getLogs({
      target: FACTORY,
      eventAbi: REWARD_FEES_UPDATED,
      fromBlock: FACTORY_DEPLOY_BLOCK,
      cacheInCloud: true,
      onlyArgs: false,
    })
  )
    .map((log: any) => ({ position: logPosition(log), rate: Number(log.args.newServiceRate) }))
    .sort((a: any, b: any) => a.position - b.position);

  // Only a rate change that strictly precedes the launch applies to it. Comparing block numbers
  // alone would wrongly apply a change that landed later in the same block as the launch.
  const rateAtPosition = (position: number) => {
    let rate = INITIAL_SERVICE_CHARGE_RATE;
    for (const change of rateChanges) {
      if (change.position > position) break;
      rate = change.rate;
    }
    return rate;
  };

  const rateByToken: Record<string, number> = {};
  for (const log of allLaunches) {
    const token = log.args.tokenAddress.toLowerCase();
    const rate = rateAtPosition(logPosition(log));
    // A rate at or above 100% would make the gross-up below divide by zero or go negative, and a
    // non-finite one would poison every figure derived from it. Throw rather than skip the token:
    // silently dropping it would omit all of its fees and revenue with nothing to signal the loss.
    if (!Number.isFinite(rate) || rate < 0 || rate >= BASIS_POINTS)
      throw new Error(
        `token-select: reconstructed serviceChargeRate ${rate} bps is out of range for ${token}`
      );
    rateByToken[token] = rate;
  }

  // Fees pulled from the pools during the period, one set of logs per launched token.
  const feeLogs = await options.getLogs({
    targets: tokens,
    eventAbi: FEES_COLLECTED,
    flatten: false,
  });

  feeLogs.forEach((logs: any[], i: number) => {
    const token = tokens[i].toLowerCase();
    const rate = rateByToken[token];
    // Every launch got a rate above or the loop threw, so this cannot normally happen. Throw
    // rather than return: skipping here would drop the token's fees with nothing to signal it.
    if (rate === undefined)
      throw new Error(`token-select: no serviceChargeRate resolved for ${token}`);

    // The event carries the net; gross is what the pool actually charged.
    const grossMultiplier = BASIS_POINTS / (BASIS_POINTS - rate);
    const protocolShare = rate / BASIS_POINTS;

    for (const entry of logs ?? []) {
      const netEth = Number(entry.ethAmount);
      const netToken = Number(entry.tokenAmount);
      if (!netEth && !netToken) continue;

      const grossEth = netEth * grossMultiplier;
      const grossToken = netToken * grossMultiplier;

      dailyFees.add(ADDRESSES.null, grossEth, SWAP_FEES);
      dailyFees.add(token, grossToken, SWAP_FEES);

      dailyRevenue.add(ADDRESSES.null, grossEth * protocolShare, SWAP_FEES_PROTOCOL);
      dailyRevenue.add(token, grossToken * protocolShare, SWAP_FEES_PROTOCOL);

      dailySupplySideRevenue.add(ADDRESSES.null, netEth, SWAP_FEES_SUPPLY);
      dailySupplySideRevenue.add(token, netToken, SWAP_FEES_SUPPLY);
    }
  });

  // One-off platform charges: a flat deployment fee per launch, and a migration fee on graduation.
  const launchesToday = await options.getLogs({
    target: FACTORY,
    eventAbi: NEW_TOKEN,
  });
  for (const log of launchesToday) {
    dailyFees.add(ADDRESSES.null, log.deploymentFee, DEPLOY_FEES);
    dailyRevenue.add(ADDRESSES.null, log.deploymentFee, DEPLOY_FEES);
  }

  const migrationsToday = await options.getLogs({
    targets: tokens,
    eventAbi: MIGRATION,
    flatten: true,
  });
  for (const log of migrationsToday) {
    dailyFees.add(ADDRESSES.null, log.migrationFeeTransferred, MIGRATION_FEES);
    dailyRevenue.add(ADDRESSES.null, log.migrationFeeTransferred, MIGRATION_FEES);
  }

  // Fees harvested from the token/$SELECT side pools. Unlike the token/WETH pool, these are not
  // split: collectSelectPoolFees transfers amount0 and amount1 in full to the treasury
  // ("all fees go to treasury" in TokenSelectFactory), so every unit is protocol revenue and none
  // of it reaches creators or contributors. Amounts are passed through untouched — no service
  // charge to reconstruct, so no floating-point arithmetic here.
  const selectPoolFees = await options.getLogs({
    target: FACTORY,
    eventAbi: SELECT_POOL_FEES,
  });
  for (const log of selectPoolFees) {
    const token = log.tokenAddress.toLowerCase();
    const [token0, token1] =
      token < SELECT_TOKEN.toLowerCase()
        ? [token, SELECT_TOKEN.toLowerCase()]
        : [SELECT_TOKEN.toLowerCase(), token];

    dailyFees.add(token0, log.amount0, SELECT_POOL_SWAP_FEES);
    dailyFees.add(token1, log.amount1, SELECT_POOL_SWAP_FEES);
    dailyRevenue.add(token0, log.amount0, SELECT_POOL_SWAP_FEES);
    dailyRevenue.add(token1, log.amount1, SELECT_POOL_SWAP_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees:
    "Gross 1% Uniswap V3 trading fees on every token launched through token.select, plus a flat ETH deployment fee per launch and a migration fee charged when a launch graduates to a live pool.",
  Revenue:
    "The platform's share of token/WETH pool trading fees (serviceChargeRate on each token, currently 20%), the whole of every token/$SELECT pool fee harvest, which the factory transfers in full to the treasury, plus all deployment and migration fees.",
  ProtocolRevenue:
    "The platform's share of token/WETH pool trading fees, the whole of every token/$SELECT pool fee harvest, plus all deployment and migration fees. token.select has no token buyback.",
  SupplySideRevenue:
    "Token/WETH pool trading fees paid out to the token's creator, its referrer where one is attached, and the contributors who funded the launch. Token/$SELECT pool fees are excluded: they accrue entirely to the treasury.",
};

const breakdownMethodology = {
  Fees: {
    [SWAP_FEES]: "Gross 1% trading fees on the token/WETH pool every launch creates.",
    [SELECT_POOL_SWAP_FEES]: "1% trading fees harvested from the token/$SELECT pool every launch creates.",
    [DEPLOY_FEES]: "Flat ETH fee charged when a token is deployed.",
    [MIGRATION_FEES]: "Fixed ETH fee plus a percentage of contributed ETH, charged on graduation.",
  },
  Revenue: {
    [SWAP_FEES_PROTOCOL]: "Platform share of token/WETH pool trading fees, read per token from serviceChargeRate.",
    [SELECT_POOL_SWAP_FEES]: "Token/$SELECT pool fees in full — collectSelectPoolFees transfers both amounts to the treasury, with no creator, referrer or contributor split.",
    [DEPLOY_FEES]: "Flat ETH fee charged when a token is deployed.",
    [MIGRATION_FEES]: "Fixed ETH fee plus a percentage of contributed ETH, charged on graduation.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_SUPPLY]: "Token/WETH pool trading fees routed to creators, referrers and launch contributors.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-04",
  methodology,
  breakdownMethodology,
  doublecounted: true, // pools are Uniswap V3
};

export default adapter;
