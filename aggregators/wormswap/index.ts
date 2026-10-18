import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { isCoreAsset } from "../../helpers/prices";
import { addTokensReceived } from "../../helpers/token";

// Public app configuration: https://wormswap.finance/swap
// Router deployment: https://bscscan.com/tx/0x1ee007745a97b3586bed37b84357262d8b320c1c9c06e3f8f0b6d0a83a60e115
const ROUTER = "0x532bd585ddb129ea50b0938995d3ac3184c4f1bc";
// Router's feeDistributor(): https://bscscan.com/address/0x532bd585ddb129ea50b0938995d3ac3184c4f1bc#readContract
const FEE_DISTRIBUTOR = "0x66f87b4125b314a8abd26abca7b43da045700eb5";
// BSC WBNB: https://bscscan.com/token/0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c
const WRAPPED_NATIVE = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
// Router's native-BNB sentinel in SwapExecuted: https://bscscan.com/address/0x532bd585ddb129ea50b0938995d3ac3184c4f1bc#code
const NATIVE = "0x0000000000000000000000000000000000000000";

const SWAP_EXECUTED =
  "event SwapExecuted(address indexed trader, address indexed router, address indexed input, address output, uint256 actualInput, uint256 fee, uint256 received)";
const NATIVE_FEE_RECEIVED = "event NativeFeeReceived(address indexed source, uint256 amount)";
const FEES_LABEL = "Swap and BNB Wrapping Fees";
const BURN_LABEL = "Fees Allocated to TANUKI Buybacks and Burns";

/** Match a successful router charge to its collector receipts by transaction and asset. */
function feeKey(log: any, token: string): string {
  const hash = log.transactionHash ?? log.transaction_hash;
  if (!hash) throw new Error("WormSwap: a fee-matching log is missing its transaction hash");
  return `${hash.toLowerCase()}:${token.toLowerCase()}`;
}

/** Correct a nearest-block estimate to the last block at or before the timestamp. */
async function lastBlockAtOrBefore(options: FetchOptions, timestamp: number, guess: number): Promise<number> {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0)
    throw new Error("WormSwap: invalid window timestamp");

  /** Fail on unavailable headers rather than persisting a partial window as zero. */
  const readBlock = async (height: number) => {
    if (!Number.isSafeInteger(height) || height < 0)
      throw new Error("WormSwap: invalid boundary block");
    const block = await options.api.provider.getBlock(height);
    if (!block || block.number !== height || !Number.isSafeInteger(block.timestamp))
      throw new Error(`WormSwap: unavailable boundary block ${height}`);
    return block;
  };

  let low = await readBlock(guess);
  let high = low;
  // Bracket in either direction, then bisect. A lookup can be hundreds of
  // blocks away; exponential steps avoid one RPC request per missed block.
  for (let step = 1; high.timestamp <= timestamp; step *= 2) {
    low = high;
    high = await readBlock(low.number + step);
  }
  for (let step = 1; low.timestamp > timestamp; step *= 2) {
    high = low;
    if (low.number === 0) throw new Error("WormSwap: window predates genesis");
    low = await readBlock(Math.max(0, high.number - step));
  }
  while (high.number - low.number > 1) {
    const block = await readBlock(Math.floor((low.number + high.number) / 2));
    if (block.timestamp <= timestamp) low = block;
    else high = block;
  }
  return low.number;
}

/** Collect one trade leg and actual protocol fee receipts for the requested window. */
async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const creditedFees = options.createBalances();
  // The runner supplies the second before the opening interval as fromTimestamp.
  // Resolve exact (fromTimestamp, toTimestamp] bounds before adding one to the
  // lower block. Nearest-block estimates alone may skip a first/gapped pull's
  // first trade or include the next interval; equal-timestamp blocks stay together.
  const fromBlock = (await lastBlockAtOrBefore(options, options.fromTimestamp, await options.getFromBlock())) + 1;
  const toBlock = await lastBlockAtOrBefore(options, options.toTimestamp, await options.getToBlock());
  const nominalFees = new Map<string, bigint>();
  const receipts = new Map<string, bigint>();
  const feeTokens = new Set<string>();
  const getLogs: FetchOptions["getLogs"] = params => options.getLogs({
    ...params, fromBlock, toBlock,
  });

  if (fromBlock <= toBlock) {
    const swaps = await getLogs({ target: ROUTER, eventAbi: SWAP_EXECUTED, onlyArgs: false });
    for (const log of swaps) {
      const { input, output, actualInput, fee, received, router } = log.args;
      const tokenIn = input.toLowerCase();
      const tokenOut = output.toLowerCase();

      // swapNativeWrapper marks its router field with WBNB. Wrapping pays a
      // real router fee, but is not a trade and must not inflate swap volume.
      if (router.toLowerCase() !== WRAPPED_NATIVE) {
        const pricedInput = tokenIn === NATIVE ? WRAPPED_NATIVE : tokenIn;
        const pricedOutput = tokenOut === NATIVE ? WRAPPED_NATIVE : tokenOut;
        // Reuse the core-asset classifier without addOneToken's Number cast:
        // raw 18-decimal amounts must remain exact above Number.MAX_SAFE_INTEGER.
        if (isCoreAsset(options.chain, pricedInput) || !isCoreAsset(options.chain, pricedOutput))
          dailyVolume.add(pricedInput, actualInput);
        else dailyVolume.add(pricedOutput, received);
      }

      const charged = BigInt(fee);
      if (charged === 0n) continue;
      const key = feeKey(log, tokenIn);
      nominalFees.set(key, (nominalFees.get(key) ?? 0n) + charged);
      feeTokens.add(tokenIn);
    }

    const recordReceipt = (log: any, token: string, value: any): boolean => {
      const key = feeKey(log, token);
      if (!nominalFees.has(key)) return false; // donations/recovery transfers are not fees
      const amount = BigInt(value);
      if (amount < 0n) throw new Error("WormSwap: negative fee receipt");
      receipts.set(key, (receipts.get(key) ?? 0n) + amount);
      return true;
    };

    if (feeTokens.has(NATIVE)) {
      const logs = await getLogs({ target: FEE_DISTRIBUTOR, eventAbi: NATIVE_FEE_RECEIVED, onlyArgs: false });
      for (const log of logs) {
        if (log.args.source.toLowerCase() !== ROUTER) continue; // excludes Arena fees
        if (recordReceipt(log, NATIVE, log.args.amount)) creditedFees.addGasToken(log.args.amount);
      }
    }

    const tokens = [...feeTokens].filter(token => token !== NATIVE);
    if (tokens.length) {
      // Verified payer -> immutable fee collector only, restricted to successful
      // swap txs. ERC20 Transfer values capture transfer-tax deductions, unlike
      // SwapExecuted.fee, which is the nominal amount sent by the router.
      // These receipts are gross WormSwap fees before protocol allocations:
      // an external token's transfer tax is not WormSwap revenue or a supplier cut.
      await addTokensReceived({
        options: { ...options, getLogs },
        balances: creditedFees,
        target: FEE_DISTRIBUTOR,
        tokens,
        fromAdddesses: [ROUTER],
        skipIndexer: true,
        logFilter: log => recordReceipt(log, log.token, log.value),
      });
    }

    for (const [key, nominal] of nominalFees) {
      const credited = receipts.get(key);
      if (credited === undefined || credited > nominal)
        throw new Error(`WormSwap: missing or inconsistent fee receipt for ${key}`);
    }
  }

  return {
    dailyVolume,
    dailyFees: creditedFees.clone(1, FEES_LABEL),
    dailyRevenue: creditedFees.clone(1, BURN_LABEL),
    dailyHoldersRevenue: creditedFees.clone(1, BURN_LABEL),
    // BURN_BPS() is a constant 10,000 on the deployed fee distributor. All net
    // router fee receipts are earmarked for TANUKI buyback/burn, with no treasury,
    // supplier or referral cut. Count the allocation at receipt, not again when
    // the keeper later converts and burns the accumulated batch.
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: 0,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BSC],
  start: "2026-10-16", // current router deployment block 127956960, 09:47:24 UTC
  fetch,
  doublecounted: true, // routed trades also settle on the underlying PancakeSwap pools
  methodology: {
    Volume: "Completed swaps routed by WormSwap, counted once using the received input before its router fee; the received output is used when only that leg is a core asset, and BNB/WBNB wrapping is excluded.",
    Fees: "User-paid swap and BNB/WBNB wrapping fees actually credited to WormSwap's fee distributor before protocol allocations, excluding external token transfer taxes, underlying DEX fees, Arena payments and donations.",
    Revenue: "Net swap and wrapping fee receipts retained by WormSwap and allocated entirely to TANUKI buybacks and burns, with no supplier or referral share.",
    HoldersRevenue: "Net swap and wrapping fee receipts earmarked for TANUKI buybacks and burns, recognized when received rather than again when the burn batch executes.",
    ProtocolRevenue: "WormSwap allocates none of its net router fee receipts to a discretionary treasury; all are reserved for TANUKI buybacks and burns.",
    SupplySideRevenue: "WormSwap pays no supplier or referral share from its router fee; underlying PancakeSwap liquidity-provider fees belong to PancakeSwap.",
  },
  breakdownMethodology: {
    Fees: {
      [FEES_LABEL]: "Actual native/ERC20 credits from the WormSwap router to its fee distributor, matched to successful SwapExecuted transactions, including the fee on BNB/WBNB wrapping.",
    },
    Revenue: {
      [BURN_LABEL]: "All net router fee receipts are committed to TANUKI buybacks and burns by the fee distributor's fixed 100% burn allocation.",
    },
    HoldersRevenue: {
      [BURN_LABEL]: "The fee-funded TANUKI buyback/burn allocation measured at fee collection; later keeper conversions and burns are not counted a second time.",
    },
  },
};

export default adapter;
