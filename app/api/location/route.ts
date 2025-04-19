// // app/api/location/route.ts
// import { NextResponse } from "next/server";
// import { getVerifiedLocations } from "@/lib/location-generator";

// export async function GET() {
//   try {
//     const locations = await getVerifiedLocations(1);
//     const location = locations[0]; // get the single location from the array
//     return NextResponse.json(location);
//   } catch (error) {
//     console.error("Error fetching location:", error);
//     return new NextResponse("Failed to generate location", { status: 500 });
//   }
// }
