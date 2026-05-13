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
    dailyRevenue: 0,
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
    Fees: "Net yield from sUSD1+ vault NAV appreciation, derived from off-chain delta-neutral basis trading, RWA yields, and DeFi strategies. The on-chain unitNAV is updated after protocol and execution fees are already deducted off-chain.",
    Revenue: "Lorenzo deducts protocol and execution fees off-chain before updating the on-chain NAV. The gross yield (pre-fee) is not available on-chain, so protocol revenue cannot be determined and is set to 0.",
    SupplySideRevenue: "All on-chain observable yield from unitNAV appreciation is distributed to sUSD1+ holders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Net yield from off-chain delta-neutral basis trading, RWA yields, and DeFi strategies, reflected on-chain via unitNAV updates.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "All on-chain observable yield from unitNAV appreciation distributed to sUSD1+ holders.",
    },
  },
};

export default adapter;
