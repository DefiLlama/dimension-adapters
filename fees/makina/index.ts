import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Machines are discovered from MachineCreated events on each hub chain's HubCoreFactory,
// so new machines are covered without adapter changes.
const HUBS: Record<string, { factory: string; fromBlock: number; start: string }> = {
  [CHAIN.ETHEREUM]: { factory: "0x8d28A69328561eF9F171c58996fEcB9F494e070c", fromBlock: 23426666, start: "2025-09-29" },
  [CHAIN.BASE]: { factory: "0x1E1fa6F5f258b744881634216bDBc612B09C3C30", fromBlock: 50872000, start: "2026-09-04" },
};

// Makina treasury, receiving the protocol share of every machine's fees on all chains.
const TREASURY = "0x68825BAfF4CaEDf6fAcc658269Cf1a0491F1Ba9f";

const ABI = {
  MachineCreated: "event MachineCreated(address indexed machine, address indexed shareToken)",
  FeesMinted: "event FeesMinted(uint256 amount)",
  Transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
  accountingToken: "address:accountingToken",
  hubCaliber: "address:hubCaliber",
  convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)",
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { factory, fromBlock } = HUBS[options.chain];
  const created = await options.getLogs({ target: factory, fromBlock, eventAbi: ABI.MachineCreated, cacheInCloud: true });
  const machines: string[] = created.map((log: any) => log.machine);
  const shareTokens: string[] = created.map((log: any) => log.shareToken);
  if (!machines.length) return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };

  const [accountingTokens, hubCalibers, supplies, shareDecimals] = await Promise.all([
    options.api.multiCall({ abi: ABI.accountingToken, calls: machines }),
    options.api.multiCall({ abi: ABI.hubCaliber, calls: machines }),
    options.toApi.multiCall({ abi: "erc20:totalSupply", calls: shareTokens }),
    options.api.multiCall({ abi: "erc20:decimals", calls: shareTokens }),
  ]);

  // Machines invest in each other: shares held by Makina hub calibers earn yield that already shows up in the
  // holding machine's own share price, so only externally held shares count towards depositor yield.
  const nestedBalances = await options.toApi.multiCall({
    abi: "erc20:balanceOf",
    calls: shareTokens.flatMap((target) => hubCalibers.map((holder: string) => ({ target, params: [holder] }))),
  });

  // Fee shares are minted to the machine, which then transfers them to the fee receivers (treasury and operators).
  const [feeLogs, transferLogs] = await Promise.all([
    options.getLogs({ targets: machines, eventAbi: ABI.FeesMinted, flatten: false }),
    options.getLogs({ targets: shareTokens, eventAbi: ABI.Transfer, flatten: false }),
  ]);

  const unitShares = shareDecimals.map((d: string) => (10n ** BigInt(d)).toString());
  const [priceBefore, priceAfter] = await Promise.all(
    [options.fromApi, options.toApi].map((api) =>
      api.multiCall({ abi: ABI.convertToAssets, calls: machines.map((target, i) => ({ target, params: [unitShares[i]] })), permitFailure: true })
    )
  );

  const feeShares: bigint[] = feeLogs.map((logs: any[]) => logs.reduce((sum, log) => sum + BigInt(log.amount), 0n));
  const protocolShares: bigint[] = transferLogs.map((logs: any[], i: number) =>
    logs
      .filter((log) => log.from.toLowerCase() === machines[i].toLowerCase() && log.to.toLowerCase() === TREASURY.toLowerCase())
      .reduce((sum, log) => sum + BigInt(log.value), 0n)
  );
  const [feeAssets, protocolAssets] = await Promise.all(
    [feeShares, protocolShares].map((shares) =>
      options.toApi.multiCall({ abi: ABI.convertToAssets, calls: machines.map((target, i) => ({ target, params: [shares[i].toString()] })) })
    )
  );

  machines.forEach((_, i) => {
    const token = accountingTokens[i];

    // depositor yield, net of fees: share price growth over the period times externally held shares
    if (priceBefore[i] != null && priceAfter[i] != null) {
      const nested = nestedBalances.slice(i * hubCalibers.length, (i + 1) * hubCalibers.length).reduce((sum: bigint, bal: string) => sum + BigInt(bal), 0n);
      const externalShares = BigInt(supplies[i]) - nested;
      const yieldAssets = ((BigInt(priceAfter[i]) - BigInt(priceBefore[i])) * externalShares) / BigInt(unitShares[i]);
      dailyFees.add(token, yieldAssets, METRIC.ASSETS_YIELDS);
      dailySupplySideRevenue.add(token, yieldAssets, METRIC.ASSETS_YIELDS);
    }

    // management and performance fees, split between the Makina treasury and the machine's operators
    const operatorAssets = BigInt(feeAssets[i]) - BigInt(protocolAssets[i]);
    dailyFees.add(token, protocolAssets[i], METRIC.PROTOCOL_FEES);
    dailyRevenue.add(token, protocolAssets[i], METRIC.PROTOCOL_FEES);
    dailyFees.add(token, operatorAssets, METRIC.OPERATORS_FEES);
    dailySupplySideRevenue.add(token, operatorAssets, METRIC.OPERATORS_FEES);
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
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
    SupplySideRevenue: "Yield earned by machine depositors after fees, plus the operators' share of the management and performance fees.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.ASSETS_YIELDS]: "Share price growth of each machine times the shares not held by other Makina machines, net of fees.",
      [METRIC.PROTOCOL_FEES]: "Fee shares transferred from machines to the Makina treasury, valued at the machine share price.",
      [METRIC.OPERATORS_FEES]: "Remaining fee shares (FeesMinted minus the treasury share), paid to machine operators.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Fee shares transferred from machines to the Makina treasury.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Fee shares transferred from machines to the Makina treasury.",
    },
    SupplySideRevenue: {
      [METRIC.ASSETS_YIELDS]: "Yield earned by machine depositors after fees.",
      [METRIC.OPERATORS_FEES]: "Fee shares paid to machine operators.",
    },
  },
};

export default adapter;
