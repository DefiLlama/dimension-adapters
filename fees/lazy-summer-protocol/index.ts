import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const harborCommands: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: ["0x09eb323dBFECB43fd746c607A9321dACdfB0140F"],
  [CHAIN.BASE]: ["0x09eb323dBFECB43fd746c607A9321dACdfB0140F"],
  [CHAIN.ARBITRUM]: [
    "0x09eb323dBFECB43fd746c607A9321dACdfB0140F",
    "0x7fBfb946cA4ba96559467E84ef41DA6cfE0C9a17",
  ],
  [CHAIN.SONIC]: ["0xa8E4716a1e8Db9dD79f1812AF30e073d3f4Cf191"],
  [CHAIN.HYPERLIQUID]: ["0x5CD5D7e3A1b604E0EdeDc4A2343b312729e09E3F"],
};

const abi = {
  getActiveFleetCommanders:
    "function getActiveFleetCommanders() view returns (address[])",
  asset: "function asset() view returns (address)",
  convertToAssets:
    "function convertToAssets(uint256 shares) view returns (uint256)",
};

const uniq = (items: string[]) => [...new Set(items)];

function buildFetch(commands: string[]) {
  return async (options: FetchOptions): Promise<FetchResultV2> => {
    console.log("[lazy-summer] buildFetch called");
    const { api } = options;

    console.log("[lazy-summer] chain", options.chain, {
      start: options.startTimestamp,
      startFormatted: new Date(options.startTimestamp * 1000).toISOString(),
      end: options.endTimestamp,
      endFormatted: new Date(options.endTimestamp * 1000).toISOString(),
      commands,
    });

    const [fromBlock, toBlock] = await Promise.all([
      options.getFromBlock(),
      options.getToBlock(),
    ]);
    console.log("[lazy-summer] blocks", { fromBlock, toBlock });

    const activePerCommand = (await api.multiCall({
      abi: abi.getActiveFleetCommanders,
      calls: commands,
      permitFailure: true,
    })) as string[][];

    const fleetCommanders: string[] = [];

    activePerCommand.forEach((fleetList, idx) => {
      const activeFleet = (fleetList || []).filter(Boolean);
      if (!activeFleet.length) return;
      fleetCommanders.push(...activeFleet);
      console.log(
        "[lazy-summer] harbor command",
        commands[idx],
        "fleetCommanders",
        activeFleet,
      );
    });

    if (!fleetCommanders.length) {
      const empty = options.createBalances();
      return {
        dailyFees: empty,
        dailyRevenue: empty,
        dailyProtocolRevenue: empty,
        timestamp: options.endTimestamp,
      };
    }

    const assets = await api.multiCall({
      abi: abi.asset,
      calls: fleetCommanders,
      permitFailure: true,
    });

    const fleetAssets = fleetCommanders
      .map((fleet, idx) => ({ fleet, asset: assets[idx] }))
      .filter(({ fleet, asset }) => !!fleet && !!asset);

    const tokens = uniq(fleetAssets.map(({ asset }) => asset as string));

    console.log("[lazy-summer] assets", assets);
    console.log("[lazy-summer] tokens", tokens);

    if (!fleetAssets.length || !tokens.length) {
      const empty = options.createBalances();
      return {
        dailyFees: empty,
        dailyRevenue: empty,
        dailyProtocolRevenue: empty,
        timestamp: options.endTimestamp,
      };
    }

    const dailyFees = options.createBalances();

    const tipAccruedLogs = await options.getLogs({
      targets: fleetAssets.map(({ fleet }) => fleet),
      flatten: false,
      fromBlock,
      toBlock,
      eventAbi: "event TipAccrued(uint256 tipAmount)",
    });

    console.log(
      "[lazy-summer] TipAccrued logs per fleet",
      tipAccruedLogs.map((arr: any[]) => arr.length),
    );

    const sharesPerFleet: bigint[] = Array(fleetAssets.length).fill(0n);

    tipAccruedLogs.forEach((logsForFleet: any[], idx: number) => {
      logsForFleet.forEach((log) => {
        const amount = BigInt(log.tipAmount?.toString?.() ?? "0");
        sharesPerFleet[idx] += amount;
      });
    });

    const assetsFromShares = await api.multiCall({
      abi: abi.convertToAssets,
      calls: sharesPerFleet.map((shares, idx) => ({
        target: fleetAssets[idx].fleet,
        params: [shares.toString()],
      })),
      block: toBlock,
      permitFailure: true,
    });

    assetsFromShares.forEach((assetAmount, idx) => {
      const amount = BigInt(assetAmount?.toString?.() ?? "0");
      if (amount === 0n) return;
      const token = fleetAssets[idx].asset as string;
      dailyFees.add(token, amount);
    });

    console.log("[lazy-summer] dailyFees raw", dailyFees.getBalances());

    const dailyRevenue = dailyFees.clone(0.3); // 30% to treasury + stakers
    const dailyProtocolRevenue = dailyFees.clone(0.1); // 10% retained by treasury

    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
      timestamp: options.endTimestamp,
    };
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {},
  methodology: {
    Fees: "TipAccrued share amounts emitted by active FleetCommanders, converted to vault assets via convertToAssets and summed per underlying asset token.",
    Revenue:
      "30% of tips flow to the DAO treasury (of which 66.6% is forwarded to SUMR stakers).",
    ProtocolRevenue:
      "10% of tips (the remaining treasury share after distributing 20% to SUMR stakers).",
  },
  start: "2025-02-10",
};

Object.entries(harborCommands).forEach(([chain, commands]) => {
  const fetch = buildFetch(commands);
  if (!adapter.adapter) adapter.adapter = {};
  adapter.adapter[chain] = { fetch };
});

export default adapter;
