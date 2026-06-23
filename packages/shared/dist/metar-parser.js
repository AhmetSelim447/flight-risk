"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMetarRaw = parseMetarRaw;
const RE_WIND = /\b(\d{3}|VRB)(\d{2})(G(\d{2}))?KT\b/;
const RE_VIS_M = /\b(\d{4})\b/;
const RE_VIS_SM = /\b(?:P?)(\d+)(?:\/(\d+))?SM\b/;
const RE_CAVOK = /\bCAVOK\b/;
const RE_CEILING = /\b(BKN|OVC)(\d{3})\b/g;
const RE_WX = /\b(VA|TS|CB|SH|RA|SN|FG|BR|HZ|DZ|SG|PL|GR|GS|TSRA|SHRA|FZRA|FZDZ|SHSN)\b/g;
function parseMetarRaw(raw) {
    const out = {};
    const w = raw.match(RE_WIND);
    if (w) {
        if (w[1] !== "VRB")
            out.wind_dir = Number(w[1]);
        out.wind_spd = Number(w[2]);
        if (w[4])
            out.gust = Number(w[4]);
    }
    // CAVOK = Ceiling And Visibility OK → vis 9999, ceiling yok
    if (RE_CAVOK.test(raw)) {
        out.vis = 9999;
    }
    else {
        // Önce metre (4 haneli), sonra statute miles dene
        const windEndIdx = w ? (raw.indexOf(w[0]) + w[0].length) : 0;
        const afterWind = raw.slice(windEndIdx);
        const vm = afterWind.match(RE_VIS_M);
        const vsm = raw.match(RE_VIS_SM);
        if (vm) {
            out.vis = Number(vm[1]);
        }
        else if (vsm) {
            // Statute miles → metre dönüşümü
            const whole = Number(vsm[1]);
            const frac = vsm[2] ? whole / Number(vsm[2]) : whole;
            out.vis = Math.round(frac * 1609.34);
        }
    }
    const allCeil = Array.from(raw.matchAll(RE_CEILING), (m) => Number(m[2]) * 100);
    if (allCeil.length)
        out.ceiling = Math.min(...allCeil);
    const ph = raw.match(RE_WX);
    if (ph)
        out.wx = Array.from(new Set(ph));
    return out;
}
