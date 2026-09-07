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

  return logs.map((log: any) => {
    const blockNumber = Number(log?.blockNumber ?? log?.block_number ?? log?.block);
    const logIndex = Number(log?.logIndex ?? log?.log_index ?? log?.index);

    if (!log?.args || !Number.isFinite(blockNumber) || !Number.isFinite(logIndex)) {
      throw new Error("getPositionedLogArgs: decoded log is missing blockNumber, logIndex, or args");
    }

    return { ...log.args, blockNumber, logIndex };
  });
}
