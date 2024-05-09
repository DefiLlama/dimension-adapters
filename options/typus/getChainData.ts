import * as sdk from "@defillama/sdk";
import { httpPost } from "../../utils/fetchURL";

interface ChainData {
  totalPremiumVolume: { [key: string]: number };
  dailyPremiumVolume: { [key: string]: number };
  totalNotionalVolume: { [key: string]: number };
  dailyNotionalVolume: { [key: string]: number };
  timestamp: string;
}

async function getChainData(
  timestamp: string,
  backFillTimestamp: string | undefined = undefined
): Promise<ChainData> {
  let end_timestamp = Number(timestamp);
  let start_timestamp = end_timestamp - 24 * 60 * 60;

  var response = await httpPost(
    "https://fullnode.mainnet.sui.io:443",
    {
      jsonrpc: "2.0",
      id: 1,
      method: "suix_queryEvents",
      params: {
        query: {
          MoveEventType:
            "0x321848bf1ae327a9e022ccb3701940191e02fa193ab160d9c0e49cd3c003de3a::typus_dov_single::DeliveryEvent",
        },
        descending_order: true,
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  var data = response.result.data;

  if (backFillTimestamp) {
    while (response.result.hasNextPage) {
      response = await httpPost(
        "https://fullnode.mainnet.sui.io:443",
        {
          jsonrpc: "2.0",
          id: 1,
          method: "suix_queryEvents",
          params: {
            query: {
              MoveEventType:
                "0x321848bf1ae327a9e022ccb3701940191e02fa193ab160d9c0e49cd3c003de3a::typus_dov_single::DeliveryEvent",
            },
            descending_order: true,
            cursor: response.result.nextCursor,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      data = data.concat(response.result.data);

      const timestamp = Number(data.at(-1).timestampMs) / 1000;
      if (timestamp <= Number(backFillTimestamp)) {
        break;
      }
    }
  }

  const acc: ChainData = {
    timestamp,
    totalNotionalVolume: {},
    dailyNotionalVolume: {},
    totalPremiumVolume: {},
    dailyPremiumVolume: {},
  };

  for (const curr of data) {
    const parsedJson = curr.parsedJson;

    let o_token_name: string;
    let dailyNotionalVolume: number;

    if (parsedJson.o_token.name.endsWith("MFUD")) {
      o_token_name = "sui:0x76cb819b01abed502bee8a702b4c2d547532c12f25001c9dea795a5e631c26f1::fud::FUD";
      dailyNotionalVolume = Number(parsedJson.delivery_size) * 10 ** 5;
    } else {
      o_token_name = "sui:0x" + parsedJson.o_token.name;
      dailyNotionalVolume = Number(parsedJson.delivery_size);
    }

    let b_token_name: string;
    let dailyPremiumVolume: number;

    if (parsedJson.b_token.name.endsWith("MFUD")) {
      b_token_name = "sui:0x76cb819b01abed502bee8a702b4c2d547532c12f25001c9dea795a5e631c26f1::fud::FUD";
      dailyPremiumVolume =
        (Number(parsedJson.bidder_bid_value) +
          Number(parsedJson.bidder_fee) +
          Number(parsedJson.incentive_bid_value) +
          Number(parsedJson.incentive_fee)) *
        10 ** 5;
    } else {
      b_token_name = "sui:0x" + parsedJson.b_token.name;
      dailyPremiumVolume =
        Number(parsedJson.bidder_bid_value) +
        Number(parsedJson.bidder_fee) +
        Number(parsedJson.incentive_bid_value) +
        Number(parsedJson.incentive_fee);
    }

    if (o_token_name in acc.totalNotionalVolume) {
      acc.totalNotionalVolume[o_token_name] += dailyNotionalVolume;
    } else {
      acc.totalNotionalVolume[o_token_name] = dailyNotionalVolume;
    }

    if (b_token_name in acc.totalPremiumVolume) {
      acc.totalPremiumVolume[b_token_name] += dailyPremiumVolume;
    } else {
      acc.totalPremiumVolume[b_token_name] = dailyPremiumVolume;
    }

    const timestamp = Number(curr.timestampMs) / 1000;
    if (timestamp > start_timestamp && timestamp <= end_timestamp) {
      if (o_token_name in acc.dailyNotionalVolume) {
        acc.dailyNotionalVolume[o_token_name] += dailyNotionalVolume;
      } else {
        acc.dailyNotionalVolume[o_token_name] = dailyNotionalVolume;
      }

      if (b_token_name in acc.dailyPremiumVolume) {
        acc.dailyPremiumVolume[b_token_name] += dailyPremiumVolume;
      } else {
        acc.dailyPremiumVolume[b_token_name] = dailyPremiumVolume;
      }
    }
  }

  acc.dailyNotionalVolume = (await sdk.Balances.getUSDString(acc.dailyNotionalVolume, end_timestamp)) as any;
  acc.dailyPremiumVolume = (await sdk.Balances.getUSDString(acc.dailyPremiumVolume, end_timestamp)) as any;
  acc.totalPremiumVolume = (await sdk.Balances.getUSDString(acc.totalPremiumVolume, end_timestamp)) as any;
  acc.totalNotionalVolume = (await sdk.Balances.getUSDString(acc.totalNotionalVolume, end_timestamp)) as any;

  return acc;
}

export default getChainData;
