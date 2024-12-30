import { 
    ITicketCreatedEvent, 
    IBoughtFromAmmEvent, 
    ISpeedMarketCreatedEvent, 
    IChainedMarketCreatedEvent 
  } from './eventArgs';
  
  export function parseTicketCreatedEvent(log: ITicketCreatedEvent, dailyBalance: any) {
    const { payout, collateral } = log;
    dailyBalance.addToken(collateral, payout);
  }
  
  export function parseBoughtFromAmmEvent(log: IBoughtFromAmmEvent, dailyBalance: any) {
    const { amount } = log;
    dailyBalance.addUSDValue(Number(amount) / 1e18);
  }
  
  export function parseSpeedMarketCreatedEvent(log: ISpeedMarketCreatedEvent, dailyBalance: any) {
    const { buyinAmount } = log;
    dailyBalance.addUSDValue(Number(buyinAmount) / 1e6); 
  }
  
  export function parseChainedMarketCreatedEvent(log: IChainedMarketCreatedEvent, dailyBalance: any) {
    const { buyinAmount, payoutMultiplier } = log;
    dailyBalance.addUSDValue((Number(buyinAmount) / 1e6) * (Number(payoutMultiplier) / 1e18));
  }
