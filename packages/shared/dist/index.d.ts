export type ICAO = string;
export type IATA = string;
export type Airport = {
    icao: ICAO;
    iata?: IATA;
    city?: string;
    name?: string;
    coords?: {
        lat: number;
        lng: number;
    };
    runways?: {
        id: string;
        heading: number;
        length_m?: number;
    }[];
    freqs?: {
        twr?: string;
        app?: string;
        atis?: string;
        del?: string;
    };
};
export type MetType = "METAR" | "TAF";
export type MetReport = {
    type: MetType;
    issued_at_utc: string;
    valid_from_utc?: string;
    valid_to_utc?: string;
    raw: string;
    parsed?: {
        wind_dir?: number;
        wind_spd?: number;
        gust?: number;
        vis?: number;
        ceiling?: number;
        wx?: string[];
        temp?: number;
    };
    source: string;
};
export type NotamItem = {
    raw: string;
    severity: "Critical" | "Medium" | "Info";
    impacts: ("runway" | "nav" | "ops_hours")[];
    valid_from_utc?: string;
    valid_to_utc?: string;
    summary: string;
};
export type Risk = {
    score: number;
    class: "green" | "yellow" | "red";
    headwind: number;
    crosswind: number;
    reasons: string[];
    alternates: string[];
};
export type BriefResponse = {
    airports: {
        dep: Airport;
        arr: Airport;
    };
    met: {
        dep: MetReport[];
        arr: MetReport[];
    };
    notam: {
        dep: NotamItem[];
        arr: NotamItem[];
    };
    risk: Risk;
};
