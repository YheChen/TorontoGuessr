export function calculateDistance(lat1, lon1, lat2, lon2) {
  const radiusKm = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radiusKm * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

export function calculateScore(distance) {
  if (distance <= 0.1) {
    return 5000;
  }

  if (distance >= 2) {
    return 0;
  }

  return Math.round(5000 * (1 - (distance - 0.1) / 1.9));
}
