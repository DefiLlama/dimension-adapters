import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Staking proxy: https://www.orbio.so/protocol#contracts-and-chain
// Verified implementation: https://robin.etherscan.io/address/0x3b101009b6ac17c8aba3801720d19713B835aE0B#code
const STAKING = "0xe0710011278bfb63e57c5f227e5980984b1eddca";
const USDG = ADDRESSES.robinhood.USDG;
const HARVESTED = "event Harvested(uint256 indexed rewardId, uint64 start, uint64 end, uint256 nvdaIn, uint256 usdgOut, uint256 treasuryUsdg, uint256 backingUsdg, uint256 totalWeight)";
const INFERENCE_FUNDED = "event InferenceFunded(uint256 usdgAtoms, uint256 indexed orderId, uint32 price)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // Harvests already include LP fees; book fees bypass the harvest split.
  // CREDIT activation burns and the launchpad's separately accounted ORBIO fee are excluded.
  const harvests = await options.getLogs({ target: STAKING, eventAbi: HARVESTED });
  for (const log of harvests) {
    dailyFees.add(USDG, log.usdgOut, "Harvest Fees");
    dailyProtocolRevenue.add(USDG, log.treasuryUsdg, "Harvest Fees To Treasury");
    // With no staking weight, the contract allocates the backing to treasury instead.
    if (BigInt(log.totalWeight) === 0n)
      dailyProtocolRevenue.add(USDG, log.backingUsdg, "Harvest Fees To Treasury");
    else
      dailyHoldersRevenue.add(USDG, log.backingUsdg, "Harvest Fees To ORBIO Stakers");
  }

  const bookFees = await options.getLogs({ target: STAKING, eventAbi: INFERENCE_FUNDED });
  for (const log of bookFees) {
    dailyFees.add(USDG, log.usdgAtoms, "CREDIT Order Book Fees");
    dailyProtocolRevenue.add(USDG, log.usdgAtoms, "CREDIT Order Book Fees To Treasury");
  }

  const dailyRevenue = dailyProtocolRevenue.clone();
  dailyRevenue.add(dailyHoldersRevenue);
  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const treasuryBreakdown = {
  "Harvest Fees To Treasury": "Harvest revenue allocated to treasury, including the backing share when no ORBIO is staked.",
  "CREDIT Order Book Fees To Treasury": "Buyer fees swept into inference backing and listed as CREDIT for treasury, without the harvest split.",
};
const holdersBreakdown = {
  "Harvest Fees To ORBIO Stakers": "Harvest revenue allocated as inference backing for ORBIO stakers, including unclaimed rewards.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-15",
  doublecounted: true, // Harvests contain creator and LP fees also counted by underlying DEX adapters.
  methodology: {
    Fees: "ORBIO creator and LP fees collected in harvests plus CREDIT order-book buyer fees swept by staking, excluding CREDIT activation burns and launchpad ORBIO fees.",
    Revenue: "Harvest and order-book fees allocated to treasury and ORBIO token holders.",
    ProtocolRevenue: "The treasury share of harvests plus swept order-book fees, including the harvest backing share when no ORBIO is staked.",
    HoldersRevenue: "The harvest share allocated as inference backing to ORBIO stakers, valued in USDG when funded rather than when claimed.",
  },
  breakdownMethodology: {
    Fees: {
      "Harvest Fees": "Creator fees converted to USDG plus LP fees incorporated into the harvest before splitting.",
      "CREDIT Order Book Fees": "USDG buyer fees collected by the CREDIT exchange and swept by staking.",
    },
    Revenue: { ...treasuryBreakdown, ...holdersBreakdown },
    ProtocolRevenue: treasuryBreakdown,
    HoldersRevenue: holdersBreakdown,
  },
};

export default adapter;
