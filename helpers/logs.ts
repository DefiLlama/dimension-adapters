import { FetchGetLogsOptions, FetchOptions } from "../adapters/types";

export type PositionedLogArgs = Record<string, any> & {
  blockNumber: number;
  logIndex: number;
};

type PositionedLogOptions = Omit<FetchGetLogsOptions, "eventAbi" | "flatten" | "onlyArgs"> & {
  eventAbi: string;
  flatten?: true;
  onlyArgs?: never;
};

/**
 * Fetch decoded event arguments together with their on-chain position.
 *
 * FetchOptions.getLogs defaults to decoded arguments only, which omits log
 * metadata. Callers that replay configuration changes need the block and log
 * index as well as the decoded arguments to preserve event ordering.
 */
export async function getPositionedLogArgs(
  options: Pick<FetchOptions, "getLogs">,
  params: PositionedLogOptions,
): Promise<PositionedLogArgs[]> {
  const logs = await options.getLogs({ ...params, onlyArgs: false });

  return logs.map(toPositionedLogArgs);
}

/**
 * Wrap FetchOptions.getLogs for RPCs that silently return at most `cap` logs per request
 * (blockscout's eth-rpc proxy, e.g. SOMNIA_ARCHIVAL_RPC), so busy windows are not undercounted.
 *
 * Each target is fetched on its own, and a block range that comes back near the cap is halved
 * until every piece is under it. The SDK pads each request by a few blocks and drops the padding,
 * so a capped reply can arrive slightly under the cap: splitting at 90% of it leaves room for that.
 * The local log cache is skipped, otherwise a capped reply would be cached and served again for
 * the smaller ranges.
 */
export function getLogsSplitAtCap(options: FetchOptions, cap = 1000): FetchOptions["getLogs"] {
  const splitAt = cap * 0.9;

  const getRangeLogs = async (params: FetchGetLogsOptions, fromBlock: number, toBlock: number): Promise<any[]> => {
    const logs = await options.getLogs({ ...params, fromBlock, toBlock, skipCache: true });
    if (logs.length < splitAt) return logs;
    if (toBlock <= fromBlock) throw new Error(`getLogsSplitAtCap: ${logs.length} logs from ${params.target} in block ${fromBlock}, cannot split further`);
    const midBlock = Math.floor((fromBlock + toBlock) / 2);
    return [...await getRangeLogs(params, fromBlock, midBlock), ...await getRangeLogs(params, midBlock + 1, toBlock)];
  };

  return async ({ target, targets, flatten = true, fromBlock, toBlock, ...params }: FetchGetLogsOptions) => {
    if (!target && !targets) throw new Error("getLogsSplitAtCap: pass target or targets");
    fromBlock = fromBlock ?? await options.getFromBlock();
    toBlock = toBlock ?? await options.getToBlock();
    const results = [];
    for (const _target of targets ?? [target]) results.push(await getRangeLogs({ ...params, target: _target }, fromBlock, toBlock));
    if (!targets) return results[0];
    return flatten ? results.flat() : results;
  };
}

export function toPositionedLogArgs(log: any): PositionedLogArgs {
  const blockNumber = Number(log?.blockNumber ?? log?.block_number ?? log?.block);
  const logIndex = Number(log?.logIndex ?? log?.log_index ?? log?.index);

  if (!log?.args || !Number.isFinite(blockNumber) || !Number.isFinite(logIndex)) {
    throw new Error("getPositionedLogArgs: decoded log is missing blockNumber, logIndex, or args");
  }

  return { ...log.args, blockNumber, logIndex };
}
