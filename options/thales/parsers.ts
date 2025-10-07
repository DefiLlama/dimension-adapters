import { Balances } from '@defillama/sdk';
import {
  ITicketCreatedEvent,
  IBoughtFromAmmEvent,
  ISpeedMarketCreatedEvent,
  IChainedMarketCreatedEvent
} from './eventArgs';

export function parseTicketCreatedEvent(
  log: ITicketCreatedEvent,
  dailyNotionalVolume: Balances,
  dailyPremiumVolume: Balances
) {
  const { buyInAmount, payout, collateral } = log;
  dailyNotionalVolume.addToken(collateral, payout);
  dailyPremiumVolume.addToken(collateral, buyInAmount);
}

export function parseBoughtFromAmmEvent(
  log: IBoughtFromAmmEvent,
  dailyNotionalVolume: Balances,
  dailyPremiumVolume: Balances
) {
  const { amount, sUSDPaid: usdcPaid } = log;
  dailyNotionalVolume.addUSDValue(Number(amount) / 1e18);
  dailyPremiumVolume.addUSDValue(Number(usdcPaid) / 1e6);
}

export function parseSpeedMarketCreatedEvent(
  log: ISpeedMarketCreatedEvent,
  dailyNotionalVolume: Balances,
  dailyPremiumVolume: Balances
) {
  const { buyinAmount } = log;
  dailyNotionalVolume.addUSDValue(Number(buyinAmount) * 2 / 1e18);
  dailyPremiumVolume.addUSDValue(Number(buyinAmount) / 1e18);
}

export function parseChainedMarketCreatedEvent(
  log: IChainedMarketCreatedEvent,
  dailyNotionalVolume: Balances,
  dailyPremiumVolume: Balances
) {
  const { buyinAmount, payoutMultiplier, directions } = log;
  const notionalVolume = (Number(buyinAmount) / 1e18) * Math.pow(Number(payoutMultiplier) / 1e18, directions.length);
  dailyNotionalVolume.addUSDValue(notionalVolume);
  dailyPremiumVolume.addUSDValue(Number(buyinAmount) / 1e18);
}
