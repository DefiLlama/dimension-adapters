import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// https://github.com/stryke-xyz/premarket-contracts (chainId 4326)
const EXCHANGE = "0xa3108eAE9C1A0E27b947D540E85cF1dF1484d659";
const REGISTRY = "0x61fD7E09bc31407eD2093708C68CBcA31d2c46bC";

const ORDER_FILLED_TOPIC =
  "0x3805c9898b62f0ab344491f0e6118904df3a201f66c8b3bea055fa0ab03580cf";

const GET_MARKET_ABI =
  "function getMarket(uint256 marketId) view returns (address collateral, address delivery, address settlement, uint256 p0, uint256 tickSize, uint256 tickSpacing, uint256 tokensPerTickSize, uint256 expiry, uint256 p1, uint256 p2, uint256 p3, uint256 p4, uint256 p5, uint256 isSpread, uint256 isCollateralScaled, uint256 p6, uint256 marketType, uint256 p7)";

const ERC20_X_ERC6909_MARKET_TYPE = 1n;
const VAULT_TOKEN_PRECISION = 10n ** 18n;

const word = (data: string, i: number) =>
  BigInt("0x" + data.slice(2 + i * 64, 2 + (i + 1) * 64));

type FillGroup = {
  marketId: bigint;
  exposureId: bigint;
  cashAmount: bigint;
  exposureAmount: bigint;
  sideCounts: [number, number];
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();

  const logs = await options.getLogs({
    target: EXCHANGE,
    topics: [ORDER_FILLED_TOPIC],
    entireLog: true,
  });

  // One economic trade emits two mirrored fills (maker + taker), so group
  // fills by everything except the side flag: mirrored pairs collapse and
  // each group counts max(makerSide, takerSide) trades. Orderbook
  // splits/merges also emit two fills, but for different exposure token ids
  // (the PRM and oPRM legs), so they land in different groups and both cash
  // legs count
  const groups = new Map<string, FillGroup>();
  for (const log of logs) {
    const makerIsExposureSide = word(log.data, 10) === 1n;
    const filledMaking = word(log.data, 14);
    const filledTaking = word(log.data, 15);
    const marketId = word(log.data, 13);
    const exposureId = word(log.data, 12);
    const cashAmount = makerIsExposureSide ? filledTaking : filledMaking;
    const exposureAmount = makerIsExposureSide ? filledMaking : filledTaking;

    const key = [log.transactionHash, marketId, exposureId, cashAmount, exposureAmount].join("|");
    let group = groups.get(key);
    if (!group) {
      group = { marketId, exposureId, cashAmount, exposureAmount, sideCounts: [0, 0] };
      groups.set(key, group);
    }
    group.sideCounts[makerIsExposureSide ? 0 : 1]++;
  }

  const trades = [...groups.values()];
  if (!trades.length) return { dailyVolume, dailyNotionalVolume };

  const marketIds = [...new Set(trades.map((t) => t.marketId.toString()))];
  const markets = await options.api.multiCall({
    abi: GET_MARKET_ABI,
    calls: marketIds.map((id) => ({ target: REGISTRY, params: [id] })),
  });
  const marketById = new Map(marketIds.map((id, i) => [id, markets[i]]));

  for (const trade of trades) {
    const market = marketById.get(trade.marketId.toString());
    if (!market) continue;

    const tradeCount = BigInt(Math.max(...trade.sideCounts));
    dailyVolume.add(market.collateral, trade.cashAmount * tradeCount);

    const exposureAmount = trade.exposureAmount * tradeCount;
    if (BigInt(market.marketType) === ERC20_X_ERC6909_MARKET_TYPE) {
      // Collateral-scaled markets need the position's tick, which is not
      // recoverable on-chain; no ERC6909 market has the flag set so far, so
      // skip their notional rather than book an unscaled number.
      if (BigInt(market.isCollateralScaled) === 1n) continue;
      const tickSize = BigInt(market.tickSize);
      const tickSpacing = BigInt(market.tickSpacing);
      const tickCount =
        BigInt(market.isSpread) === 1n && tickSize > 0n && tickSpacing > tickSize
          ? tickSpacing / tickSize
          : 1n;
      const notional =
        (tickCount * BigInt(market.tokensPerTickSize) * exposureAmount) /
        VAULT_TOKEN_PRECISION;
      dailyNotionalVolume.add(market.collateral, notional);
    } else {
      // ERC20xERC20 markets trade the pre-launch token itself; word 12 holds
      // its address.
      const exposureToken =
        "0x" + trade.exposureId.toString(16).padStart(40, "0");
      dailyNotionalVolume.add(exposureToken, exposureAmount);
    }
  }

  return {
    dailyVolume,
    dailyNotionalVolume,
  };
};

const methodology = {
  Volume:
    "Collateral/cash-side value exchanged in Premarket order fills, deduplicating the mirrored maker/taker fill events emitted for one economic trade. Orderbook splits and merges count the cash paid or received on both outcome legs.",
  NotionalVolume:
    "Outcome exposure traded. ERC6909 outcome-token fills are converted to collateral-denominated notional using the market's tick spacing and tokens-per-tick-size from the on-chain registry; ERC20xERC20 markets report the traded pre-launch token amount.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: "2026-04-15",
  methodology,
  // No pullHourly: each hourly slot resolves its timestamps to blocks
  // independently, and on MegaETH (~100k blocks/day) the boundary blocks
  // overlap between slots, double-counting trades.
};

export default adapter;
