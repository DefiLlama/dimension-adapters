//a helper library work with quadruple precision numbers that are used in InfinityPools

/**
 * Converts a quadruple precision number into a signed 256-bit integer.
 * Throws an error if the number overflows, underflows, or is improperly formatted.
 *
 * @param hexStr - A 128-bit hexadecimal string representing the quadruple precision number.
 * @returns The signed 256-bit integer as a BigInt.
 */
function toInt256(hexStr: string): bigint {
    const TOTAL_WIDTH = 128;
    const MANTISSA_WIDTH = 112;
    const EXPONENT_WIDTH = 15;
    const EXPONENT_BIAS = 16383;
  
    // Validate and sanitize the input
    if (
      typeof hexStr !== "string" ||
      !hexStr.startsWith("0x") ||
      hexStr.length !== 34
    ) {
      throw new Error(
        "Invalid input: The input must be a 128-bit hexadecimal string prefixed with '0x'."
      );
    }
  
    // Remove any whitespace or extraneous characters
    hexStr = hexStr.trim();
  
    // Convert the hexadecimal string to a binary string
    let binaryStr: string;
    try {
      binaryStr = BigInt(hexStr).toString(2).padStart(TOTAL_WIDTH, "0");
    } catch (err) {
      throw new Error(
        `Invalid hexadecimal string: ${hexStr}. Ensure it represents a valid 128-bit number.`
      );
    }
  
    if (binaryStr.length !== TOTAL_WIDTH) {
      throw new Error(
        `Invalid binary conversion: Expected ${TOTAL_WIDTH} bits, but got ${binaryStr.length} bits.`
      );
    }
  
    // Parse the sign bit, exponent, and mantissa
    const sign = binaryStr[0] === "1" ? BigInt(-1) : BigInt(1);
    const exponent = parseInt(binaryStr.slice(1, 1 + EXPONENT_WIDTH), 2);
    const mantissaStr = binaryStr.slice(1 + EXPONENT_WIDTH);
  
    // Handle special cases
    if (exponent === 0) {
      // Subnormal or zero
      if (mantissaStr === "0".repeat(MANTISSA_WIDTH)) {
        return BigInt(0); // Zero
      }
      // Subnormal: exponent is effectively 1 - EXPONENT_BIAS
      const mantissa = BigInt(`0b${mantissaStr}`);
      return (
        sign *
        (mantissa *
          BigInt(2) **
            (BigInt(1) - BigInt(EXPONENT_BIAS) - BigInt(MANTISSA_WIDTH)))
      );
    } else if (exponent === (1 << EXPONENT_WIDTH) - 1) {
      throw new Error("Overflow: The number is either infinity or NaN.");
    }
  
    // Normalized number
    const mantissa = BigInt(`0b1${mantissaStr}`); // Implicit leading 1
    const unbiasedExponent = BigInt(exponent - EXPONENT_BIAS);
  
    let result: bigint;
  
    if (unbiasedExponent - BigInt(MANTISSA_WIDTH) < 0) {
      result =
        sign *
        (mantissa / BigInt(2) ** (BigInt(MANTISSA_WIDTH) - unbiasedExponent));
    } else {
      result =
        sign *
        (mantissa * BigInt(2) ** (unbiasedExponent - BigInt(MANTISSA_WIDTH)));
    }
    // Calculate the final value
  
    // Check for overflow
    const MAX_INT256 = BigInt(
      "0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"
    );
    const MIN_INT256 = -BigInt(
      "0x8000000000000000000000000000000000000000000000000000000000000000"
    );
    if (result > MAX_INT256 || result < MIN_INT256) {
      throw new Error(
        "Overflow: The result exceeds the range of a signed 256-bit integer."
      );
    }
  
    return result;
  }
  
  /**
   * Convert unsigned 256-bit integer number into quadruple precision number.
   *
   * @param x unsigned 256-bit integer number
   * @returns quadruple precision number as a hexadecimal string
   */
  function fromUInt(x: bigint): string {
    if (x === BigInt(0)) {
      return "0x" + "00".repeat(16); // Return zero as a 16-byte hex string
    } else {
      let result = x;
  
      // Find the most significant bit (MSB)
      let msb = mostSignificantBit(result);
  
      // Adjust the value to fit in the required format
      if (msb < 112) result <<= BigInt(112 - msb);
      else if (msb > 112) result >>= BigInt(msb - 112);
  
      // Set the exponent and mantissa
      result =
        (result & BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF")) |
        (BigInt(16383 + msb) << BigInt(112));
  
      // Convert the result into a 16-byte hexadecimal string
      return "0x" + result.toString(16).padStart(32, "0");
    }
  }
  
  /**
   * Find the most significant bit (MSB) of a number.
   * @param value The input value
   * @returns The position of the most significant bit
   */
  function mostSignificantBit(value: bigint): number {
    let msb = 0;
    while (value >= BigInt(1) << BigInt(msb)) {
      msb++;
    }
    return msb - 1;
  }
  
  /**
   * Calculate x * y. Special values behave in the following way:
   *
   * NaN * x = NaN for any x.
   * Infinity * x = Infinity for any finite positive x.
   * Infinity * x = -Infinity for any finite negative x.
   * -Infinity * x = -Infinity for any finite positive x.
   * -Infinity * x = Infinity for any finite negative x.
   * Infinity * 0 = NaN.
   * -Infinity * 0 = NaN.
   * Infinity * Infinity = Infinity.
   * Infinity * -Infinity = -Infinity.
   * -Infinity * Infinity = -Infinity.
   * -Infinity * -Infinity = Infinity.
   *
   * @param x quadruple precision number as hex string
   * @param y quadruple precision number as hex string
   * @returns quadruple precision number as hex string
   */
  function mul(x: string, y: string): string {
    // Convert input hex strings to BigInt values
    const xBigInt = BigInt(x);
    const yBigInt = BigInt(y);
  
    let xExponent = (xBigInt >> BigInt(112)) & BigInt("0x7FFF");
    let yExponent = (yBigInt >> BigInt(112)) & BigInt("0x7FFF");
  
    // Check for NaN, Infinity, or zero cases
    if (xExponent === BigInt("0x7FFF")) {
      if (yExponent === BigInt("0x7FFF")) {
        if (xBigInt === yBigInt) {
          return toHex(xBigInt ^ BigInt(Number(xBigInt !== BigInt(0)))); // XOR with 1 for sign
        } else if (
          (xBigInt ^ yBigInt) ===
          BigInt("0x80000000000000000000000000000000")
        ) {
          return toHex(xBigInt | yBigInt); // OR for Infinity cases
        } else {
          return "0x7FF00000000000000000000000000000"; // NaN
        }
      } else {
        if (
          (yBigInt & BigInt("0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF")) ===
          BigInt(0)
        ) {
          return "0x7FF00000000000000000000000000000"; // NaN
        } else {
          return toHex(
            xBigInt ^ (yBigInt & BigInt("0x80000000000000000000000000000000"))
          );
        }
      }
    } else if (yExponent === BigInt("0x7FFF")) {
      if (
        (xBigInt & BigInt("0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF")) ===
        BigInt(0)
      ) {
        return "0x7FF00000000000000000000000000000"; // NaN
      } else {
        return toHex(
          yBigInt ^ (xBigInt & BigInt("0x80000000000000000000000000000000"))
        );
      }
    } else {
      let xSignifier = xBigInt & BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
      let ySignifier = yBigInt & BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
      if (xExponent === BigInt(0)) xExponent = BigInt(1);
      else xSignifier |= BigInt("0x10000000000000000000000000000");
  
      if (yExponent === BigInt(0)) yExponent = BigInt(1);
      else ySignifier |= BigInt("0x10000000000000000000000000000");
  
      xSignifier *= ySignifier;
      if (xSignifier === BigInt(0)) {
        return toHex(
          (xBigInt ^ yBigInt) &
            (BigInt("0x80000000000000000000000000000000") > BigInt(0)
              ? BigInt(1)
              : BigInt(0))
            ? BigInt("0x80000000000000000000000000000000")
            : BigInt("0x00000000000000000000000000000000")
        );
      }
  
      xExponent += yExponent;
  
      let msb: number =
        xSignifier >=
        BigInt("0x200000000000000000000000000000000000000000000000000000000")
          ? 225
          : xSignifier >=
            BigInt("0x100000000000000000000000000000000000000000000000000000000")
          ? 224
          : mostSignificantBit(xSignifier);
  
      if (xExponent + BigInt(msb) < BigInt(16496)) {
        // Underflow
        xExponent = BigInt(0);
        xSignifier = BigInt(0);
      } else if (xExponent + BigInt(msb) < BigInt(16608)) {
        // Subnormal
        if (xExponent < BigInt(16496)) xSignifier >>= BigInt(16496) - xExponent;
        else if (xExponent > BigInt(16496))
          xSignifier <<= xExponent - BigInt(16496);
        xExponent = BigInt(0);
      } else if (xExponent + BigInt(msb) > BigInt(49373)) {
        xExponent = BigInt("0x7FFF");
        xSignifier = BigInt(0);
      } else {
        if (msb > 112) xSignifier >>= BigInt(msb - 112);
        else if (msb < 112) xSignifier <<= BigInt(112 - msb);
  
        xSignifier &= BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFF");
  
        xExponent = xExponent + BigInt(msb) - BigInt(16607);
      }
  
      return toHex(
        ((xBigInt ^ yBigInt) & BigInt("0x80000000000000000000000000000000")) |
          (xExponent << BigInt(112)) |
          xSignifier
      );
    }
  }
  
  /**
   * Convert BigInt to hex string with `0x` prefix
   * @param value The BigInt value to be converted
   * @returns The hexadecimal string with `0x` prefix
   */
  function toHex(value: bigint): string {
    return "0x" + value.toString(16).padStart(32, "0");
  }
  
  export { toInt256, fromUInt, mul };
  