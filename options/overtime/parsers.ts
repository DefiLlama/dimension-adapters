import { 
    ITicketCreatedEvent, 
    IBoughtFromAmmEvent, 
    ISpeedMarketCreatedEvent, 
    IChainedMarketCreatedEvent 
  } from './eventArgs';
  
  export function parseTicketCreatedEvent(
    log: ITicketCreatedEvent, 
    dailyNotionalVolume: any,
    dailyPremiumVolume: any
  ) {
    const { buyInAmount, payout, collateral } = log;
    dailyNotionalVolume.addToken(collateral, payout);
    dailyPremiumVolume.addToken(collateral, buyInAmount);
  }
  
  export function parseBoughtFromAmmEvent(
    log: IBoughtFromAmmEvent, 
    dailyNotionalVolume: any,
    dailyPremiumVolume: any
  ) {
    const { amount, sUSDPaid: usdcPaid } = log;
    dailyNotionalVolume.addUSDValue(Number(amount) / 1e18);
    dailyPremiumVolume.addUSDValue(Number(usdcPaid) / 1e6);
  }
  
  export function parseSpeedMarketCreatedEvent(
    log: ISpeedMarketCreatedEvent, 
    dailyNotionalVolume: any,
    dailyPremiumVolume: any
  ) {
    const { buyinAmount } = log;
    dailyNotionalVolume.addUSDValue(Number(buyinAmount) * 2 / 1e6);
    dailyPremiumVolume.addUSDValue(Number(buyinAmount) / 1e6);
  }
  
  export function parseChainedMarketCreatedEvent(
    log: IChainedMarketCreatedEvent, 
    dailyNotionalVolume: any,
    dailyPremiumVolume: any
  ) {
    const { buyinAmount, payoutMultiplier, directions } = log;
    const notionalVolume = (Number(buyinAmount) / 1e6) * Math.pow(Number(payoutMultiplier) / 1e18, directions.length);
    dailyNotionalVolume.addUSDValue(notionalVolume);
    dailyPremiumVolume.addUSDValue(Number(buyinAmount) / 1e6);
  }
