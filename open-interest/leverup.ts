import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const LEVERUP_DIAMOND = '0xea1b8E4aB7f14F7dCA68c5B214303B13078FC5ec';

const pairsV4Abi =
  'function pairsV4() view returns ((string name, address base, uint16 basePosition, uint8 pairType, uint8 status, uint256 maxLongOiUsd, uint256 maxShortOiUsd, uint256 fundingFeePerSecondP, uint256 minFundingFeeR, uint256 maxFundingFeeR, (uint256 notionalUsd, uint16 maxLeverage, uint16 initialLostP, uint16 liqLostP)[] leverageMargins, uint16 slippageConfigIndex, uint16 slippagePosition, (string name, uint256 onePercentDepthAboveUsd, uint256 onePercentDepthBelowUsd, uint16 openSlippageP, uint16 closeSlippageP, uint16 longPutSlippageP, uint16 shortPutSlippageP) slippageConfig, uint16 feeConfigIndex, uint16 feePosition, (uint16 openFeeP, uint16 closeFeeP, uint24 shareP, uint24 minCloseFeeP, uint24 lvTokenDiscountP) feeConfig, uint40 longHoldingFeeRate, uint40 shortHoldingFeeRate)[])';
const getMarketInfosAbi =
  'function getMarketInfos(address[] pairBases) view returns ((address pairBase, uint256 longQty, uint256 shortQty, uint128 lpLongAvgPrice, uint128 lpShortAvgPrice, int256 fundingFeeRate)[])';

async function fetch(options: FetchOptions) {
  const pairs = await options.api.call({
    target: LEVERUP_DIAMOND,
    abi: pairsV4Abi,
  });

  const pairBases = pairs.map((p: any) => p.base);

  const marketInfos = await options.api.call({
    target: LEVERUP_DIAMOND,
    abi: getMarketInfosAbi,
    params: [pairBases],
  });

  let longOpenInterest = 0;
  let shortOpenInterest = 0;

  marketInfos.forEach((info: any) => {
    const lQty = parseFloat(info.longQty);
    const sQty = parseFloat(info.shortQty);
    const lPrice = parseFloat(info.lpLongAvgPrice);
    const sPrice = parseFloat(info.lpShortAvgPrice);

    longOpenInterest += (lQty * lPrice) / 1e28;
    shortOpenInterest += (sQty * sPrice) / 1e28;
  });

  return {
    openInterestAtEnd: longOpenInterest + shortOpenInterest,
    longOpenInterestAtEnd: longOpenInterest,
    shortOpenInterestAtEnd: shortOpenInterest,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.MONAD],
  fetch,
  start: '2025-11-23',
};

export default adapter;
