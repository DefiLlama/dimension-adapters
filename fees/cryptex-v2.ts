import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../helpers/getBlock";
import { ethers } from "ethers";
import { getPrices } from "../utils/prices";
import { type } from "os";

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
  address: string;
}

const products: string[] = [
  '0x4243b34374cfb0a12f184b92f52035d03d4f7056', // TCAP
  '0x1cd33f4e6edeee8263aa07924c2760cf2ec8aad0', // TCAP
];

const make_closed_topic0 = '0x39854479080fac0b5e7c0ecedb0fb02308a72a43cd102c6b9f918653d3400367'
const make_opened_topic0 = '0xf98b31465ac12e92b5cb136ade913276c267463c4395bb1a3999bc88fb837806'
const take_closed_topic0 = '0x63625b85818a29587ee919ee6a968ee0b32f3513f2884b3968001062ba49eb6b'
const take_opened_topic0 = '0xb9726781b72c53f23217f424d70445b222951f008aeac7eece8139caed71ed2d'

const make_closed_event = 'event MakeClosed(address indexed account,uint256 version,uint256 amount)'
const make_opened_event = 'event MakeOpened(address indexed account,uint256 version,uint256 amount)'

const take_closed_event = 'event TakeClosed(address indexed account,uint256 version,uint256 amount)'
const take_opened_event = 'event TakeOpened(address indexed account,uint256 version,uint256 amount)'

const contract_interface = new ethers.Interface([
  make_closed_event,
  make_opened_event,
  take_closed_event,
  take_opened_event
]);

type IMapCoin = {
  [s: string]: string;
}
const coinsId: IMapCoin = {
  '0x4243b34374cfb0a12f184b92f52035d03d4f7056': 'coingecko:total-crypto-market-cap-token', // TCAP
  '0x1cd33f4e6edeee8263aa07924c2760cf2ec8aad0': 'coingecko:total-crypto-market-cap-token', // TCAP
}

const abis: any = {
  "makerFee": "uint256:makerFee",
  "takerFee": "uint256:takerFee",
  "atVersion": "function atVersion(uint256 oracleVersion) view returns ((uint256 version, uint256 timestamp, int256 price))"
}
type IPrice = {
  [s: string]: number;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {

  const fromTimestamp = timestamp - 60 * 60 * 24
  const toTimestamp = timestamp
  const fromBlock = (await getBlock(fromTimestamp, CHAIN.ARBITRUM, {}));
  const toBlock = (await getBlock(toTimestamp, CHAIN.ARBITRUM, {}));
  const make_closed_topic0_logs: ILog[] = (await Promise.all(products.map((address: string) => sdk.getEventLogs({
    target: address,
    toBlock: toBlock,
    fromBlock: fromBlock,
    chain: CHAIN.ARBITRUM,
    topics: [make_closed_topic0]
  })))).flat();

  const make_opened_topic0_logs: ILog[] = (await Promise.all(products.map((address: string) => sdk.getEventLogs({
    target: address,
    toBlock: toBlock,
    fromBlock: fromBlock,
    chain: CHAIN.ARBITRUM,
    topics: [make_opened_topic0]
  })))).flat();

  const take_closed_topic0_logs: ILog[] = (await Promise.all(products.map((address: string) => sdk.getEventLogs({
    target: address,
    toBlock: toBlock,
    fromBlock: fromBlock,
    chain: CHAIN.ARBITRUM,
    topics: [take_closed_topic0]
  })))).flat();

  const take_opened_topic0_logs: ILog[] = (await Promise.all(products.map((address: string) => sdk.getEventLogs({
    target: address,
    toBlock: toBlock,
    fromBlock: fromBlock,
    chain: CHAIN.ARBITRUM,
    topics: [take_opened_topic0]
  })))).flat();

  const [makerFee, takerFee] = await Promise.all(
    ['makerFee', 'takerFee'].map((method: string) =>
      sdk.api2.abi.multiCall({
        abi: abis[method],
        calls: products.map((address: string) => ({
          target: address,
        })),
        chain: CHAIN.ARBITRUM
      })
    )
  );

  const makerFees = makerFee.map((res: any) => Number(res) / 10 ** 18);
  const takerFees = takerFee.map((res: any) => Number(res) / 10 ** 18);

  const all: ILog[] = [
    ...make_closed_topic0_logs,
    ...make_opened_topic0_logs,
    ...take_closed_topic0_logs,
    ...take_opened_topic0_logs
  ]
  const versions = [...new Set(all.map(e => contract_interface.parseLog(e)).map(e => Number(e!.args.version)))];
  const price_ = (await sdk.api2.abi.multiCall({
    abi: abis.atVersion,
    calls: versions.map((version: number) => ({
      target: products[0],
      params: [version]
    })),
    chain: CHAIN.ARBITRUM
  }))
  const _prices: IPrice = {}
  price_.forEach((e: any) => {
    const raw_price: string = e.price;
    const version: string = e.version;
    const price = Number(raw_price.toString().replace('-', '')) / 10 ** 18;
    _prices[version] = price;
  });

  const maker_logs: ILog[] = [
    ...make_closed_topic0_logs,
    ...make_opened_topic0_logs,
  ]
  const taker_logs: ILog[] = [
    ...take_closed_topic0_logs,
    ...take_opened_topic0_logs
  ]

  const makerFeesAmount = maker_logs.map((a: ILog) => {
    const value = contract_interface.parseLog(a);
    const price = _prices[value!.args.version]
    const findIndex = products.findIndex(p => p.toLowerCase() === a.address.toLowerCase());
    const fees = makerFees[findIndex]
    return ((Number(value!.args.amount) / 1e18) * price) * fees;
  }).reduce((a: number, b: number) => a + b, 0)

  const takerFeesAmount = taker_logs.map((a: ILog) => {
    const value = contract_interface.parseLog(a);
    const price = _prices[value!.args.version]
    const findIndex = products.findIndex(p => p.toLowerCase() === a.address.toLowerCase());
    const fees = takerFees[findIndex]
    return ((Number(value!.args.amount) / 1e18) * price) * fees;
  }).reduce((a: number, b: number) => a + b, 0)

  const dailyFees = (makerFeesAmount + takerFeesAmount);
  const dailyRevenue = dailyFees;
  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    timestamp
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: 1684540800
    }
  }
}

export default adapter;
