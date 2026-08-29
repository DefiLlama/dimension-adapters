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

  ⚠️ Fix applied after CI error:
    "dailyResaleFees" is not a supported top-level metric (only dailyFees,
    dailyRevenue, dailyVolume, dailyUserFees, dailyHoldersRevenue,
    dailySupplySideRevenue, dailyProtocolRevenue, etc. are). The resale/rental
    breakdown is now done via labeled entries inside the single `dailyFees`
    balance object (options.createBalances().addGasToken(amount, label)),
    the same pattern fees/gmx.ts and fees/alchemix.ts use with METRIC labels.
*/

const PIXELDEED_NFT_ADDRESS = "0x36211456E0bAbB51D4Fb5359d0ad71fC79F9C810";
const MARKETPLACE_ADDRESS = "0xfCb0Db509dBBF995F692f7B84Ab8423542270DeF";
const MERGE_CONTROLLER_ADDRESS = "0xDa22790487177788F2e221618415bb91fCcA69c3";
const RENTAL_MANAGER_ADDRESS = "0xF26Be69a711953bD2bee19B95Fd24aEA0C5603f7";
const START_BLOCK = 48028161;

const METRIC_RESALE_FEES = "Resale Fees";
const METRIC_RENTAL_FEES = "Rental Fees";

// --- Real event ABI, taken from Marketplace.sol ---
const SOLD_EVENT =
  "event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 priceWei, address royaltyReceiver, uint256 royaltyAmount, uint256 platformFeeAmount)";

// --- Real event ABI, taken from RentalManager.sol ---
const RENTED_EVENT =
  "event Rented(uint256 indexed tokenId, address indexed renter, uint32 numDays, uint64 expiresAt, uint256 paidWei, uint256 platformFeeAmount)";

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  // --- Resale (Marketplace.sol: buy() -> emits Sold) ---
  // platformFeeAmount = priceWei * 550 / 10_000 (5.5%), sent to treasury.
  // royaltyAmount (2.5%) goes to the original creator, so it's excluded from
  // protocol revenue.
  const sales = await options.getLogs({
    target: MARKETPLACE_ADDRESS,
    eventAbi: SOLD_EVENT,
    fromBlock: START_BLOCK,
  });
  sales.forEach((log: any) => {
    dailyVolume.addGasToken(log.priceWei);
    dailyFees.addGasToken(log.platformFeeAmount, METRIC_RESALE_FEES);
  });

  // --- Rental commission (RentalManager.sol: rent() -> emits Rented) ---
  // platformFeeAmount = paidWei * 250 / 10_000 (2.5%), sent to treasury.
  const rentals = await options.getLogs({
    target: RENTAL_MANAGER_ADDRESS,
    eventAbi: RENTED_EVENT,
    fromBlock: START_BLOCK,
  });
  rentals.forEach((log: any) => {
    dailyVolume.addGasToken(log.paidWei);
    dailyFees.addGasToken(log.platformFeeAmount, METRIC_RENTAL_FEES);
  });

  return {
    dailyVolume,             // shown on the Volume dashboard (gross marketplace trade value)
    dailyFees,               // total fees, broken down internally by Resale Fees / Rental Fees
    dailyRevenue: dailyFees, // 100% of the platform fee goes to the protocol treasury
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: START_BLOCK,
      meta: {
        methodology: {
          Fees: "5.5% platform fee on marketplace resales (Sold event) + 2.5% platform fee on rental payments (Rented event), both sent to the treasury. Excludes the 2.5% creator royalty.",
          Revenue: "Same as Fees — 100% of the platform fee goes to the protocol treasury.",
        },
        breakdownMethodology: {
          Fees: {
            [METRIC_RESALE_FEES]: "5.5% platform fee taken on every secondary marketplace sale.",
            [METRIC_RENTAL_FEES]: "2.5% platform fee taken on every rental payment.",
          },
        },
      },
    },
  },
};

export default adapter;
