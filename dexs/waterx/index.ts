import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryEvents } from "../../helpers/sui";

const waterxPerp = "0x44dad8a2899167fe2806c2c298366c0824180fc382aa66cb8bd034b2e9aef96f";

const eventTypes = [
  `${waterxPerp}::events::PositionOpened`,
  `${waterxPerp}::events::PositionClosed`,
  `${waterxPerp}::events::PositionModified`,
  `${waterxPerp}::events::PositionLiquidated`,
];

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances();

  const results = await Promise.all(
    eventTypes.map((eventType) => queryEvents({ eventType, options }))
  );

  for (const events of results) {
    for (const event of events) {
      dailyVolume.addUSDValue(Number(event.volume_usd.value) / 1e9);
    }
  }

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2026-06-03",
    },
  },
};

export default adapter;
