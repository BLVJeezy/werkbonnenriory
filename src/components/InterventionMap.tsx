import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, MarkerClusterGroup } from 'leaflet';
import type { InterventionLocation } from '@/lib/intervention-map';
import { located } from '@/lib/intervention-map';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

export default function InterventionMap({ locations, selected, onSelect }: { locations: InterventionLocation[]; selected: string | null; onSelect: (key: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const cluster = useRef<MarkerClusterGroup | null>(null);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet.markercluster');
      if (cancelled || !container.current) return;
      const instance = L.map(container.current, { scrollWheelZoom: true }).setView([50.95, 5.35], 9);
      // Tiles contain only geographic tile indices, never customer names or addresses.
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>' }).addTo(instance);
      const markers = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 48, iconCreateFunction: group => L.divIcon({ className: 'intervention-cluster', html: `<span>${group.getChildCount()}</span>`, iconSize: [42,42] }) });
      instance.addLayer(markers); map.current = instance; cluster.current = markers; setReady(true);
      const observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(container.current);
      instance.on('unload', () => observer.disconnect());
    })().catch(() => setError(true));
    return () => { cancelled = true; map.current?.remove(); map.current = null; cluster.current = null; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    void import('leaflet').then(module => {
      const L = module.default;
      const instance = map.current; const markers = cluster.current;
      if (!instance || !markers) return;
      markers.clearLayers();
      const bounds = L.latLngBounds([]);
      for (const location of locations) {
        if (!located(location.cache)) continue;
        const position: [number,number] = [location.cache.lat, location.cache.lon];
        bounds.extend(position);
        const marker = L.marker(position, { title: location.address, icon: L.divIcon({ className: 'intervention-pin', html: `<span>${location.orders.length}</span>`, iconSize: [34,34], iconAnchor: [17,34] }) });
        const text = document.createElement('div');
        const title = document.createElement('strong'); title.textContent = location.address; text.append(title);
        const details = document.createElement('p'); details.textContent = `${location.orders.length} interventies · ${location.latest}`; text.append(details);
        const names = document.createElement('p'); names.textContent = location.customers.join(', '); text.append(names);
        marker.bindPopup(text).on('click', () => callback.current(location.key)); markers.addLayer(marker);
      }
      if (bounds.isValid()) instance.fitBounds(bounds, { padding: [35,35], maxZoom: 15 });
    });
  }, [locations, ready]);
  useEffect(() => {
    const location = locations.find(l => l.key === selected);
    if (location && located(location.cache)) map.current?.setView([location.cache.lat, location.cache.lon], 16, { animate: false });
  }, [selected, locations]);
  return <div className="relative min-w-0">
    <div ref={container} aria-label="Interventiekaart" className="intervention-map h-[480px] w-full bg-muted sm:h-[600px]" />
    {error && <p role="alert" className="absolute inset-x-4 top-4 z-[450] bg-background p-3">Kaart kon niet geladen worden. De adressenlijst blijft beschikbaar.</p>}
  </div>;
}