from __future__ import annotations

import math


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Distance approximative sur sphère (mètres).

    Suffisant pour du géofencing simple. Si on veut du très précis:
    - PostGIS geography
    - ou pyproj / geodesic
    """

    r = 6371000.0  # rayon terrestre (m)
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    return haversine_distance_m(lat1, lon1, lat2, lon2) / 1000.0


def point_inside_circle(lat: float, lon: float, center_lat: float, center_lon: float, radius_m: float) -> bool:
    return haversine_distance_m(lat, lon, center_lat, center_lon) <= radius_m

