import axios from "axios";
import { getPrices } from "../../utils/prices";

interface ChainData {
  totalPremiumVolume: { [key: string]: number };
  dailyPremiumVolume: { [key: string]: number };
  totalNotionalVolume: { [key: string]: number };
  dailyNotionalVolume: { [key: string]: number };
  timestamp: string;
}

async function getChainData(timestamp: string): Promise<ChainData> {
  let end_timestamp = Number(timestamp);
  let start_timestamp = end_timestamp - 24 * 60 * 60;

  const response = await axios.post(
    "https://fullnode.mainnet.sui.io:443",
    suix_queryEvents,
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  // console.log(response.data.result.data);

  const acc: ChainData = {
    timestamp,
    totalNotionalVolume: {},
    dailyNotionalVolume: {},
    totalPremiumVolume: {},
    dailyPremiumVolume: {},
  };

  for (const curr of response.data.result.data) {
    const parsedJson = curr.parsedJson;
    // console.log(parsedJson);

    // const prices = await getPrices(
    //   ["sui:0x" + parsedJson.o_token.name, "sui:0x" + parsedJson.b_token.name],
    //   Number(curr.timestampMs) / 1000
    // );
    const dailyNotionalVolume =
      Number(parsedJson.delivery_size) /
      10 ** Number(parsedJson.o_token_decimal);

    const dailyPremiumVolume =
      (Number(parsedJson.bidder_bid_value) +
        Number(parsedJson.bidder_fee) +
        Number(parsedJson.incentive_bid_value) +
        Number(parsedJson.incentive_fee)) /
      10 ** Number(parsedJson.b_token_decimal);

    if ("sui:0x" + parsedJson.o_token.name in acc.totalNotionalVolume) {
      acc.totalNotionalVolume["sui:0x" + parsedJson.o_token.name] +=
        dailyNotionalVolume;
    } else {
      acc.totalNotionalVolume["sui:0x" + parsedJson.o_token.name] =
        dailyNotionalVolume;
    }

    if ("sui:0x" + parsedJson.b_token.name in acc.totalPremiumVolume) {
      acc.totalPremiumVolume["sui:0x" + parsedJson.b_token.name] +=
        dailyPremiumVolume;
    } else {
      acc.totalPremiumVolume["sui:0x" + parsedJson.b_token.name] =
        dailyPremiumVolume;
    }

    const timestamp = Number(curr.timestampMs) / 1000;
    if (timestamp > start_timestamp && timestamp <= end_timestamp) {
      if ("sui:0x" + parsedJson.o_token.name in acc.dailyNotionalVolume) {
        acc.dailyNotionalVolume["sui:0x" + parsedJson.o_token.name] +=
          dailyNotionalVolume;
      } else {
        acc.dailyNotionalVolume["sui:0x" + parsedJson.o_token.name] =
          dailyNotionalVolume;
      }

      if ("sui:0x" + parsedJson.b_token.name in acc.dailyPremiumVolume) {
        acc.dailyPremiumVolume["sui:0x" + parsedJson.b_token.name] +=
          dailyPremiumVolume;
      } else {
        acc.dailyPremiumVolume["sui:0x" + parsedJson.b_token.name] =
          dailyPremiumVolume;
      }
    }
  }

  return acc;
}

export default getChainData;

const suix_queryEvents = {
  jsonrpc: "2.0",
  id: 1,
  method: "suix_queryEvents",
  params: {
    query: {
      MoveEventType:
        "0x321848bf1ae327a9e022ccb3701940191e02fa193ab160d9c0e49cd3c003de3a::typus_dov_single::DeliveryEvent",
    },
  },
};
