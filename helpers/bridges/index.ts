import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";

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
  /** Arg name, or a dotted path into a tuple arg (e.g. 'order.inputAmount'). */
  amountArg: string;
  /** Arg name, or a dotted path into a tuple arg. */
  tokenArg?: string;
  /** Token to price when the event carries none, e.g. the zero address for native deposits. */
  fixedToken?: string;
  /** Remap token addresses before pricing, lowercase keys. */
  mapTokens?: Record<string, string>;
  /** Price the token as an address on this chain instead of the chain the event is read on (canonical bridges that report the L1 address on the L2). */
  tokenChain?: string;
  /** Return false to skip an event. Runs on decoded args. */
  filter?: (args: any) => boolean;
};

export type BridgeTransfers = {
  /** Bridge escrow / vault addresses. ERC20 transfers into them are outgoing, out of them incoming. */
  wallets: string[];
  /** Restrict to these tokens (mixed-use wallets). Omit to count every token the wallets send or receive. */
  tokens?: string[];
  /** Count only one leg from transfers when events already cover the other. Omit to count both. */
  direction?: BridgeDirection;
  /** Return false to skip a transfer. */
  filter?: (row: any) => boolean;
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
      const amount = getArg(args, event.amountArg);
      if (amount === undefined) throw new Error(`bridge helper: arg ${event.amountArg} missing on ${event.eventAbi}`);
      if (BigInt(amount) === 0n) continue;

      let token: string = event.tokenArg ? getArg(args, event.tokenArg) : event.fixedToken;
      if (!token) throw new Error(`bridge helper: token missing on ${event.eventAbi}`);
      token = token.toLowerCase();
      if (event.mapTokens?.[token]) token = event.mapTokens[token];

      if (event.tokenChain) balances.add(`${event.tokenChain}:${token}`, amount, { skipChain: true });
      else balances.add(token, amount);
      count++;
    }

    if (event.direction === "outgoing") dailyOutgoingTxCount += count;
    else dailyIncomingTxCount += count;
  }

  if (transfers?.wallets?.length) {
    // Transfers into the wallets are deposits ('in'), transfers out of them are withdrawals ('out'). Both paths cover
    // every token the wallets hold without a token list.
    const wallets = new Set(transfers.wallets.map((w) => w.toLowerCase()));
    const transferTypes: ("in" | "out")[] = transfers.direction ? [transfers.direction === "outgoing" ? "in" : "out"] : ["in", "out"];
    for (const transferType of transferTypes) {
      const rows = await getWalletTransfers(options, transfers, transferType);
      for (const row of rows) {
        // moves between the bridge's own wallets are not user transfers
        if (wallets.has(String(row.from_address).toLowerCase()) && wallets.has(String(row.to_address).toLowerCase())) continue;
        if (transfers.filter && !transfers.filter(row)) continue;
        if (transferType === "in") {
          dailyOutgoingVolume.add(row.token, row.value);
          dailyOutgoingTxCount++;
        } else {
          dailyIncomingVolume.add(row.token, row.value);
          dailyIncomingTxCount++;
        }
      }
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
}

// 'a.b.c' walks into tuple args, which ethers decodes as named results
const getArg = (args: any, path: string): any => path.split(".").reduce((value, key) => value?.[key], args);

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
type WalletTransfer = { token: string; value: any; from_address: string; to_address: string };

async function getWalletTransfers(options: FetchOptions, { wallets, tokens }: BridgeTransfers, transferType: "in" | "out"): Promise<WalletTransfer[]> {
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);

  if (sdk.indexer.isIndexerEnabled(options.chain))
    return sdk.indexer.getTokenTransfers({ chain: options.chain, targets: wallets, transferType, fromBlock, toBlock, tokens });

  // Chains outside the indexer: Transfer logs filtered by the wallet as sender or receiver. With a token list the query
  // targets those token contracts; without one it filters by topic only (no contract address)
  const rows: WalletTransfer[] = [];
  for (const wallet of wallets) {
    const padded = ethers.zeroPadValue(wallet, 32);
    const topics = transferType === "in" ? [TRANSFER_TOPIC, null, padded] : [TRANSFER_TOPIC, padded, null];
    const logs: any[] = await options.getLogs({
      ...(tokens?.length ? { targets: tokens } : { noTarget: true }),
      eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
      topics: topics as any,
      entireLog: true,
      skipIndexer: true,
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      // ERC721 shares the Transfer signature but indexes the token id as a fourth topic and has no data
      if (log.topics.length !== 3 || !log.data || log.data === "0x") continue;
      rows.push({
        token: log.address.toLowerCase(),
        value: BigInt(log.data).toString(),
        from_address: "0x" + log.topics[1].slice(26),
        to_address: "0x" + log.topics[2].slice(26),
      });
    }
  }
  return rows;
}
