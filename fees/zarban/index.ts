import { ChainApi } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { AaveLendingPoolConfig, getPoolFees } from "../../helpers/aave";
import { METRIC } from "../../helpers/metrics";

// Zarban Stablecoin System
// https://github.com/zarbanio/subgraph
const VAT = "0x975Eb113D580c44aa5676370E2CdF8f56bf3F99F";
const DOG = "0x4eB5a223B2c797Dcc13297B3C002225b1770d837";
const ZAR = "0xd946188A614A0d9d0685a60F541bba1e8CC421ae";

// Zarban Liquidity Market (Aave v2 fork)
const LIQUIDITY_MARKET: AaveLendingPoolConfig = {
  version: 2,
  lendingPoolProxy: "0xC62545B7f466317b014773D1C605cA0D0931B0Fd",
  dataProvider: "0x6028113255C24C94DfdEE59150A7EDEEf513B75A",
};

const FOLD_EVENT = "event Fold(bytes32 indexed i, address indexed u, int256 indexed rate)";
const BARK_EVENT = "event Bark(bytes32 indexed ilk, address indexed urn, uint256 ink, uint256 art, uint256 due, address clip, uint256 indexed id)";
const VAT_ILKS_ABI = "function ilks(bytes32) view returns (uint256 Art, uint256 rate, uint256 spot, uint256 line, uint256 dust)";
const DOG_ILKS_ABI = "function ilks(bytes32) view returns (address clip, uint256 chop, uint256 hole, uint256 dirt)";

const STABILITY_FEES = "Stability Fees";

const RAY = BigInt(10) ** BigInt(27);
const WAD = BigInt(10) ** BigInt(18);

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  await getPoolFees(LIQUIDITY_MARKET, options, {
    dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  });

  const foldLogs = await options.getLogs({
    target: VAT,
    eventAbi: FOLD_EVENT,
    entireLog: true,
    parseLog: true,
  });
  for (const log of foldLogs) {
    // Art must be read at the fold's own block, it changes with every frob
    const api = new ChainApi({ chain: options.chain, block: Number(log.blockNumber) });
    const ilk = await api.call({ target: VAT, abi: VAT_ILKS_ABI, params: [log.args.i] });
    const accruedZar = (BigInt(ilk.Art) * BigInt(log.args.rate)) / RAY;
    dailyFees.add(ZAR, accruedZar, STABILITY_FEES);
    dailyProtocolRevenue.add(ZAR, accruedZar, STABILITY_FEES);
  }

  const barkLogs = await options.getLogs({ target: DOG, eventAbi: BARK_EVENT });
  for (const log of barkLogs) {
    // due is the liquidated debt (tab without penalty, RAD), chop is the penalty multiplier (WAD, e.g. 1.13e18)
    const { chop } = await options.api.call({ target: DOG, abi: DOG_ILKS_ABI, params: [log.ilk] });
    const penaltyZar = (BigInt(log.due) * (BigInt(chop) - WAD)) / (RAY * WAD);
    dailyFees.add(ZAR, penaltyZar, METRIC.LIQUIDATION_FEES);
    dailyProtocolRevenue.add(ZAR, penaltyZar, METRIC.LIQUIDATION_FEES);
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Stability fees and liquidation penalties paid in ZAR by CDP borrowers, plus borrow interest, flashloan and liquidation fees paid in the Zarban liquidity market.",
  Revenue: "Stability fees and liquidation penalties from CDPs plus the reserve-factor share of liquidity market fees.",
  ProtocolRevenue: "All revenue goes to the protocol.",
  SupplySideRevenue: "Liquidity market interest distributed to depositors. CDP fees have no supply side (there is no DSR).",
};

const breakdownMethodology = {
  Fees: {
    [STABILITY_FEES]: "Stability fees accrued in ZAR on CDP debt (Vat.fold events).",
    [METRIC.BORROW_INTEREST]: "Interest paid by borrowers in the Zarban liquidity market.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation penalties paid by liquidated CDPs (Dog.bark events) and liquidation bonuses in the liquidity market.",
    [METRIC.FLASHLOAN_FEES]: "Flashloan fees paid in the Zarban liquidity market.",
  },
  Revenue: {
    [STABILITY_FEES]: "All stability fees go to the protocol.",
    [METRIC.BORROW_INTEREST]: "Reserve-factor share of liquidity market interest.",
    [METRIC.LIQUIDATION_FEES]: "CDP liquidation penalties and the protocol share of liquidity market liquidation bonuses.",
    [METRIC.FLASHLOAN_FEES]: "Protocol share of flashloan fees.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Interest distributed to liquidity market depositors.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation bonuses distributed to liquidity market depositors.",
    [METRIC.FLASHLOAN_FEES]: "Flashloan fees distributed to liquidity market depositors.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: "2023-04-30",
  methodology,
  breakdownMethodology,
};

export default adapter;
