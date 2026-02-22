import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import CoreAssets from "../../helpers/coreAssets.json";

const COMPOSITE_EXCHANGE = "0x5e3Ae52EbA0F9740364Bd5dd39738e1336086A8b";
const EXCHANGE_START_BLOCK = 7274994;

const SPOT_PERP_TRADE_EVENT = "event NewTrade(uint64 indexed buyer, uint64 indexed seller, uint256 spotMatchQuantities, uint256 spotMatchData)";
const ABI_GET_PERPS = "function getPerpOrderBook(uint32 token1, uint32 token2) external view returns (address, uint32 buyToken, uint32 payToken)";
const ABI_GET_SPOT = "function getSpotOrderBook(uint32 token1, uint32 token2) external view returns (address, uint32 buyToken, uint32 payToken)";
const ABI_GET_TOKEN_CONFIGS = "function readTokenConfig(uint32 tokenId) external view returns (uint256)";

interface OrderbookMarket {
  type: "PERPS" | "SPOT";
  baseTokenId: number;
  quoteTokenId: number;
}

interface Orderbooks {
  markets: Record<string, OrderbookMarket>;
  tokenDecimals: Record<number, number>;
  tokenErc20Decimals: Record<number, number>;
  tokenAddresses: Record<number, string>;
}

function parseSpotMatchQuantities(smq: bigint) {
  const MASK_64 = BigInt("0xFFFFFFFFFFFFFFFF");
  const fromFee = smq & MASK_64;
  const toFee = (smq >> 64n) & MASK_64;
  const fromQuantity = (smq >> 128n) & MASK_64;
  const toQuantity = (smq >> 192n) & MASK_64;
  return { fromFee, toFee, fromQuantity, toQuantity };
}

function positionRawToErc20Raw(raw: bigint, positionDecimals: number, erc20Decimals: number): bigint {
  if (positionDecimals === erc20Decimals) return raw;
  if (erc20Decimals >= positionDecimals) return raw * 10n ** BigInt(erc20Decimals - positionDecimals);
  return raw / 10n ** BigInt(positionDecimals - erc20Decimals);
}

function decodeVaultTokenConfig(vtc: bigint) {
  const vtcBigInt = BigInt(vtc);
  const addressMask = (1n << 160n) - 1n;
  const tokenAddress = "0x" + (vtcBigInt & addressMask).toString(16).padStart(40, "0");
  const positionDecimals = Number((vtcBigInt >> 168n) & 0xffn);
  const vaultDecimals = Number((vtcBigInt >> 176n) & 0xffn);
  const erc20Decimals = Number((vtcBigInt >> 184n) & 0xffn);
  const tokenId = Number((vtcBigInt >> 200n) & 0xffffffffn);
  return { tokenAddress, positionDecimals, vaultDecimals, erc20Decimals, tokenId };
}

async function getOrderbooks(options: FetchOptions, type: "PERPS" | "SPOT"): Promise<Orderbooks> {
  const orderbooks: Orderbooks = {
    markets: {},
    tokenDecimals: {},
    tokenErc20Decimals: {},
    tokenAddresses: {},
  };

  const highestTokenId = await options.api.call({
    abi: "function getHighestTokenId() external view returns (uint32)",
    target: COMPOSITE_EXCHANGE,
  });
  const maxId = Number(highestTokenId);

  const calls: Array<{ target: string; params: [number, number] }> = [];
  for (let token1 = 1; token1 <= maxId; token1++) {
    for (let token2 = 1; token2 <= maxId; token2++) {
      if (token1 === token2) continue;
      calls.push({ target: COMPOSITE_EXCHANGE, params: [token1, token2] });
    }
  }

  const tokenIds = new Set<number>();
  const abi = type === "PERPS" ? ABI_GET_PERPS : ABI_GET_SPOT;
  const callResults = await options.api.multiCall({
    abi,
    calls,
    permitFailure: true,
  });

  callResults.forEach((result: any) => {
    if (!result || result[0] == null) return;
    const addr = String(result[0]).toLowerCase();
    if (addr === CoreAssets.null || addr === "0x") return;
    const buyToken = Number(result[1]);
    const payToken = Number(result[2]);
    orderbooks.markets[addr] = { type, baseTokenId: buyToken, quoteTokenId: payToken };
    tokenIds.add(buyToken);
    tokenIds.add(payToken);
  });

  const tokenConfigCalls = Array.from(tokenIds).map((tokenId) => ({
    target: COMPOSITE_EXCHANGE,
    params: [tokenId],
  }));

  const tokenConfigs = await options.api.multiCall({
    abi: ABI_GET_TOKEN_CONFIGS,
    calls: tokenConfigCalls,
    permitFailure: true,
  });

  Array.from(tokenIds).forEach((tokenId, index) => {
    if (tokenConfigs[index] && tokenConfigs[index] !== 0n) {
      const config = decodeVaultTokenConfig(BigInt(tokenConfigs[index]));
      orderbooks.tokenDecimals[tokenId] = config.positionDecimals;
      orderbooks.tokenErc20Decimals[tokenId] = config.erc20Decimals || config.positionDecimals;
      if (config.tokenAddress && config.tokenAddress !== CoreAssets.null) {
        orderbooks.tokenAddresses[tokenId] = config.tokenAddress;
      }
    } else {
      orderbooks.tokenDecimals[tokenId] = 8;
      orderbooks.tokenErc20Decimals[tokenId] = 8;
    }
  });

  return orderbooks;
}

function getFetch(type: "PERPS" | "SPOT") {
  return async (options: FetchOptions): Promise<FetchResultVolume> => {
    const { getLogs, getFromBlock, getToBlock, createBalances } = options;
    const dailyVolume = createBalances();

    const orderbooks = await getOrderbooks(options, type);
    if (Object.keys(orderbooks.markets).length === 0) {
      return { dailyVolume };
    }

    const marketAddresses = Object.keys(orderbooks.markets);
    let fromBlock = await getFromBlock();
    const toBlock = await getToBlock();
    if (fromBlock == null || toBlock == null) {
      return { dailyVolume };
    }
    fromBlock = Math.max(fromBlock, EXCHANGE_START_BLOCK);

    try {
      const logs = await getLogs({
        targets: marketAddresses,
        eventAbi: SPOT_PERP_TRADE_EVENT,
        fromBlock,
        toBlock,
        entireLog: true,
      });

      const volumeByTokenIdRaw: Record<number, bigint> = {};
      function addVolumeRaw(tokenId: number, rawErc20: bigint) {
        if (!volumeByTokenIdRaw[tokenId]) volumeByTokenIdRaw[tokenId] = 0n;
        volumeByTokenIdRaw[tokenId] += rawErc20;
      }

      // One leg pays base (fromQuantity), one pays quote (toQuantity); different assets, not double-counting.
      for (const log of logs as any[]) {
        const eventData = log.args ?? log.parsedLog?.args ?? log;
        if (!eventData?.spotMatchQuantities) continue;

        const marketAddr = (log.address ?? log.srcAddress ?? log.target)?.toLowerCase();
        const config = orderbooks.markets[marketAddr];
        if (!config) continue;

        const baseId = config.baseTokenId;
        const quoteId = config.quoteTokenId;
        const basePosD = orderbooks.tokenDecimals[baseId] ?? 8;
        const quotePosD = orderbooks.tokenDecimals[quoteId] ?? 8;
        const baseErc = orderbooks.tokenErc20Decimals[baseId] ?? basePosD;
        const quoteErc = orderbooks.tokenErc20Decimals[quoteId] ?? quotePosD;

        const qty = parseSpotMatchQuantities(BigInt(eventData.spotMatchQuantities));
        if (qty.fromQuantity > 0n) {
          addVolumeRaw(baseId, positionRawToErc20Raw(qty.fromQuantity, basePosD, baseErc));
        }
        if (qty.toQuantity > 0n) {
          addVolumeRaw(quoteId, positionRawToErc20Raw(qty.toQuantity, quotePosD, quoteErc));
        }
      }

      const ZERO = CoreAssets.null ?? "0x0000000000000000000000000000000000000000";
      for (const [tokenIdStr, raw] of Object.entries(volumeByTokenIdRaw)) {
        const tokenId = Number(tokenIdStr);
        const addr = orderbooks.tokenAddresses[tokenId];
        if (!addr || addr === ZERO || raw === 0n) continue;
        dailyVolume.add(addr, raw);
      }

      return { dailyVolume };
    } catch (e) {
      return { dailyVolume };
    }
  };
}

export const perpsAdapter: SimpleAdapter = {
  version: 2,
  fetch: getFetch("PERPS"),
  chains: [CHAIN.MEGAETH],
  start: "2026-02-09",
};

export const spotAdapter: SimpleAdapter = {
  version: 2,
  fetch: getFetch("SPOT"),
  chains: [CHAIN.MEGAETH],
  start: "2026-02-09",
};
