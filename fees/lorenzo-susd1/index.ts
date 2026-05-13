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

const fetch = async (options: FetchOptions) => {
  const vault = vaults[options.chain];
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

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
  const yieldAmount = (BigInt(totalSupply) * navChange) / PRECISION;
  dailyFees.addUSDValue(Number(yieldAmount) / 1e18, METRIC.ASSETS_YIELDS);
  dailySupplySideRevenue.addUSDValue(Number(yieldAmount) / 1e18, METRIC.ASSETS_YIELDS);

  return {
    dailyFees,
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
    Fees: "Yield generated from sUSD1+ vault NAV appreciation. sUSD1+ accrues value through delta-neutral strategies and RWA yields, reflected in unitNAV updates.",
    SupplySideRevenue: "Net yield to sUSD1+ holders via NAV appreciation, after off-chain protocol and execution fees.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Yield from off-chain delta-neutral strategies and RWA yields, reflected on-chain via unitNAV updates.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Net yield distributed to sUSD1+ holders after off-chain protocol and execution fees.",
    },
  },
};

export default adapter;
