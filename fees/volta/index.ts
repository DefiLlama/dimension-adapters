import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { dedupeLogs } from "../../helpers/elyspump";

// Volta (https://www.volta.family) is a token launchpad on Elysium built as a Uniswap v4 hook (a Flaunch-derived "PositionManager") on
// the official Uniswap v4 PoolManager (0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1). Each launch puts the coin's whole 1B supply in a
// v4 pool against a pair asset (native HYPE, KNTQ, VOLTA, USDC, ...); the hook owns that liquidity for good and charges a 1-5% swap fee
// fixed by the creator at launch. The pools trade on Uniswap's shared PoolManager with no bonding curve, so only fees are tracked.
// The contracts are not verified on the explorer: addresses are from https://www.volta.family/docs#contracts and event ABIs from the
// published https://www.volta.family/abi/volta.json.
const POSITION_MANAGER = "0x3aB88DDc3CF2A012af88B60828edb4553697E5dC";
const VOLTA = "0x0f79931689af199e7cf868ed1107bba2c83c68f7";
const DEPLOY_BLOCK = 266498;
const NATIVE = ADDRESSES.null;

const PROTOCOL_SHARE_TO_VOLTA_BURN_PCT = 80n;

const POOL_CREATED = "event PoolCreated(bytes32 indexed _poolId, address _memecoin, address _memecoinTreasury, uint256 _tokenId, bool _currencyFlipped, uint256 _flaunchFee, tuple(string name, string symbol, string tokenUri, uint256 premineAmount, address creator, uint24 swapFee, tuple(uint24 creator, uint24 buyback, uint24 holders) creatorSplit, tuple(uint24 startFee, uint32 duration) antiSnipe, uint256 flaunchAt, bytes initialPriceParams, address pairedToken) _params)";
const POOL_FEES_DISTRIBUTED = "event PoolFeesDistributed(bytes32 indexed _poolId, uint256 _amount, uint256 _creatorAmount, uint256 _buybackAmount, uint256 _holdersAmount, uint256 _protocolAmount)";
const REFERRER_FEE_PAID = "event ReferrerFeePaid(bytes32 indexed _poolId, address _recipient, address _token, uint256 _amount)";

const LABEL = {
  swapFees: "Swap Fees",
  toCreators: "Swap Fees To Creators",
  toCoinBuybacks: "Swap Fees To Coin Buyback And Burn",
  toHolderRewards: "Swap Fees To Coin Holder Rewards",
  toVoltaBuyback: "Swap Fees To VOLTA Buyback And Burn",
  toTreasury: "Swap Fees To Treasury",
};

const lower = (a: string) => String(a).toLowerCase();

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const addQuote = (balances: any, quote: string, amount: bigint, label: string) =>
    quote === NATIVE ? balances.addGasToken(amount, label) : balances.add(quote, amount, label);

  const referrerFees = await options.getLogs({ target: POSITION_MANAGER, eventAbi: REFERRER_FEE_PAID });
  if (referrerFees.length) throw new Error(`Volta: ${referrerFees.length} ReferrerFeePaid logs, referrer fees are not tracked`);

  const launches = await options.getLogs({ target: POSITION_MANAGER, eventAbi: POOL_CREATED, fromBlock: DEPLOY_BLOCK, cacheInCloud: true });
  const pools: Record<string, { quote: string, isVolta: boolean }> = {};
  for (const l of launches) pools[lower(l._poolId)] = { quote: lower(l._params.pairedToken), isVolta: lower(l._memecoin) === VOLTA };

  const distributions = dedupeLogs(await options.getLogs({ target: POSITION_MANAGER, eventAbi: POOL_FEES_DISTRIBUTED, onlyArgs: false }));
  for (const log of distributions) {
    const info = pools[lower(log.args._poolId)];
    if (!info) throw new Error(`Volta: pool ${log.args._poolId} has no PoolCreated log`);
    const { quote, isVolta } = info;
    const amount = BigInt(log.args._amount), creator = BigInt(log.args._creatorAmount), buyback = BigInt(log.args._buybackAmount);
    const holders = BigInt(log.args._holdersAmount), protocol = BigInt(log.args._protocolAmount);
    if (creator + buyback + holders + protocol !== amount) throw new Error(`Volta: PoolFeesDistributed parts do not sum in tx ${log.transactionHash}`);
    addQuote(dailyFees, quote, amount, LABEL.swapFees);

    const toVoltaBurn = protocol * PROTOCOL_SHARE_TO_VOLTA_BURN_PCT / 100n;
    addQuote(dailyRevenue, quote, toVoltaBurn, LABEL.toVoltaBuyback);
    addQuote(dailyHoldersRevenue, quote, toVoltaBurn, LABEL.toVoltaBuyback);
    addQuote(dailyRevenue, quote, protocol - toVoltaBurn, LABEL.toTreasury);
    addQuote(dailyProtocolRevenue, quote, protocol - toVoltaBurn, LABEL.toTreasury);

    if (isVolta) {
      if (creator !== 0n || holders !== 0n) throw new Error(`Volta: unexpected creator/holder fees on the VOLTA pool in tx ${log.transactionHash}`);
      addQuote(dailyRevenue, quote, buyback, LABEL.toVoltaBuyback);
      addQuote(dailyHoldersRevenue, quote, buyback, LABEL.toVoltaBuyback);
    } else {
      addQuote(dailySupplySideRevenue, quote, creator, LABEL.toCreators);
      addQuote(dailySupplySideRevenue, quote, buyback, LABEL.toCoinBuybacks);
      addQuote(dailySupplySideRevenue, quote, holders, LABEL.toHolderRewards);
    }
  }

  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
}

const methodology = {
  Fees: "Swap fees of 1-5%, fixed by each coin's creator at launch, paid by traders on every trade in a Volta launch pool. They are counted in the pool's pair asset (HYPE, KNTQ, VOLTA or USDC) when the hook distributes them; fees taken in the launched coin count once the hook has sold them for the pair asset. The optional anti-snipe premium, taken in the launched coin and burned, is not counted, and pools paired with unpriced assets are not valued.",
  UserFees: "Swap fees paid by traders on every trade in a Volta launch pool, counted when the hook distributes them in the pair asset.",
  Revenue: "The protocol's 30% of every swap fee in Volta launch pools, plus the 70% creator share of the VOLTA pool's own fees, which Volta set entirely to VOLTA buyback and burn.",
  ProtocolRevenue: "The 20% of the protocol's 30% share of Volta swap fees that stays in the Volta owner wallet.",
  HoldersRevenue: "VOLTA bought back and burned: 80% of the protocol's 30% share of every Volta swap fee, plus the 70% creator share of the VOLTA pool's own fees.",
  SupplySideRevenue: "The 70% of every swap fee in launched coins' pools that goes to the creator side, split as each creator chose at launch between the creator, buyback and burn of the coin, and pair-asset rewards to the coin's holders.",
};

const protocolBurn = "80% of the protocol's 30% share of every swap fee, used by the Volta owner wallet to buy back and burn VOLTA (VOLTA fees are burned directly)";
const voltaPoolBurn = "the 70% creator share of the VOLTA pool's own fees, spent by the FeeExecutor on VOLTA buyback and burn";
const breakdownMethodology = {
  Fees: {
    [LABEL.swapFees]: "Hook swap fee (1-5%) paid on every launch-pool trade, from the hook's PoolFeesDistributed events in the pair asset.",
  },
  UserFees: {
    [LABEL.swapFees]: "Hook swap fee paid by traders on every launch-pool trade.",
  },
  Revenue: {
    [LABEL.toVoltaBuyback]: `${protocolBurn}, plus ${voltaPoolBurn}.`,
    [LABEL.toTreasury]: "20% of the protocol's 30% share of every swap fee, kept by the Volta owner wallet.",
  },
  ProtocolRevenue: {
    [LABEL.toTreasury]: "20% of the protocol's 30% share of every swap fee, kept by the Volta owner wallet.",
  },
  HoldersRevenue: {
    [LABEL.toVoltaBuyback]: `${protocolBurn}, plus ${voltaPoolBurn}.`,
  },
  SupplySideRevenue: {
    [LABEL.toCreators]: "Part of the 70% creator side paid to the holder of the coin's creator NFT, as set by the creator at launch.",
    [LABEL.toCoinBuybacks]: "Part of the 70% creator side used to buy back and burn the coin, as set by the creator at launch.",
    [LABEL.toHolderRewards]: "Part of the 70% creator side paid in the pair asset to the coin's holders, as set by the creator at launch.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-11-03",
  methodology,
  breakdownMethodology,
};

export default adapter;
