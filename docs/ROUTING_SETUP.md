# Configuration routage (Dijkstra) — `routing_nodes` / `routing_edges`

L’endpoint `/api/optimization/route` calcule le plus court chemin **sur le graphe configuré** en base.

## 1) Créer des nodes


```bash
curl -sS -X POST http://localhost:8001/api/routing/nodes \
  -H 'Content-Type: application/json' \
  -d '{"key":"CASA","lat":33.5731,"lon":-7.5898}'

curl -sS -X POST http://localhost:8001/api/routing/nodes \
  -H 'Content-Type: application/json' \
  -d '{"key":"RABAT","lat":34.0209,"lon":-6.8416}'

curl -sS -X POST http://localhost:8001/api/routing/nodes \
  -H 'Content-Type: application/json' \
  -d '{"key":"PARIS","lat":48.8566,"lon":2.3522}'
```

## 2) Créer des edges (coût en minutes)

```bash
curl -sS -X POST http://localhost:8001/api/routing/edges \
  -H 'Content-Type: application/json' \
  -d '{"from_key":"CASA","to_key":"RABAT","cost_minutes":60}'

curl -sS -X POST http://localhost:8001/api/routing/edges \
  -H 'Content-Type: application/json' \
  -d '{"from_key":"RABAT","to_key":"PARIS","cost_minutes":720}'
```

## 3) Calculer une route

```bash
curl -sS 'http://localhost:8001/api/optimization/route?start_key=CASA&goal_key=PARIS'
```

## Notes
- Si aucun node/edge n’existe, l’API renvoie un message “graphe vide”.
- Coût = valeur numérique (ex: `cost_minutes`).

