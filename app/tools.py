import requests
from bs4 import BeautifulSoup

def search_web(query: str) -> str:
    return f"https://www.google.com/search?q={query.replace(' ', '+')}"

def scrape_and_format(url: str) -> str:
    response = requests.get(url)
    soup = BeautifulSoup(response.text, 'html.parser')

    # Remove scripts/styles
    for script in soup(["script", "style"]):
        script.decompose()

    # Extract main content
    text = soup.get_text()
    lines = [line.strip() for line in text.splitlines()]
    text = '\n'.join([line for line in lines if line])

    return f"<!-- source: {url} -->\n\n{text[:5000]}"
