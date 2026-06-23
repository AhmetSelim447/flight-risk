export type ParsedMet = {
    wind_dir?: number;
    wind_spd?: number;
    gust?: number;
    vis?: number;
    ceiling?: number;
    wx?: string[];
};
export declare function parseMetarRaw(raw: string): ParsedMet;
