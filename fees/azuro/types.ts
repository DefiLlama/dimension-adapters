export enum BetResult {
    Lost = 'Lost',
    Won = 'Won'
}

export type Bet = {
    amount: number;
    odds: number;
    result?: BetResult;
};
