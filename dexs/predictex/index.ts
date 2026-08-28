import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// PredictEX perpetual manager (proxy) on Base: every market's trades and
// liquidations are emitted from this single contract.
const PERPETUAL_MANAGER = "0x38c4E93bac87b2fb96931dAB876Bb683D388f1A8";
// Collateral of the PredictEX liquidity pool (native USDC on Base).
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

const TRADE_EVENT =
  "event Trade(uint24 indexed perpetualId,address indexed trader,tuple(uint16 leverageTDR,uint16 brokerFeeTbps,uint24 iPerpetualId,address traderAddr,uint32 executionTimestamp,address brokerAddr,uint32 submittedTimestamp,uint32 flags,uint32 iDeadline,address executorAddr,int128 fAmount,int128 fLimitPrice,int128 fTriggerPrice,bytes brokerSignature) order,bytes32 orderDigest,int128 newPositionSizeBC,int128 price,int128 fFeeCC,int128 fPnlCC,int128 fB2C)";
const LIQUIDATE_EVENT =
  "event Liquidate(uint24 perpetualId,address indexed liquidator,address indexed trader,int128 amountLiquidatedBC,int128 liquidationPrice,int128 newPositionSizeBC,int128 fFeeCC,int128 fPnlCC)";

// ABDK 64.64 fixed-point: value = x / 2**64.
const ABDKToFloat = (x: bigint): number => Number(x) / 2 ** 64;

// PredictEX markets quote prices as 1 + P(home), i.e. in [1, 2]. One contract
// pays out at most 1 USDC. The USDC a trader commits per contract is therefore
// (price - 1) on the long/home side and (2 - price) on the short/away side.
const sideValue = (isLong: boolean, price: number): number => (isLong ? price - 1 : 2 - price);

// Value a trade by the side of the *position* it acts on, not the order sign:
// closing a long with a sell is still long-side volume. The position before the
// trade is recovered from the emitted post-trade position (newPositionSizeBC)
// minus the executed amount; a trade that flips the position is split into a
// close leg (valued at the old side) and an open leg (valued at the new side).
function tradeVolume(amount: number, newPosition: number, price: number): number {
  const prev = newPosition - amount;
  const absAmount = Math.abs(amount);
  if (prev === 0 || Math.sign(prev) === Math.sign(amount)) return absAmount * sideValue(amount > 0, price);
  const closed = Math.min(absAmount, Math.abs(prev));
  const opened = absAmount - closed;
  return closed * sideValue(prev > 0, price) + opened * sideValue(amount > 0, price);
}

const toUSDC = (value: number): number => Math.round(value * 10 ** USDC_DECIMALS);

const fetch = async ({ getLogs, createBalances }: FetchOptions) => {
  const dailyVolume = createBalances();
  const dailyNotionalVolume = createBalances();

  const [trades, liquidations] = await Promise.all([
    getLogs({ target: PERPETUAL_MANAGER, eventAbi: TRADE_EVENT }),
    getLogs({ target: PERPETUAL_MANAGER, eventAbi: LIQUIDATE_EVENT }),
  ]);

  for (const trade of trades) {
    const amount = ABDKToFloat(trade.order.fAmount);
    const newPosition = ABDKToFloat(trade.newPositionSizeBC);
    const price = ABDKToFloat(trade.price);
    dailyVolume.add(USDC, toUSDC(tradeVolume(amount, newPosition, price)));
    dailyNotionalVolume.add(USDC, toUSDC(Math.abs(amount)));
  }

  for (const liquidation of liquidations) {
    const amount = ABDKToFloat(liquidation.amountLiquidatedBC);
    const newPosition = ABDKToFloat(liquidation.newPositionSizeBC);
    const price = ABDKToFloat(liquidation.liquidationPrice);
    dailyVolume.add(USDC, toUSDC(tradeVolume(amount, newPosition, price)));
    dailyNotionalVolume.add(USDC, toUSDC(Math.abs(amount)));
  }

  return { dailyVolume, dailyNotionalVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-03-31",
  methodology: {
    Volume:
      "USDC committed in trades and liquidations on PredictEX prediction markets. Market prices are quoted as 1 + P(home), so each contract is valued at (price - 1) on the home/long side and (2 - price) on the away/short side, using the side of the position being opened, extended or closed.",
    NotionalVolume:
      "Number of contracts traded (each contract pays out at most 1 USDC), i.e. the maximum payout traded.",
  },
};

export default adapter;
