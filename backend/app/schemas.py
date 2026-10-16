"""Schemas for the API. Complex responses are assembled as dicts in routers."""

from pydantic import BaseModel


class HealthOut(BaseModel):
    status: str
    app: str
    version: str
