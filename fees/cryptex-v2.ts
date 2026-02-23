import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const products: string[] = [
  '0x4243b34374cfb0a12f184b92f52035d03d4f7056', // TCAP
  '0x1cd33f4e6edeee8263aa07924c2760cf2ec8aad0', // TCAP
];


const make_closed_event = 'event MakeClosed(address indexed account,uint256 version,uint256 amount)'
const make_opened_event = 'event MakeOpened(address indexed account,uint256 version,uint256 amount)'

const take_closed_event = 'event TakeClosed(address indexed account,uint256 version,uint256 amount)'
const take_opened_event = 'event TakeOpened(address indexed account,uint256 version,uint256 amount)'


const abis: any = {
  "makerFee": "uint256:makerFee",
  "takerFee": "uint256:takerFee",
  "atVersion": "function atVersion(uint256 oracleVersion) view returns ((uint256 version, uint256 timestamp, int256 price))"
}
type IPrice = {
  [s: string]: number;
}

const fetch = async ({ getLogs, api, createBalances }: FetchOptions) => {
  const dailyFees = createBalances();

  for (const product of products) {
    const make_closed_topic0_logs = await getLogs({ target: product, eventAbi: make_closed_event })
    const make_opened_topic0_logs = await getLogs({ target: product, eventAbi: make_opened_event })
    const take_closed_topic0_logs = await getLogs({ target: product, eventAbi: take_closed_event })
    const take_opened_topic0_logs = await getLogs({ target: product, eventAbi: take_opened_event })

    const [makerFees, takerFees] = await Promise.all(
      ['makerFee', 'takerFee'].map((method: string) => api.multiCall({ abi: abis[method], calls: [product], }))
    );

    const all = [make_closed_topic0_logs, make_opened_topic0_logs, take_closed_topic0_logs, take_opened_topic0_logs].flat()
    const versions = [...new Set(all.map(e => Number(e.version)))];
    const price_ = (await api.multiCall({ abi: abis.atVersion, target: products[0], calls: versions, }))
    const _prices: IPrice = {}
    price_.forEach((e: any) => {
      const raw_price: string = e.price;
      const version: string = e.version;
      const price = Number(raw_price.toString().replace('-', '')) / 10 ** 18;
      _prices[version] = price;
    });

    const maker_logs = [
      ...make_closed_topic0_logs,
      ...make_opened_topic0_logs,
    ]
    const taker_logs = [
      ...take_closed_topic0_logs,
      ...take_opened_topic0_logs
    ]

    maker_logs.forEach((value: any) => {
      const price = _prices[value!.version]
      const fees = makerFees[0].toString()
      dailyFees.addUSDValue(value.amount.toString() * price * fees / 1e36, METRIC.TRADING_FEES)
    })

    taker_logs.forEach((value: any) => {
      const price = _prices[value!.version]
      const fees = takerFees[0].toString()
      dailyFees.addUSDValue(value.amount.toString() * price * fees / 1e36, METRIC.TRADING_FEES)
    })
  }

  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2023-05-20',
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: 'Fees charged on maker and taker orders when opening or closing TCAP perpetual product contracts, calculated as position size multiplied by the oracle price and the maker/taker fee rate.',
    },
  },
}

export default adapter;
