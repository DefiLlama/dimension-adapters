import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Legacy Sett vaults (all sunset — see github.com/Badger-Finance/badger-legacy-sunset)
const vaults = [
  "0x4b92d19c11435614CD49Af1b589001b7c08cD4D5", // WBTC yearn vault wrapper (SimpleWrapperGatedUpgradeable)
  "0x19D97D8fA813EE2f51aD4B4e04EA08bAf4DFfC28", // BADGER
  "0x6dEf55d2e18486B9dDfaA075bc4e4EE0B28c1545", // crvRenWBTC
  "0xd04c48A53c111300aD41190D63681ed3dAd998eC", // crvRenWSBTC
  "0xb9D076fDe463dbc9f915E5392F807315Bf940334", // tbtc/sbtcCrv
  "0x7e7E112A68d8D2E221E11047a72fFC1065c38e1a", // DIGG
  "0x88128580ACdD9c04Ce47AFcE196875747bF2A9f6", // wBTC/Digg SLP
  "0x1862A18181346EBd9EdAf800804f89190DeF24a5", // wBTC/Badger SLP
  "0x758A43EE2BFf8230eeb784879CdcFF4828F2544D", // wBTC/wETH SLP
]

const getPricePerFullShareAbi = "function getPricePerFullShare() public view returns (uint256)";
const stETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // eBTC ActivePool fees — redemption/liquidation fees in stETH sent to protocol fee recipient
  const activePoolFeeLogs = await options.getLogs({
    target: "0x6dBDB6D420c110290431E863A1A978AE53F69ebC",
    eventAbi: "event FeeRecipientClaimableCollSharesIncreased(uint256 _coll, uint256 _fee)"
  })
  for (const log of activePoolFeeLogs) {
    dailyFees.add(stETH, log._fee, METRIC.MINT_REDEEM_FEES);
    dailyRevenue.add(stETH, log._fee, METRIC.MINT_REDEEM_FEES);
    dailyProtocolRevenue.add(stETH, log._fee, METRIC.MINT_REDEEM_FEES);
  }

  // Legacy vault yield tracking via pricePerFullShare growth
  const [controllers, tokens, totalSupplies] = await Promise.all([
    options.api.multiCall({ abi: 'address:controller', calls: vaults, permitFailure: true }),
    options.api.multiCall({ abi: 'address:token', calls: vaults, permitFailure: true }),
    options.api.multiCall({ abi: 'uint256:totalSupply', calls: vaults, permitFailure: true }),
  ]);

  const [fromPrices, toPrices] = await Promise.all([
    options.fromApi.multiCall({ abi: getPricePerFullShareAbi, calls: vaults, permitFailure: true }),
    options.toApi.multiCall({ abi: getPricePerFullShareAbi, calls: vaults, permitFailure: true }),
  ]);

  // WBTC wrapper (vaults[0]) has no controller→strategy pattern, skip it for strategy calls
  const strategyCalls = controllers.slice(1).map((controller: string, i: number) => ({
    target: controller,
    params: [tokens[i + 1]]
  }));

  const strategies = await options.api.multiCall({
    abi: 'function strategies(address) view returns (address)',
    calls: strategyCalls,
    permitFailure: true,
  });

  const [settPerformanceFeesGov, settPerformanceFeesStrat] = await Promise.all([
    options.api.multiCall({ abi: 'uint256:performanceFeeGovernance', calls: strategies, permitFailure: true }),
    options.api.multiCall({ abi: 'uint256:performanceFeeStrategist', calls: strategies, permitFailure: true }),
  ]);

  // WBTC wrapper has no performance fees
  const performanceFeesGov = ['0', ...settPerformanceFeesGov];
  const performanceFeesStrat = ['0', ...settPerformanceFeesStrat];

  // getPricePerFullShare() reflects values during harvest(), performance fees are deducted 
  // before yield increases the share price.
  // priceShareGrowth gives net yield so we calculate gross yield to get total fees.
  for (let i = 0; i < vaults.length; i++) {
    if (!tokens[i] || !totalSupplies[i] || !fromPrices[i] || !toPrices[i]) continue;
    const priceShareGrowth = BigInt(toPrices[i]) - BigInt(fromPrices[i]);

    // Allow negative yield (no skip on negative priceShareGrowth)
    const netYield = (BigInt(totalSupplies[i]) * priceShareGrowth) / BigInt(1e18);

    const perfFeeGovRate = Number(performanceFeesGov[i] || 0) / 10000;
    const perfFeeStratRate = Number(performanceFeesStrat[i] || 0) / 10000;
    const totalPerfFeeRate = perfFeeGovRate + perfFeeStratRate;

    // grossYield = netYield / (1 - totalPerfFeeRate)
    const grossYield = totalPerfFeeRate < 1
      ? Number(netYield) / (1 - totalPerfFeeRate)
      : Number(netYield);

    const govFees = grossYield * perfFeeGovRate;     // DAO treasury
    const stratFees = grossYield * perfFeeStratRate;  // strategist

    dailyFees.add(tokens[i], grossYield, METRIC.ASSETS_YIELDS);
    dailyRevenue.add(tokens[i], govFees + stratFees, METRIC.PERFORMANCE_FEES);
    dailyProtocolRevenue.add(tokens[i], govFees, METRIC.PERFORMANCE_FEES);
    dailySupplySideRevenue.add(tokens[i], Number(netYield), METRIC.ASSETS_YIELDS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2024-03-15",
  methodology: {
    Fees: "Total yield generated by Badger DAO vault strategies (gross, before performance fees) and eBTC redemption/liquidation fees.",
    Revenue: "Performance fees on vault yield (governance + strategist share) and eBTC protocol fees.",
    ProtocolRevenue: "Performance fees sent to the DAO treasury (governance share only) and eBTC protocol fees. Excludes strategist share.",
    SupplySideRevenue: "Net yield earned by vault depositors after performance fees are deducted.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Gross yield generated by vault strategies before performance fees.",
      [METRIC.MINT_REDEEM_FEES]: "Fees from eBTC redemptions and liquidations (stETH collateral).",
    },
    Revenue: {
      [METRIC.PERFORMANCE_FEES]: "Performance fees on vault yield (governance + strategist share).",
      [METRIC.MINT_REDEEM_FEES]: "eBTC redemption/liquidation fees sent to protocol fee recipient.",
    },
    ProtocolRevenue: {
      [METRIC.PERFORMANCE_FEES]: "Governance performance fees sent to DAO treasury.",
      [METRIC.MINT_REDEEM_FEES]: "eBTC fees sent to protocol fee recipient.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Net yield earned by vault depositors after performance fees.",
    }
  },
  allowNegativeValue: true,
}

export default adapter;
