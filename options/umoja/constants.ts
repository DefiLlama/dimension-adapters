const get_timestamp = (date: string) => new Date(date).getTime() / 1000;

export const min_start_date = "2024-02-05";
export const base_endpoint = "https://api.protocol.umoja.xyz";
export const hallmarks: [[number, string]] = [[get_timestamp("2024-02-05"), "Beta Launch"]];
export const methodology = {
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from synthetic option activation, which are about 1% of the notional value of option.",
};
