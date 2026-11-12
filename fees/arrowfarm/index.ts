import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";

// Arrowfarm is a Beefy CLM fork on Robinhood Chain (chain id 4663).
// Strategies are deployed by the StrategyFactory, which emits ProxyCreated for each one.
// https://robinhoodchain.blockscout.com/address/0xd626504db63FBe10Ea98a99f52717c5315e9eD46
const STRATEGY_FACTORY = "0xd626504db63FBe10Ea98a99f52717c5315e9eD46";
// Block of the StrategyFactory deployment (same start block as the merged Arrowfarm TVL adapter in DefiLlama-Adapters)
const FACTORY_FROM_BLOCK = 67634274;
// WETH on Robinhood Chain, the token every performance fee is charged in
const WETH = ADDRESSES.robinhood.WETH;
// ArrowBuybackBurner receives the arrowFee WETH, buys ARROWFARM and burns it.
// https://robinhoodchain.blockscout.com/address/0xd6BF871252d442C1ebBC94333f60e1823ef44cE7
const BUYBACK_BURNER = "0xd6BF871252d442C1ebBC94333f60e1823ef44cE7";
// ERC4626 vaults that mint fee shares on yield above a high-water mark to a FeeCollector routing to BUYBACK_BURNER
const SINGLE_ASSET_STRATEGIES = new Set([
  "morpho-steakhouse-usdg-v1", // deposits USDG into the Steakhouse USDG Morpho vault
]);

const proxyCreatedAbi = "event ProxyCreated(string strategyName, address proxy)";
const feeAccruedAbi = "event FeeAccrued(uint256 feeShares, uint256 totalAssets, uint256 totalSupply)";
const chargedFeesAbi = "event ChargedFees(uint256 callFeeAmount, uint256 arrowFeeAmount, uint256 strategistFeeAmount)";
const harvestAbi = "event Harvest(uint256 fee0, uint256 fee1)";
const sentFeesToTreasuryAbi = "event SentFeesToTreasury(uint256 fee0, uint256 fee1)";
const vaultAbi = "address:vault";
const wantsAbi = "function wants() view returns (address token0, address token1)";

const LABELS = {
  LP_FEES: METRIC.LP_FEES,
  YIELD: METRIC.ASSETS_YIELDS,
  PERFORMANCE_FEES: METRIC.PERFORMANCE_FEES,
  BUYBACK: METRIC.TOKEN_BUY_BACK,
  TREASURY: METRIC.PROTOCOL_FEES,
  CALLER: METRIC.OPERATORS_FEES,
};

const HARVEST_LABEL: Record<string, string> = {
  "uniswap-v1": LABELS.LP_FEES, // LP trading fees
  "fables-v1": LABELS.LP_FEES,
  "fables-native-v1": LABELS.LP_FEES,
  "velodrome-v1": LABELS.YIELD, // gauge rewards
  "ramses-v1": LABELS.YIELD, // LP trading fees plus RAM gauge rewards, not separable in Harvest
};

/**
 * Reads one window of Arrowfarm strategy events (Harvest, ChargedFees, SentFeesToTreasury)
 * and maps them to fees, revenue and supply side so that fees = revenue + supply side.
 */
async function fetch(options: FetchOptions) {
  const { api, getLogs, createBalances } = options;

  // Strategy discovery from the factory. The scan is small and append-only, so it is cached in cloud.
  const proxyLogs = await getLogs({
    target: STRATEGY_FACTORY,
    eventAbi: proxyCreatedAbi,
    fromBlock: FACTORY_FROM_BLOCK,
    cacheInCloud: true,
  });
  const harvestLabelOf: Record<string, string> = {};
  const singleAssetStrategies: string[] = [];
  for (const l of proxyLogs) {
    const name = String(l.strategyName);
    if (SINGLE_ASSET_STRATEGIES.has(name)) singleAssetStrategies.push(l.proxy);
    else if (name in HARVEST_LABEL) harvestLabelOf[l.proxy.toLowerCase()] = HARVEST_LABEL[name];
    else throw new Error(`arrowfarm: unknown strategy type ${name} at ${l.proxy}`);
  }
  const addresses = Object.keys(harvestLabelOf);

  const vaults = await api.multiCall({ abi: vaultAbi, calls: addresses });
  const wants = await api.multiCall({ abi: wantsAbi, calls: vaults });
  const tokensOf: Record<string, [string, string]> = {};
  addresses.forEach((a, i) => (tokensOf[a] = [wants[i].token0, wants[i].token1]));

  const logOpts = { entireLog: true, parseLog: true } as const;
  // getLogs throws on an empty target list (no strategy existed in the first hours)
  const logsOf = async (eventAbi: string): Promise<any[]> =>
    addresses.length ? getLogs({ targets: addresses, eventAbi, ...logOpts }) : [];
  const harvests = await logsOf(harvestAbi);
  const charged = await logsOf(chargedFeesAbi);
  const sentToTreasury = await logsOf(sentFeesToTreasuryAbi);

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const addPair = (balances: any, strategy: string, args: any, label: string) => {
    const [token0, token1] = tokensOf[strategy.toLowerCase()];
    balances.add(token0, args.fee0, label);
    balances.add(token1, args.fee1, label);
  };

  // Harvest is the post-fee share that stays with vault depositors
  for (const log of harvests) {
    const label = harvestLabelOf[log.address.toLowerCase()];
    addPair(dailyFees, log.address, log.args, label);
    addPair(dailySupplySideRevenue, log.address, log.args, label);
  }
  // ChargedFees is the performance fee taken on top of Harvest, paid in WETH
  for (const log of charged) {
    const { callFeeAmount, arrowFeeAmount, strategistFeeAmount } = log.args;
    const total = BigInt(callFeeAmount) + BigInt(arrowFeeAmount) + BigInt(strategistFeeAmount);
    dailyFees.add(WETH, total, LABELS.PERFORMANCE_FEES);
    // the harvest caller fee goes to the harvester, a cost of the protocol, not revenue
    dailySupplySideRevenue.add(WETH, callFeeAmount, LABELS.CALLER);
    dailyRevenue.add(WETH, arrowFeeAmount, LABELS.PERFORMANCE_FEES);
    dailyRevenue.add(WETH, strategistFeeAmount, LABELS.PERFORMANCE_FEES);
    dailyHoldersRevenue.add(WETH, arrowFeeAmount, LABELS.BUYBACK);
    dailyProtocolRevenue.add(WETH, strategistFeeAmount, LABELS.PERFORMANCE_FEES);
  }

  // Strategies that send 100% of trading fees to the treasury (Harvest is (0,0) for them).
  for (const log of sentToTreasury) {
    addPair(dailyFees, log.address, log.args, LABELS.LP_FEES);
    addPair(dailyRevenue, log.address, log.args, LABELS.TREASURY);
    addPair(dailyProtocolRevenue, log.address, log.args, LABELS.TREASURY);
  }

  if (singleAssetStrategies.length) {
    const vaults = (await api.multiCall({ abi: vaultAbi, calls: singleAssetStrategies })).map((v: string) => v.toLowerCase());
    const assets = await api.multiCall({ abi: "address:asset", calls: vaults });
    const feeBps = await api.multiCall({ abi: "uint256:appliedFeeBps", calls: vaults });
    const feeAccrued = await getLogs({ targets: vaults, eventAbi: feeAccruedAbi, ...logOpts });
    for (const log of feeAccrued) {
      const i = vaults.indexOf(log.address.toLowerCase());
      const { feeShares, totalAssets, totalSupply } = log.args;
      const fee = (BigInt(feeShares) * BigInt(totalAssets)) / BigInt(totalSupply);
      if (fee === 0n) continue;
      const bps = BigInt(feeBps[i]);
      if (bps === 0n) throw new Error(`arrowfarm: fee accrued on ${log.address} with appliedFeeBps 0`);
      // fee is bps of the profit, the rest stays with depositors
      const depositorYield = (fee * (10000n - bps)) / bps;
      dailyFees.add(assets[i], depositorYield, LABELS.YIELD);
      dailySupplySideRevenue.add(assets[i], depositorYield, LABELS.YIELD);
      dailyFees.add(assets[i], fee, LABELS.PERFORMANCE_FEES);
      dailyRevenue.add(assets[i], fee, LABELS.PERFORMANCE_FEES);
      dailyHoldersRevenue.add(assets[i], fee, LABELS.BUYBACK);
    }
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
}

const methodology = {
  Fees: "All yield generated by Arrowfarm vaults: LP trading fees and gauge rewards harvested by the concentrated liquidity strategies, Morpho lending yield earned by single-asset vaults, the performance fee charged on them, and trading fees sent straight to the treasury.",
  Revenue: "Performance fees charged on harvests (arrow fee and strategist fee, paid in WETH), the performance fee single-asset vaults mint as vault shares, plus trading fees that strategies send to the treasury. The harvest caller fee is not counted as revenue.",
  ProtocolRevenue: "Strategist performance fees and trading fees sent to the Arrowfarm treasury.",
  HoldersRevenue: "The arrow performance fee in WETH is sent to the ArrowBuybackBurner, which buys ARROWFARM and burns it. Single-asset vault performance fees are minted as vault shares to a FeeCollector whose burner is the ArrowBuybackBurner, counted when they accrue.",
  SupplySideRevenue: "Yield that stays with vault depositors after the performance fee (LP trading fees, gauge rewards and Morpho lending yield), plus the harvest caller fee paid to whoever calls harvest.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.LP_FEES]: "LP trading fees harvested by Uniswap and Fables strategies, net of the performance fee, plus trading fees sent to the treasury.",
    [LABELS.YIELD]: "Velodrome gauge rewards, and Ramses LP trading fees plus RAM gauge rewards, harvested and converted to the vault tokens, plus Morpho lending yield of single-asset vaults above their high-water mark, net of the performance fee.",
    [LABELS.PERFORMANCE_FEES]: "Performance fee charged on harvests, paid in WETH: taken from trading fees on Uniswap, Fables and Ramses strategies and from gauge rewards on Velodrome strategies. Single-asset vaults charge it on yield above the share-price high-water mark, minted as vault shares.",
  },
  Revenue: {
    [LABELS.PERFORMANCE_FEES]: "Arrow and strategist performance fees charged on harvests, paid in WETH, plus single-asset vault performance fees minted as vault shares.",
    [LABELS.TREASURY]: "Trading fees sent to the Arrowfarm treasury by treasury-routed strategies.",
  },
  ProtocolRevenue: {
    [LABELS.PERFORMANCE_FEES]: "Strategist performance fees charged on harvests, paid in WETH.",
    [LABELS.TREASURY]: "Trading fees sent to the Arrowfarm treasury by treasury-routed strategies.",
  },
  HoldersRevenue: {
    [LABELS.BUYBACK]: `Arrow performance fees in WETH sent to the ArrowBuybackBurner (${BUYBACK_BURNER}) to buy and burn ARROWFARM, plus single-asset vault fee shares minted to the FeeCollector that routes them to it.`,
  },
  SupplySideRevenue: {
    [LABELS.LP_FEES]: "LP trading fees harvested by Uniswap and Fables strategies and retained by vault depositors, net of the performance fee.",
    [LABELS.YIELD]: "User share of Velodrome gauge rewards, of Ramses LP trading fees plus RAM gauge rewards, and of Morpho lending yield in single-asset vaults.",
    [LABELS.CALLER]: "Harvest caller fee in WETH paid to the account that calls harvest (0 since launch).",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-09-21",
  methodology,
  breakdownMethodology,
  // LP trading fees and Morpho interest are also counted by the underlying listings
  doublecounted: true,
};

export default adapter;
