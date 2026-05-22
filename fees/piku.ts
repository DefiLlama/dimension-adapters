import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import ADDRESSES from "../helpers/coreAssets.json";

const USP_TOKEN = "0x098697bA3Fee4eA76294C5d6A466a4e3b3E95FE6";
const ORACLE = "0x433471901bA1A8BDE764E8421790C7D9bAB33552";
const FUNDING_MANAGER = "0x7e0305B212dF3FB56366251C054c07748Bf9a797";
const USDC = ADDRESSES.ethereum.USDC;

const abis = {
  getPriceForIssuance: "function getPriceForIssuance() view returns (uint256)",
  totalSupply: "erc20:totalSupply",
  decimals: "erc20:decimals",
  RedemptionOrderCreated: "event RedemptionOrderCreated(address indexed paymentClient_, uint256 indexed orderId_, address seller_, address indexed receiver_, uint256 sellAmount_, uint256 exchangeRate_, uint256 feePercentage_, uint256 feeAmount_, uint256 protocolFeeAmount_, uint256 finalRedemptionAmount_, address collateralToken_, uint8 state_)",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [priceBefore, priceAfter, totalSupply, decimals] = await Promise.all([
    options.fromApi.call({ target: ORACLE, abi: abis.getPriceForIssuance }),
    options.toApi.call({ target: ORACLE, abi: abis.getPriceForIssuance }),
    options.api.call({ target: USP_TOKEN, abi: abis.totalSupply }),
    options.api.call({ target: USP_TOKEN, abi: abis.decimals }),
  ]);

  const priceChange = BigInt(priceAfter) - BigInt(priceBefore);
  const supplySideYield = (BigInt(totalSupply) * priceChange) / 10n ** BigInt(decimals);

  if (supplySideYield > 0n) {
    const grossYield = supplySideYield * 10n / 9n;
    const treasuryYield = grossYield - supplySideYield;

    dailyFees.add(USDC, grossYield, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.add(USDC, supplySideYield, METRIC.ASSETS_YIELDS);
    dailyRevenue.add(USDC, treasuryYield, METRIC.ASSETS_YIELDS);
  } else {
    dailyFees.add(USDC, supplySideYield, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.add(USDC, supplySideYield, METRIC.ASSETS_YIELDS);
  }

  // Track redemption fees (0.2%)
  const redemptionLogs = await options.getLogs({
    target: FUNDING_MANAGER,
    eventAbi: abis.RedemptionOrderCreated,
  });

  for (const log of redemptionLogs) {
    dailyFees.add(log.collateralToken_, log.feeAmount_, METRIC.MINT_REDEEM_FEES);
    dailySupplySideRevenue.add(log.collateralToken_, log.feeAmount_, METRIC.MINT_REDEEM_FEES);
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
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-08-22",
    },
  },
  pullHourly: true,
  allowNegativeValue: true,
  methodology: {
    Fees: "Yield generated from USP's delta neutral strategies (arbitrage, carry trades, on-chain DeFi yield, RWAs) plus 0.2% platform redemption fees.",
    Revenue: "10% of all yields generated from USP backing, allocated to PikuDAO treasury.",
    ProtocolRevenue: "10% of all yields generated from USP backing, allocated to PikuDAO treasury.",
    SupplySideRevenue: "90% of yield from USP backing reflected in USP price appreciation, plus 0.2% redemption fees added back to USP backing.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Yield from USP's delta neutral strategies (arbitrage, carry trades, on-chain DeFi yield, RWAs). Oracle price reflects 90% of total yield after PikuDAO treasury allocation.",
      [METRIC.MINT_REDEEM_FEES]: "0.2% platform fee on USP redemptions, added back to USP backing.",
    },
    Revenue: {
      [METRIC.ASSETS_YIELDS]: "10% of all yields generated from USP backing goes to the PikuDAO Treasury.",
    },
    ProtocolRevenue: {
      [METRIC.ASSETS_YIELDS]: "10% of all yields generated from USP backing goes to the PikuDAO Treasury.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "90% of yield from USP's delta neutral strategies reflected in USP price appreciation.",
      [METRIC.MINT_REDEEM_FEES]: "0.2% platform redemption fees flowing back into USP backing.",
    },
  },
};

export default adapter;
