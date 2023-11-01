export interface IValoremDayData {
  date: number;
  notionalVolWrittenUSD: string;
  notionalVolExercisedUSD: string;
  notionalVolRedeemedUSD: string;
  notionalVolTransferredUSD: string;
  notionalVolSettledUSD: string;
  notionalVolCoreSumUSD: string;
  volFeesAccruedUSD: string;
  volFeesSweptUSD: string;
}

export interface IValoremDailyRecordsResponse {
  dayDatas: IValoremDayData[];
}

export interface IValoremTokenDayData {
  date: number;
  token: {
    symbol: string;
  };
  notionalVolWritten: string;
  notionalVolTransferred: string;
  notionalVolSettled: string;
  notionalVolRedeemed: string;
  notionalVolExercised: string;
  notionalVolCoreSum: string;
  volFeesAccrued: string;
  volFeesSwept: string;
}

export interface IValoremDailyTokenRecordsResponse {
  tokenDayDatas: IValoremTokenDayData[];
}
