import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const OBSERVER = "0xDb166a6E454d2a273Cd50CCD6420703564B2a830";

const AMM_STATUS_TRADING = 1;

const abis = {
  getAllInstruments:
    "function getAllInstruments() view returns (tuple(address instrumentAddr, string symbol, address market, tuple(uint8 ftype, bool isToken0Quote, address pair, uint64 scaler0, uint64 scaler1) dexV2Feeder, tuple(uint8 ftype, uint64 scaler0, address aggregator0, uint24 heartBeat0, uint64 scaler1, address aggregator1, uint24 heartBeat1) priceFeeder, uint16 initialMarginRatio, uint16 maintenanceMarginRatio, tuple(uint128 minMarginAmount, uint16 tradingFeeRatio, uint16 protocolFeeRatio, uint64 stabilityFeeRatioParam, uint8 qtype, uint128 tip) param, uint256 spotPrice, uint8 condition, tuple(uint32 expiry, uint32 timestamp, uint8 status, int24 tick, uint160 sqrtPX96, uint128 liquidity, uint128 totalLiquidity, uint128 totalShort, uint128 openInterests, uint128 totalLong, uint128 involvedFund, uint128 feeIndex, uint128 protocolFee, uint128 longSocialLossIndex, uint128 shortSocialLossIndex, int128 longFundingIndex, int128 shortFundingIndex, uint128 insuranceFund, uint128 settlementPrice)[] amms, uint256[] markPrices)[], tuple(uint32 timestamp, uint32 height))",
  getSetting:
    "function getSetting(address instrument) view returns (tuple(string symbol, address config, address gate, address market, address quote, uint8 decimals, uint16 initialMarginRatio, uint16 maintenanceMarginRatio, tuple(uint128 minMarginAmount, uint16 tradingFeeRatio, uint16 protocolFeeRatio, uint64 stabilityFeeRatioParam, uint8 qtype, uint128 tip) param))",
};

const fetch = async (options: FetchOptions) => {
  const openInterestAtEnd = options.createBalances();

  const [instruments] = await options.api.call({
    target: OBSERVER,
    abi: abis.getAllInstruments,
  });

  const live = instruments.filter((inst: any) =>
    inst.amms.some(
      (amm: any) =>
        Number(amm.status) === AMM_STATUS_TRADING && amm.openInterests !== "0" && Number(amm.openInterests) !== 0
    )
  );

  const settings = await options.api.multiCall({
    calls: live.map((inst: any) => ({ target: OBSERVER, params: [inst.instrumentAddr] })),
    abi: abis.getSetting,
  });

  live.forEach((inst: any, i: number) => {
    const quote = settings[i].quote;
    const quoteDecimals = Number(settings[i].decimals);

    inst.amms.forEach((amm: any, j: number) => {
      if (Number(amm.status) !== AMM_STATUS_TRADING) return;
      const oi = BigInt(amm.openInterests);
      if (oi === 0n) return;
      const markPrice = BigInt(inst.markPrices[j]);

      const amount = (oi * markPrice) / 10n ** BigInt(36 - quoteDecimals);
      openInterestAtEnd.add(quote, amount);
    });
  });

  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: "2024-06-26",
};

export default adapter;
