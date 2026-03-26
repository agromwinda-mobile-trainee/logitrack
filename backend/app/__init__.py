"""
Backend LogiTrack.

On garde des modules simples et bien séparés:
- api: routes HTTP (FastAPI)
- db: connexion + modèles SQLAlchemy
- services: logique métier “lisible”
- ingestion: réception de positions GPS (véhicules -> API)
"""

