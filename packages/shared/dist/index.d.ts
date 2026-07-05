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
    crossLimit?: number;
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
    id?: string;
    raw?: string;
    text?: string;
    severity?: "Critical" | "Medium" | "Info";
    impacts?: ("runway" | "nav" | "ops_hours" | "airspace" | "lighting" | "surface" | "weather")[];
    valid_from_utc?: string;
    valid_to_utc?: string;
    validFrom?: string;
    validTo?: string;
    summary?: string;
    critical?: boolean;
    synthetic?: boolean;
    event?: {
        key: string;
        category: string;
        severity: "Critical" | "Medium" | "Info";
        critical: boolean;
        impacts: string[];
        validFrom: string;
        validTo: string;
        affectedRunway?: string;
        score: number;
        reason: string;
        syntheticMode: "deterministic" | "llm_text" | "hybrid";
    };
};
export type AiRiskModel = {
    mlScore: number;
    ruleScore: number;
    finalScore: number;
    notamSemanticScore: number;
    weatherAssessment?: {
        score: number;
        trainedScore?: number | null;
        heuristicScore?: number;
        floorScore?: number;
        floorApplied?: boolean;
        floorReasons?: string[];
        categories?: {
            key: string;
            label: string;
            status: string;
            detail: string;
            present: boolean;
            score: number;
        }[];
    };
    confidence: {
        level: "high" | "medium" | "low";
        score: number;
        summary: string;
        factors: string[];
    };
    drivers: string[];
    modelVersion: string;
    limitedAdjustment: {
        applied: boolean;
        fromClass: string;
        toClass: string;
        reason: string;
    };
};
export type AiBriefReport = {
    summary: string;
    riskInterpretation: string;
    notamImpacts: string[];
    weatherConcerns: string[];
    windConcerns: string[];
    alternateCommentary: string;
    confidenceNote: string;
    limitedAdjustment: string;
};
export type LegRiskSummary = {
    score: number;
    class: "green" | "yellow" | "red";
    reasons: string[];
    floors: string[];
    conditionsSource: "metar" | "taf" | "metar+taf" | "none";
    headwind: number;
    crosswind: number;
    vis?: number;
    ceiling?: number;
    wx?: string[];
};
export type FlightPlanSummary = {
    etdUtc: string;
    etaUtc: string;
    distanceKm: number;
    estFlightMin: number;
};
export type Risk = {
    score: number;
    class: "green" | "yellow" | "red";
    headwind: number;
    crosswind: number;
    reasons: string[];
    alternates: string[];
    ml?: AiRiskModel;
    legs?: {
        dep: LegRiskSummary;
        arr: LegRiskSummary;
    };
    plan?: FlightPlanSummary;
    degraded?: boolean;
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
    aiReport?: AiBriefReport;
};
export * from "./risk";
export * from "./metar-parser";
export * from "./notam-turkish";
export * from "./constants";
