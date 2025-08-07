from langchain.agents import initialize_agent, Tool
from langchain.chat_models import ChatOpenAI
from app.tools import search_web, scrape_and_format

llm = ChatOpenAI(temperature=0)

tools = [
    Tool(name="WebSearchTool", func=search_web, description="Performs a web search based on a query"),
    Tool(name="ScrapeAndFormatTool", func=scrape_and_format, description="Scrapes and formats content into HTML or Markdown")
]

agent = initialize_agent(tools, llm, agent="zero-shot-react-description", verbose=True)
