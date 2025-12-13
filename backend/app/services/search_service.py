from langchain_community.tools import DuckDuckGoSearchRun

class SearchService:
    def __init__(self):
        self.search_tool = DuckDuckGoSearchRun()

    def search(self, query: str) -> str:
        try:
            return self.search_tool.invoke(query)
        except Exception as e:
            return f"Error searching web: {str(e)}"

search_service = SearchService()
