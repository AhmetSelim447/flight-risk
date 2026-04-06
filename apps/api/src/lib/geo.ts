// apps/api/src/lib/geo.ts
export function haversineKm(a:{lat:number;lng:number}, b:{lat:number;lng:number}) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sLat1 = Math.sin(dLat/2), sLng1 = Math.sin(dLng/2);
  const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180;
  const h = sLat1*sLat1 + Math.cos(lat1)*Math.cos(lat2)*sLng1*sLng1;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
