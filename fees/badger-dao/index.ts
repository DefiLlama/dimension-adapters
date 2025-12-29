import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

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
  const dailySupplySideRevenue = options.createBalances()

  const activePoolFeeLogs = await options.getLogs({
    target: "0x6dBDB6D420c110290431E863A1A978AE53F69ebC", // ActivePool 
    eventAbi: "event FeeRecipientClaimableCollSharesIncreased(uint256 _coll, uint256 _fee)"
  })
  for (const log of activePoolFeeLogs) {
    dailyFees.add(stETH, log._fee, METRIC.MINT_REDEEM_FEES);
    dailyRevenue.add(stETH, log._fee, METRIC.MINT_REDEEM_FEES);
  }

  const [controllers, tokens, totalSupplies] = await Promise.all([
    options.api.multiCall({ abi: 'address:controller', calls: vaults, permitFailure: true }),
    options.api.multiCall({ abi: 'address:token', calls: vaults, permitFailure: true }),
    options.api.multiCall({ abi: 'uint256:totalSupply', calls: vaults, permitFailure: true }),
  ]);

  const [fromPrices, toPrices] = await Promise.all([
    options.fromApi.multiCall({ abi: getPricePerFullShareAbi, calls: vaults, permitFailure: true }),
    options.toApi.multiCall({ abi: getPricePerFullShareAbi, calls: vaults, permitFailure: true }),
  ]);

  // remove wBTC wrapper for strategy calls
  const strategyCalls = controllers.slice(1).map((controller: string, i: number) => ({
    target: controller,
    params: [tokens[i + 1]]
  }));

  const [wbtcWithdrawalFee, strategies] = await Promise.all([
    options.api.call({ target: vaults[0], abi: 'uint256:withdrawalFee' }),
    options.api.multiCall({ abi: 'function strategies(address) view returns (address)', calls: strategyCalls, permitFailure: true }),
  ]);

  const [settWithdrawalFees, settPerformanceFeesGov, settPerformanceFeesStrat] = await Promise.all([
    options.api.multiCall({ abi: 'uint256:withdrawalFee', calls: strategies, permitFailure: true }),
    options.api.multiCall({ abi: 'uint256:performanceFeeGovernance', calls: strategies, permitFailure: true }),
    options.api.multiCall({ abi: 'uint256:performanceFeeStrategist', calls: strategies, permitFailure: true }),
  ]);

  // add WBTC wrapper fee values
  const withdrawalFees = [wbtcWithdrawalFee, ...settWithdrawalFees];
  const performanceFeesGov = ['0', ...settPerformanceFeesGov];
  const performanceFeesStrat = ['0', ...settPerformanceFeesStrat];

  for (let i = 0; i < vaults.length; i++) {
    if (!tokens[i] || !totalSupplies[i] || !fromPrices[i] || !toPrices[i]) continue;
    const priceShareGrowth = BigInt(toPrices[i]) - BigInt(fromPrices[i]);

    const totalYield = (BigInt(totalSupplies[i]) * priceShareGrowth) / BigInt(1e18);

    const performanceFeeRate = (Number(performanceFeesGov[i] || 0) + Number(performanceFeesStrat[i] || 0)) / 10000;
    const withdrawalFeeRate = Number(withdrawalFees[i] || 0) / 10000;

    const performanceFees = Number(totalYield) * performanceFeeRate;
    const withdrawalFeesAmount = Number(totalYield) * withdrawalFeeRate;
    const supplySideYield = Number(totalYield) - performanceFees - withdrawalFeesAmount;

    dailyFees.add(tokens[i], Number(totalYield), METRIC.ASSETS_YIELDS);
    dailyRevenue.add(tokens[i], performanceFees, METRIC.PERFORMANCE_FEES);
    dailyRevenue.add(tokens[i], withdrawalFeesAmount, METRIC.DEPOSIT_WITHDRAW_FEES);
    dailySupplySideRevenue.add(tokens[i], supplySideYield, METRIC.ASSETS_YIELDS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2024-03-15",
  methodology: {
    Fees: "Yield generated from supplied assets in the Badger DAO vaults.",
    UserFees: "Fees paid by users when interacting with Badger DAO contracts.",
    Revenue: "All fees paid by users.",
    SupplySideRevenue: "Yield earned by vault depositors.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Yield generated from supplied assets in the Badger DAO vaults.",
      [METRIC.MINT_REDEEM_FEES]: "Fees charged on eBTC redemptions.",
      [METRIC.PERFORMANCE_FEES]: "Performance fees on generated yield in the vault strategies.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Fees charged on vault withdrawals.",
    },
    Revenue: {
      [METRIC.MINT_REDEEM_FEES]: "Fees collected from eBTC redemptions.",
      [METRIC.PERFORMANCE_FEES]: "Fees collected from performance fees in the vault strategies.",
      [METRIC.DEPOSIT_WITHDRAW_FEES]: "Fees collected from vault withdrawals.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Yield earned by vault depositors.",
    }
  },
  allowNegativeValue: true,
}

export default adapter;
