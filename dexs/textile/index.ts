import ADDRESSES from '../../helpers/coreAssets.json'
import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

// Textile FX settles every swap through a UniswapX-style LimitOrderReactor: a maker
// (a market-making bot, or a user's resting limit order) signs an order off-chain and a
// filler executes it on-chain. The reactor's Fill(orderHash, filler, swapper, nonce) event
// carries no amounts. In the same tx the maker sends its input to the filler and receives
// its output from the filler, so each fill's legs are ERC20 Transfers between the maker
// (Fill.swapper) and the filler. Volume is the stable leg, gross of the protocol fee. The
// filler's own hedging swaps never have the maker as a counterparty, so they are not counted.
// Docs: https://docs.textilecredit.com

const FILL_EVENT = "event Fill(bytes32 indexed orderHash, address indexed filler, address indexed swapper, uint256 nonce)";
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// reactor: the chain's LimitOrderReactor, the only contract that emits Fill.
// stable: the stable side of every corridor on the chain (source: settlementCorridorRegistry
// on https://api.textilecredit.com/graphql).
// feeRecipient: where the reactor's SellFirstFeeController sends its fee output (its
// feeRecipient()). Every non-maker stable transfer from a filler in a fill tx goes here.
const TREASURY = "0x51727a09b55d56bf8f3cbe61f460327330aecba4";
const onchainConfig: Record<string, { reactor: string; stable: string; feeRecipient: string; start: string }> = {
  [CHAIN.ETHEREUM]: { reactor: "0x26a1aedaa26affc4fd9f910acfca754a31bc43c6", stable: ADDRESSES.ethereum.USDT, feeRecipient: TREASURY, start: "2026-06-07" }, // USDT
  [CHAIN.BSC]: { reactor: "0xe03261c0436db575f92f09eddf3591e2566b7d97", stable: ADDRESSES.bsc.USDT, feeRecipient: TREASURY, start: "2026-06-07" }, // USDT
  [CHAIN.POLYGON]: { reactor: "0xf3ffcf21e621552cfccc724b965e901cdf0d83fe", stable: ADDRESSES.polygon.USDT, feeRecipient: TREASURY, start: "2026-06-07" }, // USDT
  [CHAIN.BASE]: { reactor: "0xeb5a29f869ff084b3fce18d3487a38a56fedc59e", stable: ADDRESSES.base.USDC, feeRecipient: "0xd1e220544c21136811ae0400eb04a390ca05f58e", start: "2026-06-07" }, // USDC
};

const topicAddress = (topic: string) => `0x${topic.slice(26)}`.toLowerCase();

async function fetchOnchain(options: FetchOptions): Promise<FetchResultV2> {
  const { reactor, stable, feeRecipient } = onchainConfig[options.chain];
  const dailyVolume = options.createBalances();

  // "tx:maker" -> fillers the maker traded with in that tx, and "tx" -> every filler in it
  // A self-fill (swapper == filler) is not a trade, and its maker->filler transfer would match
  // both the "from maker" and "to maker" queries below. Drop it before anything is derived.
  const fills = (await options.getLogs({ target: reactor, eventAbi: FILL_EVENT, onlyArgs: false }))
    .filter((fill: any) => fill.args.swapper.toLowerCase() !== fill.args.filler.toLowerCase());
  const fillers = new Map<string, Set<string>>();
  const addFiller = (key: string, filler: string) => {
    if (!fillers.has(key)) fillers.set(key, new Set());
    fillers.get(key)!.add(filler);
  };
  for (const fill of fills) {
    const tx = fill.transactionHash.toLowerCase();
    addFiller(`${tx}:${fill.args.swapper.toLowerCase()}`, fill.args.filler.toLowerCase());
    addFiller(tx, fill.args.filler.toLowerCase());
  }

  const makers = [...new Set(fills.map((fill: any) => fill.args.swapper.toLowerCase()))] as string[];
  const transfers = makers.length ? await sdk.indexer.getTokenTransfers({
    chain: options.chain, fromBlock: await options.getFromBlock(), toBlock: await options.getToBlock(),
    targets: makers, token: stable, transferType: "all",
  }) : [];
  for (const transfer of transfers) {
    const from = transfer.from_address.toLowerCase();
    const to = transfer.to_address.toLowerCase();
    const tx = transfer.transaction_hash.toLowerCase();
    if (fillers.get(`${tx}:${from}`)?.has(to) || fillers.get(`${tx}:${to}`)?.has(from)) dailyVolume.add(stable, transfer.value);
  }

  // Volume is gross of fees. When the maker receives the stable leg, the fee is an extra
  // output in that stable, paid by the filler to the fee recipient on top of the maker's
  // amount, so add it. When the maker sends the stable leg, the fee is in the other token
  // and the stable amount counted above is already gross.
  if (fills.length) {
    const feeTopics = [TRANSFER_TOPIC, null, ethers.zeroPadValue(feeRecipient, 32)];
    const feeLogs = await options.getLogs({ target: stable, eventAbi: TRANSFER_EVENT, topics: feeTopics as any, entireLog: true });
    for (const log of feeLogs) {
      if (fillers.get(log.transactionHash.toLowerCase())?.has(topicAddress(log.topics[1]))) dailyVolume.add(stable, BigInt(log.data));
    }
  }

  return { dailyVolume };
}

// Celo has no llama indexer, and its public RPCs drop logs without an error: the same
// eth_getLogs query on forno returned 5 and then 27 of a day's 44 Fill events, and
// celo-json-rpc.stakely.io returns none. So Celo reads Textile's public API, which serves
// the same per-fill stable legs from the protocol's subgraph and returns an error rather
// than a partial list when its indexed snapshot doesn't cover the window.
const API = "https://api.textilecredit.com/graphql";
const CELO_QUERY = `
  query TextileVolumes($from: Int!, $to: Int!) {
    settlementTradeVolumes(fromTimestamp: $from, toTimestamp: $to, chainId: 42220) {
      volumeUsd
    }
  }
`;

async function fetchCelo(options: FetchOptions): Promise<FetchResultV2> {
  const res = await httpPost(API, { query: CELO_QUERY, variables: { from: options.fromTimestamp, to: options.toTimestamp } });
  // GraphQL errors come back with HTTP 200: fail the run so the window is retried.
  if (res?.errors?.length) throw new Error(`Textile API: ${res.errors.map((e: any) => e.message).join("; ")}`);
  const rows = res?.data?.settlementTradeVolumes;
  if (!Array.isArray(rows)) throw new Error("Textile API: settlementTradeVolumes missing from response");
  return { dailyVolume: rows.reduce((sum: number, row: any) => sum + row.volumeUsd, 0) };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume:
      "Sum of the stable (USDT/USDC) leg of every order filled through Textile's LimitOrderReactor, gross of the protocol fee: the stable transfers between the maker and the filler in each transaction that emits the reactor's Fill event, plus the filler's stable fee transfer to the fee recipient when the maker receives the stable leg. Celo is read from Textile's public API, which serves the same gross legs from the protocol subgraph.",
  },
  adapter: {
    ...Object.fromEntries(Object.entries(onchainConfig).map(([chain, { start }]) => [chain, { fetch: fetchOnchain, start }])),
    [CHAIN.CELO]: { fetch: fetchCelo, start: "2026-06-07" },
  },
};

export default adapter;
