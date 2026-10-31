import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { LifiDiamonds } from "../../helpers/aggregators/lifi";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { isCoreAsset } from "../../helpers/prices";
import { fetchRelayTotals, RelayTotals } from "./relay";
import { fetchSolanaSwaps, SOLANA_START } from "./solana";

// Scrooge (https://scrooge.exchange): swap aggregator on Robinhood Chain. It compares KyberSwap, Nordstern,
// SushiSwap, Uniswap and other venues and settles the chosen route through its own router, ScroogeRouter, which
// takes Scrooge's fee from the output and emits one event per swap: Swapped for a route through one venue,
// SwappedMany for a route split across several. Scrooge's other contracts (the swap widget's partner contract,
// multi-token sells and buys, recurring buys) all settle through the same router, so its events count each of
// their swaps once. Swaps the site sends straight to a venue's own router (0x, Uniswap) are not counted.
// Swaps Scrooge takes through LI.FI, on Robinhood Chain or on another chain (buying a coin on Ethereum, Base,
// Arbitrum or BNB Chain), are sent under the integrator string "scrooge" and counted from LI.FI's
// LiFiGenericSwapCompleted logs, as in aggregators/hyperdex; Scrooge takes no fee on them. Swaps on BNB Chain or Base
// that Scrooge takes through Relay are read from Relay's requests API by Scrooge's Relay app id, with Scrooge's app fee
// (./relay.ts). Swaps on Solana, built on Jupiter with Scrooge's fee paid in the same transaction, are read from Dune
// (./solana.ts), so the adapter runs a day at a time. Cross-chain routes are in bridge-aggregators/scrooge.
// Verified source: https://repo.sourcify.dev/4663/0x7668b4F9E949E392DC3A1B562bf03086Fd35bb82
const ROUTER = "0x7668b4F9E949E392DC3A1B562bf03086Fd35bb82";
// Sites embedding the swap widget can charge their own fee (at most 1%), which ScroogePartner takes from what the
// router pays it and sends to the site. Deployed 2026-10-17.
// Verified source: https://repo.sourcify.dev/4663/0x405AE06D4204A94D341597B513116A43D10b0712
const PARTNER = "0x405AE06D4204A94D341597B513116A43D10b0712";
// $SCROOGE, Scrooge's token: CoinGecko's "scrooge-2" lists this contract on Robinhood Chain
// (https://www.coingecko.com/en/coins/scrooge-2), and decimals() returns 18. Its address is not priced by the coins
// API, so it is valued through its CoinGecko id.
const SCROOGE = "0x4da3916d3ae6feece32ec8a2c4856d4abeb41bfd";
const SCROOGE_CG = "scrooge-2";
const SCROOGE_DECIMALS = 1e18;
// The router pays its fee to Scrooge's fee wallet (FEE_WALLET in ./relay.ts), which swaps what it holds into SCROOGE
// every 15 minutes and sends it to 0x…dEaD, keeping a little ETH for its own gas: the router's fees are holders revenue,
// counted when charged. The burns themselves are not read, as the same wallet also burns Scrooge's launchpad fees,
// which are not swap fees. Relay's app fees accrue to that wallet as USDC on Base until claimed, and Solana's fees stay
// in Scrooge's Solana fee wallet: neither is burned, so both are protocol revenue.

const SwappedEvent = "event Swapped(address indexed sender, address indexed recipient, address indexed target, address tokenIn, address tokenOut, uint256 amountIn, uint256 received, uint256 fee)";
const SwappedManyEvent = "event SwappedMany(address indexed sender, address indexed recipient, address tokenIn, address tokenOut, uint256 amountIn, uint256 received, uint256 fee, uint256 legs)";
const PartnerSwappedEvent = "event PartnerSwapped(address indexed sender, address indexed partner, address indexed recipient, address tokenIn, address tokenOut, uint256 amountIn, uint256 received, uint256 partnerFee)";
const LifiSwapEvent = "event LiFiGenericSwapCompleted(bytes32 indexed transactionId, string integrator, string referrer, address receiver, address fromAssetId, address toAssetId, uint256 fromAmount, uint256 toAmount)";
const LIFI_INTEGRATOR = "scrooge";

const SWAP_FEES = "Swap Fees";
const SWAP_FEES_TO_PROTOCOL = "Swap Fees To Scrooge";
const PARTNER_FEES = "Partner Fees";
const PARTNER_FEES_TO_SITES = "Partner Fees To Integrating Sites";

// Native ETH is address(0) on both sides of the router's events. A side is valued by preference where it is ETH or a
// core asset, then where it is SCROOGE (paying with SCROOGE for a new token, or selling one for SCROOGE).
const NATIVE = ADDRESSES.null;
const rank = (token: string) => {
  const t = token.toLowerCase();
  if (t === NATIVE || isCoreAsset(CHAIN.ROBINHOOD, t)) return 2;
  return t === SCROOGE ? 1 : 0;
};
const addToken = (balances: any, token: string, amount: bigint, label?: string) => {
  if (token.toLowerCase() === SCROOGE) balances.addCGToken(SCROOGE_CG, Number(amount) / SCROOGE_DECIMALS, label);
  else balances.add(token, amount, label);
};

// Same-chain swaps through LI.FI under Scrooge's integrator string, counted once on the side that is the native coin
// or a core asset: most are new coins bought or sold for ETH or a stablecoin, whose own side is not priced. Where
// both sides are, the output is preferred when the input is the native coin, as native-in facets emit a
// caller-declared fromAmount (see aggregators/hyperdex). A day's logs are read 10,000 blocks per eth_getLogs, as
// bridge-aggregators/lifi does: a day is over 800,000 blocks on Robinhood Chain and ~350,000 on Arbitrum, past the range
// RPCs serve in one call where the logs indexer does not cover the chain.
const addLifiSwaps = async (options: FetchOptions, dailyVolume: any) => {
  const logs = await options.getLogs({ target: LifiDiamonds[options.chain].id, eventAbi: LifiSwapEvent, maxBlockRange: 10000 });
  const core = (token: string) => token.toLowerCase() === NATIVE || isCoreAsset(options.chain, token);
  for (const log of logs) {
    if (log.integrator !== LIFI_INTEGRATOR) continue;
    const nativeIn = log.fromAssetId.toLowerCase() === NATIVE;
    if (core(log.toAssetId) && (nativeIn || !core(log.fromAssetId))) dailyVolume.add(log.toAssetId, log.toAmount);
    else dailyVolume.add(log.fromAssetId, log.fromAmount);
  }
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const result = () => ({ dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyHoldersRevenue });

  if (options.chain === CHAIN.SOLANA) {
    const { volumeUsd, feeLamports } = await fetchSolanaSwaps(options);
    dailyVolume.addUSDValue(volumeUsd);
    dailyFees.add(ADDRESSES.solana.SOL, feeLamports, SWAP_FEES);
    dailyRevenue.add(ADDRESSES.solana.SOL, feeLamports, SWAP_FEES_TO_PROTOCOL);
    dailyProtocolRevenue.add(ADDRESSES.solana.SOL, feeLamports, SWAP_FEES_TO_PROTOCOL);
    return result();
  }

  await addLifiSwaps(options, dailyVolume);
  const relay: RelayTotals = options.preFetchedResults;
  const relayFees = relay.sameChainFees[options.chain] ?? 0;
  dailyVolume.addUSDValue(relay.sameChain[options.chain] ?? 0);
  dailyFees.addUSDValue(relayFees, SWAP_FEES);
  dailyRevenue.addUSDValue(relayFees, SWAP_FEES_TO_PROTOCOL);
  dailyProtocolRevenue.addUSDValue(relayFees, SWAP_FEES_TO_PROTOCOL);
  if (options.chain !== CHAIN.ROBINHOOD) return result();

  const [single, split, partner] = await Promise.all([
    options.getLogs({ target: ROUTER, eventAbi: SwappedEvent }),
    options.getLogs({ target: ROUTER, eventAbi: SwappedManyEvent }),
    options.getLogs({ target: PARTNER, eventAbi: PartnerSwappedEvent }),
  ]);

  // A fee is taken from the output: counted in the output token where it is valued at least as well as the input,
  // otherwise as the same share of the input, so a fee taken in a new token bought with ETH or USDG is still valued.
  const addFee = (balances: any, log: any, fee: bigint, label: string) => {
    if (fee === 0n) return;
    const received = BigInt(log.received);
    if (rank(log.tokenOut) >= rank(log.tokenIn) || received === 0n) addToken(balances, log.tokenOut, fee, label);
    else addToken(balances, log.tokenIn, (BigInt(log.amountIn) * fee) / received, label);
  };

  for (const log of [...single, ...split]) {
    // One side of each swap, the better valued: the input, unless only the output is valued, then the output before the fee.
    if (rank(log.tokenIn) >= rank(log.tokenOut)) addToken(dailyVolume, log.tokenIn, BigInt(log.amountIn));
    else addToken(dailyVolume, log.tokenOut, BigInt(log.received));
    const fee = BigInt(log.fee);
    addFee(dailyFees, log, fee, SWAP_FEES);
    addFee(dailyRevenue, log, fee, METRIC.TOKEN_BUY_BACK);
    addFee(dailyHoldersRevenue, log, fee, METRIC.TOKEN_BUY_BACK);
  }

  // The partner contract's swaps are counted in volume through the router's events above; only its fee is read here.
  for (const log of partner) {
    const fee = BigInt(log.partnerFee);
    addFee(dailyFees, log, fee, PARTNER_FEES);
    addFee(dailySupplySideRevenue, log, fee, PARTNER_FEES_TO_SITES);
  }

  return result();
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: fetchRelayTotals as any,
  adapter: {
    [CHAIN.ROBINHOOD]: { start: "2026-09-22" },
    // The first swap under Scrooge's LI.FI integrator string, 2026-10-12.
    [CHAIN.ETHEREUM]: { start: "2026-10-12" },
    [CHAIN.BASE]: { start: "2026-10-12" },
    [CHAIN.ARBITRUM]: { start: "2026-10-12" },
    [CHAIN.BSC]: { start: "2026-10-12" },
    [CHAIN.SOLANA]: { start: SOLANA_START },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Every swap settled through ScroogeRouter (Swapped and SwappedMany events), counted once at its input amount when the input is ETH or a core asset, otherwise at its output before Scrooge's fee; a swap between a new token and SCROOGE is valued on its SCROOGE side. A route split across venues counts once at its total. Swaps the site sends straight to a venue's own router are not counted. Swaps through LI.FI under the integrator \"scrooge\", on Robinhood Chain and other chains, from LiFiGenericSwapCompleted logs; swaps on one chain through Relay under Scrooge's Relay app id, at the USD value Relay reports sent. On Solana, every successful Jupiter v6 transaction that paid Scrooge's fee wallet (SOL, or Jupiter's platform fee in wrapped SOL to its token account), valued once from Jupiter's swap events as aggregators/jupiter-aggregator does.",
    Fees: "Scrooge's fee, taken by ScroogeRouter from each swap's output (the fee field of Swapped and SwappedMany), plus the fee a site embedding Scrooge's swap widget charges on top through ScroogePartner (at most 1%). On swaps through Relay, Scrooge's app fee as Relay reports it paid to Scrooge's fee wallet. On Solana, the SOL the swap paid Scrooge's fee wallet or its wrapped-SOL account. Fees of the underlying venues and pools are not included. Scrooge takes no fee on swaps through LI.FI.",
    Revenue: "Scrooge's fee on each swap: taken by ScroogeRouter on Robinhood Chain, paid as Relay's app fee on swaps through Relay, and paid in SOL to Scrooge's Solana fee wallet on Solana. The fee a partner site adds goes to that site and is not included.",
    ProtocolRevenue: "Scrooge's fee on swaps through Relay, paid as Relay's app fee, and on Solana, paid in SOL to Scrooge's Solana fee wallet: kept by Scrooge, not burned.",
    SupplySideRevenue: "The fee a partner site charges in Scrooge's swap widget, paid to that site.",
    HoldersRevenue: "Scrooge's fee on swaps through ScroogeRouter on Robinhood Chain, which the fee wallet swaps into SCROOGE every 15 minutes and burns, counted when the fee is charged. Burns funded by Scrooge's launchpad fees, which reach the same wallet, are not included.",
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEES]: "Scrooge's fee on each swap, taken from the output by ScroogeRouter, paid through Relay as an app fee, or paid in SOL on Solana.",
      [PARTNER_FEES]: "The fee a site embedding Scrooge's swap widget adds on top, taken from the output by ScroogePartner.",
    },
    Revenue: {
      [SWAP_FEES_TO_PROTOCOL]: "Scrooge's swap fee on swaps through Relay and on Solana, kept by Scrooge.",
      [METRIC.TOKEN_BUY_BACK]: "Scrooge's swap fee on ScroogeRouter swaps, spent buying SCROOGE to burn.",
    },
    ProtocolRevenue: {
      [SWAP_FEES_TO_PROTOCOL]: "Scrooge's swap fee on swaps through Relay and on Solana, kept by Scrooge.",
    },
    SupplySideRevenue: {
      [PARTNER_FEES_TO_SITES]: "Partner fees, paid to the sites that embed Scrooge's swap widget.",
    },
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "Scrooge's swap fee on ScroogeRouter swaps, which the fee wallet swaps into SCROOGE and burns (sends to 0x…dEaD).",
    },
  },
};

export default adapter;
