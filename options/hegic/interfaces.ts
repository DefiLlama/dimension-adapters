export interface AnalyticsData {
    positions: {
        active: Position[],
        closed: Position[],
    }
}

export interface Position {
    purchaseDate: string;
    amount: number;
    spotPrice: number;
    premiumPaid: number;
}