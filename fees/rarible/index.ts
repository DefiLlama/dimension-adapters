import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";
import { getProvider } from "@defillama/sdk";
import { PromisePool } from "@supercharge/promise-pool";

const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const MATCH_EVENT = "event Match(bytes32 leftHash, bytes32 rightHash, uint256 newLeftFill, uint256 newRightFill)";

function topic(address: string) {
    return "0x000000000000000000000000" + address.slice(2).toLowerCase();
};

async function getNativeInflows(chain: string, toAddresses: string[], fromBlock: number, toBlock: number): Promise<bigint> {
  const rpcUrl = (getProvider(chain) as any).rpcs[0].url;
  
  const { results } = await PromisePool
    .withConcurrency(2)
    .for(toAddresses)
    .process(toAddress => httpPost(rpcUrl, {
      jsonrpc: "2.0", id: 1, method: "trace_filter",
      params: [{ fromBlock: `0x${fromBlock.toString(16)}`, toBlock: `0x${toBlock.toString(16)}`, toAddress: [toAddress] }],
    }));
  
  return results.flatMap((r: any) => r.result ?? [])
    .filter((t: any) => t.type === "call" && t.action?.callType === "call" && BigInt(t.action?.value ?? 0) > 0n)
    .reduce((sum: bigint, t: any) => sum + BigInt(t.action.value), 0n);
};

const config: Record<string, { exchange: string; feeReceivers: string[]; start: string }> = {
  [CHAIN.ETHEREUM]: {
    exchange: "0x9757F2d2b135150BBeb65308D4a91804107cd8D6",
    // 0xb6EC1d... = fee receiver, 0x1cf0df2a... = treasury (some sales pay directly here)
    feeReceivers: ["0xb6EC1d227D5486D344705663F700d90d947d7548", "0x1cf0df2a5a20cd61d68d4489eebbf85b8d39e18a"],
    start: "2021-06-12",
  },
  [CHAIN.POLYGON]: {
    exchange: "0x12b3897a36fDB436ddE2788C06Eff0ffD997066e",
    feeReceivers: ["0x053F171c0D0Cc9d76247D4d1CdDb280bf1131390"],
    start: "2022-02-21",
  },
  [CHAIN.BASE]: {
    exchange: "0x6C65a3C3AA67b126e43F86DA85775E0F5e9743F7",
    feeReceivers: ["0xb6EC1d227D5486D344705663F700d90d947d7548"],
    start: "2023-12-19",
  },
};

const fetch = async (options: FetchOptions) => {
  const { getLogs, createBalances, chain, getFromBlock, getToBlock } = options;
  const { feeReceivers } = config[chain];
  const dailyFees = createBalances();

  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()]);

  const { results: [matchOrders, ...transferLogResults], errors } = await PromisePool
    .withConcurrency(3)
    .for([
      () =>
        getLogs({
          target: config[chain].exchange,
          eventAbi: MATCH_EVENT,
          entireLog: true,
        }),
        ...feeReceivers.map(receiver => () => getLogs({
          eventAbi: TRANSFER_EVENT,
          topics: [TRANSFER_TOPIC, null as any, topic(receiver)],
          noTarget: true,
          entireLog: true,
        })),
    ])
    .process(fn => fn());

  if (errors.length) throw errors[0];

  const matchOrdersTxHashes = new Set((matchOrders as any[]).map((l: any) => l.transactionHash.toLowerCase()));

  for (const log of transferLogResults.flat()) {
    if (!matchOrdersTxHashes.has(log.transactionHash.toLowerCase())) continue;
    dailyFees.add(log.address, BigInt(log.data));
  };

  const nativeInflows = await getNativeInflows(chain, feeReceivers, fromBlock, toBlock);
  dailyFees.addGasToken(nativeInflows);

  return { dailyFees, dailyRevenue: dailyFees };
};

const methodology = {
  Fees: "2% protocol fee (seller-side) collected by Rarible on ERC20 NFT sales across supported chains.",
  Revenue: "All protocol fees are retained by Rarible.",
};

const adapter: Adapter = {
  version: 2,
  methodology,
  pullHourly: true,
  adapter: Object.fromEntries(
    Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }])
  ),
};

export default adapter;
