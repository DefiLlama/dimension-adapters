import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'

const EXCHANGE_V3_CONTRACT = "0xe3333700cA9d93003F00f0F71f8515005F6c00Aa";
const COMBO_POSITION_TOKEN_PREFIX = 3n;
const ORDER_FILLED_EVENT = "event OrderFilled (bytes32 indexed orderHash, address indexed maker, address indexed taker, uint8 side, uint256 tokenId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee, bytes32 builder, bytes32 metadata)";

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const orderFilledLogs = await options.getLogs({
    target: EXCHANGE_V3_CONTRACT,
    eventAbi: ORDER_FILLED_EVENT,
  })

  const exchangeAddress = EXCHANGE_V3_CONTRACT.toLowerCase();

  for (const log of orderFilledLogs) {
    const isTakerLeg = String(log.taker).toLowerCase() === exchangeAddress;
    if (!isTakerLeg) continue;

    const isComboPosition = (BigInt(log.tokenId) >> 248n) === COMBO_POSITION_TOKEN_PREFIX;
    if (!isComboPosition) continue;

    const isBuy = Number(log.side) === 0;
    const [usdVolume, notionalVolume] = isBuy
      ? [log.makerAmountFilled, log.takerAmountFilled]
      : [log.takerAmountFilled, log.makerAmountFilled];

    dailyVolume.add(ADDRESSES.polygon.PUSD, usdVolume);
    dailyNotionalVolume.add(ADDRESSES.polygon.PUSD, notionalVolume);

    dailyFees.add(ADDRESSES.polygon.PUSD, log.fee, 'Taker Fees');
    dailyRevenue.add(ADDRESSES.polygon.PUSD, log.fee, 'Taker Fees To Protocol');
  }

  return { dailyVolume, dailyNotionalVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone() };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-05-26",
  chains: [CHAIN.POLYGON],
  // Combos taker fees land in the Polymarket V2 fee recipient and are also counted in the polymarket fees adapter
  doublecounted: true,
  methodology: {
    Volume: 'USD value paid or received by takers on combo (parlay) positions traded on Polymarket.',
    NotionalVolume: 'Number of combo position shares traded by takers, each share paying out $1 if the combo resolves true.',
    Fees: 'Taker fees paid on combo position trades.',
    Revenue: 'All taker fees on combo trades go to Polymarket.',
    ProtocolRevenue: 'All taker fees on combo trades go to Polymarket.',
  },
  breakdownMethodology: {
    Fees: {
      'Taker Fees': 'Taker fees paid on combo position trades.',
    },
    Revenue: {
      'Taker Fees To Protocol': 'Taker fees on combo trades sent to the Polymarket fee recipient.',
    },
    ProtocolRevenue: {
      'Taker Fees To Protocol': 'Taker fees on combo trades sent to the Polymarket fee recipient.',
    },
  },
}

export default adapter;