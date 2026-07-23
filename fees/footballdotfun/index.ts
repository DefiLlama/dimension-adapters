import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CONTRACTS = [
  "0x9da1bB4e725ACc0d96010b7cE2A7244Cda446617",
  "0x4Fdce033b9F30019337dDC5cC028DC023580585e"
]

const BUY_EVENT = {
  event: "event PlayerTokensPurchase(address indexed buyer, address indexed recipient, uint256[] playerTokenIds, uint256[] playerTokenAmountsToBuy, uint256[] currencySpent, uint256[] newPlayerPrices, uint256[] feeAmounts)"
}

const SELL_EVENT = {
  event: "event CurrencyPurchase(address indexed buyer, address indexed recipient, uint256[] playerTokenIds, uint256[] playerTokenAmounts, uint256[] currencyReceived, uint256[] newPlayerPrices, uint256[] feeAmounts)"
}

const SWAP_EVENT = {
  event: "event TokensSwapped(address indexed swapper, address indexed recipient, uint256[] playerTokenIdsIn, uint256[] playerTokenAmountsIn, uint256[] playerTokenIdsOut, uint256[] playerTokenAmountsOut, uint256[] currencyReceivedArr, uint256[] sellFeeAmounts)"
}

async function fetch(options: FetchOptions) {
  const [buyEvents1, sellEvents1, swapEvents1, buyEvents2, sellEvents2, swapEvents2] = await Promise.all([
    options.getLogs({
      target: CONTRACTS[0],
      eventAbi: BUY_EVENT.event,
    }),
    options.getLogs({
      target: CONTRACTS[0],
      eventAbi: SELL_EVENT.event,
    }),
    options.getLogs({
      target: CONTRACTS[0],
      eventAbi: SWAP_EVENT.event,
    }),
    options.getLogs({
      target: CONTRACTS[1],
      eventAbi: BUY_EVENT.event,
    }),
    options.getLogs({
      target: CONTRACTS[1],
      eventAbi: SELL_EVENT.event,
    }),
    options.getLogs({
      target: CONTRACTS[1],
      eventAbi: SWAP_EVENT.event,
    })
  ]);

  const buyEvents = [...buyEvents1, ...buyEvents2];
  const sellEvents = [...sellEvents1, ...sellEvents2];
  const swapEvents = [...swapEvents1, ...swapEvents2];


  const buyfees = buyEvents.map(event => event.feeAmounts).flat().reduce((acc, fee) => acc + Number(fee), 0); // Includes both buy and buys within swaps
  const sellfees = sellEvents.map(event => event.feeAmounts).flat().reduce((acc, fee) => acc + Number(fee), 0);
  const swapfees = swapEvents.map(event => event.sellFeeAmounts).flat().reduce((acc, fee) => acc + Number(fee), 0); // These are sell fees within swap events
  const buyVolume = buyEvents.map(event => event.currencySpent).flat().reduce((acc, volume) => acc + Number(volume), 0); // Includes both buy and buys within swaps
  const sellVolume = sellEvents.map(event => event.currencyReceived).flat().reduce((acc, volume) => acc + Number(volume), 0);
  const swapVolume = swapEvents.map(event => event.currencyReceivedArr).flat().reduce((acc, volume) => acc + Number(volume), 0); // These are sell volumes within swap events

  const dailyVolume = (Number(buyVolume) + Number(sellVolume) + Number(swapVolume)) / 1e6;
  const dailyFees = (Number(buyfees) + Number(sellfees) + Number(swapfees)) / 1e6;

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyVolume
  };
}

const methodology = {
  Fees: "Dynamic Fees are collected For player token purchase and sell.",
  Revenue: "Dynamic Fees from player token purchase and sell.",
  ProtocolRevenue: "Dynamic Fees from player token purchase and sell goes to treasury.",
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2025-08-03",
  methodology
};

export default adapter;
