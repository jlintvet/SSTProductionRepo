import React, { useState, useEffect, useRef } from "react";

// Convert lat/lon to tile x/y at a given integer zoom level
function latLonToTile(lat, lon, z) {
  const n = Math.pow(2, z);
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

// Convert tile x/y back to top-left lat/lon
function tileToLatLon(x, y, z) {
  const n = Math.pow(2, z);
  const lon = x / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
  const lat = latRad * 180 / Math.PI;
  return { lat, lon };
}

const TILE_SIZE = 256;

export default function CartoTileLayer({ pan, zoom, BASE_W, BASE_H, BOUNDS }) {
  const { north, south, west, east } = BOUNDS;

  // Pick an integer tile zoom level that gives ~good resolution
  // Map canvas width at current zoom vs world width in pixels at tile zoom
  const tileZoom = Math.min(12, Math.max(5, Math.round(Math.log2((BASE_W * zoom) / ((east - west) / 360 * TILE_SIZE)) + 1)));

  const topLeft = latLonToTile(north, west, tileZoom);
  const bottomRight = latLonToTile(south, east, tileZoom);

  const tiles = [];
  for (let tx = topLeft.x; tx <= bottomRight.x; tx++) {
    for (let ty = topLeft.y; ty <= bottomRight.y; ty++) {
      tiles.push({ tx, ty, tz: tileZoom });
    }
  }

  // For each tile, compute its pixel position on the canvas
  function tilePixelPos(tx, ty, tz) {
    const tileNW = tileToLatLon(tx, ty, tz);
    const tileSE = tileToLatLon(tx + 1, ty + 1, tz);

    const relX1 = (tileNW.lon - west) / (east - west);
    const relY1 = (north - tileNW.lat) / (north - south);
    const relX2 = (tileSE.lon - west) / (east - west);
    const relY2 = (north - tileSE.lat) / (north - south);

    return {
      left: relX1 * BASE_W * zoom,
      top: relY1 * BASE_H * zoom,
      width: (relX2 - relX1) * BASE_W * zoom,
      height: (relY2 - relY1) * BASE_H * zoom,
    };
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0, left: 0,
        width: `${BASE_W * zoom}px`,
        height: `${BASE_H * zoom}px`,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {tiles.map(({ tx, ty, tz }) => {
        const pos = tilePixelPos(tx, ty, tz);
        const src = `https://basemaps.cartocdn.com/light_nolabels/${tz}/${tx}/${ty}.png`;
        return (
          <img
            key={`${tz}-${tx}-${ty}`}
            src={src}
            alt=""
            style={{
              position: "absolute",
              left: pos.left,
              top: pos.top,
              width: pos.width,
              height: pos.height,
              imageRendering: "pixelated",
              display: "block",
            }}
            loading="lazy"
          />
        );
      })}
    </div>
  );
}