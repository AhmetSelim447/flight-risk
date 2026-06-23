export declare function windComponents(rwyHeadingDeg: number, windDirDeg: number | undefined, windSpdKt: number | undefined): {
    head: number;
    cross: number;
};
type RiskInput = {
    vis?: number;
    ceiling?: number;
    wx?: string[];
    head: number;
    cross: number;
    crossLimit?: number;
    notamCritical: number;
};
export declare function riskScore(inp: RiskInput): {
    score: number;
    class: "green" | "yellow" | "red";
    reasons: string[];
};
export {};
