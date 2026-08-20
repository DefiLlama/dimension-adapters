// token.select — DefiLlama FEES adapter (dimension-adapters/fees/token-select/index.ts)
//
// A fair-launch launchpad on Robinhood Chain. Every launch deploys its own token contract from
// one factory, migrates into a Uniswap V3 1% pool, and routes that pool's trading fees back
// through the token contract, which splits them between the platform, the token's creator, an
// optional referrer, and the people who funded the launch.
//
// Everything below is read from logs rather than lifetime-counter deltas, because Robinhood
// Chain's public RPC serves no archive state — a historical eth_call at the period-start block
// fails. The only eth_calls made are at the latest block, against values fixed at deployment.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// TokenSelectFactory (ERC1967 proxy — stable across implementation upgrades)
// https://robinhoodchain.blockscout.com/address/0xA94AA60e9c7f193BF678608D5837F0FD51794635
const FACTORY = "0xA94AA60e9c7f193BF678608D5837F0FD51794635";
const FROM_BLOCK = 27657019; // first NewTokenSelectToken, 2026-08-04
const BASIS_POINTS = 10_000;

// The platform's cut of gross pool fees, in bps. Set per token at deployment and immutable
// thereafter; every token launched to date reads 2000 (20%), e.g. $GOOD:
// https://robinhoodchain.blockscout.com/address/0x5f62C57e5C537887117EeF828b7E3Ad41C009FEb?tab=read_contract
// Used as the fallback when the on-chain read is unavailable — see the note in fetch().
const DEFAULT_SERVICE_CHARGE_RATE = 2000;

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
const SELECT_TOKEN = "0xFc39e99e78524d7c891669F70d5aa92aB1041eb6";

const SWAP_FEES = "Trading Fees";
const SWAP_FEES_PROTOCOL = "Trading Fees to Protocol";
const SWAP_FEES_SUPPLY = "Trading Fees to Contributors and Creators";
const DEPLOY_FEES = "Token Deployment Fees";
const MIGRATION_FEES = "Migration Fees";

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Every token ever launched. Cached in cloud because this walks from the factory's first block.
  const allLaunches = await options.getLogs({
    target: FACTORY,
    eventAbi: NEW_TOKEN,
    fromBlock: FROM_BLOCK,
    cacheInCloud: true,
  });
  const tokens = allLaunches.map((log: any) => log.tokenAddress);
  if (!tokens.length) return { dailyFees, dailyRevenue, dailySupplySideRevenue };

  // serviceChargeRate is the platform's share of gross pool fees, in bps. options.api is pinned
  // to the period's end block, and Robinhood Chain's public RPC serves no archive state, so this
  // read fails for any historical period ("metadata is not found") and permitFailure yields null.
  // The value is fixed per token at deployment, so fall back to the deployed rate rather than
  // letting a failed read book the platform's cut as 0%.
  const serviceChargeRates = await options.api.multiCall({
    calls: tokens,
    abi: "uint256:serviceChargeRate",
    permitFailure: true,
  });
  const rateByToken: Record<string, number> = {};
  tokens.forEach((token: string, i: number) => {
    const rate = Number(serviceChargeRates[i]);
    if (Number.isFinite(rate) && rate > 0 && rate < BASIS_POINTS) {
      rateByToken[token.toLowerCase()] = rate;
    } else {
      rateByToken[token.toLowerCase()] = DEFAULT_SERVICE_CHARGE_RATE;
    }
  });

  // Fees pulled from the pools during the period, one set of logs per launched token.
  const feeLogs = await options.getLogs({
    targets: tokens,
    eventAbi: FEES_COLLECTED,
    flatten: false,
  });

  feeLogs.forEach((logs: any[], i: number) => {
    const token = tokens[i].toLowerCase();
    const rate = rateByToken[token];
    if (rate === undefined) return;

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

  // Fees harvested from the token/$SELECT side pools.
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
    const rate = rateByToken[token];
    if (rate === undefined) continue;
    const protocolShare = rate / BASIS_POINTS;

    dailyFees.add(token0, log.amount0, SWAP_FEES);
    dailyFees.add(token1, log.amount1, SWAP_FEES);
    dailyRevenue.add(token0, Number(log.amount0) * protocolShare, SWAP_FEES_PROTOCOL);
    dailyRevenue.add(token1, Number(log.amount1) * protocolShare, SWAP_FEES_PROTOCOL);
    dailySupplySideRevenue.add(token0, Number(log.amount0) * (1 - protocolShare), SWAP_FEES_SUPPLY);
    dailySupplySideRevenue.add(token1, Number(log.amount1) * (1 - protocolShare), SWAP_FEES_SUPPLY);
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
    "The platform's share of pool trading fees (serviceChargeRate on each token, currently 20%), plus all deployment and migration fees.",
  ProtocolRevenue:
    "The platform's share of pool trading fees, plus all deployment and migration fees. token.select has no token buyback.",
  SupplySideRevenue:
    "Pool trading fees paid out to the token's creator, its referrer where one is attached, and the contributors who funded the launch.",
};

const breakdownMethodology = {
  Fees: {
    [SWAP_FEES]: "Gross 1% trading fees on both pools every launch creates — the token/WETH pool and the token/$SELECT pool.",
    [DEPLOY_FEES]: "Flat ETH fee charged when a token is deployed.",
    [MIGRATION_FEES]: "Fixed ETH fee plus a percentage of contributed ETH, charged on graduation.",
  },
  Revenue: {
    [SWAP_FEES_PROTOCOL]: "Platform share of pool trading fees, read per token from serviceChargeRate.",
    [DEPLOY_FEES]: "Flat ETH fee charged when a token is deployed.",
    [MIGRATION_FEES]: "Fixed ETH fee plus a percentage of contributed ETH, charged on graduation.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_SUPPLY]: "Trading fees routed to creators, referrers and launch contributors.",
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
