from fastapi import FastAPI
from app.routes import router

app = FastAPI(
    title="GPT WebBuilder Template Agent",
    description="LangChain agent to fetch and format web templates for use in GPT",
    version="1.0.0"
)

app.include_router(router)
