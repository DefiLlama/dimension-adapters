import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Arrowfarm is a Beefy CLM fork on Robinhood Chain (chain id 4663).
// Strategies are deployed by the StrategyFactory, which emits ProxyCreated for each one.
// https://robinhoodchain.blockscout.com/address/0xd626504db63FBe10Ea98a99f52717c5315e9eD46
const STRATEGY_FACTORY = "0xd626504db63FBe10Ea98a99f52717c5315e9eD46";
// Block of the StrategyFactory deployment (same start block as the merged Arrowfarm TVL adapter in DefiLlama-Adapters)
const FACTORY_FROM_BLOCK = 67634274;
// WETH on Robinhood Chain, the token every performance fee is charged in
// https://robinhoodchain.blockscout.com/address/0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
// ArrowBuybackBurner receives the arrowFee WETH, buys ARROWFARM and burns it.
// https://robinhoodchain.blockscout.com/address/0xd6BF871252d442C1ebBC94333f60e1823ef44cE7
const BUYBACK_BURNER = "0xd6BF871252d442C1ebBC94333f60e1823ef44cE7";

const proxyCreatedAbi = "event ProxyCreated(string strategyName, address proxy)";
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

// Harvest semantics differ per strategy type, so an unknown type must fail loudly
// rather than be counted with the wrong formula.
const POST_FEE_HARVEST: Record<string, boolean> = {
  "uniswap-v1": false, // Harvest is gross LP trading fees, the charged part included
  "fables-v1": false, // same contract shape as uniswap-v1
  "fables-native-v1": false,
  "velodrome-v1": true, // Harvest is the post-fee user share of the gauge reward
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
  const strategies: { address: string; velodrome: boolean }[] = proxyLogs.map((l: any) => {
    const name = String(l.strategyName);
    if (!(name in POST_FEE_HARVEST)) throw new Error(`arrowfarm: unknown strategy type ${name} at ${l.proxy}`);
    return { address: l.proxy.toLowerCase(), velodrome: POST_FEE_HARVEST[name] };
  });
  const addresses = strategies.map((s) => s.address);

  const vaults = await api.multiCall({ abi: vaultAbi, calls: addresses });
  const wants = await api.multiCall({ abi: wantsAbi, calls: vaults });
  const tokensOf: Record<string, [string, string]> = {};
  addresses.forEach((a, i) => (tokensOf[a] = [wants[i].token0, wants[i].token1]));

  const uniTargets = strategies.filter((s) => !s.velodrome).map((s) => s.address);
  const veloTargets = strategies.filter((s) => s.velodrome).map((s) => s.address);

  const logOpts = { entireLog: true, parseLog: true } as const;
  // getLogs throws on an empty target list (no Velodrome strategy existed on the first days)
  const logsOf = async (targets: string[], eventAbi: string): Promise<any[]> =>
    targets.length ? getLogs({ targets, eventAbi, ...logOpts }) : [];
  const uniHarvests = await logsOf(uniTargets, harvestAbi);
  const veloHarvests = await logsOf(veloTargets, harvestAbi);
  const uniCharged = await logsOf(uniTargets, chargedFeesAbi);
  const veloCharged = await logsOf(veloTargets, chargedFeesAbi);
  const sentToTreasury = await logsOf(uniTargets, sentFeesToTreasuryAbi);

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

  // uniswap-*, fables-*: Harvest is GROSS LP trading fees, the charged part is included.
  // The charged WETH is removed from the supply side below, never added to fees again.
  for (const log of uniHarvests) {
    addPair(dailyFees, log.address, log.args, LABELS.LP_FEES);
    addPair(dailySupplySideRevenue, log.address, log.args, LABELS.LP_FEES);
  }
  for (const log of uniCharged) {
    const { callFeeAmount, arrowFeeAmount, strategistFeeAmount } = log.args;
    const charged = BigInt(callFeeAmount) + BigInt(arrowFeeAmount) + BigInt(strategistFeeAmount);
    dailySupplySideRevenue.add(WETH, -charged, LABELS.LP_FEES);
    // the harvest caller fee goes to the harvester, a cost of the protocol, not revenue
    dailySupplySideRevenue.add(WETH, callFeeAmount, LABELS.CALLER);
    dailyRevenue.add(WETH, arrowFeeAmount, LABELS.PERFORMANCE_FEES);
    dailyRevenue.add(WETH, strategistFeeAmount, LABELS.PERFORMANCE_FEES);
    dailyHoldersRevenue.add(WETH, arrowFeeAmount, LABELS.BUYBACK);
    dailyProtocolRevenue.add(WETH, strategistFeeAmount, LABELS.PERFORMANCE_FEES);
  }

  // velodrome-*: Harvest is the POST-fee user share of the gauge reward, ChargedFees is the cut on top.
  for (const log of veloHarvests) {
    addPair(dailyFees, log.address, log.args, LABELS.YIELD);
    addPair(dailySupplySideRevenue, log.address, log.args, LABELS.YIELD);
  }
  for (const log of veloCharged) {
    const { callFeeAmount, arrowFeeAmount, strategistFeeAmount } = log.args;
    const charged = BigInt(callFeeAmount) + BigInt(arrowFeeAmount) + BigInt(strategistFeeAmount);
    dailyFees.add(WETH, charged, LABELS.PERFORMANCE_FEES);
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

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
}

const methodology = {
  Fees: "All yield generated by Arrowfarm concentrated liquidity vaults: LP trading fees harvested by Uniswap and Fables strategies (gross, before the performance fee), gauge rewards harvested by Velodrome strategies plus the performance fee charged on them, and trading fees sent straight to the treasury.",
  Revenue: "Performance fees charged on harvests (arrow fee and strategist fee, paid in WETH) plus trading fees that strategies send to the treasury. The harvest caller fee is not counted as revenue.",
  ProtocolRevenue: "Strategist performance fees and trading fees sent to the Arrowfarm treasury.",
  HoldersRevenue: "The arrow performance fee in WETH is sent to the ArrowBuybackBurner, which buys ARROWFARM and burns it.",
  SupplySideRevenue: "Yield that stays with vault depositors (gross harvested trading fees minus the performance fee, and the user share of Velodrome gauge rewards), plus the harvest caller fee paid to whoever calls harvest.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.LP_FEES]: "LP trading fees harvested by Uniswap and Fables strategies (gross, before the performance fee), plus trading fees sent to the treasury.",
    [LABELS.YIELD]: "Velodrome gauge rewards harvested and converted to the vault tokens, net of the performance fee.",
    [LABELS.PERFORMANCE_FEES]: "Performance fee charged on Velodrome gauge rewards, paid in WETH.",
  },
  Revenue: {
    [LABELS.PERFORMANCE_FEES]: "Arrow and strategist performance fees charged on harvests, paid in WETH.",
    [LABELS.TREASURY]: "Trading fees sent to the Arrowfarm treasury by treasury-routed strategies.",
  },
  ProtocolRevenue: {
    [LABELS.PERFORMANCE_FEES]: "Strategist performance fees charged on harvests, paid in WETH.",
    [LABELS.TREASURY]: "Trading fees sent to the Arrowfarm treasury by treasury-routed strategies.",
  },
  HoldersRevenue: {
    [LABELS.BUYBACK]: `Arrow performance fees in WETH sent to the ArrowBuybackBurner (${BUYBACK_BURNER}) to buy and burn ARROWFARM.`,
  },
  SupplySideRevenue: {
    [LABELS.LP_FEES]: "LP trading fees retained by vault depositors, net of the performance fee.",
    [LABELS.YIELD]: "User share of Velodrome gauge rewards.",
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
  // LP trading fees are also counted by the underlying DEX listings
  doublecounted: true,
  allowNegativeValue: true, // per-hour supply side nets WETH charged against gross harvests held in other tokens
};

export default adapter;
