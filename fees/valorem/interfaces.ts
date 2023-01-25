export interface IValoremDayData {
  date: number;
  notionalVolWrittenUSD: string;
  notionalVolExercisedUSD: string;
  notionalVolRedeemedUSD: string;
  notionalVolTransferredUSD: string;
  notionalVolSettledUSD: string;
  notionalVolSumUSD: string;
  notionalVolFeesAccruedUSD: string;
  notionalVolFeesSweptUSD: string;
}

export interface IValoremDailyRecordsResponse {
  dayDatas: IValoremDayData[];
}
