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
