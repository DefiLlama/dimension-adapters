import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const contract_address = {
  [CHAIN.BASE]: "0x0a2af931effd34b81ebcc57e3d3c9b1e1de1c9ce",
  [CHAIN.ARBITRUM]: "0xd762960c31210Cf1bDf75b06A5192d395EEDC659"
};
const usdt = 'tether'
const event_order_settled = 'event OrderSettled(uint128 indexed marketId,uint128 indexed accountId,uint256 fillPrice,int256 pnl,int256 accruedFunding,int128 sizeDelta,int128 newSize,uint256 totalFees,uint256 referralFees,uint256 collectedFees,uint256 settlementReward,bytes32 indexed trackingCode,address settler)'

const fetch = async (timestamp: number, _: ChainBlocks, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({
    target: contract_address[options.chain],
    eventAbi: event_order_settled
  });

  logs.forEach((log: any) => {
    const volume = Math.abs(Number(log.fillPrice)/1e18 * Number(log.sizeDelta)/1e18)
    dailyVolume.addCGToken(usdt, volume)
  });

  let openInterestUSD = 0;
  if (options.chain === CHAIN.BASE) {
    const data = await fetchURL('https://api.kwenta.io/perpsV3/markets');
    if (data && data.success && data.data && Array.isArray(data.data.markets)) {
      data.data.markets.forEach((market: any) => {
        if (market.provider === 'snx_v3_base' && !market.isSuspended) {
          openInterestUSD += Number(market.openInterest?.longUSD || 0);
          openInterestUSD += Number(market.openInterest?.shortUSD || 0);
        }
      });
    }
  }

  return {
    dailyVolume: dailyVolume,
    openInterestAtEnd: openInterestUSD
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-01-13',
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-06-24',
    }
  }
}
export default adapters
