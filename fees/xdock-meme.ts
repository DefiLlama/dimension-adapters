import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const FeeCollectedEvent = "event TradeToken(address account,address token,bool isBuy,uint32 timestamp,uint256 ethAmount,uint256 tokenAmount,uint256 feeAmount,uint256 virtualTokenReserves,uint256 virtualEthReserves)"
const FeeToCreatorEvent = "event GraduateRewards(address token, address creator, uint256 rewards, uint32 timestamp)"

const WOKB = '0xe538905cf8410324e03a5a23c1c177a474d59b2b';
const XdockFeeCollector = '0xe6A5f4b8257BbAd4F033D3831ebF23E0F833961F';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const data: any[] = await options.getLogs({
    target: XdockFeeCollector,
    eventAbi: FeeCollectedEvent,
  });
  data.forEach((log: any) => {
    dailyFees.add(WOKB, log.feeAmount);
    dailyRevenue.add(WOKB, log.feeAmount);
  });
  
  const data1: any[] = await options.getLogs({
    target: XdockFeeCollector,
    eventAbi: FeeToCreatorEvent,
  });
  data1.forEach((log: any) => {
    dailyFees.add(WOKB, log.feeAmount);
    dailySupplySideRevenue.add(WOKB, log.feeAmount);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: 'All fees paid by users for launching, trading tokens.',
  Revenue: 'Fees collected by xdock.meme protocol.',
  ProtocolRevenue: 'Fees collected by xdock.meme protocol.',
  SupplySideRevenue: 'Fees paid to the creator after token graduation.',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.XLAYER],
  start: '2025-09-08',
  methodology,
}

export default adapter;
