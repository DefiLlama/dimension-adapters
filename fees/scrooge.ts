import ADDRESSES from "../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { fetchRelayTotals, RelayTotals } from "../aggregators/scrooge/relay";
import { addToken, rank, ROUTER, SwappedEvent, SwappedManyEvent } from "../aggregators/scrooge/router";
import { fetchSolanaFeeLamports, SOLANA_START } from "../aggregators/scrooge/solana";
import { CHAIN } from "../helpers/chains";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";
import { METRIC } from "../helpers/metrics";

// Scrooge (https://scrooge.exchange): swap aggregator on Robinhood Chain; its volume is in aggregators/scrooge, which
// holds the sources shared with this adapter. Scrooge's fee is charged three ways:
// - On Robinhood Chain, ScroogeRouter (aggregators/scrooge/router.ts) takes it from each swap's output and reports it in
//   the fee field of its Swapped and SwappedMany events.
// - On swaps on one chain that Scrooge takes through Relay, as Relay's app fee, read from Relay's requests API by the
//   referrer Scrooge's site sends, and before it sent one listed (aggregators/scrooge/relay.ts, relayHistory.ts).
//   Scrooge takes no fee on swaps through LI.FI, its other route on Ethereum, Base, Arbitrum and BNB Chain, so Relay's
//   app fee is its only fee there.
// - On Solana, paid in SOL to Scrooge's Solana fee wallet in the same transaction as the Jupiter swap, read from Dune
//   (aggregators/scrooge/solana.ts), so the adapter runs a day at a time.
// Sites embedding the swap widget can charge their own fee (at most 1%), which ScroogePartner takes from what the
// router pays it and sends to the site. Deployed 2026-10-17.
// Verified source: https://repo.sourcify.dev/4663/0x405AE06D4204A94D341597B513116A43D10b0712
const PARTNER = "0x405AE06D4204A94D341597B513116A43D10b0712";
const PartnerSwappedEvent = "event PartnerSwapped(address indexed sender, address indexed partner, address indexed recipient, address tokenIn, address tokenOut, uint256 amountIn, uint256 received, uint256 partnerFee)";
// The router pays its fee to Scrooge's fee wallet (FEE_WALLET in aggregators/scrooge/relay.ts), which swaps what it holds
// into SCROOGE every 15 minutes and sends it to 0x…dEaD, keeping a little ETH for its own gas: the router's fees are
// holders revenue, counted when charged. The burns themselves are not read, as the same wallet also burns Scrooge's
// launchpad fees, which are not swap fees. Relay's app fees accrue to that wallet as USDC on Base until claimed, and
// Solana's fees stay in Scrooge's Solana fee wallet: neither is burned, so both are protocol revenue.

const SWAP_FEES = "Swap Fees";
const SWAP_FEES_TO_PROTOCOL = "Swap Fees To Scrooge";
const PARTNER_FEES = "Partner Fees";
const PARTNER_FEES_TO_SITES = "Partner Fees To Integrating Sites";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const result = () => ({ dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue, dailyHoldersRevenue });

  if (options.chain === CHAIN.SOLANA) {
    const feeLamports = await fetchSolanaFeeLamports(options);
    dailyFees.add(ADDRESSES.solana.SOL, feeLamports, SWAP_FEES);
    dailyRevenue.add(ADDRESSES.solana.SOL, feeLamports, SWAP_FEES_TO_PROTOCOL);
    dailyProtocolRevenue.add(ADDRESSES.solana.SOL, feeLamports, SWAP_FEES_TO_PROTOCOL);
    return result();
  }

  const relay: RelayTotals = options.preFetchedResults;
  const relayFees = relay.sameChainFees[options.chain] ?? 0;
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
    const fee = BigInt(log.fee);
    addFee(dailyFees, log, fee, SWAP_FEES);
    addFee(dailyRevenue, log, fee, METRIC.TOKEN_BUY_BACK);
    addFee(dailyHoldersRevenue, log, fee, METRIC.TOKEN_BUY_BACK);
  }

  for (const log of partner) {
    const fee = BigInt(log.partnerFee);
    addFee(dailyFees, log, fee, PARTNER_FEES);
    addFee(dailySupplySideRevenue, log, fee, PARTNER_FEES_TO_SITES);
  }

  return result();
};

// runAdapter drops every chain's record when one chain throws, so Dune's Solana indexing delay is checked once, before
// any chain runs, rather than in the Solana leg after the other chains have done their work.
const prefetch = async (options: FetchOptions): Promise<RelayTotals> => {
  assertDuneSolanaIndexed(options);
  return fetchRelayTotals(options);
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: prefetch as any,
  adapter: {
    [CHAIN.ROBINHOOD]: { start: "2026-09-22" },
    // Relay's app fee is Scrooge's only fee on these chains. Every Relay request Scrooge made is counted, the first on
    // 2026-10-14, so these chains start with Scrooge's volume there, from its first LI.FI swap on 2026-10-12.
    [CHAIN.ETHEREUM]: { start: "2026-10-12" },
    [CHAIN.BASE]: { start: "2026-10-12" },
    [CHAIN.ARBITRUM]: { start: "2026-10-12" },
    [CHAIN.BSC]: { start: "2026-10-12" },
    [CHAIN.SOLANA]: { start: SOLANA_START },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Scrooge's fee, taken by ScroogeRouter from each swap's output (the fee field of Swapped and SwappedMany), plus the fee a site embedding Scrooge's swap widget charges on top through ScroogePartner (at most 1%). On swaps through Relay, Scrooge's app fee as Relay reports it paid to Scrooge's fee wallet: on swaps under Scrooge's referrer \"scrooge.exchange\" since 2026-10-29, and before then, when Scrooge's swaps carried no referrer, on the ones Relay filled for Scrooge's app, listed by id. On Solana, the SOL the swap paid Scrooge's fee wallet or its wrapped-SOL account. Fees of the underlying venues and pools are not included. Scrooge takes no fee on swaps through LI.FI.",
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
