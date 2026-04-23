
import base64
import openai
import asyncio

api_key = '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'

import tempfile

def test():
    client = openai.OpenAI(
        base_url='https://openrouter.ai/api/v1',
        api_key=api_key,
    )
    wav_b64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='
    audio_data = base64.b64decode(wav_b64)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        f.write(audio_data)
        f_name = f.name
        
    with open(f_name, 'rb') as f:
        transcription = client.audio.transcriptions.create(
            file=f,
            model='openai/whisper-large-v3'
        )
        print(transcription.text)

test()
