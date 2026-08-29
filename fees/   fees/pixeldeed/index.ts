import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/*
  ✅ VERIFIED (2026-08-29, robinhoodchain.blockscout.com):
    - All 4 contracts have "Contract source code verified (exact match)" status.
    - Constructor arguments cross-reference each other (same _nft/admin/_treasury),
      and the on-chain source code matches packages/contracts/src/*.sol line by line.
    - Marketplace.PLATFORM_FEE_BPS = 550  (5.5%, resale platform fee)
    - RentalManager.PLATFORM_FEE_BPS = 250 (2.5%, rental platform fee)
    - Royalty (ERC-2981, 2.5%) goes to `royaltyReceiver` (the original creator), so
      it is NOT INCLUDED in protocol revenue — this is explicitly stated in the Fees methodology.
    - No ETH passes through MergeController (burn+mint only) — since there's no
      revenue, it was not included in the adapter.

  ⚠️ Check before submitting:
    - Confirm the exact name of the CHAIN.ROBINHOOD key from
      helpers/chains.ts in the dimension-adapters repo (i.e. verify whether
      it's registered as "robinhood" — ROBINHOOD is assumed below).
    - The transaction counts are currently low (4/1/2/1), so low fees/volume
      is expected — this reflects that the protocol is new and just getting started.
*/

const PIXELDEED_NFT_ADDRESS = "0x36211456E0bAbB51D4Fb5359d0ad71fC79F9C810";
const MARKETPLACE_ADDRESS = "0xfCb0Db509dBBF995F692f7B84Ab8423542270DeF";
const MERGE_CONTROLLER_ADDRESS = "0xDa22790487177788F2e221618415bb91fCcA69c3";
const RENTAL_MANAGER_ADDRESS = "0xF26Be69a711953bD2bee19B95Fd24aEA0C5603f7";
const START_BLOCK = 48028161;

// --- Actual event ABI taken from Marketplace.sol ---
const SOLD_EVENT =
  "event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 priceWei, address royaltyReceiver, uint256 royaltyAmount, uint256 platformFeeAmount)";

// --- Actual event ABI taken from RentalManager.sol ---
const RENTED_EVENT =
  "event Rented(uint256 indexed tokenId, address indexed renter, uint32 numDays, uint64 expiresAt, uint256 paidWei, uint256 platformFeeAmount)";

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyVolume = options.createBalances();
  const dailyResaleFees = options.createBalances();
  const dailyRentalFees = options.createBalances();

  // --- Resale (Marketplace.sol: buy() -> emits Sold) ---
  // platformFeeAmount = priceWei * 550 / 10_000 (5.5%), goes to treasury.
  // royaltyAmount (2.5%) goes to the original creator, so it is not counted as protocol revenue.
  const sales = await options.getLogs({
    target: MARKETPLACE_ADDRESS,
    eventAbi: SOLD_EVENT,
    fromBlock: START_BLOCK,
  });
  sales.forEach((log: any) => {
    dailyVolume.addGasToken(log.priceWei);
    dailyResaleFees.addGasToken(log.platformFeeAmount);
  });

  // --- Rental commission (RentalManager.sol: rent() -> emits Rented) ---
  // platformFeeAmount = paidWei * 250 / 10_000 (2.5%), goes to treasury.
  const rentals = await options.getLogs({
    target: RENTAL_MANAGER_ADDRESS,
    eventAbi: RENTED_EVENT,
    fromBlock: START_BLOCK,
  });
  rentals.forEach((log: any) => {
    dailyVolume.addGasToken(log.paidWei);
    dailyRentalFees.addGasToken(log.platformFeeAmount);
  });

  const dailyFees = options.createBalances();
  dailyFees.addBalances(dailyResaleFees);
  dailyFees.addBalances(dailyRentalFees);

  return {
    dailyVolume,             // Goes into the Volume dashboard (marketplace trading amount)
    dailyFees,                // total fee (resale + rental)
    dailyRevenue: dailyFees,  // adjust if the protocol's own earned portion differs
    dailyResaleFees,          // used for breakdown (as in the NOXA Fun example)
    dailyRentalFees,
  } as any;
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: START_BLOCK,
      meta: {
        methodology: {
          Fees: "5.5% platform fee on Marketplace resales (Sold event) + 2.5% platform fee on Rental commission (Rented event), both going to treasury. Does not include the 2.5% royalty that goes to the creator.",
          Revenue: "Same as Fees — only the portion that goes to the protocol treasury is counted as revenue.",
        },
      },
    },
  },
};

export default adapter;
