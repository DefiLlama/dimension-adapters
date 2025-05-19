import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryEvents } from "../../helpers/sui";

async function getChainData(options: FetchOptions): Promise<FetchResultV2> {
  const events = await queryEvents({
    eventType:
      "0xe27969a70f93034de9ce16e6ad661b480324574e68d15a64b513fd90eb2423e5::position::OrderFilledEvent",
    options,
  });
  const dailyVolume = options.createBalances();

  for (const curr of events) {
    const parsedJson = curr;

    const trading_token_name = "0x" + parsedJson.symbol.base_token.name;
    dailyVolume.add(trading_token_name, Number(parsedJson.filled_size));
  }

  const events2 = await queryEvents({
    eventType: "0xe27969a70f93034de9ce16e6ad661b480324574e68d15a64b513fd90eb2423e5::trading::LiquidateEvent",
    options,
  });

  for (const curr of events2) {
    const parsedJson = curr;
    if (parsedJson.u64_padding.length > 0) {
      const position_size = parsedJson.u64_padding[0];
      const trading_token_name = "0x" + parsedJson.base_token.name;
      dailyVolume.add(trading_token_name, Number(position_size));
    }
  }

  return {
    dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: getChainData,
      start: "2025-4-1",
    },
  },
};

export default adapter;
