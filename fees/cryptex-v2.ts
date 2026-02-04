import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

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
  const dailyMakerFees = createBalances();
  const dailyTakerFees = createBalances();
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
      dailyMakerFees.addUSDValue(value.amount.toString() * price * fees / 1e36, { label: 'Maker position fees from TCAP product open and close events' })
    })

    taker_logs.forEach((value: any) => {
      const price = _prices[value!.version]
      const fees = takerFees[0].toString()
      dailyTakerFees.addUSDValue(value.amount.toString() * price * fees / 1e36, { label: 'Taker position fees from TCAP product open and close events' })
    })
  }

  const dailyFees = createBalances();
  dailyFees.addBalances(dailyMakerFees);
  dailyFees.addBalances(dailyTakerFees);
  const dailyRevenue = createBalances();
  dailyRevenue.addBalances(dailyMakerFees);
  dailyRevenue.addBalances(dailyTakerFees);
  return { dailyFees, dailyRevenue, }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: '2023-05-20'
    }
  },
  breakdownMethodology: {
    Fees: {
      'Maker position fees from TCAP product open and close events': 'Fees charged on maker positions when opening or closing TCAP perpetual product contracts, calculated as position size multiplied by the oracle price and the maker fee rate.',
      'Taker position fees from TCAP product open and close events': 'Fees charged on taker positions when opening or closing TCAP perpetual product contracts, calculated as position size multiplied by the oracle price and the taker fee rate.',
    },
    Revenue: {
      'Maker position fees from TCAP product open and close events': 'Fees charged on maker positions when opening or closing TCAP perpetual product contracts, calculated as position size multiplied by the oracle price and the maker fee rate.',
      'Taker position fees from TCAP product open and close events': 'Fees charged on taker positions when opening or closing TCAP perpetual product contracts, calculated as position size multiplied by the oracle price and the taker fee rate.',
    },
  },
}

export default adapter;
