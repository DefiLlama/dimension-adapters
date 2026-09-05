import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/*
  ✅ VERIFIED (2026-08-29, robinhoodchain.blockscout.com):
    - All 4 contracts show "Contract source code verified (exact match)".
    - Constructor arguments cross-reference each other (same _nft/admin/_treasury
      across Marketplace, MergeController, RentalManager), and the on-chain
      source matches packages/contracts/src/*.sol line-for-line.
    - Marketplace.PLATFORM_FEE_BPS = 550  (5.5%, resale platform fee)
    - RentalManager.PLATFORM_FEE_BPS = 250 (2.5%, rental platform fee)
    - Royalty (ERC-2981, 2.5%) goes to `royaltyReceiver` (original creator),
      NOT counted as protocol revenue — noted explicitly in the Fees methodology.
    - MergeController never moves ETH (burn+mint only) — no revenue, so it's
      excluded from this adapter.

  ⚠️ CodeRabbit review fixes (2026-08-29):
    1. Removed the fixed `fromBlock: START_BLOCK` from both getLogs() calls —
       for version-2 adapters, FetchOptions already scopes each call to the
       current day/hour window. A fixed fromBlock re-fetched everything since
       deployment on every run, turning "daily" values into cumulative totals.
    2. Added `dailyProtocolRevenue` — both fee sources are sent straight to the
       treasury, so this should be reported explicitly, not just folded into
       dailyRevenue.
    3. Added `pullHourly: true` — version-2 adapters that read granular EVM
       logs must opt into hourly retrieval explicitly.
    4. Creator royalty is now included in `dailyFees` and reported separately
       as `dailySupplySideRevenue` (instead of being excluded from dailyFees
       entirely), so that dailyFees = dailyRevenue + dailySupplySideRevenue,
       matching DefiLlama's standard fee-accounting convention.
*/

const PIXELDEED_NFT_ADDRESS = "0x36211456E0bAbB51D4Fb5359d0ad71fC79F9C810";
const MARKETPLACE_ADDRESS = "0xfCb0Db509dBBF995F692f7B84Ab8423542270DeF";
const MERGE_CONTROLLER_ADDRESS = "0xDa22790487177788F2e221618415bb91fCcA69c3";
const RENTAL_MANAGER_ADDRESS = "0xF26Be69a711953bD2bee19B95Fd24aEA0C5603f7";
const START_BLOCK = 48028161;

const METRIC_RESALE_FEES = "Resale Fees";
const METRIC_RENTAL_FEES = "Rental Fees";
const METRIC_CREATOR_ROYALTY = "Creator Royalty";

// --- Real event ABI, taken from Marketplace.sol ---
const SOLD_EVENT =
  "event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 priceWei, address royaltyReceiver, uint256 royaltyAmount, uint256 platformFeeAmount)";

// --- Real event ABI, taken from RentalManager.sol ---
const RENTED_EVENT =
  "event Rented(uint256 indexed tokenId, address indexed renter, uint32 numDays, uint64 expiresAt, uint256 paidWei, uint256 platformFeeAmount)";

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();             // total: treasury fees + creator royalty
  const dailyProtocolFees = options.createBalances();      // treasury-only cut -> Revenue / ProtocolRevenue
  const dailySupplySideRevenue = options.createBalances(); // creator royalty -> SupplySideRevenue

  // --- Resale (Marketplace.sol: buy() -> emits Sold) ---
  // platformFeeAmount = priceWei * 550 / 10_000 (5.5%), sent to treasury.
  // royaltyAmount (2.5%) goes to the original creator: still part of dailyFees
  // (total amount paid on top of the sale price), but reported as
  // dailySupplySideRevenue rather than protocol revenue, so that
  // dailyFees = dailyRevenue + dailySupplySideRevenue holds.
  const sales = await options.getLogs({
    target: MARKETPLACE_ADDRESS,
    eventAbi: SOLD_EVENT,
  });
  sales.forEach((log: any) => {
    dailyVolume.addGasToken(log.priceWei);
    dailyFees.addGasToken(log.platformFeeAmount, METRIC_RESALE_FEES);
    dailyFees.addGasToken(log.royaltyAmount, METRIC_CREATOR_ROYALTY);
    dailyProtocolFees.addGasToken(log.platformFeeAmount, METRIC_RESALE_FEES);
    dailySupplySideRevenue.addGasToken(log.royaltyAmount, METRIC_CREATOR_ROYALTY);
  });

  // --- Rental commission (RentalManager.sol: rent() -> emits Rented) ---
  // platformFeeAmount = paidWei * 250 / 10_000 (2.5%), sent to treasury.
  // Rentals have no royalty component.
  const rentals = await options.getLogs({
    target: RENTAL_MANAGER_ADDRESS,
    eventAbi: RENTED_EVENT,
  });
  rentals.forEach((log: any) => {
    dailyVolume.addGasToken(log.paidWei);
    dailyFees.addGasToken(log.platformFeeAmount, METRIC_RENTAL_FEES);
    dailyProtocolFees.addGasToken(log.platformFeeAmount, METRIC_RENTAL_FEES);
  });

  return {
    dailyVolume,                            // shown on the Volume dashboard (gross marketplace trade value)
    dailyFees,                              // total: treasury fees + creator royalty
    dailyRevenue: dailyProtocolFees,        // treasury-only cut (excludes creator royalty)
    dailyProtocolRevenue: dailyProtocolFees, // same treasury-only cut
    dailySupplySideRevenue,                 // creator royalty (goes to a third party, not the protocol)
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: START_BLOCK,
      pullHourly: true,
      meta: {
        methodology: {
          Fees: "5.5% platform fee on marketplace resales (Sold event) + 2.5% platform fee on rental payments (Rented event) + the 2.5% creator royalty on resales, which is passed through to the original creator rather than kept by the protocol.",
          Revenue: "Only the treasury-bound platform fees (resale + rental) — excludes the creator royalty.",
          SupplySideRevenue: "The 2.5% creator royalty on resales, paid to the original creator (royaltyReceiver), not the protocol treasury.",
        },
        breakdownMethodology: {
          Fees: {
            [METRIC_RESALE_FEES]: "5.5% platform fee taken on every secondary marketplace sale.",
            [METRIC_RENTAL_FEES]: "2.5% platform fee taken on every rental payment.",
            [METRIC_CREATOR_ROYALTY]: "2.5% ERC-2981 creator royalty on every secondary sale, paid to the original creator.",
          },
        },
      },
    },
  },
};

export default adapter;


