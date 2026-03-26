from __future__ import annotations

import heapq
def dijkstra(graph: dict[str, list[tuple[str, float]]], start: str, goal: str) -> list[str]:
    """
    Dijkstra simplifié.
    - graph: {node: [(neighbor, cost), ...]}
    - renvoie la liste des clés de nœuds (chemin)
    """

    dist: dict[str, float] = {start: 0.0}
    prev: dict[str, str | None] = {start: None}
    pq: list[tuple[float, str]] = [(0.0, start)]

    while pq:
        d, u = heapq.heappop(pq)
        if u == goal:
            break
        if d != dist.get(u, float("inf")):
            continue
        for v, w in graph.get(u, []):
            nd = d + w
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))

    if goal not in prev:
        return []

    path: list[str] = []
    cur: str | None = goal
    while cur is not None:
        path.append(cur)
        cur = prev.get(cur)
    return list(reversed(path))

