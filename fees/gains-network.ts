import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { getBlock } from "../helpers/getBlock";
import BigNumber from "bignumber.js";
import { getPrices } from "../utils/prices";
import { Chain } from "@defillama/sdk/build/general";

interface IEvent {
  name: string;
  topic: string;
}

type IAddresses = {
  [s: string | Chain]: string[];
};

type CollateralConfig = {
  precision: BigNumber;
  slug: string;
};

interface ITx {
  address: string;
  data: string;
}

const event: IEvent[] = [
  {
    name: "DevGovFeeCharged(address indexed trader, uint valueDai)",
    topic: "0x4628f3d38f72d5f9e077d3965e10cd3242ff1316aa2bf81f054c0dfb25408406",
  },
  {
    name: "SssFeeCharged(address indexed trader, uint valueDai)",
    topic: "0xd1e388cc27c5125a80cf538c12b26dc5a784071d324a81a736e4d17f238588e4",
  },
  {
    name: "ReferralFeeCharged(address indexed trader, uint valueDai)",
    topic: "0x0f5273269f52308b9c40fafda3ca13cc42f715fcd795365e87f351f59e249313",
  },
  {
    name: "NftBotFeeCharged(address indexed trader, uint valueDai)",
    topic: "0xcada75418f444febbe725c87360b063440c54e00e82d578010de1ed009d756c5",
  },
  {
    name: "DaiVaultFeeCharged(address indexed trader, uint valueDai)",
    topic: "0x60c73da98faf96842eabd77a0c73964cd189dbaf2c9ae90923a3fed137f30e3e",
  },
  {
    name: "LpFeeCharged(address indexed trader, uint valueDai)",
    topic: "0xf3dd1b8102b506743ce65a97636e91051e861f4f8f7e3eb87f2d95d0a616cea2",
  },
  {
    name: "TriggerFeeCharged(address indexed trader, uint valueDai)",
    topic: "0x17fa86cf4833d28c6224a940e6bd001f2db0cb3d89d69727765679b3efee6559",
  },
  {
    name: "GovFeeCharged(address indexed trader, uint valueDai, bool distributed)",
    topic: "0xccd80d359a6fbe0bfa5cbb1ecf0854adbe8c67b4ed6bf10d3c0d78c2be0f48cb",
  },
  {
    name: "BorrowingFeeCharged(address indexed trader, uint tradeValueDai, uint feeValueDai)",
    topic: "0xe7d34775bf6fd7b34e703a903ef79ab16166ebdffce96a66f4d2f84b6263bb29",
  },
];

const ONE_E_18 = new BigNumber("10").pow(18);
const ONE_E_6 = new BigNumber("10").pow(6);

const USDC_CONFIG: CollateralConfig = {
  precision: ONE_E_6,
  slug: "coingecko:usdc",
};
const ETH_CONFIG: CollateralConfig = {
  precision: ONE_E_18,
  slug: "coingecko:eth",
};
const DAI_CONFIG: CollateralConfig = {
  precision: ONE_E_18,
  slug: "coingecko:dai",
};

const addressConfig: { [a: string]: CollateralConfig } = {
  "0x82e59334da8c667797009bbe82473b55c7a6b311": DAI_CONFIG,
  "0x0bbed2eac3237ba128643670b7cf3be475933755": ETH_CONFIG,
  "0x2ac6749d0affd42c8d61ef25e433f92e375a1aef": USDC_CONFIG,
  "0x298a695906e16aea0a184a2815a76ead1a0b7522": DAI_CONFIG,
  "0x62a9f50c92a57c719ff741133caa55c7a81ce019": ETH_CONFIG,
  "0x4542256c583bcad66a19a525b57203773a6485bf": USDC_CONFIG,
};

const contract_addresses: IAddresses = {
  [CHAIN.POLYGON]: [
    "0x82e59334da8c667797009bbe82473b55c7a6b311", // DAI TradingCallbacks
    "0x0bbed2eac3237ba128643670b7cf3be475933755", // ETH TradingCallbacks
    "0x2ac6749d0affd42c8d61ef25e433f92e375a1aef", // USDC TradingCallbacks
  ],
  [CHAIN.ARBITRUM]: [
    "0x298a695906e16aea0a184a2815a76ead1a0b7522", // DAI TradingCallbacks
    "0x62a9f50c92a57c719ff741133caa55c7a81ce019", // ETH TradingCallbacks
    "0x4542256c583bcad66a19a525b57203773a6485bf", // USDC TradingCallbacks
  ],
};

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const toTimestamp = getTimestampAtStartOfNextDayUTC(timestamp);

    const fromBlock = await getBlock(fromTimestamp, chain, {});
    const toBlock = await getBlock(toTimestamp, chain, {});
    const [
      devFeeCall,
      ssFeeCall,
      referralFeeCall,
      nftBotFeeCall,
      daiVaultCall,
      lpFeeCall,
      triggerFeeCall,
      govFeeCall,
      borrowingFeeCall,
    ]: any = await Promise.all(
      event.map((e: IEvent) =>
        sdk.getEventLogs({
          targets: contract_addresses[chain],
          topic: e.name,
          toBlock: toBlock,
          fromBlock: fromBlock,
          chain: chain,
          topics: [e.topic],
        })
      )
    );

    const prices = await getPrices(["coingecko:dai", "coingecko:eth", "coingecko:usdc"], fromTimestamp);

    const reducer = (a: BigNumber, c: BigNumber) => a.plus(c);
    const convertToUsd = (data: string, config: CollateralConfig) =>
      new BigNumber(data).div(config.precision || ONE_E_18).times(prices[config.slug]?.price || 1);
    const reduceToBn = (e: ITx[]) => e.map((p: ITx) => convertToUsd(p.data, addressConfig[p.address])).reduce(reducer, new BigNumber("0"));

    const devFeeValume = reduceToBn(devFeeCall);
    const ssFeeVol = reduceToBn(ssFeeCall);
    const referralFeeVol = reduceToBn(referralFeeCall);
    const nftBotFeeVol = reduceToBn(nftBotFeeCall);
    const daiVaultVol = reduceToBn(daiVaultCall);
    const lpFeeVol = reduceToBn(lpFeeCall);
    const triggerFeeVol = reduceToBn(triggerFeeCall);
    const govFeeVol = govFeeCall
      .map((p: ITx) => convertToUsd(p.data.slice(0, 66), addressConfig[p.address]))
      .reduce(reducer, new BigNumber("0"));
    const borrowingFeeVol = borrowingFeeCall
      .map((p: ITx) => convertToUsd("0x" + p.data.slice(66, 130), addressConfig[p.address]))
      .reduce(reducer, new BigNumber("0"));

    const dailyHoldersRevenue = ssFeeVol.toString();
    const dailyRevenue = devFeeValume.plus(ssFeeVol).plus(govFeeVol).toString();
    const dailyFees = devFeeValume
      .plus(ssFeeVol)
      .plus(govFeeVol)
      .plus(referralFeeVol)
      .plus(nftBotFeeVol)
      .plus(daiVaultVol)
      .plus(lpFeeVol)
      .plus(triggerFeeVol)
      .plus(borrowingFeeVol)
      .toString();

    return {
      timestamp,
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue,
    } as FetchResultFees;
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async () => 1654214400,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async () => 1672358400,
    },
  },
};

export default adapter;
