from app.services.search_service import search_service
from app.services.llm_service import llm_service
from app.models.chat import Message

class ResearchService:
    async def research(self, query: str) -> str:
        # 1. Search the web
        search_results = search_service.search(query)
        
        # 2. Synthesize answer using LLM
        prompt = f"""
        You are a research assistant. Answer the following question based on the provided search results.
        
        Question: {query}
        
        Search Results:
        {search_results}
        
        Answer:
        """
        
        messages = [Message(role="user", content=prompt)]
        response = await llm_service.chat(messages, "gpt-3.5-turbo")
        
        return response

research_service = ResearchService()
