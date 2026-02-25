import asyncio
from app.services.ontology_service import ontology_service

payload = [
    {
        "id": "test-123",
        "type": "local",
        "name": "Test Local Source",
        "config": {
                "path": "C:\\Users\\opole\\Downloads\\ChatBotn\\test_docs" 
        }
    }
]

async def main():
    print("Running extraction...")
    res = await ontology_service.extract_taxonomy_from_sources(sources=payload, llm_config_id="gpt-3.5-turbo")
    print(f"Result: {res}")

if __name__ == "__main__":
    asyncio.run(main())
