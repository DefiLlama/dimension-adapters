import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import * as sdk from "@defillama/sdk";

// sUSN token addresses across supported chains
const SUSN: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0xE24a3DC889621612422A64E6388927901608B91D",
  [CHAIN.SOPHON]: "0xb87dbe27db932bacaaa96478443b6519d52c5004",
  [CHAIN.ERA]: "0xB6a09d426861c63722Aa0b333a9cE5d5a9B04c4f",
  [CHAIN.TAC]: "0x5Ced7F73B76A555CCB372cc0F0137bEc5665F81E"
};

// Underlying USN stablecoin token on Ethereum (18 decimals, USD pegged)
const USN_ETHEREUM = "0xdA67B4284609d2d48e5d10cfAc411572727dc1eD";

// Official Beethoven/Balancer-style rate provider returning sUSN:USN exchange rate (18 decimals)
const SUSN_RATE_PROVIDER = "0x3A89f87EA1D5B9fd0FEde73b5098678190D2EEaa";

async function getRateAt(timestamp: number): Promise<bigint> {
  const api = new sdk.ChainApi({ chain: CHAIN.ETHEREUM, timestamp });
  await api.getBlock();
  const rate = await api.call({ abi: "uint256:getRate", target: SUSN_RATE_PROVIDER });
  return BigInt(rate);
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [rateTodayBn, rateYesterdayBn, totalSupply] = await Promise.all([
    getRateAt(options.toTimestamp),
    getRateAt(options.fromTimestamp),
    options.api.call({ abi: "uint256:totalSupply", target: SUSN[options.chain] }),
  ]);

  const totalSupplyBn = BigInt(totalSupply);
  const rateDelta = rateTodayBn - rateYesterdayBn;

  if (rateDelta !== 0n) {
    // Protocol return distribution (docs.noon.capital/noon-the-details/return-distribution):
    // - 80% of net returns accrue to sUSN depositors via exchange rate appreciation (Supply-Side Revenue)
    // - 20% protocol performance fee is retained: 10% Insurance Fund + 10% Operations Fund (Protocol Revenue)
    //
    // netYield = (totalSupply * rateDelta) / 10^18
    // grossYield = netYield / 0.80 = (netYield * 5) / 4
    // protocolRevenue = grossYield - netYield = grossYield * 0.20
    const netYield = (totalSupplyBn * rateDelta) / 10n ** 18n;
    const grossYield = (netYield * 5n) / 4n;
    const protocolRevenue = grossYield - netYield;

    // USN is USD-pegged (token: USN_ETHEREUM); addUSDValue works on all chains where ethereum: pricing does not
    const netYieldUsd = Number(netYield) / 1e18;
    const protocolRevenueUsd = Number(protocolRevenue) / 1e18;

    dailySupplySideRevenue.addUSDValue(netYieldUsd, METRIC.ASSETS_YIELDS);
    dailyRevenue.addUSDValue(protocolRevenueUsd, METRIC.PERFORMANCE_FEES);
    dailyFees.addUSDValue(netYieldUsd, METRIC.ASSETS_YIELDS);
    dailyFees.addUSDValue(protocolRevenueUsd, METRIC.PERFORMANCE_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    // Explicit 0: Protocol revenue is retained in Insurance & Operations funds.
    // Surplus insurance funds buy back $NOON only after a 12-month seasoning period.
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: "Total gross returns generated across Noon investment strategies (T-Bills, Private Credit, DeFi lending, funding rate arbitrage).",
  SupplySideRevenue: "80% of protocol returns distributed to sUSN holders through daily exchange rate appreciation.",
  Revenue: "20% performance fee retained by the protocol (split between 10% Insurance Fund and 10% Operations Fund).",
  ProtocolRevenue: "All protocol revenue is retained by the Operations and Insurance funds.",
  HoldersRevenue: "No direct distributions to NOON token holders (insurance surplus buybacks occur after 12-month seasoning).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.ASSETS_YIELDS]: "Net returns generated across Noon investment strategies distributed to sUSN depositors.",
    [METRIC.PERFORMANCE_FEES]: "20% protocol performance fee allocated to Operations Fund and Insurance Fund.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "20% protocol performance fee allocated to Operations Fund and Insurance Fund.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "20% protocol performance fee allocated to Operations Fund and Insurance Fund.",
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: "80% of returns accruing to sUSN stakers via share price appreciation.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true, // strategy losses flow through sUSN exchange-rate depreciation
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2025-04-16', // Noon protocol mainnet launch
    },
    [CHAIN.SOPHON]: {
      fetch,
      start: '2025-04-16', // Sophon deployment
    },
    [CHAIN.ERA]: {
      fetch,
      start: '2025-04-16', // ZKsync Era deployment
    },
    [CHAIN.TAC]: {
      fetch,
      start: '2025-07-12', // TAC deployment
    },
  },
};

export default adapter;
