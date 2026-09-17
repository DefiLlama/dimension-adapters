import ADDRESSES from "../../helpers/coreAssets.json";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// heks is a coin launchpad on Robinhood Chain. A launch opens a Uniswap v4 pool with a single-sided
// position and a hook; trading happens in that pool, and the hook skims the protocol's fee.
//
// Two deployments have been live. Coin creation moved to the current one on 2026-09-15, but the
// retired one's pools still trade and still charge, so both are read here.
//
// Every address below is the vault that custodies a deployment's positions and books its fees.
// https://robinhoodchain.blockscout.com/address/0x89c0983D9B01F6CAe4FEcbb6b5D6296b44536400
const VAULTS = [
  "0x89c0983d9b01f6cae4fecbb6b5d6296b44536400", // current
  "0x3025685be0c6fa2ce7ec3ed6cdbdaf2e6309638f", // retired for new coins on 2026-09-15, still trading
];

// The launchpads that mint coins and charge the flat creation fee.
// https://robinhoodchain.blockscout.com/address/0x62cA64f87E051a2E190d17caA98E4a08f4a597dc
const LAUNCHPADS = [
  "0x62ca64f87e051a2e190d17caa98e4a08f4a597dc", // current
  "0x0647b0f4bfdec1f64ffad55edcf24504269058de", // retired for new coins on 2026-09-15
];

// One event per fee credit, emitted by the vault. It carries the gross amount and the split in the
// same log, so the income statement is read rather than reconstructed from a rate: `amount` is
// always `creatorShare + protocolShare`, including the remainder the contract carries between
// credits to keep the split exact.
//
// `currency` is the pool's pair asset, never the launched coin: the hook always charges in the pair
// asset, and the pools' own Uniswap LP fee is zero. Deployments differ in which asset that is —
// the current one quotes in native ETH, the retired one in WETH — so the currency is taken from the
// log rather than assumed.
const COLLECTED =
  "event Collected(bytes32 indexed id, address indexed currency, uint256 amount, uint256 creatorShare, uint256 protocolShare, uint256 carryAfter)";

// The launch event carries the creation fee the creator paid, so no extra call is needed to price
// it. The fee is charged in msg.value, i.e. in native ETH on every lane.
const TOKEN_CREATED =
  "event TokenCreated(address indexed token, address indexed creator, address indexed numeraire, bytes32 poolId, int24 derivedTick, uint160 sqrtPriceX96, int24 tickLower, int24 tickUpper, int256 feedAnswer, uint256 feedUpdatedAt, uint256 launchFee, uint256 devBuyIn, uint256 devBuyOut, uint256 xKey, uint256 uiMultiplier, string metaURI)";

// Uniswap v4 represents native ETH as the zero address.
const NATIVE = ADDRESSES.null;

// Labels used in the breakdowns; every one has a breakdownMethodology entry.
const SWAP_FEES_TO_PROTOCOL = "Swap Fees To Protocol";
const LAUNCH_FEES = "Launch Fees";

// The current deployment quotes in native ETH, the retired one in WETH, and the stock lanes in the
// tokenised share itself, so a credit can arrive in any of them.
const credit = (balances: any, currency: string, amount: any, label: string) =>
  String(currency).toLowerCase() === NATIVE
    ? balances.addGasToken(amount, label)
    : balances.add(currency, amount, label);

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [collected, launches] = await Promise.all([
    options.getLogs({ targets: VAULTS, eventAbi: COLLECTED, flatten: true }),
    options.getLogs({ targets: LAUNCHPADS, eventAbi: TOKEN_CREATED, flatten: true }),
  ]);

  // Trading fee: 1% of each swap in steady state. For the first ten seconds of a pool's life the
  // rate decays linearly from 80% down to that 1%, which prices out snipers of the opening block;
  // the log carries the resulting amount, so no rate is assumed here.
  collected.forEach((log: any) => {
    credit(dailyFees, log.currency, log.amount, METRIC.SWAP_FEES);
    // The creator's slice. A creator may redirect it to the holders of their own coin at launch;
    // either way it leaves the protocol, so it is supply side rather than holders revenue — heks
    // has no token of its own.
    credit(dailySupplySideRevenue, log.currency, log.creatorShare, METRIC.CREATOR_FEES);
    credit(dailyRevenue, log.currency, log.protocolShare, SWAP_FEES_TO_PROTOCOL);
    credit(dailyProtocolRevenue, log.currency, log.protocolShare, SWAP_FEES_TO_PROTOCOL);
  });

  // Creation fee: a flat charge per launch, paid by the creator and kept in full by the protocol.
  launches.forEach((log: any) => {
    dailyFees.addGasToken(log.launchFee, LAUNCH_FEES);
    dailyRevenue.addGasToken(log.launchFee, LAUNCH_FEES);
    dailyProtocolRevenue.addGasToken(log.launchFee, LAUNCH_FEES);
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Fees paid by users on heks: a 1% fee on every swap in a launched coin's pool, plus the flat fee a creator pays to launch one. The swap fee is charged in the pool's pair asset and is read from the vault's own Collected events, which carry the gross amount and its split in the same log.",
  UserFees: "Both fees are paid by users: the swap fee by traders, the launch fee by the creator.",
  Revenue: "The protocol's 30% share of every swap fee, plus the launch fee in full.",
  ProtocolRevenue: "The protocol's 30% share of every swap fee, plus the launch fee in full. There is no heks token, so none of this is distributed to holders.",
  SupplySideRevenue: "The 70% of every swap fee that goes to the coin's creator. A creator can redirect that share to the holders of their own coin at launch; it leaves the protocol either way.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "1% of each swap, charged in the pool's pair asset. For the first ten seconds after a launch the rate decays linearly from 80% to 1%, which prices out snipers of the opening block.",
    [LAUNCH_FEES]: "Flat fee in native ETH paid by the creator when a coin is launched.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The protocol's 30% share of each swap fee.",
    [LAUNCH_FEES]: "Flat launch fee, kept in full by the protocol.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The protocol's 30% share of each swap fee.",
    [LAUNCH_FEES]: "Flat launch fee, kept in full by the protocol.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "The 70% of each swap fee paid out to the coin's creator, or to the holders of their coin if the creator chose that at launch.",
  },
};

const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-09-10", // first launch
  // Not double counted against uniswap-v4 on this chain: the hook takes its cut as a hook delta,
  // outside the swap's amount0/amount1, and these pools' own LP fee is zero (they are created with
  // the dynamic-fee flag and it is never set, so the `fee` field of every Swap log is 0). The
  // uniswap-v4 adapter derives fees from that field, so none of the amounts above appear there.
};

export default adapter;
