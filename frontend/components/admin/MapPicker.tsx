'use client';
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { OpenStreetMapProvider } from 'leaflet-geosearch';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default marker icon issue with webpack/Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

function LocationMarker({ position, onPositionChange }: { position: [number, number]; onPositionChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    },
  });

  return position ? <Marker position={position} draggable eventHandlers={{ dragend: (e) => { const m = e.target; const pos = m.getLatLng(); onPositionChange(pos.lat, pos.lng); } }} /> : null;
}

function SearchControl({ onResult }: { onResult: (lat: number, lng: number) => void }) {
  const [query, setQuery] = useState('');
  const provider = new OpenStreetMapProvider();

  const handleSearch = async () => {
    const results = await provider.search({ query });
    if (results.length > 0) {
      const { x, y } = results[0];
      onResult(parseFloat(y), parseFloat(x));
    }
  };

  return (
    <div className="absolute top-2 left-2 z-[1000] flex gap-1">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher une adresse…"
        className="border rounded px-2 py-1 text-sm w-48"
        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
      />
      <button onClick={handleSearch} className="bg-primary text-white px-2 py-1 rounded text-sm">Chercher</button>
    </div>
  );
}

interface MapPickerProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}

export default function MapPicker({ lat, lng, onChange }: MapPickerProps) {
  const [position, setPosition] = useState<[number, number]>([lat, lng]);

  useEffect(() => {
    setPosition([lat, lng]);
  }, [lat, lng]);

  const handlePositionChange = (newLat: number, newLng: number) => {
    setPosition([newLat, newLng]);
    onChange(newLat, newLng);
  };

  return (
    <div className="h-80 w-full rounded-2xl overflow-hidden border relative">
<MapContainer center={position} zoom={13} className="h-full w-full" scrollWheelZoom={false} attributionControl={false}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <LocationMarker position={position} onPositionChange={handlePositionChange} />
        <SearchControl onResult={handlePositionChange} />
      </MapContainer>
    </div>
  );
}