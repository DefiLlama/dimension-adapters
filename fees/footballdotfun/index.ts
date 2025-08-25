import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BUY_EVENT = {
  contract: "0x9da1bB4e725ACc0d96010b7cE2A7244Cda446617",
  event: "event PlayerTokensPurchase(address indexed buyer, address indexed recipient, uint256[] playerTokenIds, uint256[] playerTokenAmountsToBuy, uint256[] currencySpent, uint256[] newPlayerPrices, uint256[] feeAmounts)"
}

const SELL_EVENT = {
  contract: "0x9da1bB4e725ACc0d96010b7cE2A7244Cda446617",
  event: "event CurrencyPurchase(address indexed buyer, address indexed recipient, uint256[] playerTokenIds, uint256[] playerTokenAmounts, uint256[] currencyReceived, uint256[] newPlayerPrices, uint256[] feeAmounts)"
}

async function fetch(options: FetchOptions) {
  const buyEvents = await options.getLogs({
    target: BUY_EVENT.contract,
    eventAbi: BUY_EVENT.event,
  });
  const sellEvents = await options.getLogs({
    target: SELL_EVENT.contract,
    eventAbi: SELL_EVENT.event,
  });
  const buyfees = buyEvents.map(event => event.feeAmounts).flat().reduce((acc, fee) => acc + Number(fee), 0);
  const sellfees = sellEvents.map(event => event.feeAmounts).flat().reduce((acc, fee) => acc + Number(fee), 0);
  const dailyFees = (Number(buyfees) + Number(sellfees)) / 1e6;

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

const methodology = {
  Fees: "Dynamic Fees are collected For player token purchase and sell.",
  Revenue: "Dynamic Fees from player token purchase and sell.",
  ProtocolRevenue: "Dynamic Fees from player token purchase and sell goes to treasury.",
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: "2025-08-03",
  methodology
};

export default adapter;
