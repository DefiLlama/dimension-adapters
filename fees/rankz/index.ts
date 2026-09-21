import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from "../../helpers/coreAssets.json";

// Rankz (rankz.fun): physical graded-card gacha on Robinhood Chain.
// Users buy crate opens in USDG through the VendingMachine, which splits
// every payment on-chain in the same transaction:
//   - potBps of the crate price  -> PotVault (community jackpot, user-bound)
//   - remainder + network fee    -> Treasury
// Instant-sell buybacks settle through the Orderbook: the Treasury Safe is
// the signer of platform buyback offers, and the Trade event carries the
// payout. Following the Physical TCG category convention (Pull.fun,
// Collector Crypt), Fees/Revenue are net of buyback payouts and can be
// negative on heavy-buyback days; gross crate spend is reported as volume.

const USDG = ADDRESSES.robinhood.USDG;
const TREASURY = "0x5FA3Bc34AC395f6922f6E478Ab7b033B14845eeB";
const POT_VAULT = "0xde4404b82B02578F6459e8BebE9299F3276cc14f";
const VENDING_MACHINE = "0xBabBf19E398Ea52E47CF7Fc9893439b70fbd4357";
const ORDERBOOK = "0x059a6445BCEFBCdD439B035f8Fa12253551bB921";

const LABELS = {
  CRATE_SALES: "Crate Sales",
  POT_CONTRIBUTIONS: "Pot Contributions",
  BUYBACK_PAYOUTS: "Buyback Payouts",
};

const TRADE_EVENT =
  "event Trade(bytes32 indexed orderHash, uint8 indexed orderType, address indexed signer, address counterparty, uint256 tokenId, uint256 price, uint256 fee)";

const fetch = async (options: FetchOptions) => {
  // Gross crate spend, exactly as the VendingMachine splits it on each open.
  const treasuryIn = await addTokensReceived({
    options,
    tokens: [USDG],
    targets: [TREASURY],
    fromAddressFilter: VENDING_MACHINE,
  });
  const potIn = await addTokensReceived({
    options,
    tokens: [USDG],
    targets: [POT_VAULT],
    fromAddressFilter: VENDING_MACHINE,
  });

  // Platform buyback payouts: Orderbook trades signed by the Treasury Safe.
  const buybacks = options.createBalances();
  const trades = await options.getLogs({ target: ORDERBOOK, eventAbi: TRADE_EVENT });
  for (const t of trades) {
    if (String(t.signer).toLowerCase() === TREASURY.toLowerCase()) {
      buybacks.add(USDG, t.price, LABELS.BUYBACK_PAYOUTS);
    }
  }

  const dailyVolume = options.createBalances();
  dailyVolume.addBalances(treasuryIn);
  dailyVolume.addBalances(potIn);

  const dailyFees = options.createBalances();
  dailyFees.addBalances(treasuryIn, LABELS.CRATE_SALES);
  dailyFees.addBalances(potIn, LABELS.POT_CONTRIBUTIONS);
  dailyFees.subtract(buybacks, LABELS.BUYBACK_PAYOUTS);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(treasuryIn, LABELS.CRATE_SALES);
  dailyRevenue.subtract(buybacks, LABELS.BUYBACK_PAYOUTS);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addBalances(potIn, LABELS.POT_CONTRIBUTIONS);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Gross USDG crate spend (crate price + network fee on every open), no netting.",
  Fees: "Crate spend net of instant-sell buyback payouts (Orderbook trades signed by the Treasury). Can be negative on heavy-buyback days.",
  Revenue: "Treasury share of each open (crate price minus Pot contribution, plus network fee) minus buyback payouts. Gross of off-chain card fulfillment (every crate delivers a physical graded card).",
  ProtocolRevenue: "Treasury share of each open (crate price minus Pot contribution, plus network fee) minus buyback payouts.",
  SupplySideRevenue: "The Pot contribution of each open: a fixed bps of the crate price funding the community jackpot paid back to players.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.CRATE_SALES]: "USDG the VendingMachine routes to the Treasury on each crate open (crate price minus Pot contribution, plus network fee).",
    [LABELS.POT_CONTRIBUTIONS]: "USDG the VendingMachine routes to the PotVault on each crate open (fixed bps of the crate price).",
    [LABELS.BUYBACK_PAYOUTS]: "USDG paid out to players who instant-sell cards back (Orderbook trades signed by the Treasury Safe); subtracted.",
  },
  Revenue: {
    [LABELS.CRATE_SALES]: "Treasury share of each crate open.",
    [LABELS.BUYBACK_PAYOUTS]: "Instant-sell buyback payouts to players; subtracted.",
  },
  SupplySideRevenue: {
    [LABELS.POT_CONTRIBUTIONS]: "Pot contributions funding the community jackpot paid back to players.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-03",
  methodology,
  breakdownMethodology,
  allowNegativeValue: true, //buybacks can exceed sales
};

export default adapter;
