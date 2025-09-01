import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { BigNumberish } from "ethers";
import { fromHex, toHex } from "tron-format-address";
import { httpGet } from "../utils/fetchURL";

interface IContext {
  currentTimestamp: number;
  startTimestamp: number;
  endTimestamp: number;
  startBlock: number;
  endBlock: number;
  markets: string[];
  underlyings: string[];
  reserveFactors: string[];
}
interface IAccrueInterestLog {
  market: string;
  cashPrior: BigNumberish;
  interestAccumulated: BigNumberish;
  borrowIndexNew: BigNumberish;
  totalBorrowsNew: BigNumberish;
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, fromTimestamp, toTimestamp, }: FetchOptions): Promise<FetchResultFees> => {
  const context = await getContext(timestamp, {}, { fromTimestamp, toTimestamp });
  const dailyProtocolFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  await getDailyProtocolFees(context, { dailyProtocolFees, dailyProtocolRevenue, });
  const dailySupplySideRevenue = dailyProtocolFees.clone();
  dailySupplySideRevenue.subtract(dailyProtocolRevenue);
  return {
    timestamp,
    dailyFees: dailyProtocolFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue: dailySupplySideRevenue
  }
}

const getContext = async (timestamp: number, _: ChainBlocks, { fromTimestamp, toTimestamp }: { fromTimestamp: number, toTimestamp: number }): Promise<IContext> => {
  const min_block_timestamp = fromTimestamp * 1000;
  const max_block_timestamp = toTimestamp * 1000;

  const underlyings: string[] = [
    ADDRESSES.tron.WTRX,
    ADDRESSES.tron.USDT,
    ADDRESSES.tron.USDJ,
    ADDRESSES.tron.SUN_1,
    'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
    ADDRESSES.tron.BTC,
    ADDRESSES.tron.JST,
    ADDRESSES.tron.WBTT,
    ADDRESSES.tron.ETH,
    ADDRESSES.tron.TUSD,
    'TFczxzPhnThNSqr5by8tvxsdCFRRz6cPNq',
    ADDRESSES.tron.SUN,
    ADDRESSES.tron.USDC,
    ADDRESSES.tron.BTT,
    ADDRESSES.tron.USDD,
    ADDRESSES.tron.BUSD,
    'TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5',
    'TRFe3hT5oYhjSZ6f3ji5FJ7YCfrkWnHRvh',
    'TGkxzkDKyMeq2T7edKnyjZoFypyzjkkssq'
  ];

  const allMarketAddressess: string[] = [
    '0x2C7c9963111905d29eB8Da37d28b0F53A7bB5c28',
    '0xea09611b57e89d67FBB33A516eB90508Ca95a3e5',
    '0x6eF7C4870977C6a2543b0E8cF4F659AF883C96Dc',
    '0x4434BECA3Ac7D96E2b4eeF1974CF9bDdCb7A328B',
    '0xAC456571aC5A383b77C65D9Fdcd66D8aC2ed62bB',
    '0x7513102BC947f138B88F4BcC6acF73AcB8D4D087',
    '0xE03473f8720297d9bf887f2D7E4eC2EFc70c3460',
    '0xCbA95c5726a36046503570496E2C5a457Ed7c008',
    '0xa60befaf69b18090b762A83177F09831773967ea',
    '0xB5B1A24c3067f985ac2da2F6BcE0FA685Bf8eC06',
    '0x40262ab2a177fb3fc6d2709A816dB3b1A10BC78E',
    '0x94A7a1e585A77E2eDFd834005BE9F545Fe1f3C97',
    '0x88bb336C70A33FE2506240a19826C2aD487AE6d8',
    '0xcC1d948F9397dB4c047de179eB74Ca013529022A',
    '0xE7F8A90ede3d84c7c0166BD84A4635E4675aCcfC',
    '0x71169CC742905196D4ae1b6330e5366B5459A3dC',
    '0x5C78c77bbAD44c3EBD2088E6B7b5D5f01Bb0a8F5',
    '0xDDCBbCb2F17Db034fC970fBD87ffa7Da51bebbfC',
    '0x22163f4926c1B7e1d22dBbC76FBEF7F54d364d87'
  ];

  const reserveFactors: string[] = [
    '100000000000000000', '50000000000000000',
    '50000000000000000', '1000000000000000000',
    '200000000000000000', '100000000000000000',
    '200000000000000000', '200000000000000000',
    '1000000000000000000', '50000000000000000',
    '200000000000000000', '300000000000000000',
    '50000000000000000', '200000000000000000',
    '50000000000000000', '1000000000000000000',
    '100000000000000000', '100000000000000000',
    '50000000000000000'
  ]

  return {
    currentTimestamp: timestamp,
    startTimestamp: fromTimestamp,
    endTimestamp: toTimestamp,
    startBlock: min_block_timestamp,
    endBlock: max_block_timestamp,
    markets: allMarketAddressess,
    underlyings,
    reserveFactors,
  };
};

const endpoint = `https://api.trongrid.io`
// TODO: check and replace code to fetch logs more than 200
const getLogs = async (address: string, min_block_timestamp: number, max_block_timestamp: number) => {
  const url = `${endpoint}/v1/contracts/${fromHex(address)}/events?event_name=AccrueInterest&min_block_timestamp=${min_block_timestamp}&max_block_timestamp=${max_block_timestamp}&limit=200`;
  const res = await httpGet(url);
  return res.data;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const getDailyProtocolFees = async ({
  markets,
  underlyings,
  reserveFactors,
  startBlock,
  endBlock,
}: IContext, { dailyProtocolFees, dailyProtocolRevenue }: { dailyProtocolFees: sdk.Balances, dailyProtocolRevenue: sdk.Balances }) => {

  let logs: any[] = [];
  for (let i = 0; i < markets.length; i++) {
    const address = markets[i];
    await delay(2500)
    const _logs = await getLogs(address, startBlock, endBlock);
    logs = logs.concat(_logs);
    await delay(2500)
  }

  const raw_data: IAccrueInterestLog[] = logs.map((e: any) => {
    const x = e;
    const address = toHex(x.contract_address);
    return {
      market: address,
      cashPrior: x.result.cashPrior,
      interestAccumulated: x.result.interestAccumulated,
      borrowIndexNew: x.result.borrowIndex,
      totalBorrowsNew: x.result.totalBorrows,
    }
  });

  raw_data.forEach((log: IAccrueInterestLog) => {
    const marketIndex = markets.findIndex((e: string) => e.toLowerCase() === log.market.toLowerCase());
    const underlying = underlyings[marketIndex].toLowerCase();
    dailyProtocolFees.add(underlying, Number(log.interestAccumulated));
    dailyProtocolRevenue.add(underlying, Number(log.interestAccumulated) * Number(reserveFactors[marketIndex]) / 1e18);
  });
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.TRON]: {
      fetch: fetch,
      start: '2023-11-19',
      // runAtCurrTime: true,
    },
  },
  methodology: {
    Fees: "Total interest paid by borrowers",
    Revenue: "Protocol's share of interest treasury",
    ProtocolRevenue: "Protocol's share of interest into treasury",
    HoldersRevenue: "No revenue distributed to JST holders",
    SupplySideRevenue: "Interest paid to lenders in liquidity pools"
  }
};

export default adapter;
