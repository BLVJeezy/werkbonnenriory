/// <reference types="google.maps" />
import { useEffect, useRef, useState } from 'react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import type { InterventionLocation } from '@/lib/intervention-map';
import { located } from '@/lib/intervention-map';

let loader: Promise<typeof google.maps> | null = null;
function loadGoogleMaps(): Promise<typeof google.maps> {
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const key = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY'] as string | undefined;
    if (!key) { loader = null; reject(new Error('Google Maps-browsersleutel ontbreekt.')); return; }
    const channel = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID'] as string | undefined;
    const callbackName = 'initInterventionMap';
    (window as unknown as Record<string, unknown>)[callbackName] = () => resolve(window.google.maps);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=${callbackName}${channel ? `&channel=${channel}` : ''}`;
    script.async = true;
    script.onerror = () => { loader = null; reject(new Error('Google Maps kon niet geladen worden.')); };
    document.head.appendChild(script);
  });
  return loader;
}

export default function InterventionMap({ locations, selected, onSelect }: { locations: InterventionLocation[]; selected: string | null; onSelect: (key: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const clusterer = useRef<MarkerClusterer | null>(null);
  const info = useRef<google.maps.InfoWindow | null>(null);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then(maps => {
      if (cancelled || !container.current) return;
      const instance = new maps.Map(container.current, {
        center: { lat: 50.87, lng: 5.52 }, zoom: 9, clickableIcons: false,
        styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
      });
      info.current = new maps.InfoWindow();
      clusterer.current = new MarkerClusterer({ map: instance });
      map.current = instance; setReady(true);
    }).catch(() => setError(true));
    return () => { cancelled = true; clusterer.current?.clearMarkers(); clusterer.current = null; info.current?.close(); info.current = null; map.current = null; };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const instance = map.current; const markers = clusterer.current;
    if (!instance || !markers) return;
    markers.clearMarkers();
    const bounds = new google.maps.LatLngBounds();
    const list: google.maps.Marker[] = [];
    for (const location of locations) {
      if (!located(location.cache)) continue;
      const position = { lat: location.cache.lat, lng: location.cache.lon };
      bounds.extend(position);
      const marker = new google.maps.Marker({ position, title: location.address, label: { text: String(location.orders.length), color: '#ffffff', fontWeight: '800' } });
      marker.addListener('click', () => {
        const text = document.createElement('div');
        const title = document.createElement('strong'); title.textContent = location.address; text.append(title);
        const details = document.createElement('p'); details.textContent = `${location.orders.length} interventies · ${location.latest}`; text.append(details);
        const names = document.createElement('p'); names.textContent = location.customers.join(', '); text.append(names);
        info.current?.setContent(text); info.current?.open({ map: instance, anchor: marker });
        callback.current(location.key);
      });
      list.push(marker);
    }
    markers.addMarkers(list);
    if (!bounds.isEmpty()) instance.fitBounds(bounds, 35);
  }, [locations, ready]);
  useEffect(() => {
    const location = locations.find(l => l.key === selected);
    if (location && located(location.cache)) { map.current?.panTo({ lat: location.cache.lat, lng: location.cache.lon }); map.current?.setZoom(16); }
  }, [selected, locations]);
  return <div className="relative min-w-0">
    <div ref={container} aria-label="Interventiekaart" className="intervention-map h-[480px] w-full bg-muted sm:h-[600px]" />
    {error && <p role="alert" className="absolute inset-x-4 top-4 z-[450] bg-background p-3">Google Maps kon niet geladen worden. De adressenlijst blijft beschikbaar.</p>}
  </div>;
}
