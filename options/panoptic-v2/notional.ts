/** Q64.96 fixed-point scale used for Uniswap V3 square-root prices. */
const Q96 = 1n << 96n;
/** Q128.128 scale used internally by Uniswap V3 TickMath ratio multiplication. */
const Q128 = 1n << 128n;
/** Scale removed when TickMath converts its Q128.128 ratio to Q64.96. */
const Q32 = 1n << 32n;
/** Largest uint256, used by TickMath to invert ratios for positive ticks. */
const MAX_UINT256 = (1n << 256n) - 1n;
/** Largest absolute tick supported by Uniswap V3 TickMath. */
const MAX_TICK = 887272n;
/** Least-significant absolute-tick bit, handled by TickMath's initial ratio. */
const LOWEST_TICK_BIT = 0x1n;
/** TickMath multiplier for the least-significant bit of the absolute tick. */
const ODD_TICK_MULTIPLIER = 0xfffcb933bd6fad37aa2d162d1a594001n;

/**
 * Remaining absolute-tick bit masks and fixed-point multipliers, ported from
 * Uniswap V3 TickMath.getSqrtRatioAtTick:
 * https://github.com/Uniswap/v3-core/blob/main/contracts/libraries/TickMath.sol
 */
const TICK_MULTIPLIERS: ReadonlyArray<readonly [bigint, bigint]> = [
  [0x2n, 0xfff97272373d413259a46990580e213an],
  [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
  [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
  [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
  [0x20n, 0xff973b41fa98c081472e6896dfb254c0n],
  [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
  [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n],
  [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
  [0x200n, 0xf987a7253ac413176f2b074cf7815e54n],
  [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
  [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n],
  [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
  [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n],
  [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
  [0x8000n, 0x31be135f97d08fd981231505542fcfa6n],
  [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
  [0x20000n, 0x5d6af8dedb81196699c329225ee604n],
  [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
  [0x80000n, 0x48a170391f7dc42444e8fa2n],
];

export type PanopticLeg = {
  asset: string;
  optionRatio: string;
  strike: string;
  tokenType: string;
  width: string;
};

function divideRoundingUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator % denominator === 0n ? quotient : quotient + 1n;
}

function getSqrtRatioAtTick(tick: bigint): bigint {
  if (tick < -MAX_TICK || tick > MAX_TICK) {
    throw new Error(`Panoptic leg tick ${tick} is outside the Uniswap V3 range`);
  }

  const absoluteTick = tick < 0n ? -tick : tick;
  let ratio =
    (absoluteTick & LOWEST_TICK_BIT) === 0n
      ? Q128
      : ODD_TICK_MULTIPLIER;

  for (const [mask, multiplier] of TICK_MULTIPLIERS) {
    if ((absoluteTick & mask) !== 0n) {
      ratio = (ratio * multiplier) >> 128n;
    }
  }

  if (tick > 0n) {
    ratio = MAX_UINT256 / ratio;
  }

  return divideRoundingUp(ratio, Q32);
}

function getLegTicks(strike: bigint, width: bigint, tickSpacing: bigint) {
  const range = width * tickSpacing;
  return {
    lower: strike - range / 2n,
    upper: strike + divideRoundingUp(range, 2n),
  };
}

/**
 * Returns the raw underlying-token notional used by Panoptic's /info analytics.
 * Each leg is valued independently, so multi-leg mints and burns report gross
 * options activity instead of netting the legs against one another.
 */
export function getLegNotionalAmount(
  leg: PanopticLeg,
  positionSize: bigint,
  tickSpacing: bigint,
): { amount: bigint; tokenType: 0 | 1 } {
  const tokenType = Number(leg.tokenType);
  if (tokenType !== 0 && tokenType !== 1) {
    throw new Error(`Invalid Panoptic tokenType ${leg.tokenType}`);
  }

  const { lower, upper } = getLegTicks(
    BigInt(leg.strike),
    BigInt(leg.width),
    tickSpacing,
  );
  const geometricMeanPriceX96 =
    (getSqrtRatioAtTick(lower) * getSqrtRatioAtTick(upper)) / Q96;
  const assetAmount = positionSize * BigInt(leg.optionRatio);

  if (leg.asset === "0") {
    return {
      amount:
        tokenType === 0
          ? assetAmount
          : divideRoundingUp(assetAmount * geometricMeanPriceX96, Q96),
      tokenType,
    };
  }

  if (leg.asset === "1") {
    return {
      amount:
        tokenType === 1
          ? assetAmount
          : divideRoundingUp(assetAmount * Q96, geometricMeanPriceX96),
      tokenType,
    };
  }

  throw new Error(`Invalid Panoptic asset ${leg.asset}`);
}
