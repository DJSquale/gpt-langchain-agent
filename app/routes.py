from fastapi import APIRouter, Query
from app.agent import agent

router = APIRouter()

@router.get("/fetch-template")
def fetch_template(q: str = Query(..., description="Template search query")):
    result = agent.run(f"Find a web template or code snippet for: {q}")
    return {"query": q, "result": result}
