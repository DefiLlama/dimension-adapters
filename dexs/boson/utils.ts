import { ethers } from "ethers";
import { FetchOptions } from "../../adapters/types";
import { addTokensReceived, getETHReceived } from "../../helpers/token";

import {
  protocolDiamondAddress,
  fundsDepositedTopic,
  fundsEncumberedTopic,
  offerCreatedTopic_v2_0_0,
  offerCreatedTopic_v2_3_0,
  offerCreatedTopic_v2_4_0,
  offerCreatedTopic_v2_5_0,
  OfferCreatedEvent_v2_0_0,
  OfferCreatedEvent_v2_3_0,
  OfferCreatedEvent_v2_4_0,
  OfferCreatedEvent_v2_5_0,
  FundsDepositedEvent,
  FundsEncumberedEvent,
} from "./constants";
import { Balances } from "@defillama/sdk";

export async function getNewOffers(
  { getLogs }: FetchOptions,
  dailyVolume: Balances
) {
  const response = await getLogs({
    target: protocolDiamondAddress,
    topics: [
      [
        offerCreatedTopic_v2_0_0,
        offerCreatedTopic_v2_3_0,
        offerCreatedTopic_v2_4_0,
        offerCreatedTopic_v2_5_0,
      ],
    ],
  });

  // Combine all versions of the OfferCreated event
  const iface = new ethers.Interface([
    OfferCreatedEvent_v2_0_0,
    OfferCreatedEvent_v2_3_0,
    OfferCreatedEvent_v2_4_0,
    OfferCreatedEvent_v2_5_0,
  ]);

  const offerLogs = response
    .map((log) => iface.parseLog(log)?.args)
    .filter((args) => args != null);

  for (const offer of offerLogs) {
    const price = BigInt(offer.offer.price);
    const token = offer.offer.exchangeToken;
    dailyVolume.add(token, price);
  }
}

export async function getEncumberedFunds(
  options: FetchOptions,
  dailyVolume: Balances
) {
  const response = await options.getLogs({
    target: protocolDiamondAddress,
    topics: [[fundsDepositedTopic, fundsEncumberedTopic]],
    onlyArgs: true,
  });

  // Combine all versions of the OfferCreated event
  const iface = new ethers.Interface([
    FundsEncumberedEvent,
    FundsDepositedEvent,
  ]);

  const parsedLogs = response
    .map((log) => iface.parseLog(log)?.args)
    .filter((args) => args != null);

  const uniqueTokens = new Set(
    parsedLogs.map((i) => i.tokenAddress || i.exchangeToken)
  );

  await addTokensReceived({
    target: protocolDiamondAddress,
    tokens: Array.from(uniqueTokens),
    options,
    balances: dailyVolume,
  });

  await getETHReceived({
    target: protocolDiamondAddress,
    balances: dailyVolume,
    options,
  });
}
