// // app/api/test-panorama/route.ts
// import { NextResponse } from "next/server";
// import { getVerifiedLocations } from "@/lib/location-generator";
// import { getStreetViewImageUrl } from "@/lib/streetview";

// export async function GET() {
//   try {
//     const locations = await getVerifiedLocations(1000); // ✅ make sure 10 is passed

//     const results = locations.map((loc) => ({
//       ...loc,
//       imageUrl: getStreetViewImageUrl(loc.lat, loc.lng),
//       googleMapsLink: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${loc.lat},${loc.lng}`,
//     }));

//     return NextResponse.json(results);
//   } catch (err) {
//     return new NextResponse("Error: " + String(err), { status: 500 });
//   }
// }
