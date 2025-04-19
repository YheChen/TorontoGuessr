"use client";

import { useState } from "react";

export default function TestPanorama() {
  const [data, setData] = useState<
    {
      lat: number;
      lng: number;
      imageUrl: string;
      googleMapsLink: string;
    }[]
  >([]);

  const fetchPanoramas = async () => {
    const res = await fetch("/api/test-panorama");
    const json = await res.json();
    setData(json);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={fetchPanoramas}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded mb-6"
      >
        Generate 10 Random Panoramas
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.map((loc, index) => (
          <div key={index} className="space-y-2">
            <img
              src={loc.imageUrl}
              alt="Street View"
              className="rounded shadow"
            />
            <p className="text-sm">
              📍 {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
            </p>
            <a
              href={loc.googleMapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline text-sm"
            >
              View in Google Maps →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
