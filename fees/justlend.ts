import { Adapter, ChainBlocks, FetchResultFees } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { BigNumberish } from "ethers";
import { getPrices } from "../utils/prices";
import { fromHex, toHex } from "tron-format-address";
import axios from "axios";

interface IPrices {
  [address: string]: {
    decimals: number;
    price: number;
    symbol: string;
    timestamp: number;
  };
}

interface IContext {
  currentTimestamp: number;
  startTimestamp: number;
  endTimestamp: number;
  startBlock: number;
  endBlock: number;
  markets: string[];
  underlyings: string[];
  reserveFactors: string[];
  prices: IPrices;
}
interface IAccrueInterestLog {
  market: string;
  cashPrior: BigNumberish;
  interestAccumulated: BigNumberish;
  borrowIndexNew: BigNumberish;
  totalBorrowsNew: BigNumberish;
}

interface ITx {
  address: string;
  data: string;
  topics: string[];
  transactionHash: string;
}

const comptrollerABI = {
  getAllMarkets: "function getAllMarkets() external view returns (address[])",
};


const tokenABI = {
  underlying: "function underlying() external view returns (address)",
  accrueInterest:"event AccrueInterest(uint256 cashPrior,uint256 interestAccumulated,uint256 borrowIndex,uint256 totalBorrows)",
  reserveFactorMantissa: "function reserveFactorMantissa() external view returns (uint256)",
};

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const context = await getContext(timestamp, {});
  const { dailyProtocolFees, dailyProtocolRevenue } = await getDailyProtocolFees(context);
  const dailySupplySideRevenue = (dailyProtocolFees - dailyProtocolRevenue);
  return {
    timestamp,
    dailyFees: dailyProtocolFees.toString(),
    dailyRevenue: dailyProtocolRevenue.toString(),
    dailyHoldersRevenue: dailyProtocolRevenue.toString(),
    dailySupplySideRevenue: `${dailySupplySideRevenue}`
  }
}

const getAllMarkets = async (
  unitroller: string,
  chain: CHAIN
): Promise<string[]> => {
  return (
    await sdk.api2.abi.call({
      target: unitroller,
      abi: comptrollerABI.getAllMarkets,
      chain: chain,
    })
  );
};

const getContext = async (timestamp: number, _: ChainBlocks): Promise<IContext> => {
  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const min_block_timestamp = fromTimestamp * 1000;
  const max_block_timestamp = toTimestamp * 1000;

  const underlyings: string[] = [
    'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR',
    'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    'TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT',
    'TKkeiboTkxXKJpbmVFbv4a8ov5rAfRDMf9',
    'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7',
    'TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9',
    'TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9',
    'TKfjV9RNKJJCqPvBtK8L7Knykh7DNWvnYt',
    'THb4CqiFdwNHsWsQCs4JhzwjMWys4aqCbF',
    'TUpMhErZL2fhh4sVNULAbNKLokS4GjC1F4',
    'TFczxzPhnThNSqr5by8tvxsdCFRRz6cPNq',
    'TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S',
    'TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8',
    'TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4',
    'TPYmHEhy5n8TCEfYGqW2rPxsghSfzghPDn',
    'TMz2SWatiAtZVVcH2ebpsbVtYwUPT9EdjH',
    'TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5',
    'TRFe3hT5oYhjSZ6f3ji5FJ7YCfrkWnHRvh',
    'TGkxzkDKyMeq2T7edKnyjZoFypyzjkkssq'
  ];

  const allMarketAddressess:string[] =[
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
    '100000000000000000',  '50000000000000000',
    '50000000000000000',   '1000000000000000000',
    '200000000000000000',  '100000000000000000',
    '200000000000000000',  '200000000000000000',
    '1000000000000000000', '50000000000000000',
    '200000000000000000',  '300000000000000000',
    '50000000000000000',   '200000000000000000',
    '50000000000000000',   '1000000000000000000',
    '100000000000000000',  '100000000000000000',
    '50000000000000000'
  ]
  const prices = await getPrices(
    [
      ...underlyings.filter((e: string) => e).map((x: string) => `${CHAIN.TRON}:${x.toLowerCase()}`),
    ],
    timestamp
  );

  return {
    currentTimestamp: timestamp,
    startTimestamp: fromTimestamp,
    endTimestamp: toTimestamp,
    startBlock: min_block_timestamp,
    endBlock: max_block_timestamp,
    markets: allMarketAddressess,
    underlyings,
    reserveFactors,
    prices,
  };
};

const getMarketDetails = async (markets: string[], chain: CHAIN): Promise<{underlyings: string[], reserveFactors:string[]}> => {
  const underlyings = await sdk.api2.abi.multiCall({
    calls: markets.map((market: string) => ({
      target: market,
    })),
    abi: tokenABI.underlying,
    chain: chain,
    permitFailure: true,
  });

  const reserveFactors = await sdk.api2.abi.multiCall({
    calls: markets.map((market: string) => ({
      target: market,
    })),
    abi: tokenABI.reserveFactorMantissa,
    chain: chain,
    permitFailure: true,
  });
  const _underlyings =  underlyings;
  _underlyings[0]  = 'TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR';
  return {
    underlyings: _underlyings,
    reserveFactors: reserveFactors,
  };
};

const endpoint = `https://api.trongrid.io`
const getLogs = async (address: string, min_block_timestamp: number, max_block_timestamp: number) => {
  const url = `${endpoint}/v1/contracts/${fromHex(address)}/events?event_name=AccrueInterest&min_block_timestamp=${min_block_timestamp}&max_block_timestamp=${max_block_timestamp}&limit=200`;
  const res = await axios.get(url, {});
  return res.data.data;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const getDailyProtocolFees = async ({
  markets,
  underlyings,
  reserveFactors,
  prices,
  startBlock,
  endBlock,
}: IContext) => {
  let dailyProtocolFees = 0;
  let dailyProtocolRevenue = 0;
  let logs: any[] = [];
  for(let i = 0; i < markets.length; i++) {
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
    const price = prices[`${CHAIN.TRON}:${underlying?.toLowerCase()}`];

    const interestTokens = Math.abs((Number(log.interestAccumulated) / (10 ** price?.decimals || 0)));
    const reserveFactor = Math.abs(Number(reserveFactors[marketIndex]) / 1e18);
    const interestUSD = interestTokens * price?.price || 0

    dailyProtocolFees += interestUSD;
    dailyProtocolRevenue += interestUSD * reserveFactor;
  });

  return {
    dailyProtocolFees,
    dailyProtocolRevenue,
  };
};


const adapter: Adapter = {
  adapter: {
    [CHAIN.TRON]: {
      fetch: fetch,
      start: async () => 1700352000,
      // runAtCurrTime: true,
    },
  },
};

export default adapter;
