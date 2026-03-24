import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { ethers } from "ethers";

/**
 * TermMax - Fixed-rate lending protocol
 * 
 * Tracks all Transfer events to treasury and classifies by source:
 * 1. Protocol Fees: From FT token contracts (borrow/lend fees, discounted to underlying value)
 * 2. Liquidation Fees: From GT contracts (liquidation penalties)
 * 3. Performance Fees: From performance fee manager (vault yield fees)
 */

const DEFAULT_TREASURY = "0x719e77027952929ed3060dbFFC5D43EC50c1cf79";
const TREASURY: Record<string, string> = {
  [CHAIN.BSQUARED]: "0x70e992E94474e4E9B2D964F6876c05cDE45f8E89",
};
const PERFORMANCE_FEE_MANAGER = "0xEEC1238f2191978528e31dFf120bB8030fc62ff2";

// FT Redeemer address - transfers from this address are redeemed FT proceeds,
// not new fee income. Excluding to avoid double-counting with FT fees.
const FT_REDEEMER = "0x79f5f259662Bc24E9C87DE00a1b866f5CA4b5A96";

async function getTransfers(
  options: FetchOptions,
  _from: string | null,
  _to: string | null,
  fromBlock: number,
  toBlock: number,
) {
  const eventAbi = "event Transfer (address indexed from, address indexed to, uint256 value)";
  const from = _from ? ethers.zeroPadValue(_from, 32) : null;
  const to = _to ? ethers.zeroPadValue(_to, 32) : null;
  return await options.getLogs({
    eventAbi,
    topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", from as any, to as any],
    fromBlock,
    toBlock,
    entireLog: true,
    noTarget: true,
    parseLog: true,
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
  const froms = logs.map(log => log.args.from);
  const addresses = logs.map(log => log.address);

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
    if (froms[i].toLowerCase() === FT_REDEEMER.toLowerCase()) continue;

    const tokenAddress = addresses[i];
    const gtConfig = gtConfigs[i];
    const marketAddress = marketAddresses[i];
    const balance = logs[i].args.value;

    if (gtConfig) {
      dailyUserFees.add(gtConfig.collateral, balance, METRIC.LIQUIDATION_FEES);
    } else if (marketAddress) {
      tuples.push({ log: logs[i], marketAddress, orderAddress: froms[i] });
    } else if (froms[i].toLowerCase() === PERFORMANCE_FEE_MANAGER.toLowerCase()) {
      dailyUserFees.add(tokenAddress, balance, METRIC.PERFORMANCE_FEES);
    }
  }

  if (tuples.length > 0) {
    const [allTokens, swapExactLogs, swapToExactLogs] = await Promise.all([
      // tokens(): [FT, XT, GT, collateral, underlying]
      safeMultiCall({
        abi: "function tokens() view returns (address, address, address, address, address)",
        calls: tuples.map((t) => t.marketAddress),
        permitFailure: true,
      }),
      options.getLogs({
        eventAbi: "event SwapExactTokenToToken(address indexed tokenIn, address indexed tokenOut, address caller, address recipient, uint128 tokenAmtIn, uint128 netTokenOut, uint128 feeAmt)",
        fromBlock,
        toBlock,
        entireLog: true,
        noTarget: true,
        parseLog: true,
      }),
      options.getLogs({
        eventAbi: "event SwapTokenToExactToken(address indexed tokenIn, address indexed tokenOut, address caller, address recipient, uint128 tokenAmtOut, uint128 netTokenIn, uint128 feeAmt)",
        fromBlock,
        toBlock,
        entireLog: true,
        noTarget: true,
        parseLog: true,
      }),
    ]);

    // config() for maturity and fee rates — separated because the complex
    // struct ABI may fail on some SDK versions or market contracts.
    const allConfigs = await safeMultiCall({
      abi: "function config() view returns ((address, uint64, (uint32, uint32, uint32, uint32, uint32, uint32)))",
      calls: tuples.map((t) => t.marketAddress),
      permitFailure: true,
    });

    const ftAddressSet = new Set<string>();
    const xtAddressSet = new Set<string>();
    const ftToMarket = new Map<string, string>();
    const xtToMarket = new Map<string, string>();
    const marketToFeeConfig = new Map<string, any>();

    for (const t of tuples) {
      ftAddressSet.add(t.log.address.toLowerCase());
    }
    for (let i = 0; i < tuples.length; i++) {
      const tokens = allTokens[i];
      const config = allConfigs[i];
      const market = tuples[i].marketAddress.toLowerCase();
      if (tokens?.[0]) {
        ftAddressSet.add(tokens[0].toLowerCase());
        ftToMarket.set(tokens[0].toLowerCase(), market);
      }
      if (tokens?.[1]) {
        xtAddressSet.add(tokens[1].toLowerCase());
        xtToMarket.set(tokens[1].toLowerCase(), market);
      }
      if (config?.[2]) {
        marketToFeeConfig.set(market, config[2]);
      }
    }

    const PRECISION = BigInt(1e18);
    const multByTxOrder = new Map<string, bigint>();
    const multByTx = new Map<string, bigint>();

    function storeMult(txHash: string, emitter: string, mult: bigint) {
      multByTxOrder.set(`${txHash}:${emitter.toLowerCase()}`, mult);
      multByTx.set(txHash, mult);
    }

    // Compute FT fee discount multiplier from swap event data.
    //
    // Uses taker/maker fee split formula for precise valuation:
    //   Case 1 (FT -> DebtToken):  mult = netTokenOut / (tokenAmtIn - feeAmt × tr/(tr+mr))
    //   Case 2 (DebtToken -> FT):  mult = tokenAmtIn  / (netTokenOut - feeAmt × tr/(tr+mr))
    //   Case 3 (XT -> DebtToken):  mult = (tokenAmtIn - netTokenOut) / (tokenAmtIn - feeAmt × tr/(tr+mr))
    //   Case 4 (DebtToken -> XT):  mult = (netTokenOut - tokenAmtIn) / (netTokenOut - feeAmt × tr/(tr+mr))
    //
    // where tr = takerFeeRate, mr = makerFeeRate (direction-dependent)
    function computeMultiplier(
      tokenInAddr: string,
      tokenOutAddr: string,
      tokenAmtIn: bigint,
      netTokenOut: bigint,
      feeAmt: bigint,
    ): bigint | null {
      let market: string | undefined;
      let isLend: boolean;

      if (ftAddressSet.has(tokenInAddr)) {
        // Case 1: sell FT (borrow)
        market = ftToMarket.get(tokenInAddr);
        isLend = false;
      } else if (ftAddressSet.has(tokenOutAddr)) {
        // Case 2: buy FT (lend)
        market = ftToMarket.get(tokenOutAddr);
        isLend = true;
      } else if (xtAddressSet.has(tokenInAddr)) {
        // Case 3: sell XT (lend)
        market = xtToMarket.get(tokenInAddr);
        isLend = true;
      } else if (xtAddressSet.has(tokenOutAddr)) {
        // Case 4: buy XT (borrow)
        market = xtToMarket.get(tokenOutAddr);
        isLend = false;
      } else {
        return null;
      }

      const feeConfig = market ? marketToFeeConfig.get(market) : null;
      const takerRate = BigInt(feeConfig ? (isLend ? feeConfig[0] : feeConfig[2]) : 0);
      const makerRate = BigInt(feeConfig ? (isLend ? feeConfig[3] : feeConfig[1]) : 0);
      const totalRate = takerRate + makerRate;
      const takerPortion = totalRate > 0n ? (feeAmt * takerRate) / totalRate : 0n;

      let numerator: bigint;
      let denominator: bigint;

      if (ftAddressSet.has(tokenInAddr)) {
        // Case 1: FT -> DebtToken
        numerator = netTokenOut;
        denominator = tokenAmtIn - takerPortion;
      } else if (ftAddressSet.has(tokenOutAddr)) {
        // Case 2: DebtToken -> FT
        numerator = tokenAmtIn;
        denominator = netTokenOut - takerPortion;
      } else if (xtAddressSet.has(tokenInAddr)) {
        // Case 3: XT -> DebtToken
        numerator = tokenAmtIn - netTokenOut;
        denominator = tokenAmtIn - takerPortion;
      } else {
        // Case 4: DebtToken -> XT
        numerator = netTokenOut - tokenAmtIn;
        denominator = netTokenOut - takerPortion;
      }

      if (denominator <= 0n || numerator <= 0n) return null;
      const mult = (numerator * PRECISION) / denominator;
      // Sanity: multiplier should be <= 1.0 (fee can't be worth more than face value)
      return mult <= PRECISION ? mult : null;
    }

    for (const log of swapExactLogs) {
      const mult = computeMultiplier(
        log.args.tokenIn.toLowerCase(),
        log.args.tokenOut.toLowerCase(),
        BigInt(log.args.tokenAmtIn),
        BigInt(log.args.netTokenOut),
        BigInt(log.args.feeAmt),
      );
      if (mult !== null) storeMult(log.transactionHash, log.address, mult);
    }

    for (const log of swapToExactLogs) {
      const mult = computeMultiplier(
        log.args.tokenIn.toLowerCase(),
        log.args.tokenOut.toLowerCase(),
        BigInt(log.args.netTokenIn),
        BigInt(log.args.tokenAmtOut),
        BigInt(log.args.feeAmt),
      );
      if (mult !== null) storeMult(log.transactionHash, log.address, mult);
    }

    // Fixed-rate fallback for fees without a matching swap event (e.g. issueFt mints).
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

    for (let i = 0; i < tuples.length; i++) {
      const { log, orderAddress } = tuples[i];
      const tokens = allTokens[i];
      if (tokens && tokens[4]) {
        const underlyingToken = tokens[4];
        let balance = log.args.value;

        // Primary: discount using swap-derived multiplier from the same tx
        const mult =
          multByTxOrder.get(
            `${log.transactionHash}:${orderAddress.toLowerCase()}`,
          ) ?? multByTx.get(log.transactionHash);
        if (mult && mult <= PRECISION) {
          balance = (balance * mult) / PRECISION;
        } else {
          // Fallback: apply fixed-rate simple-interest discount based on
          // time-to-maturity (for issueFt mint fees without matching swap)
          const maturity = Number(allConfigs[i]?.[1] ?? 0);
          if (maturity > options.endTimestamp) {
            const yearsToMaturity =
              (maturity - options.endTimestamp) / 86400 / 365;
            const factor = BigInt(
              Math.floor(1e18 / (1 + FALLBACK_ANNUAL_RATE * yearsToMaturity)),
            );
            balance = (balance * factor) / PRECISION;
          }
        }

        dailyUserFees.add(underlyingToken, balance, METRIC.PROTOCOL_FEES);
      }
    }
  }

  return { dailyUserFees };
}

const fetch = async (options: FetchOptions) => {
  const treasury = TREASURY[options.chain] ?? DEFAULT_TREASURY;

  const [fromBlock, toBlock] = await Promise.all([
    options.getFromBlock(),
    options.getToBlock(),
  ]);
  const logs = await getTransfers(options, null, treasury, fromBlock, toBlock);
  const { dailyUserFees } = await handleLogs(options, logs, fromBlock, toBlock);

  return {
    dailyUserFees,
    dailyFees: dailyUserFees,
    dailyRevenue: dailyUserFees,
    dailyProtocolRevenue: dailyUserFees,
  };
};

const methodology = {
  Fees: "Tracks Transfer events to treasury: protocol fees (FT discounted to underlying), liquidation fees (GT collateral), and performance fees.",
  Revenue: "Tracks Transfer events to treasury: protocol fees (FT discounted to underlying), liquidation fees (GT collateral), and performance fees.",
  ProtocolRevenue: "Tracks Transfer events to treasury: protocol fees (FT discounted to underlying), liquidation fees (GT collateral), and performance fees.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: "Fees charged for each borrow/lend tx, discounted by actual swap price at trade time.",
    [METRIC.LIQUIDATION_FEES]: "The penalty charged when a loan is liquidated.",
    [METRIC.PERFORMANCE_FEES]: "The performance fee charged for passive earn yield on TermMax.",
  }
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