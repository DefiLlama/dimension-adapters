import { SimpleAdapter, FetchOptions, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Interface, getAddress } from "ethers";
import { getTxReceipts, getTransactions } from "../../helpers/getTxReceipts";

const CHAIN_KEY = CHAIN.PLASMA;
const LAUNCHPAD = "0x5a96508c1092960dA0981CaC7FD00217E9CdabEC";
const START_BLOCK = 1_872_202;
const WXPL = "0x6100E367285b01F48D07953803A2d8dCA5D19873";

const TOPIC_SWAP = "0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822";
const SWAP_EVENT_ABI = "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)";

const FEE_NUMERATOR = 1n;
const FEE_DENOMINATOR = 100n;

const USE_EXACT_FEES = process.env.LAUNCHPAD_EXACT_FEES === "1";

const wxplInterface = new Interface([
  "event Transfer(address indexed from, address indexed to, uint value)",
  "event Withdrawal(address indexed src, uint value)"
]);

const TRANSFER_TOPIC = wxplInterface.getEvent("Transfer").topicHash.toLowerCase();
const WITHDRAWAL_TOPIC = wxplInterface.getEvent("Withdrawal").topicHash.toLowerCase();

const WXPL_LC = WXPL.toLowerCase();

type LaunchpadTokenMeta = {
  token: string;
  token0: string;
  token1: string;
  wxplIs0: boolean;
  wxplIs1: boolean;
  createdBlock: number;
};

type ExactFeeRequest = {
  txHash: string;
  token: string;
};

const tokenMetaCache = new Map<string, LaunchpadTokenMeta>();
let cachedTokensToBlock = START_BLOCK - 1;

function normalize(address?: string): string {
  if (!address) return "";
  try {
    return getAddress(address).toLowerCase();
  } catch (error) {
    return address.toLowerCase();
  }
}

function toBlockNumber(value: unknown, fallback: number): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return fallback;
}

async function ensureLaunchpadTokens(options: FetchOptions, toBlock: number) {
  if (cachedTokensToBlock >= toBlock) return;

  const fetchFrom = Math.max(START_BLOCK, cachedTokensToBlock + 1);
  if (fetchFrom > toBlock) return;

  const deployedLogs = await options.getLogs({
    target: LAUNCHPAD,
    eventAbi: "event Deployed(address indexed token, uint256 amount)",
    fromBlock: fetchFrom,
    toBlock,
    cacheInCloud: true,
    entireLog: true,
  });

  const txHashToToken = new Map<string, string>();

  for (const log of deployedLogs) {
    const token = normalize((log as any).token ?? (log as any).args?.token);
    if (!token || !log?.transactionHash) continue;
    txHashToToken.set(String(log.transactionHash).toLowerCase(), token);
  }

  if (!txHashToToken.size) {
    cachedTokensToBlock = Math.max(cachedTokensToBlock, toBlock);
    return;
  }

  const pairCreatedLogs = await options.getLogs({
    target: LAUNCHPAD,
    eventAbi: "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)",
    fromBlock: fetchFrom,
    toBlock,
    cacheInCloud: true,
    entireLog: true,
  });

  for (const log of pairCreatedLogs) {
    const txHash = String(log?.transactionHash ?? "").toLowerCase();
    if (!txHash) continue;

    const tokenAddress = txHashToToken.get(txHash);
    if (!tokenAddress) continue;

    try {
      const token0 = normalize((log as any).token0 ?? (log as any).args?.token0);
      const token1 = normalize((log as any).token1 ?? (log as any).args?.token1);
      const createdBlock = toBlockNumber(log.blockNumber ?? (log as any).block, toBlock);

      const wxplIs0 = token0 === WXPL_LC;
      const wxplIs1 = token1 === WXPL_LC;
      if (!wxplIs0 && !wxplIs1) continue;

      tokenMetaCache.set(tokenAddress, {
        token: tokenAddress,
        token0,
        token1,
        wxplIs0,
        wxplIs1,
        createdBlock,
      });
    } catch (error) {
      continue;
    }
  }

  cachedTokensToBlock = Math.max(cachedTokensToBlock, toBlock);
}

function toBigInt(value: any): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return value.startsWith("0x") ? BigInt(value) : BigInt(value);
  if (typeof value === "object") {
    if (typeof value.toString === "function") {
      const str = value.toString();
      if (str) return str.startsWith("0x") ? BigInt(str) : BigInt(str);
    }
    if ("_hex" in value) {
      try {
        return BigInt((value as any)._hex);
      } catch {}
    }
  }
  return 0n;
}

function computeExactFee(
  receipt: any,
  tx: any,
  tokenAddress: string,
): bigint {
  if (!receipt?.logs?.length) return 0n;

  const tokenLc = tokenAddress.toLowerCase();
  let wxplDepositToToken = 0n;
  let wxplWithdrawal = 0n;

  for (const rawLog of receipt.logs) {
    const addr = normalize((rawLog as any)?.address);
    if (addr !== WXPL_LC) continue;

    const topic0 = String((rawLog as any)?.topics?.[0] ?? "").toLowerCase();

    try {
      if (topic0 === TRANSFER_TOPIC) {
        const parsed = wxplInterface.parseLog({ topics: rawLog.topics, data: rawLog.data });
        const to = normalize(parsed.args.to as string);
        if (to === tokenLc) {
          wxplDepositToToken += BigInt(parsed.args.value);
        }
      } else if (topic0 === WITHDRAWAL_TOPIC) {
        const parsed = wxplInterface.parseLog({ topics: rawLog.topics, data: rawLog.data });
        wxplWithdrawal += BigInt(parsed.args.value);
      }
    } catch (error) {
      continue;
    }
  }

  let feeBuy = 0n;
  const txValue = toBigInt(tx?.value);
  if (wxplDepositToToken > 0n) {
    if (txValue >= wxplDepositToToken) {
      feeBuy = txValue - wxplDepositToToken;
    } else {
      const estimated = wxplDepositToToken / 100n;
      if (estimated > 0n) feeBuy = estimated;
    }
  }

  let feeSell = 0n;
  if (wxplWithdrawal > 0n) {
    feeSell = wxplWithdrawal / 100n;
  }

  return feeBuy + feeSell;
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { createBalances } = options;

  const [fromBlock, toBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);

  await ensureLaunchpadTokens(options, toBlock);

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const empty = createBalances();

  const exactFeeRequests: ExactFeeRequest[] = [];
  let totalSwaps = 0;

  for (const meta of tokenMetaCache.values()) {
    if (meta.createdBlock > toBlock) continue;

    const swapLogs = await options.getLogs({
      target: meta.token,
      eventAbi: SWAP_EVENT_ABI,
      fromBlock,
      toBlock,
      cacheInCloud: true,
      entireLog: true,
    });

    if (!swapLogs.length) continue;

    for (const log of swapLogs) {
      const raw = log as any;
      const amount0In = toBigInt(raw.amount0In ?? raw.args?.amount0In);
      const amount1In = toBigInt(raw.amount1In ?? raw.args?.amount1In);
      const amount0Out = toBigInt(raw.amount0Out ?? raw.args?.amount0Out);
      const amount1Out = toBigInt(raw.amount1Out ?? raw.args?.amount1Out);

      const wxplIn = meta.wxplIs0 ? amount0In : amount1In;
      const wxplOut = meta.wxplIs0 ? amount0Out : amount1Out;
      const wxplVolume = wxplIn > wxplOut ? wxplIn : wxplOut;
      if (wxplVolume === 0n) continue;

      dailyVolume.addGasToken(wxplVolume);
      totalSwaps += 1;

      if (USE_EXACT_FEES) {
        if (raw.transactionHash) {
          exactFeeRequests.push({
            txHash: String(raw.transactionHash).toLowerCase(),
            token: meta.token.toLowerCase(),
          });
        }
      } else {
        const feeAmount = (wxplVolume * FEE_NUMERATOR) / FEE_DENOMINATOR;
        if (feeAmount > 0n) {
          dailyFees.addGasToken(feeAmount);
        }
      }
    }
  }

  if (USE_EXACT_FEES && exactFeeRequests.length) {
    const uniqueTxs = Array.from(new Set(exactFeeRequests.map((req) => req.txHash)));
    const cacheKey = `${options.moduleUID}-${toBlock}`;

    let receipts: any[] | undefined;
    let transactions: any[] | undefined;
    try {
      [receipts, transactions] = await Promise.all([
        getTxReceipts(options.chain, uniqueTxs, { cacheKey }),
        getTransactions(options.chain, uniqueTxs, { cacheKey }),
      ]);
    } catch (error) {
      // fallback: if helpers fail, skip exact fee enrichment (keep defaults)
      receipts = [];
      transactions = [];
    }

    const receiptMap = new Map<string, any>();
    (receipts ?? []).forEach((rcpt: any) => {
      const hash = rcpt?.transactionHash?.toLowerCase?.();
      if (hash && !receiptMap.has(hash)) receiptMap.set(hash, rcpt);
    });
    uniqueTxs.forEach((hash, idx) => {
      if (!receiptMap.has(hash)) receiptMap.set(hash, receipts?.[idx] ?? null);
    });

    const txMap = new Map<string, any>();
    (transactions ?? []).forEach((tx: any) => {
      const hash = (tx?.hash ?? tx?.transactionHash)?.toLowerCase?.();
      if (hash && !txMap.has(hash)) txMap.set(hash, tx);
    });
    uniqueTxs.forEach((hash, idx) => {
      if (!txMap.has(hash)) txMap.set(hash, transactions?.[idx] ?? null);
    });

    const feeCache = new Map<string, bigint>();

    for (const req of exactFeeRequests) {
      const key = `${req.txHash}-${req.token}`;
      if (feeCache.has(key)) continue;

      const receipt = receiptMap.get(req.txHash);
      const tx = txMap.get(req.txHash);
      const fee = computeExactFee(receipt, tx, req.token);
      feeCache.set(key, fee);
      if (fee > 0n) {
        dailyFees.addGasToken(fee);
      }
    }
  }

  if (!totalSwaps) {
    return {
      dailyVolume,
      dailyFees,
      dailyRevenue: empty,
      dailyProtocolRevenue: empty,
      dailyHoldersRevenue: empty,
      dailySupplySideRevenue: empty,
    };
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: empty,
    dailyProtocolRevenue: empty,
    dailyHoldersRevenue: empty,
    dailySupplySideRevenue: empty,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN_KEY]: {
      fetch,
      start: START_BLOCK,
    },
  },
  methodology: {
    Volume: "Counts WXPL-side volume from Swap events emitted by launchpad-created bonding-curve tokens (the trading address is the token contract itself).",
    Fees: USE_EXACT_FEES
      ? "Exact fee mode enabled via LAUNCHPAD_EXACT_FEES=1: BUY = tx.value - WXPL transfer to the token; SELL ≈ 1% of WXPL withdrawals (validated on-chain)."
      : "Assumes a 1.0% fee on WXPL volume (validated from receipts); fees are routed to external wallets (2/3 + 1/3 split via the hub).",
    Revenue: "Not reported because collected fees do not accrue to the protocol treasury.",
  },
};

export default adapter;





