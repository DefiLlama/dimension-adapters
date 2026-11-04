import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from "../../helpers/coreAssets.json";

const USDC = ADDRESSES[CHAIN.ETHEREUM].USDC;
const USDT = ADDRESSES[CHAIN.ETHEREUM].USDT;

// Approved prefunding routes: (lending Safe -> borrower payout wallet, token).
//
// Source: each entry is a DeFa-operated lending Safe paired with the payout wallet
// of the borrower that Safe funds. A route is added only once DeFa has approved it,
// and the resulting total is published on DeFa's public dashboard at
// https://dune.com/defa_im/defa-by-invoicemate, which is generated from this same
// pair list. The borrower names below are labels for that pairing, not its source.
//
// Matching the pair rather than the Safe alone keeps stablecoin that leaves a Safe
// for an operational relay, for rebalancing, or back to lenders out of the total.
const ROUTES = [
  { safe: "0x182d16434faa044b9216a490cf0955b04ae16904", borrower: "0x6ccf7374dd59f3642633ce2161e02cf670773034", token: USDC }, // A Express
  { safe: "0x6357c870970775d63847d31be3161093a21736db", borrower: "0x8a0dd7159093f1847bf9b467cabb9926e26fa653", token: USDC }, // Menden/Mansa
  { safe: "0x6357c870970775d63847d31be3161093a21736db", borrower: "0x8a0dd7159093f1847bf9b467cabb9926e26fa653", token: USDT }, // Menden/Mansa
];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  // One pass per route. `target` filters the indexed `to` topic and
  // `fromAddressFilter` the indexed `from`, so each pass matches only that
  // Safe -> borrower pair for that token. `tokens` is explicit: with a
  // from-filter the helper has no address to enumerate holdings for.
  await Promise.all(
    ROUTES.map((route) =>
      addTokensReceived({
        target: route.borrower,
        fromAddressFilter: route.safe,
        tokens: [route.token],
        options,
        balances: dailyVolume,
      })
    )
  );
  return { dailyVolume };
};

const methodology = {
  Volume:
    "Gross capital disbursed to borrowers through DeFa's PayFi facility. Each approved route is a lending Safe, a borrower payout wallet and a stablecoin; volume is the USDC and USDT Transfer events on Ethereum whose sender is the Safe and whose recipient is that borrower's payout wallet, read from on-chain logs. Restricting to the pair excludes operational relays, rebalancing and transfers back to lenders, so only first-leg origination counts. Repayments are a separate reverse-direction flow and are not subtracted: this is lifetime gross disbursement, and redraws count each time. One row per Transfer log, so a transaction carrying several disbursements counts each. DefiLlama accumulates the daily figures into cumulative volume.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2026-04-11" },
    // Disabled: these chains recorded no volume on the previous Dune-backed path.
    // Re-enable when a prefunding route goes live on them.
    // [CHAIN.STELLAR]: { start: "2026-07-04" },
    // [CHAIN.STARKNET]: { start: "2026-07-04" },
    // zigchain: { start: "2026-07-04" },
  },
};

export default adapter;
