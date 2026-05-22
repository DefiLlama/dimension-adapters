import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const USP_TOKEN = "0x098697bA3Fee4eA76294C5d6A466a4e3b3E95FE6";
const ORACLE = "0x433471901bA1A8BDE764E8421790C7D9bAB33552";
const FUNDING_MANAGER = "0x7e0305B212dF3FB56366251C054c07748Bf9a797";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

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

  if (supplySideYield !== 0n) {
    const grossYield = supplySideYield * 10n / 9n;
    const treasuryYield = grossYield - supplySideYield;

    dailyFees.add(USDC, grossYield, METRIC.ASSETS_YIELDS);
    dailySupplySideRevenue.add(USDC, supplySideYield, METRIC.ASSETS_YIELDS);
    dailyRevenue.add(USDC, treasuryYield, METRIC.ASSETS_YIELDS);
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
    Fees: "Total value generated from USP backing asset yields (gross yield from oracle NAV changes) plus 0.2% redemption fees charged on USP redemptions.",
    Revenue: "10% of all yield generated from USP backing assets, allocated to PikuDAO treasury for protocol development, security, governance, and PIKU buyback and burn.",
    ProtocolRevenue: "10% of all yield generated from USP backing assets, allocated to PikuDAO treasury for protocol development, security, governance, and PIKU buyback and burn.",
    SupplySideRevenue: "90% of yield from backing assets reflected in USP price appreciation, plus 0.2% redemption fees added back to USP backing benefiting remaining holders.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Yield from delta neutral strategies (arbitrage, carry trades, on-chain yield, RWAs) backing USP. Oracle reflects 90% of total yield after PikuDAO treasury allocation.",
      [METRIC.MINT_REDEEM_FEES]: "0.2% fee charged on USP redemptions, added back to USP backing.",
    },
    Revenue: {
      [METRIC.ASSETS_YIELDS]: "10% of all yields generated from USP backing goes to the PikuDAO Treasury.",
    },
    ProtocolRevenue: {
      [METRIC.ASSETS_YIELDS]: "10% of all yields generated from USP backing goes to the PikuDAO Treasury.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "90% of gross yield reflected in USP oracle price appreciation.",
      [METRIC.MINT_REDEEM_FEES]: "0.2% redemption fees flowing back into USP backing.",
    },
  },
};

export default adapter;
