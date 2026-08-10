import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

const FEE_RECIPIENT = "0x6A80f57ac54123cB71e6c79B3935A381b87B4308";

const configs: Record<string, any> = {
  [CHAIN.BSC]: {
    start: "2026-03-17",
    messageContract: "0x0b3e65149C84A0aB56B199DeA3C48965a0569225",
  },
  [CHAIN.BASE]: {
    start: "2026-04-22",
    messageContract: "0xf3e05a607c97006b37d2b2789e17c3a832ba56f0",
  },
  [CHAIN.ETHEREUM]: {
    start: "2026-05-05",
    messageContract: "0xd33f10222a9783d30cb3a4dab51fed1a045c81e0",
  },
};

const fetch = async (options: FetchOptions) => {
  const dailyTradeFees = await addTokensReceived({
    options,
    target: FEE_RECIPIENT,
  });

  const dailyMessageFees = await addTokensReceived({
    options,
    target: configs[options.chain].messageContract,
  });

  const dailyFees = options.createBalances();

  dailyFees.add(dailyTradeFees, 'Trading Fees');
  dailyFees.add(dailyMessageFees, 'Message Fees');
  
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: configs,
  methodology: {
    Fees: 'Swap fees: 0.25% of every swap output collected + Chat-message fees: user payments to the AlloX message-purchase',
    Revenue: 'Swap fees: 0.25% of every swap output collected + user payments to the AlloX message-purchase',
    ProtocolRevenue: 'Swap fees: 0.25% of every swap output collected + user payments to the AlloX message-purchase',
  },
  breakdownMethodology: {
    Fees: {
      'Trading Fees': 'Swap fees: 0.25% of every swap output collected',
      'Message Fees': 'Chat-message fees: user payments to the AlloX message-purchase',
    },
    Revenue: {
      'Trading Fees': 'Swap fees: 0.25% of every swap output collected',
      'Message Fees': 'Chat-message fees: user payments to the AlloX message-purchase',
    },
  }
};

export default adapter;
