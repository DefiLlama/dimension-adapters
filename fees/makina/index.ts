import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Machines are discovered from MachineCreated events on each hub chain's HubCoreFactory, so new machines are
// covered without adapter changes. The other hub's factory, deployed at the same address, deploys the spoke
// calibers that the other hub's machines run on this chain.
const HUBS: Record<string, { factory: string; fromBlock: number; spokeFactory: { address: string; fromBlock: number }; start: string }> = {
  [CHAIN.ETHEREUM]: {
    factory: "0x8d28A69328561eF9F171c58996fEcB9F494e070c",
    fromBlock: 23426666,
    spokeFactory: { address: "0x1E1fa6F5f258b744881634216bDBc612B09C3C30", fromBlock: 25834668 },
    start: "2025-09-29",
  },
  [CHAIN.BASE]: {
    factory: "0x1E1fa6F5f258b744881634216bDBc612B09C3C30",
    fromBlock: 50872000,
    spokeFactory: { address: "0x8d28A69328561eF9F171c58996fEcB9F494e070c", fromBlock: 35929980 },
    start: "2026-09-04",
  },
};

// Makina treasury, receiving the protocol share of every machine's fees on all chains.
const TREASURY = "0x68825baff4caedf6facc658269cf1a0491f1ba9f";
const ZERO = "0x0000000000000000000000000000000000000000";

const ABI = {
  MachineCreated: "event MachineCreated(address indexed machine, address indexed shareToken)",
  CaliberCreated: "event CaliberCreated(address indexed caliber, address indexed machineEndpoint)",
  FeesMinted: "event FeesMinted(uint256 amount)",
  Transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
  accountingToken: "address:accountingToken",
  hubCaliber: "address:hubCaliber",
  feeManager: "address:feeManager",
  convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)",
  // WatermarkFeeManager
  mgmtFeeRatePerSecond: "uint256:mgmtFeeRatePerSecond",
  mgmtFeeSplitBps: "function mgmtFeeSplitBps() view returns (uint256[])",
  securityModule: "address:securityModule",
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const result = { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  const { factory, fromBlock, spokeFactory } = HUBS[options.chain];
  const [created, spokeCalibers] = await Promise.all([
    options.getLogs({ target: factory, fromBlock, eventAbi: ABI.MachineCreated, cacheInCloud: true }),
    options.getLogs({ target: spokeFactory.address, fromBlock: spokeFactory.fromBlock, eventAbi: ABI.CaliberCreated, cacheInCloud: true }),
  ]);
  const machines: string[] = created.map((log: any) => log.machine.toLowerCase());
  const shareTokens: string[] = created.map((log: any) => log.shareToken);
  if (!machines.length) return result;

  const [accountingTokens, hubCalibers, feeManagers, supplies, shareDecimals] = await Promise.all([
    options.api.multiCall({ abi: ABI.accountingToken, calls: machines }),
    options.api.multiCall({ abi: ABI.hubCaliber, calls: machines }),
    options.toApi.multiCall({ abi: ABI.feeManager, calls: machines }),
    options.toApi.multiCall({ abi: "erc20:totalSupply", calls: shareTokens }),
    options.api.multiCall({ abi: "erc20:decimals", calls: shareTokens }),
  ]);
  const [mgmtRates, mgmtSplits, securityModules] = await Promise.all(
    [ABI.mgmtFeeRatePerSecond, ABI.mgmtFeeSplitBps, ABI.securityModule].map((abi) =>
      options.toApi.multiCall({ abi, calls: feeManagers, permitFailure: true })
    )
  );

  const unitShares = shareDecimals.map((d: string) => 10n ** BigInt(d));
  const [priceBefore, priceAfter] = await Promise.all(
    [options.fromApi, options.toApi].map((api) =>
      api.multiCall({ abi: ABI.convertToAssets, calls: machines.map((target, i) => ({ target, params: [unitShares[i].toString()] })), permitFailure: true })
    )
  );

  // Machines invest in each other: shares held by Makina calibers (hub or spoke) or machines earn yield that
  // already shows up in the holding machine's own share price, so only externally held shares count.
  const holders = [...hubCalibers, ...spokeCalibers.map((log: any) => log.caliber), ...machines];
  const nestedBalances = await options.toApi.multiCall({
    abi: "erc20:balanceOf",
    calls: shareTokens.flatMap((target) => holders.map((holder) => ({ target, params: [holder] }))),
  });

  const [feeLogs, transferLogs] = await Promise.all([
    options.getLogs({ targets: machines, eventAbi: ABI.FeesMinted, flatten: false, onlyArgs: false }),
    options.getLogs({ targets: shareTokens, eventAbi: ABI.Transfer, flatten: false, onlyArgs: false }),
  ]);

  machines.forEach((machine, i) => {
    const token = accountingTokens[i];
    const toAssets = (shares: bigint) => (priceAfter[i] == null ? 0n : (shares * BigInt(priceAfter[i])) / unitShares[i]);

    // depositor yield, net of fees: share price growth over the period times externally held shares
    if (priceBefore[i] != null && priceAfter[i] != null) {
      const nested = nestedBalances.slice(i * holders.length, (i + 1) * holders.length).reduce((sum: bigint, bal: string) => sum + BigInt(bal), 0n);
      const yieldAssets = ((BigInt(priceAfter[i]) - BigInt(priceBefore[i])) * (BigInt(supplies[i]) - nested)) / unitShares[i];
      dailyFees.add(token, yieldAssets, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(token, yieldAssets, METRIC.ASSETS_YIELDS);
    }

    // Fee shares are minted to the machine, then the WatermarkFeeManager transfers them out, in order: the security
    // module fee, one transfer per management fee receiver, then one per performance fee receiver.
    const feeTxs = new Set(feeLogs[i].map((log: any) => log.transactionHash));
    const securityModule = securityModules[i]?.toLowerCase();
    const mgmtTransfers = Number(mgmtRates[i] ?? 0) > 0 ? (mgmtSplits[i] ?? []).filter((bps: string) => Number(bps) > 0).length : 0;
    const byTx: Record<string, any[]> = {};
    for (const log of transferLogs[i]) {
      const { from, to } = log.args;
      if (!feeTxs.has(log.transactionHash) || from.toLowerCase() !== machine || to === ZERO) continue;
      (byTx[log.transactionHash] = byTx[log.transactionHash] || []).push(log);
    }

    for (const logs of Object.values(byTx)) {
      logs.sort((a, b) => Number(a.logIndex) - Number(b.logIndex));
      let position = 0;
      for (const log of logs) {
        const to = log.args.to.toLowerCase();
        const assets = toAssets(BigInt(log.args.value));
        if (to === securityModule) {
          dailyFees.add(token, assets, METRIC.MANAGEMENT_FEES);
          dailySupplySideRevenue.add(token, assets, METRIC.STAKING_REWARDS);
          continue;
        }
        const label = position++ < mgmtTransfers ? METRIC.MANAGEMENT_FEES : METRIC.PERFORMANCE_FEES;
        dailyFees.add(token, assets, label);
        if (to === TREASURY) dailyRevenue.add(token, assets, label);
        else dailySupplySideRevenue.add(token, assets, METRIC.OPERATORS_FEES);
      }
    }
  });

  return result;
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true, // vault yield can be negative
  adapter: Object.fromEntries(Object.entries(HUBS).map(([chain, { start }]) => [chain, { fetch, start }])),
  methodology: {
    Fees: "Yield earned by Makina machine depositors, plus the management and performance fees minted by machines.",
    Revenue: "Makina treasury share of the management and performance fees.",
    ProtocolRevenue: "Makina treasury share of the management and performance fees.",
    SupplySideRevenue: "Yield earned by machine depositors after fees, plus the operators' and security module's share of the fees.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Share price growth of each machine times the shares not held by other Makina machines or calibers, net of fees.",
      [METRIC.MANAGEMENT_FEES]: "Time-based management (and security module) fee shares minted by machines, valued at the machine share price.",
      [METRIC.PERFORMANCE_FEES]: "Performance fee shares minted by machines on share price gains above the watermark, valued at the machine share price.",
    },
    Revenue: {
      [METRIC.MANAGEMENT_FEES]: "Management fee shares transferred to the Makina treasury.",
      [METRIC.PERFORMANCE_FEES]: "Performance fee shares transferred to the Makina treasury.",
    },
    ProtocolRevenue: {
      [METRIC.MANAGEMENT_FEES]: "Management fee shares transferred to the Makina treasury.",
      [METRIC.PERFORMANCE_FEES]: "Performance fee shares transferred to the Makina treasury.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Yield earned by machine depositors after fees.",
      [METRIC.OPERATORS_FEES]: "Management and performance fee shares paid to machine operators.",
      [METRIC.STAKING_REWARDS]: "Management fee shares paid to the machine's security module.",
    },
  },
};

export default adapter;
