import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { BigNumberish } from "ethers";
import { fetchURLAutoHandleRateLimit } from "../utils/fetchURL";

const { tronToEvmAddress, evmToTronAddress } = sdk.util;

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

const fetch = async ({ createBalances, fromTimestamp, toTimestamp, }: FetchOptions): Promise<FetchResultFees> => {
  const context = await getContext(toTimestamp, {}, { fromTimestamp, toTimestamp });
  const dailyProtocolFees = createBalances();
  const dailyProtocolRevenue = createBalances();
  await getDailyProtocolFees(context, { dailyProtocolFees, dailyProtocolRevenue, });
  const dailySupplySideRevenue = createBalances();
  const tempBalance = dailyProtocolFees.clone();
  tempBalance.subtract(dailyProtocolRevenue);
  dailySupplySideRevenue.addBalances(tempBalance, 'Borrow Interest');

  // Energy Rental Market — JustLend's separate product where users rent
  // Energy from staked TRX. Income flows to sTRX, which keeps a fixed share as
  // reserves; the rest goes to sTRX stakers.
  await getDailyEnergyRentalFees(context, { dailyProtocolFees, dailyProtocolRevenue, dailySupplySideRevenue });

  return {
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
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// TronGrid caps each events response at 200. On busy days a single market emits more than
// 200 AccrueInterest events in a day (e.g. 398 on the USDT market on 2024-12-03), so a single
// capped request silently drops the remainder and undercounts borrow interest. Paginate with
// the fingerprint cursor.
const getLogs = async (tronAddress: string, eventName: string, min_block_timestamp: number, max_block_timestamp: number) => {
  let logs: any[] = [];
  let fingerprint: string | undefined = undefined;
  for (let page = 0; page < 200; page++) {
    const params = [
      `event_name=${eventName}`,
      `min_block_timestamp=${min_block_timestamp}`,
      `max_block_timestamp=${max_block_timestamp}`,
      'order_by=block_timestamp,asc',
      'limit=200',
    ];
    if (fingerprint) params.push(`fingerprint=${fingerprint}`);
    const url = `${endpoint}/v1/contracts/${tronAddress}/events?${params.join('&')}`;
    const res = await fetchURLAutoHandleRateLimit(url);
    const events = res.data ?? [];
    logs = logs.concat(events);
    fingerprint = res.meta?.fingerprint;
    if (!fingerprint || !events.length) break;
    await delay(2500);
  }
  return logs;
}
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
    const _logs = await getLogs(evmToTronAddress(address), 'AccrueInterest', startBlock, endBlock);
    logs = logs.concat(_logs);
    await delay(2500)
  }

  const raw_data: IAccrueInterestLog[] = logs.map((e: any) => {
    const x = e;
    const address = tronToEvmAddress(x.contract_address);
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
    dailyProtocolFees.add(underlying, Number(log.interestAccumulated), 'Borrow Interest');
    dailyProtocolRevenue.add(underlying, Number(log.interestAccumulated) * Number(reserveFactors[marketIndex]) / 1e18, 'Protocol Reserve Share');
  });
};

// Tagged on TronScan as `JustLend DAO: Energy Rental`. Verified source:
// https://tronscan.org/#/contract/TNoHbPuBQrVanVf9qxUsSvHdB2eDkeDAKD/code
// Renters pay two charges out of their deposit, and `subedSecurityDeposit` on
// `ReturnResource` is the refund of whatever is left:
// - rent for the time the energy is held. `RentIndex.income` is what the market
//   accrues over all open orders each time its index moves. `OrderIndex.rental`
//   is the same rent per order, booked only when that order is next touched, so
//   the two must never be added together.
// - a usage charge when energy comes back used: `usageRental` on `ReturnResource`
//   and on `Liquidate`. `liquidateFee` goes to the liquidator and isn't counted.
const ENERGY_RENTAL_CONTRACT = 'TU2MJ5Veik1LRAgjeSzEdvmDYx7mefJZvd';

// `reserveFactor().rentFactor` on sTRX (TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5), taken in `_settleIncome`:
// https://tronscan.org/#/contract/TUAV6ZSCXtF8KVvDKSeVmAbJEovTBf4HtG/code
// No `RentFactorUpdated` event has been emitted since the contract was created.
const STRX_RENT_RESERVE_SHARE = 0.2;

const getEventField = (event: any, field: string): number => {
  const value = event.result?.[field];
  if (value === undefined) throw new Error(`JustLend ${event.event_name} event ${event.transaction_id} has no ${field}`);
  return Number(value);
}

const getDailyEnergyRentalFees = async (
  { startBlock, endBlock }: IContext,
  { dailyProtocolFees, dailyProtocolRevenue, dailySupplySideRevenue }: { dailyProtocolFees: sdk.Balances, dailyProtocolRevenue: sdk.Balances, dailySupplySideRevenue: sdk.Balances },
) => {
  const trxToken = ADDRESSES.tron.WTRX.toLowerCase();
  const addRentalIncome = (sun: number, label: string) => {
    dailyProtocolFees.add(trxToken, sun, label);
    dailyProtocolRevenue.add(trxToken, sun * STRX_RENT_RESERVE_SHARE, 'Energy Rental Reserve Share');
    dailySupplySideRevenue.add(trxToken, sun * (1 - STRX_RENT_RESERVE_SHARE), label);
  }

  for (const event of await getLogs(ENERGY_RENTAL_CONTRACT, 'RentIndex', startBlock, endBlock))
    addRentalIncome(getEventField(event, 'income'), 'Energy Rental Duration Fee');
  await delay(2500);
  for (const event of await getLogs(ENERGY_RENTAL_CONTRACT, 'ReturnResource', startBlock, endBlock))
    addRentalIncome(getEventField(event, 'usageRental'), 'Energy Rental Fee');
  await delay(2500);
  for (const event of await getLogs(ENERGY_RENTAL_CONTRACT, 'Liquidate', startBlock, endBlock))
    addRentalIncome(getEventField(event, 'usageRental'), 'Energy Rental Fee');
};


const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TRON],
  start: '2023-11-19',
  // runAtCurrTime: true,
  methodology: {
    Fees: "Total interest paid by borrowers across all lending markets, plus the rent and usage charges paid by renters on the Energy Rental Market",
    Revenue: "Protocol's share of interest based on each market's reserve factor, plus the 20% of Energy Rental income that sTRX keeps as reserves",
    ProtocolRevenue: "Protocol's share of interest based on each market's reserve factor, plus the 20% of Energy Rental income that sTRX keeps as reserves",
    HoldersRevenue: "No revenue distributed to JST holders",
    SupplySideRevenue: "Interest paid to lenders in liquidity pools plus the 80% of Energy Rental income that goes to sTRX stakers",
  },
  breakdownMethodology: {
    Fees: {
      'Borrow Interest': 'Interest accrued from borrowers across all lending markets, calculated from AccrueInterest events',
      'Energy Rental Fee': 'Usage charge paid by renters when rented energy comes back used, from the usageRental field of ReturnResource and Liquidate events',
      'Energy Rental Duration Fee': 'Rent paid for the time energy is held, as accrued by the rental market, from the income field of RentIndex events',
    },
    Revenue: {
      'Protocol Reserve Share': 'Portion of borrow interest kept by the protocol based on each market\'s reserve factor',
      'Energy Rental Reserve Share': '20% of Energy Rental income that sTRX keeps as reserves',
    },
    ProtocolRevenue: {
      'Protocol Reserve Share': 'Portion of borrow interest kept by the protocol based on each market\'s reserve factor',
      'Energy Rental Reserve Share': '20% of Energy Rental income that sTRX keeps as reserves',
    },
    SupplySideRevenue: {
      'Borrow Interest': 'Borrow interest distributed to lenders (total interest minus protocol reserve share)',
      'Energy Rental Fee': '80% of the Energy Rental usage charge, which goes to sTRX stakers who provide the delegated TRX',
      'Energy Rental Duration Fee': '80% of the Energy Rental rent, which goes to sTRX stakers who provide the delegated TRX',
    },
  }
};

export default adapter;
