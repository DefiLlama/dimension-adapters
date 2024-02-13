import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const events = [
  'event DevGovFeeCharged(address indexed trader, uint valueUsdc)',
  'event SssFeeCharged(address indexed trader, uint valueUsdc)',
  'event ReferralFeeCharged(address indexed trader, uint valueUsdc)',
  'event UsdcVaultFeeCharged(address indexed trader, uint valueUsdc)',
];

const FEE_ADDRESS = {
  [CHAIN.ERA]: ["0xE95a6FCC476Dc306749c2Ac62fB4637c27ac578d", "0x6cf71FaeA3771D56e72c72501e7172e79116E2A3", "0x50853A14cD14CC6A891BF034A204A15d294AF056", "0x240d75373f9941b8F7FbA660b9ae73dfa655f7Da"],
  [CHAIN.ARBITRUM]: ["0x8d85f4615ea5F2Ea8D91C196aaD4C04D8416865C", "0xB88C3A703B3565cb7bfdB1806Ba3728C54dd4b91"],
};

const fetch = (addressList: string[]) => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, chain, }: FetchOptions): Promise<FetchResultFees> => {
    const USDC = (ADDRESSES as any)[chain].USDC;

    const [devFeeVol, ssFeeVol, referralFeeVol, usdcVaultFeeVol]: any = (await Promise.all(
      events.map(async (e: string) => (await getLogs({ targets: addressList, eventAbi: e })).reduce((acc, i) => acc + Number(i.valueUsdc), 0))
    ));
    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    dailyRevenue.add(USDC, devFeeVol + ssFeeVol)
    dailyFees.add(USDC, devFeeVol + ssFeeVol + referralFeeVol + usdcVaultFeeVol)

    return {
      timestamp,
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue: dailyRevenue,
    } as FetchResultFees
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch: fetch(FEE_ADDRESS[CHAIN.ERA]),
      start: 1690848000, // 2023/08/01 00:00:00
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(FEE_ADDRESS[CHAIN.ARBITRUM]),
      start: 1698883200, // 2023/11/02 00:00:00
    },
  },
};

export default adapter;
