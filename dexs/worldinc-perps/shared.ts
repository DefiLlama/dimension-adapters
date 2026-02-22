/**
 * Shared constants and helpers for World Inc (WCM) adapters (fees, spot volume, perp volume).
 */

export const COMPOSITE_EXCHANGE = "0x5e3Ae52EbA0F9740364Bd5dd39738e1336086A8b";
export const EXCHANGE_START_BLOCK = 7274994;

export const SPOT_PERP_TRADE_EVENT =
  "event NewTrade(uint64 indexed buyer, uint64 indexed seller, uint256 spotMatchQuantities, uint256 spotMatchData)";

export const ABI_GET_SPOT =
  "function getSpotOrderBook(uint32 token1, uint32 token2) external view returns (address, uint32 buyToken, uint32 payToken)";
export const ABI_GET_PERPS =
  "function getPerpOrderBook(uint32 token1, uint32 token2) external view returns (address, uint32 buyToken, uint32 payToken)";
export const ABI_GET_TOKEN_CONFIGS =
  "function readTokenConfig(uint32 tokenId) external view returns (uint256)";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const MASK_64 = BigInt("0xFFFFFFFFFFFFFFFF");

export function parseSpotMatchQuantities(smq: bigint) {
  const fromFee = smq & MASK_64;
  const toFee = (smq >> 64n) & MASK_64;
  const fromQuantity = (smq >> 128n) & MASK_64;
  const toQuantity = (smq >> 192n) & MASK_64;
  return { fromFee, toFee, fromQuantity, toQuantity };
}

export function positionRawToErc20Raw(
  raw: bigint,
  positionDecimals: number,
  erc20Decimals: number
): bigint {
  if (positionDecimals === erc20Decimals) return raw;
  if (erc20Decimals >= positionDecimals)
    return raw * 10n ** BigInt(erc20Decimals - positionDecimals);
  return raw / 10n ** BigInt(positionDecimals - erc20Decimals);
}

/** VaultTokenConfig: tokenAddress 0-159, positionDecimals 168, vaultDecimals 176, erc20Decimals 184, tokenId 200 (PublicStruct.sol). */
export function decodeVaultTokenConfig(vtc: bigint) {
  const vtcBigInt = BigInt(vtc);
  const tokenAddress =
    "0x" + (vtcBigInt & ((1n << 160n) - 1n)).toString(16).padStart(40, "0");
  const positionDecimals = Number((vtcBigInt >> 168n) & 0xffn);
  const vaultDecimals = Number((vtcBigInt >> 176n) & 0xffn);
  const erc20Decimals = Number((vtcBigInt >> 184n) & 0xffn);
  const tokenId = Number((vtcBigInt >> 200n) & 0xffffffffn);
  return { tokenAddress, positionDecimals, vaultDecimals, erc20Decimals, tokenId };
}
