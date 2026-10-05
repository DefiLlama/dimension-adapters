import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived } from "../token";

/**
 * Engine behind `factory/evmBridges.ts`. Adapters do not import this directly: a plain bridge is one
 * config entry in the factory, anything that needs custom code is a standalone file in `bridges/`.
 * See `bridges/AGENTS.md` for the counting rules.
 *
 * Per chain, "outgoing" is value deposited into the bridge on that chain (leaving it) and
 * "incoming" is value withdrawn from the bridge on that chain (arriving on it). Each chain reads only
 * its own events and wallet transfers. Bridges that only emit on one chain (canonical L2 bridges)
 * record that chain alone; the destination leg is attributed server-side from the bridge's declared
 * destination chain, never inferred here.
 */

export type BridgeDirection = "outgoing" | "incoming";

export type BridgeEvent = {
  eventAbi: string;
  targets: string[];
  /** 'outgoing' = deposit into the bridge on this chain, 'incoming' = withdrawal from the bridge on this chain. */
  direction: BridgeDirection;
  amountArg: string;
  tokenArg?: string;
  /** Token to price when the event carries none, e.g. the zero address for native deposits. */
  fixedToken?: string;
  /** Remap token addresses before pricing, lowercase keys. */
  mapTokens?: Record<string, string>;
  /** Return false to skip an event. Runs on decoded args. */
  filter?: (args: any) => boolean;
};

export type BridgeTransfers = {
  /** Bridge escrow / vault addresses. ERC20 transfers into them are outgoing, out of them incoming. */
  wallets: string[];
  /** Tokens to track. When omitted every ERC20 transfer touching the wallets is counted. */
  tokens?: string[];
  /** Return false to skip a transfer. Runs on the raw transfer log. */
  filter?: (log: any) => boolean;
};

export type BridgeChainConfig = {
  start?: string;
  deadFrom?: string;
  events?: BridgeEvent[];
  transfers?: BridgeTransfers;
};

const methodology = {
  OutgoingVolume: "USD value deposited into the bridge on each chain, i.e. value leaving that chain.",
  IncomingVolume: "USD value withdrawn from the bridge on each chain, i.e. value arriving on that chain.",
  OutgoingTxCount: "Number of deposits into the bridge on each chain.",
  IncomingTxCount: "Number of withdrawals from the bridge on each chain.",
};

export function bridgeExport(
  config: { [chain: string]: BridgeChainConfig },
  { pullHourly = true, ...otherRootOptions }: { pullHourly?: boolean; [key: string]: any } = {},
): SimpleAdapter {
  const exportObject: BaseAdapter = {};

  Object.entries(config).forEach(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: (options: FetchOptions) => fetchBridgeChain(options, chainConfig),
      start: chainConfig.start,
      deadFrom: chainConfig.deadFrom,
    };
  });

  return {
    ...otherRootOptions,
    version: 2,
    pullHourly,
    adapter: exportObject,
    methodology,
  } as SimpleAdapter;
}

async function fetchBridgeChain(options: FetchOptions, { events = [], transfers }: BridgeChainConfig) {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  for (const event of events) {
    const logs = await options.getLogs({ eventAbi: event.eventAbi, targets: event.targets });
    const balances = event.direction === "outgoing" ? dailyOutgoingVolume : dailyIncomingVolume;
    let count = 0;

    for (const args of logs) {
      if (event.filter && !event.filter(args)) continue;
      const amount = args[event.amountArg];
      if (amount === undefined) throw new Error(`bridge helper: arg ${event.amountArg} missing on ${event.eventAbi}`);
      if (BigInt(amount) === 0n) continue;

      let token: string = event.tokenArg ? args[event.tokenArg] : event.fixedToken;
      if (!token) throw new Error(`bridge helper: token missing on ${event.eventAbi}`);
      token = token.toLowerCase();
      if (event.mapTokens?.[token]) token = event.mapTokens[token];

      balances.add(token, amount);
      count++;
    }

    if (event.direction === "outgoing") dailyOutgoingTxCount += count;
    else dailyIncomingTxCount += count;
  }

  if (transfers?.wallets?.length) {
    // the filter runs once per transfer on the indexer and per-token log paths, which is how transfers are counted;
    // the no-token-list log fallback does not call it, so counts there are lower than the volume suggests
    const counting = (onCount: () => void) => (log: any) => {
      if (transfers.filter && !transfers.filter(log)) return false;
      onCount();
      return true;
    };
    await addTokensReceived({ options, targets: transfers.wallets, tokens: transfers.tokens, balances: dailyOutgoingVolume, logFilter: counting(() => dailyOutgoingTxCount++) });
    await addTokensReceived({ options, fromAdddesses: transfers.wallets, tokens: transfers.tokens, balances: dailyIncomingVolume, logFilter: counting(() => dailyIncomingTxCount++) });
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
}
