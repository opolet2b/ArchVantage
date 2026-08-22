import logging
import re
from langchain_core.messages import HumanMessage
from langchain_core.output_parsers import PydanticOutputParser

logger = logging.getLogger(__name__)

def invoke_with_fallback(llm, schema_class, messages):
    parser = PydanticOutputParser(pydantic_object=schema_class)
    format_instructions = parser.get_format_instructions()
    
    # Inject format instructions and strict JSON rules into the last message
    last_msg = messages[-1].content
    if isinstance(last_msg, str):
        strict_rules = "CRITICAL: You MUST respond with ONLY valid, raw JSON matching the schema. DO NOT wrap the JSON in markdown blocks (```json ... ```). DO NOT include any conversational text, greetings, or explanations."
        messages[-1].content = f"{last_msg}\n\n{format_instructions}\n\n{strict_rules}"
    
    def extract_json_str(text: str) -> str:
        if not text or text.strip().lower() == "null":
            return '{"categories": {}, "figures": []}'
            
        # Strip markdown json blocks if the model ignored the instructions
        match = re.search(r'```(?:json)?\s*(.*?)\s*```', text, re.DOTALL)
        if match:
            text = match.group(1)
            
        if text.strip().lower() == "null":
            return '{"categories": {}, "figures": []}'
            
        # Or try to find the first { and last }
        start = text.find('{')
        end = text.rfind('}')
        if start != -1 and end != -1:
            text = text[start:end+1]
            
        # Fix trailing commas (common LLM hallucination) which break json.loads
        text = re.sub(r',\s*([\]}])', r'\1', text)
        return text

    try:
        response = None
        response = llm.invoke(messages)
        clean_json = extract_json_str(response.content)
        return parser.parse(clean_json)
    except Exception as e:
        err_str = str(e).lower()
        if "completion null" in err_str or "input_value=none" in err_str:
            if schema_class.__name__ == "StoryboarderResult":
                return schema_class(slides=[])
            return schema_class(categories={}, figures=[])
            
        logger.warning(f"[Map-Reduce] LLM hallucinated JSON structure for a chunk. Attempting self-correction... Error: {e}")
        if response is None:
            raise Exception(f"LLM Invocation failed: {e}")
            
        try:
            fix_prompt = f"The following text was supposed to be a JSON object but failed to parse with error: {e}.\n\nText:\n{response.content}\n\nPlease output ONLY the corrected JSON object. DO NOT include conversational text."
            response = llm.invoke([HumanMessage(content=fix_prompt)])
            clean_json = extract_json_str(response.content)
            return parser.parse(clean_json)
        except Exception as fallback_e:
            logger.warning(f"[Map-Reduce] Self-correction failed. Returning empty schema to prevent crash.")
            if schema_class.__name__ == "StoryboarderResult":
                return schema_class(slides=[])
            return schema_class(categories={}, figures=[])
