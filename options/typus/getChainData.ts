import { queryEvents } from "../../helpers/sui";
import { FetchOptions, FetchResultV2 } from "../../adapters/types";


async function getChainData(
  options: FetchOptions,
): Promise<FetchResultV2> {
  const events = await queryEvents({eventType:"0x321848bf1ae327a9e022ccb3701940191e02fa193ab160d9c0e49cd3c003de3a::typus_dov_single::DeliveryEvent", options})
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  for (const curr of events) {
    const parsedJson = curr;
    if (parsedJson.o_token.name.endsWith("MFUD")) {
      const o_token_name = "0x76cb819b01abed502bee8a702b4c2d547532c12f25001c9dea795a5e631c26f1::fud::FUD";
      dailyNotionalVolume.add(o_token_name, Number(parsedJson.delivery_size) * 10 ** 5);
    } else {
      const o_token_name = "0x" + parsedJson.o_token.name;
      dailyNotionalVolume.add(o_token_name, Number(parsedJson.delivery_size));
    }

    if (parsedJson.b_token.name.endsWith("MFUD")) {
      const b_token_name = "0x76cb819b01abed502bee8a702b4c2d547532c12f25001c9dea795a5e631c26f1::fud::FUD";
      const _dailyPremiumVolume =
        (Number(parsedJson.bidder_bid_value) +
          Number(parsedJson.bidder_fee) +
          Number(parsedJson.incentive_bid_value) +
          Number(parsedJson.incentive_fee)) *
        10 ** 5;
      dailyPremiumVolume.add(b_token_name, _dailyPremiumVolume);
    } else {
      const b_token_name = "0x" + parsedJson.b_token.name;
      const _dailyPremiumVolume =
        Number(parsedJson.bidder_bid_value) +
        Number(parsedJson.bidder_fee) +
        Number(parsedJson.incentive_bid_value) +
        Number(parsedJson.incentive_fee);
      dailyPremiumVolume.add(b_token_name, _dailyPremiumVolume);
    }
  }

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
}

export default getChainData;
