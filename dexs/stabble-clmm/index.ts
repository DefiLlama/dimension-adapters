import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getEnv } from "../../helpers/env";
import { addOneToken } from "../../helpers/prices";
import { httpPost } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

// stabble's CLMM program, the same one the TVL adapter reads (projects/stabble-clmm).
const PROGRAM_ID = "6dMXqGZ3ga2dikrYS9ovDXgHGh5RUsb2RTUj6hrQXhk6";

// The program is a Raydium CLMM fork, so every swap emits an anchor SwapEvent as a
// `Program data:` log line. The discriminator is sha256("event:SwapEvent")[..8].
const SWAP_EVENT_DISCRIMINATOR = "40c6cde8260871e2";
const SWAP_EVENT_SIZE = 205;

// Raydium's FEE_RATE_DENOMINATOR_VALUE. trade_fee_rate, protocol_fee_rate and
// fund_fee_rate on the AmmConfig account are all parts per million of it.
const FEE_RATE_DENOMINATOR = 1_000_000;

const SIGNATURE_PAGE_SIZE = 1000;
const MAX_SIGNATURE_PAGES = 250;
const TX_BATCH_SIZE = 25;
const ACCOUNT_BATCH_SIZE = 100;

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function toBase58(bytes: Buffer): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out += "1";
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]];
  return out;
}

async function rpcCall(body: any): Promise<any> {
  const url = getEnv("SOLANA_RPC");
  let delay = 1000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await httpPost(url, body);
    } catch (e) {
      if (attempt >= 7) throw e;
      await sleep(delay);
      delay = Math.min(delay * 2, 15000);
    }
  }
}

// Signatures come back newest first, so page backwards until we drop below the window.
async function getSignatures(fromTimestamp: number, toTimestamp: number): Promise<string[]> {
  const signatures: string[] = [];
  let before: string | undefined;

  for (let page = 0; page < MAX_SIGNATURE_PAGES; page++) {
    const params: any = { limit: SIGNATURE_PAGE_SIZE };
    if (before) params.before = before;
    const res = await rpcCall({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [PROGRAM_ID, params] });
    if (res.error) throw new Error(`stabble-clmm: getSignaturesForAddress failed: ${res.error.message}`);

    const items = res.result ?? [];
    if (!items.length) return signatures;

    for (const item of items) {
      if (!item.blockTime) continue;
      if (item.blockTime >= toTimestamp) continue;
      if (item.blockTime < fromTimestamp) return signatures;
      // a failed transaction never reaches the swap handler, so it emits no event
      if (item.err) continue;
      signatures.push(item.signature);
    }

    if (items.length < SIGNATURE_PAGE_SIZE) return signatures;
    before = items[items.length - 1].signature;
  }

  throw new Error(`stabble-clmm: gave up paging signatures after ${MAX_SIGNATURE_PAGES} pages`);
}

async function getTransactions(signatures: string[]): Promise<any[]> {
  const fetched: Record<string, any> = {};
  let pending = signatures;

  for (let round = 0; pending.length && round < 12; round++) {
    const retry: string[] = [];
    for (let i = 0; i < pending.length; i += TX_BATCH_SIZE) {
      const chunk = pending.slice(i, i + TX_BATCH_SIZE);
      const res = await rpcCall(chunk.map((signature, id) => ({
        jsonrpc: "2.0",
        id,
        method: "getTransaction",
        params: [signature, { encoding: "json", maxSupportedTransactionVersion: 0 }],
      })));
      for (const item of res) {
        const signature = chunk[item.id];
        // rate limiting comes back per call inside the batch, so retry only those
        if (item.error) retry.push(signature);
        else if (!item.result) throw new Error(`stabble-clmm: transaction ${signature} is missing from the ledger`);
        else fetched[signature] = item.result;
      }
    }
    if (retry.length) await sleep(2000 * (round + 1));
    pending = retry;
  }

  if (pending.length) throw new Error(`stabble-clmm: could not read ${pending.length} transactions from the Solana RPC`);
  return Object.values(fetched);
}

async function getAccounts(addresses: string[]): Promise<Record<string, Buffer>> {
  const accounts: Record<string, Buffer> = {};
  for (let i = 0; i < addresses.length; i += ACCOUNT_BATCH_SIZE) {
    const chunk = addresses.slice(i, i + ACCOUNT_BATCH_SIZE);
    const res = await rpcCall({ jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [chunk, { encoding: "base64" }] });
    if (res.error) throw new Error(`stabble-clmm: getMultipleAccounts failed: ${res.error.message}`);
    res.result.value.forEach((account: any, index: number) => {
      if (!account) throw new Error(`stabble-clmm: account ${chunk[index]} not found on chain`);
      accounts[chunk[index]] = Buffer.from(account.data[0], "base64");
    });
  }
  return accounts;
}

// Other CLMM forks on Solana share this discriminator and one Jupiter route can touch
// several of them in the same transaction, so only take events emitted while our
// program is the frame that is actually executing.
function getSwapEvents(logs: string[]): Buffer[] {
  const stack: string[] = [];
  const events: Buffer[] = [];

  for (const log of logs) {
    if (log.startsWith("Program ") && log.includes(" invoke [")) {
      stack.push(log.split(" ")[1]);
    } else if (log.startsWith("Program ") && (log.endsWith(" success") || log.includes(" failed"))) {
      if (stack[stack.length - 1] === log.split(" ")[1]) stack.pop();
    } else if (log.startsWith("Program data: ") && stack[stack.length - 1] === PROGRAM_ID) {
      const data = Buffer.from(log.slice("Program data: ".length), "base64");
      if (data.length === SWAP_EVENT_SIZE && data.subarray(0, 8).toString("hex") === SWAP_EVENT_DISCRIMINATOR) events.push(data);
    }
  }

  return events;
}

// PoolState, laid out as in the program IDL: 8 byte discriminator, 1 byte bump, then
// amm_config, owner, token_mint_0, token_mint_1, token_vault_0, token_vault_1,
// observation_key, mint_decimals_0, mint_decimals_1.
function decodePool(data: Buffer) {
  return {
    ammConfig: toBase58(data.subarray(9, 41)),
    token0: toBase58(data.subarray(73, 105)),
    token1: toBase58(data.subarray(105, 137)),
  };
}

// AmmConfig: 8 byte discriminator, bump, index (u16), owner, then the three fee rates.
function decodeConfig(data: Buffer) {
  return {
    protocolFeeRate: data.readUInt32LE(43),
    tradeFeeRate: data.readUInt32LE(47),
    fundFeeRate: data.readUInt32LE(53),
  };
}

// SwapEvent: pool_state, sender, token_account_0, token_account_1, then the amounts.
// amount_0 / amount_1 are gross transfer amounts and transfer_fee_* is the token-2022
// transfer fee withheld out of them.
function decodeSwapEvent(data: Buffer) {
  return {
    pool: toBase58(data.subarray(8, 40)),
    amount0: Number(data.readBigUInt64LE(136) - data.readBigUInt64LE(144)),
    amount1: Number(data.readBigUInt64LE(152) - data.readBigUInt64LE(160)),
  };
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const signatures = await getSignatures(options.startTimestamp, options.endTimestamp);
  const transactions = signatures.length ? await getTransactions(signatures) : [];
  const swaps = transactions
    .flatMap((tx: any) => getSwapEvents(tx.meta?.logMessages ?? []))
    .map(decodeSwapEvent);

  if (swaps.length) {
    const poolAccounts = await getAccounts([...new Set(swaps.map((swap) => swap.pool))]);
    const pools: Record<string, any> = {};
    for (const [address, data] of Object.entries(poolAccounts)) pools[address] = decodePool(data);
    const configAccounts = await getAccounts([...new Set(Object.values(pools).map((pool) => pool.ammConfig))]);

    for (const { pool, amount0, amount1 } of swaps) {
      const { token0, token1, ammConfig } = pools[pool];
      const { tradeFeeRate, protocolFeeRate, fundFeeRate } = decodeConfig(configAccounts[ammConfig]);
      const feeRate = tradeFeeRate / FEE_RATE_DENOMINATOR;
      const revenueRatio = (protocolFeeRate + fundFeeRate) / FEE_RATE_DENOMINATOR;

      // the fee is taken on the input leg, but the two legs of a swap are the same
      // notional, and pricing whichever one is a core asset is more reliable than
      // pricing the long tail of tokens these pools quote against
      addOneToken({ balances: dailyVolume, token0, token1, amount0, amount1 });
      const { token, amount } = addOneToken({ balances: dailyFees, token0, token1, amount0: amount0 * feeRate, amount1: amount1 * feeRate });
      dailyRevenue.add(token, amount * revenueRatio);
      dailySupplySideRevenue.add(token, amount * (1 - revenueRatio));
    }
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Sum of the SwapEvent amounts the CLMM program emits, read from the program's own transaction logs.",
  Fees: "Swap fees paid by traders, the trade_fee_rate on each pool's AmmConfig applied to the amount swapped.",
  Revenue: "The protocol's cut of swap fees, protocol_fee_rate plus fund_fee_rate of the trading fee.",
  SupplySideRevenue: "The rest of the trading fee, which accrues to liquidity providers.",
};

const adapter: SimpleAdapter = {
  version: 2,
  // Swaps are read from per-transaction logs, so the window can be any length.
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-12-12',
  methodology,
};

export default adapter;
