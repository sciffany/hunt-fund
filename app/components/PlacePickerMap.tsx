"use client";

import { useEffect, useRef, useState } from "react";
import type { Circle, Map as LeafletMap, Marker } from "leaflet";
import { formatLatitude, formatLongitude } from "@/lib/work-arrival";
import "leaflet/dist/leaflet.css";

const DEFAULT_CENTER = { latitude: 1.3521, longitude: 103.8198 };
const inputClass =
  "mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-500";

function parsePoint(latitude: string, longitude: string) {
  if (!latitude.trim() || !longitude.trim()) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

export function PlacePickerMap({
  latitude,
  longitude,
  radiusMeters,
  onChange,
}: {
  latitude: string;
  longitude: string;
  radiusMeters: number;
  onChange: (latitude: string, longitude: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const circleRef = useRef<Circle | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const onChangeRef = useRef(onChange);
  const pointRef = useRef({ latitude, longitude, radiusMeters });
  const fittedRef = useRef(false);
  const lastPointRef = useRef<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  onChangeRef.current = onChange;
  pointRef.current = { latitude, longitude, radiusMeters };

  const applyRef = useRef(() => {});
  applyRef.current = () => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    const point = parsePoint(pointRef.current.latitude, pointRef.current.longitude);
    const radius = pointRef.current.radiusMeters;
    if (!point) {
      markerRef.current?.remove();
      markerRef.current = null;
      circleRef.current?.remove();
      circleRef.current = null;
      lastPointRef.current = null;
      return;
    }

    const latLng: [number, number] = [point.latitude, point.longitude];
    if (!markerRef.current) {
      markerRef.current = L.marker(latLng, {
        draggable: true,
        autoPan: true,
        icon: L.divIcon({
          className: "place-picker-pin",
          html: '<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#171717;border:2px solid #fff;box-shadow:0 0 0 1px #171717"></span>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).addTo(map);
      markerRef.current.on("dragend", () => {
        const position = markerRef.current?.getLatLng();
        if (!position) return;
        const nextLatitude = formatLatitude(position.lat);
        const nextLongitude = formatLongitude(position.lng);
        if (!nextLatitude || !nextLongitude) return;
        onChangeRef.current(nextLatitude, nextLongitude);
      });
    } else {
      markerRef.current.setLatLng(latLng);
    }

    if (!circleRef.current) {
      circleRef.current = L.circle(latLng, {
        radius,
        color: "#171717",
        weight: 1,
        fillColor: "#171717",
        fillOpacity: 0.12,
      }).addTo(map);
    } else {
      circleRef.current.setLatLng(latLng);
      circleRef.current.setRadius(radius);
    }

    const key = `${point.latitude},${point.longitude}`;
    const moved = key !== lastPointRef.current;
    lastPointRef.current = key;
    if (!moved || !circleRef.current) return;
    if (!fittedRef.current) {
      map.fitBounds(circleRef.current.getBounds(), {
        padding: [24, 24],
        maxZoom: 17,
      });
      fittedRef.current = true;
    } else {
      map.panTo(latLng);
    }
  };

  useEffect(() => {
    applyRef.current();
  }, [latitude, longitude, radiusMeters]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let map: LeafletMap | null = null;
    let observer: ResizeObserver | null = null;

    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !container.isConnected) return;

      const start = parsePoint(
        pointRef.current.latitude,
        pointRef.current.longitude,
      );
      map = L.map(container).setView(
        start
          ? [start.latitude, start.longitude]
          : [DEFAULT_CENTER.latitude, DEFAULT_CENTER.longitude],
        start ? 16 : 11,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      map.on("click", (event) => {
        const nextLatitude = formatLatitude(event.latlng.lat);
        const nextLongitude = formatLongitude(event.latlng.lng);
        if (!nextLatitude || !nextLongitude) return;
        onChangeRef.current(nextLatitude, nextLongitude);
      });

      if (cancelled) {
        map.remove();
        map = null;
        return;
      }

      leafletRef.current = L;
      mapRef.current = map;
      observer = new ResizeObserver(() => {
        map?.invalidateSize();
      });
      observer.observe(container);
      map.invalidateSize();
      applyRef.current();
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      leafletRef.current = null;
      fittedRef.current = false;
      lastPointRef.current = null;
    };
  }, []);

  function setCoordinate(kind: "latitude" | "longitude", value: string) {
    if (kind === "latitude") onChangeRef.current(value, pointRef.current.longitude);
    else onChangeRef.current(pointRef.current.latitude, value);
  }

  function normalizeCoordinate(kind: "latitude" | "longitude") {
    const raw =
      kind === "latitude" ? pointRef.current.latitude : pointRef.current.longitude;
    if (!raw.trim()) return;
    const formatted =
      kind === "latitude" ? formatLatitude(Number(raw)) : formatLongitude(Number(raw));
    if (!formatted || formatted === raw) return;
    setCoordinate(kind, formatted);
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocateError("This browser can’t share your location.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const nextLatitude = formatLatitude(position.coords.latitude);
        const nextLongitude = formatLongitude(position.coords.longitude);
        if (!nextLatitude || !nextLongitude) {
          setLocateError("This location can’t be used.");
          return;
        }
        onChangeRef.current(nextLatitude, nextLongitude);
      },
      () => {
        setLocating(false);
        setLocateError("Allow location access, or click the map.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  return (
    <div className="space-y-2">
      <style>{".leaflet-div-icon.place-picker-pin{background:transparent;border:none}"}</style>
      <div className="overflow-hidden rounded-md border border-neutral-300">
        <div ref={containerRef} className="relative z-0 h-64 w-full" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          Latitude
          <input
            name="latitude"
            inputMode="decimal"
            required
            value={latitude}
            onChange={(event) => setCoordinate("latitude", event.target.value)}
            onBlur={() => normalizeCoordinate("latitude")}
            placeholder="-90 to 90"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          Longitude
          <input
            name="longitude"
            inputMode="decimal"
            required
            value={longitude}
            onChange={(event) => setCoordinate("longitude", event.target.value)}
            onBlur={() => normalizeCoordinate("longitude")}
            placeholder="-180 to 180"
            className={inputClass}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-600">
          Type coordinates, click the map, or drag the pin.
        </p>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
        >
          {locating ? "Finding…" : "Use my location"}
        </button>
      </div>
      {locateError ? <p className="text-sm text-red-700">{locateError}</p> : null}
    </div>
  );
}
