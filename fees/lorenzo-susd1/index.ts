import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// https://lorenzo-protocol.gitbook.io/docs
// https://medium.com/@lorenzoprotocol/usd1-mainnet-launch-72550abac2ed
const vaults: Record<string, string> = {
  [CHAIN.BSC]: "0x4f2760b32720f013e900dc92f65480137391199b",
  [CHAIN.ETHEREUM]: "0x8F18f2C97d2f5ec0e1d5b91c1d2ce245a9151972",
};
const PRECISION = BigInt(1e18);
const PROTOCOL_FEE = 5;

const fetch = async (options: FetchOptions) => {
  const vault = vaults[options.chain];
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const [navBefore, navAfter, totalSupply] = await Promise.all([
    options.fromApi.call({
      target: vault,
      abi: "uint256:getCurrentUnitNav",
    }),
    options.toApi.call({
      target: vault,
      abi: "uint256:getCurrentUnitNav",
    }),
    options.api.call({
      target: vault,
      abi: "uint256:totalSupply",
    }),
  ]);

  const navChange = BigInt(navAfter) - BigInt(navBefore);
  const netYield = (BigInt(totalSupply) * navChange) / PRECISION;
  const netYieldValue = Number(netYield) / 1e18;

  if (navChange > 0n) {
    // Lorenzo takes 5% on positive yields
    // On-chain NAV is post-fee: net = gross * (1 - 0.05), so gross = net / 0.95
    const grossYield = netYieldValue / (1 - PROTOCOL_FEE / 100);
    const protocolRevenue = grossYield - netYieldValue;
    dailyFees.addUSDValue(grossYield, METRIC.ASSETS_YIELDS);
    dailyRevenue.addUSDValue(protocolRevenue, METRIC.PERFORMANCE_FEES);
    dailySupplySideRevenue.addUSDValue(netYieldValue, METRIC.ASSETS_YIELDS);
  } else {
    // Negative yield: no protocol fee taken
    dailyFees.addUSDValue(netYieldValue, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.addUSDValue(netYieldValue, METRIC.ASSETS_YIELDS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-07-12",
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-08-28",
    },
  },
  methodology: {
    Fees: "Total yield from sUSD1+ vault strategies (delta-neutral basis trading, RWA yields, DeFi). Lorenzo takes a 5% fee on positive yields off-chain before updating the NAV.",
    Revenue: "Lorenzo takes a 5% performance fee on positive yields, deducted off-chain before the on-chain NAV update.",
    SupplySideRevenue: "Net yield distributed to sUSD1+ holders via NAV appreciation, after Lorenzo's 5% performance fee.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Gross yield from off-chain delta-neutral basis trading, RWA yields, and DeFi strategies, reflected on-chain via NAV updates.",
    },
    Revenue: {
      [METRIC.PERFORMANCE_FEES]: "Lorenzo's 5% performance fee on positive yields, deducted off-chain before NAV updates.",
    },
    ProtocolRevenue: {
      [METRIC.PERFORMANCE_FEES]: "Lorenzo's 5% performance fee on positive yields, deducted off-chain before NAV updates.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Net yield from NAV appreciation distributed to sUSD1+ holders after the 5% performance fee.",
    },
  },
};

export default adapter;
