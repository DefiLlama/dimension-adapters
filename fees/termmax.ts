import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { ethers } from "ethers";

/**
 * TermMax Protocol Fees Adapter
 *
 * TermMax is a fixed-rate lending protocol that enables users to borrow/lend at fixed rates.
 * Docs: https://docs.ts.finance/
 *
 * Fee Collection Mechanism:
 * - All protocol fees are collected via ERC20 Transfer events TO the treasury address
 * - We track all token transfers sent to the treasury within the time range
 *
 * Fee Types (distinguished by the source of the transfer):
 * 1. Protocol Fees: Fees from trading orders (borrow/lend transactions)
 *    - Source: FT (Fixed-rate Token) contracts associated with a market
 *    - Detected when: marketAddress lookup succeeds (transfer came from an FT token)
 *    - Valued in: Underlying/debt token, discounted by the actual swap price at trade time
 *    - Discount method: Match each FT fee Transfer to the Swap event in the same tx,
 *      derive FT price from the swap's exchange rate, apply to fee amount
 *    - Fallback: If no matching FT swap found (e.g. XT swap fees, issueFt mint fees),
 *      apply a conservative 5% annual simple-interest discount based on time-to-maturity
 *
 * 2. Liquidation Penalties: Fees charged when undercollateralized positions are liquidated
 *    - Source: GT (Gearing Token) contracts
 *    - Detected when: gtConfig lookup succeeds (transfer came from a GT token)
 *    - Valued in: Collateral token
 *
 * 3. Performance Fees: Fees charged on yield earned by passive depositors
 *    - Source: Performance Fee Manager contract
 *    - Detected when: transfer originates from the PERFORMANCE_FEE_MANAGER address
 *    - Valued in: The transferred token (typically the vault's underlying asset)
 */

// Treasury addresses per chain
const DEFAULT_TREASURY = "0x719e77027952929ed3060dbFFC5D43EC50c1cf79";
const TREASURY: Record<string, string> = {
  [CHAIN.BSQUARED]: "0x70e992E94474e4E9B2D964F6876c05cDE45f8E89",
};

// Performance Fee Manager address - used to identify performance fee transfers
const PERFORMANCE_FEE_MANAGER = "0xEEC1238f2191978528e31dFf120bB8030fc62ff2";

async function getTransfers(
  options: FetchOptions,
  _from: string | null,
  _to: string | null,
  fromBlock: number,
  toBlock: number,
) {
  const eventAbi =
    "event Transfer (address indexed from, address indexed to, uint256 value)";
  const from = _from ? ethers.zeroPadValue(_from, 32) : null;
  const to = _to ? ethers.zeroPadValue(_to, 32) : null;
  return await options.getLogs({
    eventAbi,
    topics: [
      // Transfer(address,address,uint256)
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      from as any,
      to as any,
    ],
    fromBlock,
    toBlock,
    entireLog: true,
    noTarget: true,
  });
}

/**
 * Classifies and sums fees from Transfer logs
 *
 * Classification logic:
 * - For each transfer, we try to identify the source contract type:
 *   1. Call getGtConfig() on the 'from' address - if it succeeds, this is a GT contract
 *      -> The transfer is a liquidation penalty (valued in collateral token)
 *   2. Call marketAddr() on the token address - if it succeeds, this is an FT contract
 *      -> The transfer is a protocol fee (valued in underlying token)
 *   3. Check if 'from' address matches PERFORMANCE_FEE_MANAGER
 *      -> The transfer is a performance fee (valued in the transferred token)
 */
async function handleLogs(
  options: FetchOptions,
  logs: any[],
  fromBlock: number,
  toBlock: number,
) {
  const dailyUserFees = options.createBalances();

  const froms = [];
  const addresses = [];
  for (const log of logs) {
    froms.push(log.args.from);
    addresses.push(log.address);
  }

  // Helper: multiCall with permitFailure that won't throw on SDK errors
  async function safeMultiCall(params: { abi: string; calls: any[]; permitFailure: true }): Promise<any[]> {
    try {
      return await options.api.multiCall(params);
    } catch (_) {
      return new Array(params.calls.length).fill(null);
    }
  }

  const [gtConfigs, marketAddresses] = await Promise.all([
    safeMultiCall({
      abi: "function getGtConfig() view returns ((address collateral, address debtToken, address ft, address treasurer, uint64 maturity, (address oracle, uint32 liquidationLtv, uint32 maxLtv, bool liquidatable) loanConfig))",
      calls: froms,
      permitFailure: true,
    }),
    safeMultiCall({
      abi: "address:marketAddr",
      calls: addresses,
      permitFailure: true,
    }),
  ]);

  const tuples = [];
  for (let i = 0; i < logs.length; i++) {
    const [tokenAddress, gtConfig, marketAddress, balance] = [
      addresses[i],
      gtConfigs[i],
      marketAddresses[i],
      logs[i].args.value,
    ];
    if (gtConfig) {
      // GT contract -> Liquidation penalty (valued in collateral token)
      dailyUserFees.add(gtConfig.collateral, balance, METRIC.LIQUIDATION_FEES);
    } else if (marketAddress) {
      const log = logs[i];
      tuples.push({ log, marketAddress, orderAddress: froms[i] });
    } else if (
      froms[i].toLowerCase() === PERFORMANCE_FEE_MANAGER.toLowerCase()
    ) {
      // Transfers from the operator address are performance fees (valued in the transferred token)
      dailyUserFees.add(tokenAddress, balance, METRIC.PERFORMANCE_FEES);
    }
    // Transfers from unknown sources are ignored (not TermMax protocol fees)
  }

  if (tuples.length > 0) {
    // Fetch tokens (for FT/XT/underlying addresses) and swap events in parallel
    const SWAP_EXACT_ABI =
      "event SwapExactTokenToToken(address indexed tokenIn, address indexed tokenOut, address caller, address recipient, uint128 tokenAmtIn, uint128 netTokenOut, uint128 feeAmt)";
    const SWAP_TO_EXACT_ABI =
      "event SwapTokenToExactToken(address indexed tokenIn, address indexed tokenOut, address caller, address recipient, uint128 tokenAmtOut, uint128 netTokenIn, uint128 feeAmt)";

    const [allTokens, swapExactLogs, swapToExactLogs] = await Promise.all([
      // tokens(): [FT, XT, GT, collateral, underlying]
      safeMultiCall({
        abi: "function tokens() view returns (address, address, address, address, address)",
        calls: tuples.map((t) => t.marketAddress),
        permitFailure: true,
      }),
      options.getLogs({
        eventAbi: SWAP_EXACT_ABI,
        fromBlock,
        toBlock,
        entireLog: true,
        noTarget: true,
      }),
      options.getLogs({
        eventAbi: SWAP_TO_EXACT_ABI,
        fromBlock,
        toBlock,
        entireLog: true,
        noTarget: true,
      }),
    ]);

    // config() for maturity — separated from main Promise.all because the
    // complex struct ABI may fail on some SDK versions or market contracts.
    // If it fails, the fixed-rate fallback is skipped (FT valued 1:1).
    const allConfigs = await safeMultiCall({
      abi: "function config() view returns ((address, uint64, (uint32, uint32, uint32, uint32, uint32, uint32)))",
      calls: tuples.map((t) => t.marketAddress),
      permitFailure: true,
    });

    // Build FT address set for identifying FT-involved swaps
    const ftAddressSet = new Set<string>();
    for (const t of tuples) {
      ftAddressSet.add(t.log.address.toLowerCase());
    }
    for (const tokens of allTokens) {
      if (tokens?.[0]) ftAddressSet.add(tokens[0].toLowerCase());
    }

    // Build FT price maps keyed by:
    //   txHash:orderAddress (precise match for order-based fees)
    //   txHash (fallback for minted fees where from=0x0)
    // Price = underlying per FT, scaled by PRICE_PRECISION
    const PRICE_PRECISION = BigInt(1e18);
    const priceByTxOrder = new Map<string, bigint>();
    const priceByTx = new Map<string, bigint>();

    function storePrice(txHash: string, emitter: string, price: bigint) {
      priceByTxOrder.set(`${txHash}:${emitter.toLowerCase()}`, price);
      priceByTx.set(txHash, price);
    }

    // Derive FT price from a swap event's token pair and amounts.
    // Only uses FT-direct swaps (not XT swaps) because XT/underlying AMM
    // prices are unreliable near maturity due to curve collapse.
    function derivePrice(
      tokenInAddr: string,
      tokenOutAddr: string,
      amtA: bigint, // tokenAmtIn (exact-in) or netTokenIn (exact-out)
      amtB: bigint, // netTokenOut (exact-in) or tokenAmtOut (exact-out)
      feeAmt: bigint,
    ): bigint | null {
      if (ftAddressSet.has(tokenOutAddr)) {
        // Buying FT with underlying: ftPrice = amtA / (amtB + feeAmt)
        const totalFt = amtB + feeAmt;
        return totalFt > 0n ? (amtA * PRICE_PRECISION) / totalFt : null;
      }
      if (ftAddressSet.has(tokenInAddr)) {
        // Selling FT for underlying: ftPrice = amtB / (amtA - feeAmt)
        const effectiveFt = amtA - feeAmt;
        return effectiveFt > 0n ? (amtB * PRICE_PRECISION) / effectiveFt : null;
      }
      return null;
    }

    // Filter swap events by whether FT is directly involved
    function isTermMaxFtSwap(log: any): boolean {
      return (
        ftAddressSet.has(log.args.tokenIn.toLowerCase()) ||
        ftAddressSet.has(log.args.tokenOut.toLowerCase())
      );
    }

    for (const log of swapExactLogs) {
      if (!isTermMaxFtSwap(log)) continue;
      const price = derivePrice(
        log.args.tokenIn.toLowerCase(),
        log.args.tokenOut.toLowerCase(),
        BigInt(log.args.tokenAmtIn),
        BigInt(log.args.netTokenOut),
        BigInt(log.args.feeAmt),
      );
      if (price !== null)
        storePrice(log.transactionHash, log.address, price);
    }

    for (const log of swapToExactLogs) {
      if (!isTermMaxFtSwap(log)) continue;
      const price = derivePrice(
        log.args.tokenIn.toLowerCase(),
        log.args.tokenOut.toLowerCase(),
        BigInt(log.args.netTokenIn),
        BigInt(log.args.tokenAmtOut),
        BigInt(log.args.feeAmt),
      );
      if (price !== null)
        storePrice(log.transactionHash, log.address, price);
    }

    // Fixed-rate fallback for FT fees without a matching FT swap event
    // (e.g. fees from XT swaps or issueFt mints).
    //
    // Why 5% annual rate:
    // - FT is a zero-coupon bond worth 1 underlying at maturity, so before
    //   maturity its present value is less than face value.
    // - Observed on-chain FT swap prices imply ~15% annualized rates, but
    //   this varies across markets, maturities, and time periods.
    // - We use a conservative 5% rate to avoid overestimating fee revenue
    //   while staying defensible for DefiLlama reviewers.
    // - Formula: discountFactor = 1 / (1 + rate × daysToMaturity / 365)
    const FALLBACK_ANNUAL_RATE = 0.05;
    const FALLBACK_SCALE = BigInt(1e18);

    for (let i = 0; i < tuples.length; i++) {
      const { log, orderAddress } = tuples[i];
      const tokens = allTokens[i];
      if (tokens && tokens[4]) {
        const underlyingToken = tokens[4];
        let balance = log.args.value;

        // Primary: discount using actual FT swap price from the same tx
        const price =
          priceByTxOrder.get(
            `${log.transactionHash}:${orderAddress.toLowerCase()}`,
          ) ?? priceByTx.get(log.transactionHash);
        if (price && price < PRICE_PRECISION) {
          balance = (balance * price) / PRICE_PRECISION;
        } else {
          // Fallback: apply fixed-rate simple-interest discount based on
          // time-to-maturity (for XT swap fees, issueFt mint fees, etc.)
          const maturity = Number(allConfigs[i]?.[1] ?? 0);
          if (maturity > options.endTimestamp) {
            const yearsToMaturity =
              (maturity - options.endTimestamp) / 86400 / 365;
            const factor = BigInt(
              Math.floor(1e18 / (1 + FALLBACK_ANNUAL_RATE * yearsToMaturity)),
            );
            balance = (balance * factor) / FALLBACK_SCALE;
          }
        }

        dailyUserFees.add(underlyingToken, balance, METRIC.PROTOCOL_FEES);
      }
    }
  }

  return { dailyUserFees };
}

const fetch = async (options: FetchOptions) => {
  const dailyRevenue = options.createBalances();
  const treasury = TREASURY[options.chain] ?? DEFAULT_TREASURY;

  const [fromBlock, toBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);
  const logs = await getTransfers(options, null, treasury, fromBlock, toBlock);
  const { dailyUserFees } = await handleLogs(options, logs, fromBlock, toBlock);
  dailyRevenue.add(dailyUserFees);

  return {
    dailyUserFees,
    dailyFees: dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees: "Protocol fees (FT discounted by actual swap price) from trading orders, liquidation penalties (in collateral tokens), and performance fees (in transferred tokens).",
  UserFees:
    "Protocol fees (FT discounted by actual swap price) from trading orders, liquidation penalties (in collateral tokens), and performance fees (in transferred tokens).",
  Revenue:
    "Protocol fees (FT discounted by actual swap price) from trading orders, liquidation penalties (in collateral tokens), and performance fees (in transferred tokens).",
  ProtocolRevenue:
    "Protocol fees (FT discounted by actual swap price) from trading orders, liquidation penalties (in collateral tokens), and performance fees (in transferred tokens).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: "Fees charged for each borrow/lend tx, discounted by actual swap price at trade time.",
    [METRIC.LIQUIDATION_FEES]: "The penalty charged when a loan is liquidated.",
    [METRIC.PERFORMANCE_FEES]:
      "The performance fee charged for passive earn yield on TermMax.",
  },
  UserFees: {
    [METRIC.PROTOCOL_FEES]: "Fees charged for each borrow/lend tx, discounted by actual swap price at trade time.",
    [METRIC.LIQUIDATION_FEES]: "The penalty charged when a loan is liquidated.",
    [METRIC.PERFORMANCE_FEES]:
      "The performance fee charged for passive earn yield on TermMax.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Fees charged for each borrow/lend tx, discounted by actual swap price at trade time.",
    [METRIC.LIQUIDATION_FEES]: "The penalty charged when a loan is liquidated.",
    [METRIC.PERFORMANCE_FEES]:
      "The performance fee charged for passive earn yield on TermMax.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Fees charged for each borrow/lend tx, discounted by actual swap price at trade time.",
    [METRIC.LIQUIDATION_FEES]: "The penalty charged when a loan is liquidated.",
    [METRIC.PERFORMANCE_FEES]:
      "The performance fee charged for passive earn yield on TermMax.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2025-03-27" },
    [CHAIN.ARBITRUM]: { start: "2025-03-27" },
    [CHAIN.BSC]: { start: "2025-05-28" },
    [CHAIN.BERACHAIN]: { start: "2025-07-08" },
    [CHAIN.BSQUARED]: { start: "2026-02-15" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
