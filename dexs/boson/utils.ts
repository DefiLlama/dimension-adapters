import { ethers, MaxUint256 } from "ethers";
import { FetchOptions } from "../../adapters/types";

import {
  protocolDiamondAddress,
  fundsEncumberedTopic,
  offerCreatedTopic_v2_0_0,
  offerCreatedTopic_v2_3_0,
  offerCreatedTopic_v2_4_0,
  offerCreatedTopic_v2_5_0,
  rangeReservedTopic,
  OfferCreatedEvent_v2_0_0,
  OfferCreatedEvent_v2_3_0,
  OfferCreatedEvent_v2_4_0,
  OfferCreatedEvent_v2_5_0,
  RangeReservedEvent,
  FundsEncumberedEvent,
  getOffer_v2_5_0,
} from "./constants";

export async function getNewOffers(
  { getLogs }: FetchOptions,
  volumeByToken: Record<string, bigint>
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
    const quantityAvailable = BigInt(offer.offer.quantityAvailable);
    if (quantityAvailable === MaxUint256) continue; // skip unlimited offers

    const price = BigInt(offer.offer.price);
    const amount = quantityAvailable * price;
    const token = offer.offer.exchangeToken;
    volumeByToken[token] = (volumeByToken[token] || 0n) + amount;
  }
}

export async function getReservedRanges(
  { getLogs, api }: FetchOptions,
  volumeByToken: Record<string, bigint>
) {
  // only for unlimited offers, since they are not counted in getNewOffers
  const logs = await getLogs({
    target: protocolDiamondAddress,
    topics: [rangeReservedTopic],
    eventAbi: RangeReservedEvent,
  });

  for (const log of logs) {
    const offerId = BigInt(log.offerId);
    const startExchangeId = BigInt(log.startExchangeId);
    const endExchangeId = BigInt(log.endExchangeId);
    const quantityAvailable = endExchangeId - startExchangeId + 1n;

    // get offer details
    const blockNumber = api.block;
    api.block = "latest"; // to get the most recent offer data
    const [, offer] = await api.call({
      target: protocolDiamondAddress,
      abi: getOffer_v2_5_0,
      params: [offerId.toString()],
    });
    api.block = blockNumber; // restore original block number

    if (BigInt(offer.quantityAvailable) !== MaxUint256) continue; // skip limited offers

    const price = BigInt(offer.price);
    const amount = quantityAvailable * price;
    const token = offer.exchangeToken;
    volumeByToken[token] = (volumeByToken[token] || 0n) + amount;
  }
}

export async function getEncumberedFunds(
  { getLogs }: FetchOptions,
  volumeByToken: Record<string, bigint>
) {
  const FundsEncumberedLogs = await getLogs({
    target: protocolDiamondAddress,
    topics: [fundsEncumberedTopic],
    eventAbi: FundsEncumberedEvent,
  });

  for (const log of FundsEncumberedLogs) {
    const token = log.exchangeToken;
    const amount = BigInt(log.amount);
    volumeByToken[token] = (volumeByToken[token] || 0n) + amount;
  }
}
