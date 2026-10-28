import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// heks is a coin launchpad on Robinhood Chain. A launch opens a Uniswap v4 pool with a single-sided
// position and a hook; trading happens in that pool, and the hook skims the fee.
//
// Several deployments have been live. New coins are created on the newest one, but the earlier ones'
// pools still trade and still charge, so all of them are read here.
//
// Every address below is the vault that books a deployment's fees.
// https://robinhoodchain.blockscout.com/address/0xAD0a1F3887A5aEB0df22dEbb0B9C54d4a9186148
const VAULTS = [
  "0xad0a1f3887a5aeb0df22debb0b9c54d4a9186148", // V2.3, current since 2026-10-07
  "0xac88b0892fb759caabdcfe52c9b6cd1b915a4e84", // V2.2
  "0xb7ab4c5e3d133cfbe4fcd627728849b8e6f0dbf0", // V2.1
  "0x89c0983d9b01f6cae4fecbb6b5d6296b44536400", // V2
  "0x3025685be0c6fa2ce7ec3ed6cdbdaf2e6309638f", // V1, creation closed on 2026-09-15, still trading
];

// Vaults that also credit a creator tax (V2.2 onwards). Earlier vaults have no such event.
const TAX_VAULTS: string[] = [
  "0xad0a1f3887a5aeb0df22debb0b9c54d4a9186148", // V2.3
  "0xac88b0892fb759caabdcfe52c9b6cd1b915a4e84", // V2.2
];

// The launchpads that mint coins and charge the flat creation fee.
// https://robinhoodchain.blockscout.com/address/0x05281d26889a7225936D124F30CA5bDfF025339B
const LAUNCHPADS = [
  "0x05281d26889a7225936d124f30ca5bdff025339b", // V2.3, current since 2026-10-07
  "0x0f2005a033c6ca153a06ca80c670e856e494c45a", // V2.2
  "0x3aab7d1317565d768b92a07b4417b128f470da68", // V2.1
  "0x62ca64f87e051a2e190d17caa98e4a08f4a597dc", // V2
  "0x0647b0f4bfdec1f64ffad55edcf24504269058de", // V1, creation closed on 2026-09-15
];

// One event per fee credit, emitted by the vault. It carries the gross amount and the split in the
// same log, so the income statement is read rather than reconstructed from a rate: `amount` is
// always `creatorShare + protocolShare`, including the remainder the contract carries between
// credits to keep the split exact.
//
// `currency` is the pool's pair asset, never the launched coin: the hook always charges in the pair
// asset, and the pools' own Uniswap LP fee is zero. Deployments differ in which asset that is —
// the newer ones quote in native ETH, V1 in WETH, and the stock lanes in the tokenised share
// itself — so the currency is taken from the log rather than assumed. Native ETH arrives as the
// zero address, which is the key balances already use for the gas token.
const COLLECTED =
  "event Collected(bytes32 indexed id, address indexed currency, uint256 amount, uint256 creatorShare, uint256 protocolShare, uint256 carryAfter)";

// From V2.2 a creator may add a tax of their own on top of the protocol fee. It is credited whole to the
// creator (or to the coin's holders, if the creator chose that at launch), outside the split above,
// by its own event: `Collected.amount` no longer includes it, and every swap's total fee is
// `Collected.amount + TaxCredited.amount`.
const TAX_CREDITED =
  "event TaxCredited(bytes32 indexed id, address indexed currency, uint256 amount, bool toHolders)";

// The launch event carries the creation fee the creator paid, so no extra call is needed to price
// it. The fee is charged in msg.value, i.e. in native ETH on every lane. V2.2 and V2.3 emit the same event.
const TOKEN_CREATED =
  "event TokenCreated(address indexed token, address indexed creator, address indexed numeraire, bytes32 poolId, int24 derivedTick, uint160 sqrtPriceX96, int24 tickLower, int24 tickUpper, int256 feedAnswer, uint256 feedUpdatedAt, uint256 launchFee, uint256 devBuyIn, uint256 devBuyOut, uint256 xKey, uint256 uiMultiplier, string metaURI)";

// Labels used in the breakdowns; every one has a breakdownMethodology entry.
const SWAP_FEES_TO_PROTOCOL = "Token Swap Fees to Protocol";
const CREATOR_TAX = "Creator Tax";
const LAUNCH_FEES = "Launch Fees";
const LAUNCH_FEES_TO_PROTOCOL = "Launch Fees to Protocol";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [collected, taxes, launches] = await Promise.all([
    options.getLogs({ targets: VAULTS, eventAbi: COLLECTED, flatten: true }),
    TAX_VAULTS.length ? options.getLogs({ targets: TAX_VAULTS, eventAbi: TAX_CREDITED, flatten: true }) : Promise.resolve([]),
    options.getLogs({ targets: LAUNCHPADS, eventAbi: TOKEN_CREATED, flatten: true }),
  ]);

  // Protocol fee on swaps: 1% of each swap in steady state, higher for a pool's first ten seconds
  // to price out snipers of the opening block; the log carries the resulting amount, so no rate is
  // assumed here.
  collected.forEach((log: any) => {
    dailyFees.add(log.currency, log.amount, METRIC.SWAP_FEES);
    // The creator's slice. A creator may redirect it to the holders of their own coin at launch;
    // either way it leaves the protocol, so it is supply side rather than holders revenue — heks
    // has no token of its own.
    dailySupplySideRevenue.add(log.currency, log.creatorShare, METRIC.CREATOR_FEES);
    dailyRevenue.add(log.currency, log.protocolShare, SWAP_FEES_TO_PROTOCOL);
    dailyProtocolRevenue.add(log.currency, log.protocolShare, SWAP_FEES_TO_PROTOCOL);
  });

  // Creator tax (from V2.2): paid by traders, kept in full by the creator or the coin's holders.
  taxes.forEach((log: any) => {
    dailyFees.add(log.currency, log.amount, CREATOR_TAX);
    dailySupplySideRevenue.add(log.currency, log.amount, CREATOR_TAX);
  });

  // Creation fee: a flat charge per launch, paid by the creator and kept in full by the protocol.
  launches.forEach((log: any) => {
    dailyFees.addGasToken(log.launchFee, LAUNCH_FEES);
    dailyRevenue.addGasToken(log.launchFee, LAUNCH_FEES_TO_PROTOCOL);
    dailyProtocolRevenue.addGasToken(log.launchFee, LAUNCH_FEES_TO_PROTOCOL);
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
  Fees: "Fees paid by users on heks: a fee on every swap in a launched coin's pool, plus the flat fee a creator pays to launch one. The swap fee is charged in the pool's pair asset. It is the protocol fee — 1% in steady state, higher in a launch's first ten seconds to price out snipers — plus, on coins launched from V2.2 whose creator set one, a creator tax of up to 10%. Both are read from the vault's own events: Collected carries the protocol fee and its split, TaxCredited the creator tax.",
  UserFees: "All fees are paid by users: the swap fee and the creator tax by traders, the launch fee by the creator.",
  Revenue: "The protocol's 30% share of every swap's protocol fee, plus the launch fee in full. The creator tax is never shared with the protocol.",
  ProtocolRevenue: "The protocol's 30% share of every swap's protocol fee, plus the launch fee in full. There is no heks token, so none of this is distributed to holders.",
  SupplySideRevenue: "The 70% of every swap's protocol fee that goes to the coin's creator, plus the creator tax in full on coins that set one. A creator can redirect both to the holders of their own coin at launch; they leave the protocol either way.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "The protocol fee on each swap, charged in the pool's pair asset: 1% in steady state. For the first ten seconds after a launch it is higher, which prices out snipers of the opening block: up to V2.1 it decays linearly from 80% to 1%; from V2.2 buys pay a surcharge that starts at 99% of the trade and halves down to zero, and the buyer always keeps at least 1%.",
    [CREATOR_TAX]: "From V2.2: a tax of up to 10% a creator may set at launch, paid by traders on top of the protocol fee.",
    [LAUNCH_FEES]: "Flat fee in native ETH paid by the creator when a coin is launched.",
  },
  // dailyUserFees aliases dailyFees: every fee here is paid by users, so the breakdown is the same.
  UserFees: {
    [METRIC.SWAP_FEES]: "The protocol fee on each swap, paid by the trader in the pool's pair asset.",
    [CREATOR_TAX]: "From V2.2: the creator's own tax, paid by the trader in the pool's pair asset.",
    [LAUNCH_FEES]: "Flat fee in native ETH paid by the creator when a coin is launched.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The protocol's 30% share of each swap's protocol fee.",
    [LAUNCH_FEES_TO_PROTOCOL]: "Flat launch fee, kept in full by the protocol.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The protocol's 30% share of each swap's protocol fee.",
    [LAUNCH_FEES_TO_PROTOCOL]: "Flat launch fee, kept in full by the protocol.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "The 70% of each swap's protocol fee paid out to the coin's creator, or to the holders of their coin if the creator chose that at launch.",
    [CREATOR_TAX]: "From V2.2: the creator tax in full, to the creator or to the coin's holders.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-09-10", // first launch
  // Not double counted against uniswap-v4 on this chain: the hook takes its cut as a hook delta,
  // outside the swap's amount0/amount1, and these pools' own LP fee is zero (earlier deployments
  // create them with the dynamic-fee flag and never set it, V2.2 and V2.3 with a static fee of zero), so the
  // `fee` field of every Swap log is 0. The uniswap-v4 adapter derives fees from that field, so none
  // of the amounts above appear there.
};

export default adapter;
