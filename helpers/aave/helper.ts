function extractBits(data: bigint, startBit: number, bitLength: number) {
  const mask = (BigInt(1) << BigInt(bitLength)) - BigInt(1);
  return (data >> BigInt(startBit)) & mask;
}

export function decodeReserveConfig(rawDataStr: string) {
  const data = BigInt(rawDataStr);

  const decoded = {
    ltv: Number(extractBits(data, 0, 16)),
    liquidationThreshold: Number(extractBits(data, 16, 16)),
    liquidationBonus: Number(extractBits(data, 32, 16)),
    decimals: Number(extractBits(data, 48, 8)),
    isActive: Boolean(extractBits(data, 56, 1)),
    isFrozen: Boolean(extractBits(data, 57, 1)),
    borrowingEnabled: Boolean(extractBits(data, 58, 1)),
    stableRateBorrowingEnabled: Boolean(extractBits(data, 59, 1)),
    isPaused: Boolean(extractBits(data, 60, 1)),
    isolationModeBorrowingEnabled: Boolean(extractBits(data, 61, 1)),
    siloedBorrowingEnabled: Boolean(extractBits(data, 62, 1)),
    flashloaningEnabled: Boolean(extractBits(data, 63, 1)),
    reserveFactor: Number(extractBits(data, 64, 16)),
    borrowCap: Number(extractBits(data, 80, 36)),
    supplyCap: Number(extractBits(data, 116, 36)),
    liquidationProtocolFee: Number(extractBits(data, 152, 16)),
    eModeCategory: Number(extractBits(data, 168, 8)),
    unbackedMintCap: Number(extractBits(data, 176, 36)),
    debtCeiling: Number(extractBits(data, 212, 40)),
    virtualAccountingEnabled: Boolean(extractBits(data, 252, 1)),
    unused: Number(extractBits(data, 253, 3)),
  };

  return decoded;
}
